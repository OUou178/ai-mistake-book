/* ============================================================
 * 前端数据层：优先走后端 API，后端不可达时回退 localStorage
 * 与架构图对应：前端 Web App -> 后端 API -> 业务库 / 向量库 / 复习算法 / OCR / 大模型
 *
 * 浏览器直连模式（无后端，如 CloudStudio / GitHub Pages 静态部署）：
 *   设置里填的 LLM 配置会写入 localStorage，AI 功能由浏览器直接 fetch 厂商接口，
 *   无需后端。受厂商 CORS 限制（部分厂商允许浏览器跨域，部分不允许）。
 * ============================================================ */
window.API = (function () {
  // 动态取当前页面来源：后端同源托管前端后，任意端口 / 域名都可自动适配
  const API_BASE = (typeof location !== 'undefined' && location.origin) ? location.origin : 'http://127.0.0.1:3000';
  const LS_KEY = 'ai_mistake_book_v1';
  const CFG_KEY = 'ai_mistake_book_llm_cfg_v1'; // 浏览器直连模式的 LLM/OCR 配置
  const BOX_INTERVALS = [1, 3, 7, 16, 30];
  const DAY = 86400000;
  const MAX_BOX = 5;

  let online = null;       // null=未探测, true/false
  let offlineSince = 0;

  // —— 本地 LLM 配置（浏览器直连模式）——
  function loadLocalCfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || { llm: {}, ocr: {} }; } catch { return { llm: {}, ocr: {} }; }
  }
  function saveLocalCfg(cfg) { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch {} }

  // 部署时若提供 config.js（window.__APP_CONFIG__），启动时自动写入本地配置
  // 策略：config.js 是部署端的「源」——其 baseUrl/model 始终覆盖本地（保证改一次 config.js 刷新即生效）；
  //       用户的 apiKey 本地已设则保留（避免误清），仅当本地为空时才采用 config.js 的 apiKey
  //       （兼容早期把 key 直接放 config.js 的部署方式；当前 serverless 模式下 apiKey 留空）。
  (function seedFromGlobal() {
    try {
      const g = window.__APP_CONFIG__;
      if (!g || !g.llm) return;
      const cur = loadLocalCfg();
      const curLlm = cur.llm || {};
      const curOcr = cur.ocr || {};
      const newCfg = {
        llm: {
          apiKey: curLlm.apiKey || (g.llm.apiKey || ''),
          baseUrl: (g.llm.baseUrl || '') || curLlm.baseUrl || '',
          model:   (g.llm.model   || '') || curLlm.model   || '',
          vision:  (g.llm.vision  || '') || curLlm.vision  || ''
        },
        ocr: {
          vendor:    (g.ocr && g.ocr.vendor)    || curOcr.vendor    || 'openai',
          apiKey:    curOcr.apiKey    || ((g.ocr && g.ocr.apiKey)    || ''),
          secretKey: curOcr.secretKey || ((g.ocr && g.ocr.secretKey) || '')
        }
      };
      // 仅当有变化时才写（避免无意义的 setItem）
      if (JSON.stringify(newCfg) !== JSON.stringify({ llm: curLlm, ocr: curOcr })) saveLocalCfg(newCfg);
    } catch {}
  })();

  async function ping() {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 700);
      const r = await fetch(API_BASE + '/api/health', { signal: c.signal });
      clearTimeout(t);
      if (!r.ok) return false;
      // 静态托管（CloudStudio / GitHub Pages）对未知路径会回退返回 HTML（200），
      // 不能仅凭 r.ok 判断「有后端」——必须是我们后端返回的 JSON 健康检查
      const ct = r.headers.get('content-type') || '';
      if (!/json/.test(ct)) return false; // text/html 回退 → 不是真后端
      const j = await r.json().catch(() => null);
      return !!(j && j.ok === true && 'llm' in j && 'ocr' in j);
    } catch { return false; }
  }
  async function check() {
    if (online === null || (online === false && Date.now() - offlineSince > 15000)) {
      online = await ping();
      if (!online) offlineSince = Date.now();
    }
    return online;
  }
  async function req(method, path, body) {
    const r = await fetch(API_BASE + path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    if (!r.ok && r.status !== 501) throw new Error('HTTP ' + r.status);
    return r;
  }

  // —— 浏览器直连大模型（OpenAI 兼容 /chat/completions）——
  // opts: { temperature, stream, onDelta, json }
  async function directLLM(messages, opts) {
    opts = opts || {};
    const cfg = loadLocalCfg().llm || {};
    const key = cfg.apiKey, base = cfg.baseUrl, model = opts.model || cfg.model;
    if (!base) throw new Error('未配置大模型（请在「⚙ 设置」填写 Base URL；服务端代理模式下填函数地址，密钥由代理注入）');
    const headers = { 'content-type': 'application/json' };
    if (key) headers.authorization = 'Bearer ' + key; // 代理模式：前端不持密钥，由函数注入
    const body = {
      model: model || 'gpt-4o-mini',
      temperature: opts.temperature != null ? opts.temperature : 0.2,
      messages,
      stream: !!opts.stream
    };
    if (opts.json) body.response_format = { type: 'json_object' };
    const r = await fetch(base, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      let msg = 'HTTP ' + r.status;
      try { const j = await r.json(); if (j && j.error && j.error.message) msg = j.error.message; else if (j && j.error) msg = (typeof j.error === 'string' ? j.error : JSON.stringify(j.error)); } catch {}
      throw new Error(msg);
    }
    if (opts.stream) {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '', full = '';
      // 调试用：记录首字节 / 错误信息
      let usage = null, finishReason = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop();
        for (const ln of lines) {
          const t = ln.trim();
          if (!t.startsWith('data:')) continue;
          const data = t.slice(5).trim();
          if (!data) continue;
          if (data === '[DONE]') continue;
          try {
            const j = JSON.parse(data);
            const choice = j.choices && j.choices[0];
            // 兼容多家的 delta 字段名
            const delta = choice
              ? (choice.delta?.content || choice.delta?.text || (choice.message && choice.message.content))
              : null;
            if (delta) { full += delta; if (opts.onDelta) opts.onDelta(delta); }
            if (choice && choice.finish_reason) finishReason = choice.finish_reason;
            if (j.usage) usage = j.usage;
            // 服务端错误（如安全审核不通过会以 SSE 形式返回）
            if (j.error) throw new Error((j.error.message || JSON.stringify(j.error)));
          } catch (e) {
            // 解析失败通常意味着响应结束了；若是显式抛出则透传
            if (e && e.message && !/Unexpected token/.test(e.message)) throw e;
          }
        }
      }
      // 空内容兜底：若 SSE 全部跑完却 0 字符，给清晰提示
      if (!full) {
        const hint = finishReason ? `（模型结束原因：${finishReason}）` : '';
        throw new Error('模型返回为空' + hint + (usage ? '' : '（可能是模型名不存在 / 网络被中途截断）'));
      }
      return full;
    }
    const j = await r.json();
    const msg = j.choices && j.choices[0] && j.choices[0].message;
    const text = (msg && msg.content) || '';
    if (!text) {
      const err = j.error;
      if (err) throw new Error(err.message || JSON.stringify(err));
      throw new Error('模型返回为空（可能模型名不存在）');
    }
    return text;
  }

  // —— AI 答疑流式：后端优先，离线走浏览器直连 ——
  async function chatStream(text, onDelta) {
    if (await check()) {
      try {
        const url = API_BASE + '/api/qa/stream?q=' + encodeURIComponent(text);
        const r = await fetch(url);
        if (r.ok) {
          const reader = r.body.getReader();
          const dec = new TextDecoder();
          let buf = '', full = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split('\n'); buf = lines.pop();
            for (const ln of lines) {
              const t = ln.trim();
              if (!t.startsWith('data:')) continue;
              try {
                const j = JSON.parse(t.slice(5).trim());
                if (j.delta) { full += j.delta; onDelta(j.delta); }
                if (j.error) { full = j.error; onDelta(''); }
              } catch {}
            }
          }
          return full;
        }
      } catch {}
    }
    const sys = '你是 AI 家教，针对学生的错题进行讲解、提示思路、给出相关知识点，用中文、条理清晰地回答。';
    const messages = [{ role: 'system', content: sys }, { role: 'user', content: text }];
    const cfg = loadLocalCfg().llm || {};
    const primary = cfg.model || 'qwen-plus';
    // 自动候选：配置的模型 404 / 不存在时，依次尝试其他常见文本模型，免去手动改设置
    const candidates = [primary, 'qwen-max', 'qwen-turbo', 'qwen2.5-72b-instruct', 'qwen2.5-7b-instruct'];
    let lastErr = '';
    for (const m of candidates) {
      try {
        return await directLLM(messages, { temperature: 0.6, stream: true, onDelta, model: m });
      } catch (e) {
        lastErr = e.message;
        // 仅 404 / 模型不存在类错误继续尝试下一个；鉴权 / CORS 等其他错误直接中断
        if (!/404|not\s*found|model|invalid/i.test(e.message)) break;
      }
    }
    throw new Error('聊天模型调用失败：' + (lastErr || '未知错误') + '；请到「⚙ 设置 → Model Name」确认你工作空间实际部署的模型名（或在控制台「探测可用模型」）。');
  }

  async function list() {
    if (!(await check())) return ls();
    try { const j = await (await req('GET', '/api/mistakes')).json(); return j; }
    catch { return ls(); }
  }
  async function add(m) {
    if (!(await check())) { const s = ls(); s.items.push(m); lsSave(s); return m; }
    try { const j = await (await req('POST', '/api/mistakes', m)).json(); return j.item || m; }
    catch { const s = ls(); s.items.push(m); lsSave(s); return m; }
  }
  async function update(id, patch) {
    if (!(await check())) { const s = ls(); const it = s.items.find((x) => x.id === id); if (it) Object.assign(it, patch); lsSave(s); return it || patch; }
    try { const j = await (await req('PATCH', '/api/mistakes/' + id, patch)).json(); return j.item || patch; }
    catch { const s = ls(); const it = s.items.find((x) => x.id === id); if (it) Object.assign(it, patch); lsSave(s); return it || patch; }
  }
  async function remove(id) {
    if (!(await check())) { const s = ls(); s.items = s.items.filter((x) => x.id !== id); lsSave(s); return; }
    try { await req('DELETE', '/api/mistakes/' + id); }
    catch { const s = ls(); s.items = s.items.filter((x) => x.id !== id); lsSave(s); }
  }
  async function reviewResult(id, quality) {
    const q = typeof quality === 'boolean' ? (quality ? 4 : 2) : Math.max(0, Math.min(5, +quality || 0));
    const local = () => {
      const s = ls(); const it = s.items.find((x) => x.id === id);
      if (it) {
        it.reviewCount = (it.reviewCount || 0) + 1;
        it.lastQuality = q; it.lastResult = q >= 3 ? 'ok' : 'fail';
        let EF = it.EF != null ? it.EF : 2.5;
        let interval = it.interval || 0;
        let repetitions = it.repetitions || 0;
        if (q >= 3) {
          if (repetitions === 0) interval = 1; else if (repetitions === 1) interval = 6; else interval = Math.round(interval * EF);
          repetitions += 1;
        } else { repetitions = 0; interval = 1; }
        EF = Math.max(1.3, EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
        it.EF = +EF.toFixed(3); it.interval = interval; it.repetitions = repetitions;
        it.box = Math.min(MAX_BOX, interval >= 30 ? 5 : interval >= 16 ? 4 : interval >= 7 ? 3 : interval >= 3 ? 2 : 1);
        it.nextReviewAt = Date.now() + interval * 86400000;
        lsSave(s);
      }
      return it;
    };
    if (!(await check())) return local();
    try { const j = await (await req('POST', '/api/mistakes/' + id + '/result', { quality: q })).json(); return j.item; }
    catch { return local(); }
  }
  async function analyze(payload) {
    if (await check()) {
      try { const r = await req('POST', '/api/analyze', payload); if (r.status === 501) return null; return await r.json(); } catch {}
    }
    // 浏览器直连
    try {
      const sys = '你是错题分析助手。根据学科、题干、学生错误答案、正确答案，判断【学科】(从["数学","英语","语文","物理","化学","生物","历史","地理","政治","行测","申论","其他"]选一)、错误类型(从["概念不清","计算失误","审题偏差","知识遗忘","思路错误","粗心大意","其他"]选一)并抽取知识点(数组)。只返回JSON:{"subject":"...","errorType":"...","knowledgePoints":["..."]}';
      const text = await directLLM([{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(payload) }], { temperature: 0.2, json: true });
      return JSON.parse(text);
    } catch (e) { console.warn('[analyze] 浏览器直连失败：', e.message); return null; }
  }
  async function similar(text, subject, excludeId) {
    if (!(await check())) return { items: [] };
    try { const j = await (await req('POST', '/api/similar', { text, subject, excludeId })).json(); return j; }
    catch { return { items: [] }; }
  }
  // 探测当前 Base URL 下可用模型（OpenAI 兼容 /models 端点）
  async function listModels() {
    const c = loadLocalCfg();
    const llm = c.llm || {};
    const base = (llm.baseUrl || '').replace(/\/chat\/completions\/?$/, '');
    const key = llm.apiKey;
    if (!base) return { error: '未配置 Base URL' };
    const url = base.replace(/\/$/, '') + '/models';
    const headers = { 'content-type': 'application/json' };
    if (key) headers.authorization = 'Bearer ' + key;
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) {
        let msg = 'HTTP ' + r.status;
        try { const j = await r.json(); if (j && j.error) msg = (j.error.message || JSON.stringify(j.error)); } catch {}
        return { error: msg };
      }
      const j = await r.json();
      const list = Array.isArray(j.data) ? j.data.map((m) => m.id || m.name) : (j.models ? j.models : []);
      return { models: list };
    } catch (e) { return { error: e.message }; }
  }
  async function ocr(image) {
    if (await check()) {
      try { const r = await req('POST', '/api/ocr', { image }); if (r.status === 501) return { error: 'OCR 未配置（设置 OCR_API_KEY 后启用）' }; return await r.json(); } catch {}
    }
    // 浏览器直连：仅 openai 兼容视觉可用；百度需服务端签名
    const c = loadLocalCfg();
    const vendor = (c.ocr && c.ocr.vendor) || 'openai';
    if (vendor === 'baidu') return { error: '百度 OCR 需后端支持（浏览器直连模式不支持），请运行后端或改用「跟随大模型(视觉)」' };
    const llm = c.llm || {};
    if (!llm.apiKey && !llm.baseUrl) return { error: '未配置大模型（OCR 跟随视觉需在设置填写 Base URL / 支持视觉的 Model，或使用服务端代理）' };
    const visionModel = (llm.vision || llm.model || '').trim(); // 视觉模型优先，缺省复用 LLM 模型
    // 自动候选：用户配置的视觉模型 404 时，依次尝试其他常见视觉模型，免去手动改设置
    const KNOWN = ['qwen-vl-max', 'qwen2.5-vl-72b-instruct', 'qwen2.5-vl-32b-instruct', 'qwen-vision-max'];
    const candidates = Array.from(new Set([visionModel, ...KNOWN].filter(Boolean)));
    let lastErr = '';
    for (const m of candidates) {
      try {
        const text = await directLLM([{ role: 'user', content: [
          { type: 'text', text: '请识别图片中的所有题目文字，保持原题格式与换行，只输出识别到的文字内容，不要解释、不要翻译。' },
          { type: 'image_url', image_url: { url: image } }
        ] }], { temperature: 0.2, model: m });
        if (text && text.trim()) return { text: text.trim(), model: m };
      } catch (e) {
        lastErr = e.message;
        // 仅 404/模型不存在类错误继续尝试下一个；鉴权/CORS 等其他错误直接中断
        if (!/404|not\s*found|model/i.test(e.message)) break;
      }
    }
    const is404 = /HTTP\s*404/i.test(lastErr) || /not\s*found/i.test(lastErr);
    const hint = is404
      ? `\n\n所有候选视觉模型（${candidates.join(' / ')}）在你的 MaaS 工作空间都返回 404。原因：该工作空间只部署了文本模型（如 qwen-plus），没有视觉模型。\n解决二选一：①图片 OCR 改用「本地后端 + 百度智能云 OCR」（已为你配好，填百度 Key 即生效，见 ⚙设置 / README）；②到阿里云百炼给工作空间部署视觉模型（如 qwen-vl-max），再把准确模型名填进「⚙ 设置 → 视觉模型」。`
      : `\n\n排查：①图片大小（≤10MB）；②直接在「AI 答疑」发文字消息验证基础链路是否通。`;
    return { error: 'OCR 浏览器直连失败：' + (lastErr || '未知错误') + hint };
  }
  async function variants(question, subject, count) {
    const payload = { question, subject, count };
    if (await check()) {
      try { const j = await (await req('POST', '/api/variants', payload)).json(); return j; } catch {}
    }
    try {
      const sys = '你是出题助手。基于原题生成 ' + (count || 5) + ' 道变体题，保持考点、难度相近，结构相似。每题一行 JSON: {"question":"...","hint":"..."}，整体输出 JSON {"items":[...]}';
      const text = await directLLM([{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(payload) }], { temperature: 0.7, json: true });
      const out = JSON.parse(text);
      return Array.isArray(out.items) ? { items: out.items } : { items: [] };
    } catch (e) { console.warn('[variants] 浏览器直连失败：', e.message); return { items: [] }; }
  }
  async function grade(question, userAnswer, correctAnswer, subject) {
    const payload = { question, userAnswer, correctAnswer, subject };
    if (await check()) {
      try { return await (await req('POST', '/api/grade', payload)).json(); } catch {}
    }
    try {
      const sys = '你是 AI 批改助手。判断学生答案是否正确、得分(0-5)、简短评语。输出 JSON: {"score":N,"correct":bool,"comment":"..."}';
      const text = await directLLM([{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(payload) }], { temperature: 0.2, json: true });
      return JSON.parse(text);
    } catch (e) { console.warn('[grade] 浏览器直连失败：', e.message); return { score: 0, correct: false, comment: '批改失败' }; }
  }
  async function status() { return await check(); }
  async function config() {
    if (await check()) {
      try { const r = await req('GET', '/api/config'); return await r.json(); } catch {}
    }
    // 离线：读本地配置（浏览器直连模式）
    const c = loadLocalCfg();
    const llm = c.llm || {};
    return {
      hasKey: !!(llm.apiKey || llm.baseUrl),
      llm: { base: llm.baseUrl, model: llm.model, vision: llm.vision },
      ocr: { vendor: c.ocr && c.ocr.vendor, hasKey: !!(c.ocr && c.ocr.apiKey), hasSecret: !!(c.ocr && c.ocr.secretKey) }
    };
  }
  async function saveConfig(payload) {
    // 始终写入本地（浏览器直连模式可用）
    const cur = loadLocalCfg();
    const llm = {
      apiKey: (payload.llm && payload.llm.apiKey) || cur.llm.apiKey || '',
      baseUrl: (payload.llm && payload.llm.baseUrl) || cur.llm.baseUrl || '',
      model: (payload.llm && payload.llm.model) || cur.llm.model || '',
      vision: (payload.llm && payload.llm.vision) || cur.llm.vision || ''
    };
    const ocr = {
      vendor: (payload.ocr && payload.ocr.vendor) || cur.ocr.vendor || 'openai',
      apiKey: (payload.ocr && payload.ocr.apiKey) || cur.ocr.apiKey || '',
      secretKey: (payload.ocr && payload.ocr.secretKey) || cur.ocr.secretKey || ''
    };
    saveLocalCfg({ llm, ocr });
    // 尝试后端
    if (await check()) {
      try {
        const r = await req('POST', '/api/config', payload);
        const j = await r.json();
        if (j && j.ok) return Object.assign({ local: false }, j);
        return { ok: false, error: (j && j.error) || '保存失败', localSaved: true };
      } catch (e) { /* 后端不可达，走本地 */ }
    }
    // 后端不可达：本地已保存，浏览器直连模式
    return { ok: true, localOnly: true, model: llm.model, warning: '后端未连接，已保存为浏览器直连模式（AI 功能由浏览器直接调用厂商接口）' };
  }

  function ls() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || { items: [] }; } catch { return { items: [] }; } }
  function lsSave(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

  return { list, add, update, remove, reviewResult, analyze, similar, ocr, variants, grade, status, config, saveConfig, chatStream, directLLM, listModels, isOnline: () => online };
})();

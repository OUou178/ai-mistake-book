/* ============================================================
 * 前端数据层：优先走后端 API，后端不可达时回退 localStorage
 * 与架构图对应：前端 Web App -> 后端 API -> 业务库 / 向量库 / 复习算法 / OCR / 大模型
 * ============================================================ */
window.API = (function () {
  // 动态取当前页面来源：后端同源托管前端后，任意端口 / 域名都可自动适配
  const API_BASE = (typeof location !== 'undefined' && location.origin) ? location.origin : 'http://127.0.0.1:3000';
  const LS_KEY = 'ai_mistake_book_v1';
  const BOX_INTERVALS = [1, 3, 7, 16, 30];
  const DAY = 86400000;
  const MAX_BOX = 5;

  let online = null;       // null=未探测, true/false
  let offlineSince = 0;

  function ls() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || { items: [] }; } catch { return { items: [] }; } }
  function lsSave(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

  async function ping() {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 700);
      const r = await fetch(API_BASE + '/api/health', { signal: c.signal });
      clearTimeout(t);
      return r.ok;
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
    // quality: 0-5（SM-2）；兼容旧 boolean
    const q = typeof quality === 'boolean' ? (quality ? 4 : 2) : Math.max(0, Math.min(5, +quality || 0));
    const local = () => {
      const s = ls(); const it = s.items.find((x) => x.id === id);
      if (it) {
        it.reviewCount = (it.reviewCount || 0) + 1;
        it.lastQuality = q; it.lastResult = q >= 3 ? 'ok' : 'fail';
        // 本地也跑一遍 SM-2（简化）
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
    if (!(await check())) return null;
    try { const r = await req('POST', '/api/analyze', payload); if (r.status === 501) return null; return await r.json(); }
    catch { return null; }
  }
  async function similar(text, subject, excludeId) {
    if (!(await check())) return { items: [] };
    try { const j = await (await req('POST', '/api/similar', { text, subject, excludeId })).json(); return j; }
    catch { return { items: [] }; }
  }
  async function ocr(image) {
    if (!(await check())) return { error: '后端未连接' };
    try { const r = await req('POST', '/api/ocr', { image }); if (r.status === 501) return { error: 'OCR 未配置（设置 OCR_API_KEY 后启用）' }; return await r.json(); }
    catch { return { error: 'OCR 调用失败' }; }
  }
  async function variants(question, subject, count) {
    if (!(await check())) return { items: [] };
    try { const j = await (await req('POST', '/api/variants', { question, subject, count })).json(); return j; }
    catch { return { items: [] }; }
  }
  async function grade(question, userAnswer, correctAnswer, subject) {
    if (!(await check())) return { score: 0, correct: false, comment: '后端未连接' };
    try { return await (await req('POST', '/api/grade', { question, userAnswer, correctAnswer, subject })).json(); }
    catch { return { score: 0, correct: false, comment: '批改失败' }; }
  }
  async function status() { return await check(); }
  async function config() {
    if (!(await check())) return { hasKey: false, llm: {}, ocr: {} };
    try { const r = await req('GET', '/api/config'); return await r.json(); }
    catch { return { hasKey: false, llm: {}, ocr: {} }; }
  }
  async function saveConfig(payload) {
    if (!(await check())) return { ok: false, error: '后端未连接' };
    try {
      const r = await req('POST', '/api/config', payload);
      return await r.json();
    } catch (e) { return { ok: false, error: String(e) }; }
  }

  return { list, add, update, remove, reviewResult, analyze, similar, ocr, variants, grade, status, config, saveConfig };
})();

/* ============================================================
 * AI 智能错题本 · 后端服务（零依赖，Node 内置模块）
 * 对应架构图：后端 API + 业务数据库 + 向量数据库 + 复习算法 + OCR + 大模型
 * 业务库 / 向量库用 JSON 文件持久化；OCR / 大模型读环境变量，未配置则回退本地规则
 * 启动：node server.js  （默认 3000 端口，可用 PORT 覆盖）
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const VEC_FILE = path.join(DATA_DIR, 'vectors.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const STATIC_DIR = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp'
};

const MAX_BOX = 5;
const BOX_INTERVALS = [1, 3, 7, 16, 30];
const DAY = 86400000;
const ERROR_TYPES = ['概念不清', '计算失误', '审题偏差', '知识遗忘', '思路错误', '粗心大意', '其他'];

/* ---------- SM-2 间隔重复算法（替换 Leitner） ---------- */
function sm2Update(card, q) {
  q = Math.max(0, Math.min(5, +q || 0));
  let EF = card.EF != null ? card.EF : 2.5;
  let interval = card.interval || 0;
  let repetitions = card.repetitions || 0;
  if (q >= 3) {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * EF);
    repetitions += 1;
  } else {
    repetitions = 0;
    interval = 1;
  }
  EF = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (EF < 1.3) EF = 1.3;
  return { EF: +EF.toFixed(3), interval, repetitions, nextReviewAt: Date.now() + interval * DAY, lastQuality: q };
}
function boxFromSM2(interval, repetitions) {
  if (repetitions >= 5 && interval >= 30) return 5;
  if (interval >= 16) return 4;
  if (interval >= 7) return 3;
  if (interval >= 3) return 2;
  return 1;
}

/* ---------- 学科自动识别（关键词匹配） ---------- */
const SUBJECT_RULES = [
  { s: '数学', keys: ['函数','导数','三角','数列','几何','向量','圆锥','微积分','积分','方程','根式','不等式','概率','lim','sin','cos','tan'] },
  { s: '英语', keys: ['英语','english','语法','从句','时态','vocabulary','writing','reading'] },
  { s: '语文', keys: ['语文','文言','古诗','拼音','病句','成语','修辞','作文','现代文'] },
  { s: '物理', keys: ['物理','力学','电磁','电场','磁场','电路','能量','动量','运动学','热学','光学'] },
  { s: '化学', keys: ['化学','氧化','电解','有机','元素周期','电化学'] },
  { s: '生物', keys: ['生物','细胞','遗传','神经','光合','蛋白质','dna','基因','生态','免疫'] },
  { s: '历史', keys: ['历史','朝代','战争','改革','近代','古代','世界史'] },
  { s: '地理', keys: ['地理','气候','地形','洋流','人口','农业','工业','区域'] },
  { s: '政治', keys: ['政治','马原','毛中特','哲学','法治','经济生活','思修'] },
  { s: '行测', keys: ['行测','资料分析','判断推理','言语理解','数量关系'] },
  { s: '申论', keys: ['申论','归纳概括','公文写作','大作文'] }
];
function guessSubject(text) {
  const t = (text || '').toLowerCase();
  for (const r of SUBJECT_RULES) for (const k of r.keys) if (t.includes(k)) return r.s;
  return null;
}

/* ---------- 本地变体题生成（替换数字） ---------- */
function localVariants(question, subject, n) {
  n = Math.max(1, Math.min(10, +n || 5));
  const nums = (question.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  const items = [];
  const uniqNums = Array.from(new Set(nums));
  for (let i = 0; i < n; i++) {
    const map = {};
    uniqNums.forEach((num) => {
      const delta = (i + 1) * Math.max(1, Math.abs(num) * 0.18 + 1);
      const newNum = num + (i % 2 === 0 ? delta : -delta);
      map[num] = Math.round(newNum * 100) / 100;
    });
    let v = question;
    uniqNums.forEach((num) => {
      const re = new RegExp('(?<!\\d)' + num + '(?!\\d)', 'g');
      v = v.replace(re, String(map[num]));
    });
    items.push({ question: v, hint: '本地生成 · 数字变换' });
  }
  return items;
}

/* ---------- 本地 AI 批改 ---------- */
function localGrade(question, userAnswer, correctAnswer) {
  const u = (userAnswer || '').trim();
  const c = (correctAnswer || '').trim();
  if (!u) return { score: 0, correct: false, comment: '未作答' };
  const nu = parseFloat(u.replace(/[^0-9.\-]/g, ''));
  const nc = parseFloat(c.replace(/[^0-9.\-]/g, ''));
  if (!isNaN(nu) && !isNaN(nc)) {
    const diff = Math.abs(nu - nc);
    if (diff === 0) return { score: 5, correct: true, comment: '答案完全正确' };
    if (diff / Math.max(1, Math.abs(nc)) < 0.05) return { score: 4, correct: true, comment: '基本正确，略有偏差' };
    return { score: 1, correct: false, comment: '答案有误，正确答案是 ' + c };
  }
  if (u === c) return { score: 5, correct: true, comment: '答案正确' };
  if (c && u && (u.includes(c.slice(0, Math.max(2, Math.floor(c.length / 2)))) || c.includes(u.slice(0, Math.max(2, Math.floor(u.length / 2)))))) return { score: 3, correct: false, comment: '部分正确（关键词匹配）' };
  return { score: 0, correct: false, comment: '答案错误，正确答案是 ' + c };
}

/* ---------- 题目拆分（OCR 后按编号/换行分段） ---------- */
function splitQuestions(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const out = [];
  let cur = '';
  const isStart = (l) => /^(\d+[\.、\)]|第\s*\d+\s*题|（\s*\d+\s*）|\(\s*\d+\s*\)|[一二三四五六七八九十]+[\.、\)])\s*/.test(l);
  for (const l of lines) {
    if (isStart(l)) {
      if (cur.trim()) out.push(cur.trim());
      cur = l;
    } else if (cur) {
      cur += '\n' + l;
    } else {
      cur = l;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  if (out.length === 0 && text.trim()) out.push(text.trim());
  return out;
}

fs.mkdirSync(DATA_DIR, { recursive: true });
function readJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; }
}
function writeJSON(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}
let store = readJSON(STORE_FILE, { items: [] });
let vectors = readJSON(VEC_FILE, {}); // id -> {vec}
function persist() { writeJSON(STORE_FILE, store); writeJSON(VEC_FILE, vectors); }

/* ---------- 向量数据库：中文 bigram TF-IDF + 余弦相似度 ---------- */
function tokenize(text) {
  const t = (text || '').toLowerCase();
  const toks = [];
  const cjk = t.match(/[一-龥]/g) || [];
  for (let i = 0; i < cjk.length - 1; i++) toks.push(cjk[i] + cjk[i + 1]);
  for (const c of cjk) toks.push(c);
  const en = t.match(/[a-z0-9]+/g) || [];
  for (const w of en) toks.push(w);
  return toks;
}
function embed(text) {
  const vec = {};
  for (const tk of tokenize(text)) vec[tk] = (vec[tk] || 0) + 1;
  for (const k in vec) vec[k] = 1 + Math.log(vec[k]);
  return vec;
}
function cosine(a, b) {
  let dot = 0;
  const keys = Object.keys(a).length >= Object.keys(b).length ? Object.keys(a) : Object.keys(b);
  for (const k of keys) dot += (a[k] || 0) * (b[k] || 0);
  let na = 0, nb = 0;
  for (const k in a) na += a[k] * a[k];
  for (const k in b) nb += b[k] * b[k];
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
function isDue(m) { return m.box < MAX_BOX && m.nextReviewAt <= Date.now(); }

/* ---------- 本地规则分析（大模型未配置时回退） ---------- */
function guessErrorType(q, my, correct) {
  const myT = (my || '').trim(), correctT = (correct || '').trim();
  if (!myT) return '审题偏差';
  const n1 = parseFloat(myT.replace(/[^d.-]/g, '')), n2 = parseFloat(correctT.replace(/[^d.-]/g, ''));
  if (!isNaN(n1) && !isNaN(n2) && n1 !== n2) {
    const close = Math.abs(n1 - n2) <= Math.max(1, Math.abs(n2) * 0.1);
    return close ? '计算失误' : '概念不清';
  }
  if (myT.length === 1 && correctT.length === 1 && myT !== correctT) return '粗心大意';
  return '概念不清';
}

/* ---------- 配置（前端 UI 写入 data/config.json，叠加上环境变量） ---------- */
let config = readJSON(CONFIG_FILE, { llm: {}, ocr: {} });
function getLLMConfig() {
  const c = config && config.llm ? config.llm : {};
  return {
    key: c.apiKey || process.env.LLM_API_KEY || '',
    base: c.baseUrl || process.env.LLM_BASE_URL || 'https://api.openai.com/v1/chat/completions',
    model: c.model || process.env.LLM_MODEL || 'gpt-4o-mini',
    vision: c.vision || process.env.LLM_VISION_MODEL || ''
  };
}
function getOCRConfig() {
  const c = config && config.ocr ? config.ocr : {};
  const vendor = c.vendor || process.env.OCR_VENDOR || 'openai';
  if (vendor === 'baidu') {
    return {
      vendor,
      apiKey: c.apiKey || process.env.OCR_API_KEY || '',
      secretKey: c.secretKey || process.env.OCR_SECRET_KEY || ''
    };
  }
  // openai 兼容视觉：复用大模型配置（视觉模型优先）
  const llm = getLLMConfig();
  return { vendor: 'openai', apiKey: llm.key, base: llm.base, model: llm.vision || llm.model };
}
function ocrEnabled() {
  const cfg = getOCRConfig();
  if (cfg.vendor === 'baidu') return !!(cfg.apiKey && cfg.secretKey);
  return !!cfg.apiKey; // openai 兼容：复用 LLM key
}
async function testLLM(cfg) {
  if (!cfg.key) return { ok: false, error: '缺少 API Key' };
  try {
    const r = await fetch(cfg.base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 })
    });
    if (!r.ok) {
      let msg = 'HTTP ' + r.status;
      try { const j = await r.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch {}
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    const s = String(e);
    // 网络层错误（离线 / 沙箱无外网 / DNS）：视为网络不通，仍允许保存
    const network = /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|TIMEOUT|network|socket/i.test(s);
    return { ok: false, error: s, network };
  }
}

/* ---------- 大模型分析（可插拔） ---------- */
async function llmAnalyze(payload) {
  const cfg = getLLMConfig();
  if (!cfg.key) return null;
  const base = cfg.base;
  const model = cfg.model;
  const sys = '你是错题分析助手。根据学科、题干、学生错误答案、正确答案，判断【学科】(从["数学","英语","语文","物理","化学","生物","历史","地理","政治","行测","申论","其他"]选一)、错误类型(从[' +
    ERROR_TYPES.join(',') + ']选一)并抽取知识点(数组)。只返回JSON:{"subject":"...","errorType":"...","knowledgePoints":["..."]}';
  try {
    const r = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key },
      body: JSON.stringify({
        model, temperature: 0.2,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(payload) }],
        response_format: { type: 'json_object' }
      })
    });
    if (!r.ok) return null;
    const j = await r.json();
    return JSON.parse(j.choices[0].message.content);
  } catch { return null; }
}

/* ---------- 大模型变体题（可插拔） ---------- */
async function llmVariants(payload) {
  const cfg = getLLMConfig();
  if (!cfg.key) return null;
  try {
    const base = cfg.base;
    const model = cfg.model;
    const sys = `你是出题助手。基于原题生成 ${payload.count || 5} 道变体题，保持考点、难度相近，结构相似。每题一行 JSON: {"question":"...","hint":"..."}，整体输出 JSON {"items":[...]}`;
    const r = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key },
      body: JSON.stringify({ model, temperature: 0.7, messages: [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(payload) }], response_format: { type: 'json_object' } })
    });
    if (!r.ok) return null;
    const j = await r.json();
    const out = JSON.parse(j.choices[0].message.content);
    return Array.isArray(out.items) ? out.items : null;
  } catch { return null; }
}

/* ---------- 大模型批改（可插拔） ---------- */
async function llmGrade(payload) {
  const cfg = getLLMConfig();
  if (!cfg.key) return null;
  try {
    const base = cfg.base;
    const model = cfg.model;
    const sys = '你是 AI 批改助手。判断学生答案是否正确、得分(0-5)、简短评语。输出 JSON: {"score":N,"correct":bool,"comment":"..."}';
    const r = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key },
      body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(payload) }], response_format: { type: 'json_object' } })
    });
    if (!r.ok) return null;
    const j = await r.json();
    return JSON.parse(j.choices[0].message.content);
  } catch { return null; }
}

// —— OCR：OpenAI 兼容视觉 / 百度智能云 ——
async function ocrVision(imageDataUrl, llm) {
  try {
    const r = await fetch(llm.base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + llm.key },
      body: JSON.stringify({
        model: llm.model,
        messages: [{ role: 'user', content: [
          { type: 'text', text: '请识别图片中的所有题目文字，保持原题格式与换行，只输出识别到的文字内容，不要解释、不要翻译。' },
          { type: 'image_url', image_url: { url: imageDataUrl } }
        ] }]
      })
    });
    if (!r.ok) return null;
    const j = await r.json();
    const t = j.choices?.[0]?.message?.content || '';
    return t.trim() || null;
  } catch { return null; }
}
async function ocrBaidu(imageDataUrl, cfg) {
  try {
    const tokenUrl = 'https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=' +
      encodeURIComponent(cfg.apiKey) + '&client_secret=' + encodeURIComponent(cfg.secretKey);
    const tr = await fetch(tokenUrl);
    if (!tr.ok) return null;
    const tj = await tr.json();
    const token = tj.access_token;
    if (!token) return null;
    const b64 = imageDataUrl.split(',')[1] || imageDataUrl;
    const or = await fetch('https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=' + token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ image: b64 }).toString()
    });
    if (!or.ok) return null;
    const oj = await or.json();
    if (oj.error_code) return null;
    const lines = (oj.words_result || []).map((w) => w.words).join('\n');
    return lines || null;
  } catch { return null; }
}
async function ocrText(imageDataUrl) {
  const cfg = getOCRConfig();
  if (cfg.vendor === 'baidu') {
    if (!cfg.apiKey || !cfg.secretKey) return null;
    return await ocrBaidu(imageDataUrl, cfg);
  }
  // 默认 openai 兼容视觉：复用大模型配置（getOCRConfig 已优先取视觉模型）
  const llm = getOCRConfig();
  if (!llm.apiKey) return null;
  return await ocrVision(imageDataUrl, llm);
}

/* ---------- 工具 ---------- */
function uid() { return crypto.randomUUID(); }
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = ''; req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });
}
function find(id) { return store.items.find((m) => m.id === id); }

/* ---------- 静态资源托管（单端口部署：前端 + 后端同源，任意端口可用） ---------- */
// 严格白名单：只托管前端必需文件，杜绝源码 / 数据 / 子目录泄露
const STATIC_ALLOWED = new Set(['index.html', 'app.js', 'api.js', 'styles.css', 'config.js']);
function serveStatic(p, res) {
  let rel = decodeURIComponent(p).replace(/^\/+/, '');
  if (rel === '' || rel === 'index.html') rel = 'index.html';
  if (!STATIC_ALLOWED.has(rel)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found');
  }
  const filePath = path.join(STATIC_DIR, rel);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found');
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'access-control-allow-origin': '*' });
  res.end(fs.readFileSync(filePath));
}

/* ---------- 路由 ---------- */
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  // 静态资源（非 /api 的 GET 请求由本服务直接托管前端，单端口即可访问）
  if (req.method === 'GET' && !p.startsWith('/api/')) return serveStatic(p, res);
  const m = p.match(/^\/api\/mistakes\/([^/]+)(\/result)?$/);

  try {
    // 健康检查
    if (p === '/api/health') return send(res, 200, { ok: true, llm: !!getLLMConfig().key, ocr: ocrEnabled() });

    // 配置读取（不返回敏感 key，仅返回是否已配置 / base / model）
    if (p === '/api/config' && req.method === 'GET') {
      const c = getLLMConfig();
      const o = getOCRConfig();
      return send(res, 200, {
        hasKey: !!c.key,
        llm: { base: c.base, model: c.model, vision: c.vision },
        ocr: { vendor: o.vendor, hasKey: !!o.apiKey, hasSecret: !!o.secretKey }
      });
    }

    // 配置保存：先校验 LLM Key 是否能连通，校验通过才落盘
    if (p === '/api/config' && req.method === 'POST') {
      const b = await readBody(req);
      const llmIn = b.llm || {};
      const cur = getLLMConfig();
      const cand = {
        key: (llmIn.apiKey != null && llmIn.apiKey !== '') ? llmIn.apiKey : cur.key,
        base: llmIn.baseUrl || cur.base,
        model: llmIn.model || cur.model
      };
      if (!cand.key) return send(res, 200, { ok: false, error: '请填写 API Key', saved: false });
      if (!cand.base) return send(res, 200, { ok: false, error: '请填写 Base URL', saved: false });
      const test = await testLLM(cand);
      if (!test.ok && !test.network) return send(res, 200, { ok: false, error: '校验失败：' + test.error, saved: false });
      config.llm = { apiKey: cand.key, baseUrl: cand.base, model: cand.model, vision: (llmIn.vision != null && llmIn.vision !== '') ? llmIn.vision : cur.vision };
      if (b.ocr) {
        config.ocr = config.ocr || {};
        if (b.ocr.vendor != null) config.ocr.vendor = b.ocr.vendor;
        if (b.ocr.apiKey != null) config.ocr.apiKey = b.ocr.apiKey;
        if (b.ocr.secretKey != null) config.ocr.secretKey = b.ocr.secretKey;
      }
      writeJSON(CONFIG_FILE, config);
      if (test.ok)
        return send(res, 200, { ok: true, hasKey: true, llm: { base: cand.base, model: cand.model } });
      // 网络层错误：已保存，提示联网后生效
      return send(res, 200, { ok: true, savedWithWarning: true, hasKey: true, llm: { base: cand.base, model: cand.model }, warning: '已保存配置，但校验时网络不通（可能是离线/沙箱）。联网后将自动生效。' });
    }

    // 列表
    if (p === '/api/mistakes' && req.method === 'GET') return send(res, 200, { items: store.items });

    // 创建
    if (p === '/api/mistakes' && req.method === 'POST') {
      const b = await readBody(req);
      const item = b.id ? b : Object.assign({ id: uid() }, b);
      item.createdAt = item.createdAt || Date.now();
      item.box = item.box || 1;
      item.nextReviewAt = item.nextReviewAt || Date.now() + BOX_INTERVALS[0] * DAY;
      item.reviewCount = item.reviewCount || 0;
      // 分析：前端未给则后端补（优先大模型）
      if (!item.errorType) {
        const ai = await llmAnalyze({ subject: item.subject, question: item.question, myAnswer: item.myAnswer, correctAnswer: item.correctAnswer });
        item.errorType = ai?.errorType || guessErrorType(item.question, item.myAnswer, item.correctAnswer);
        if (ai?.knowledgePoints) item.knowledgePoints = ai.knowledgePoints;
      }
      // 向量化 + 去重
      vectors[item.id] = embed([item.question, item.myAnswer, item.correctAnswer].join(' '));
      let best = 0, bestId = null;
      for (const id in vectors) {
        if (id === item.id) continue;
        const s = cosine(vectors[item.id], vectors[id]);
        if (s > best) { best = s; bestId = id; }
      }
      if (best >= 0.82) item.duplicateOf = bestId;
      store.items.push(item);
      persist();
      return send(res, 201, { item, duplicateScore: best });
    }

    // 单条 GET / PATCH / DELETE
    if (m && !m[2]) {
      const id = m[1];
      if (req.method === 'GET') {
        const it = find(id); return it ? send(res, 200, { item: it }) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'PATCH') {
        const it = find(id); if (!it) return send(res, 404, { error: 'not found' });
        const b = await readBody(req);
        Object.assign(it, b);
        if (b.question !== undefined || b.myAnswer !== undefined || b.correctAnswer !== undefined)
          vectors[id] = embed([it.question, it.myAnswer, it.correctAnswer].join(' '));
        persist(); return send(res, 200, { item: it });
      }
      if (req.method === 'DELETE') {
        store.items = store.items.filter((x) => x.id !== id);
        delete vectors[id]; persist();
        return send(res, 200, { ok: true });
      }
    }

    // 复习结果（SM-2 质量分 0-5；兼容旧版 remembered 布尔 → quality 4/2）
    if (m && m[2] && req.method === 'POST') {
      const it = find(m[1]); if (!it) return send(res, 404, { error: 'not found' });
      const b = await readBody(req);
      const quality = b.quality !== undefined ? +b.quality : (b.remembered ? 4 : 2);
      const upd = sm2Update(it, quality);
      it.reviewCount = (it.reviewCount || 0) + 1;
      it.EF = upd.EF; it.interval = upd.interval; it.repetitions = upd.repetitions;
      it.box = boxFromSM2(upd.interval, upd.repetitions);
      it.nextReviewAt = upd.nextReviewAt;
      it.lastQuality = upd.lastQuality;
      it.lastReviewAt = Date.now();
      it.lastResult = quality >= 3 ? 'ok' : 'fail';
      persist(); return send(res, 200, { item: it });
    }

    // 到期复习队列
    if (p === '/api/reviews/due' && req.method === 'POST')
      return send(res, 200, { items: store.items.filter(isDue).sort((a, b) => a.nextReviewAt - b.nextReviewAt) });

    // 智能分析（含学科自动识别）
    if (p === '/api/analyze' && req.method === 'POST') {
      const b = await readBody(req);
      const ai = await llmAnalyze(b);
      const baseText = [b.question, b.myAnswer, b.correctAnswer].join(' ');
      const localSubject = guessSubject(baseText);
      const out = ai || { errorType: guessErrorType(b.question, b.myAnswer, b.correctAnswer), knowledgePoints: [], subject: localSubject };
      if (!out.subject) out.subject = localSubject;
      return send(res, 200, out);
    }

    // 变体题生成（LLM 优先 + 本地回退）
    if (p === '/api/variants' && req.method === 'POST') {
      const b = await readBody(req);
      const ai = await llmVariants({ question: b.question, subject: b.subject, count: b.count });
      const items = ai || localVariants(b.question, b.subject, b.count);
      return send(res, 200, { items });
    }

    // AI 批改（LLM 优先 + 本地回退）
    if (p === '/api/grade' && req.method === 'POST') {
      const b = await readBody(req);
      const ai = await llmGrade(b);
      const r = ai || localGrade(b.question, b.userAnswer, b.correctAnswer);
      return send(res, 200, r);
    }

    // OCR 题目拆分（独立端点，客户端可对纯文本拆分）
    if (p === '/api/ocr/split' && req.method === 'POST') {
      const b = await readBody(req);
      return send(res, 200, { questions: splitQuestions(b.text || '') });
    }

    // 相似题检索（向量库）
    if (p === '/api/similar' && req.method === 'POST') {
      const b = await readBody(req);
      const qv = embed(b.text || '');
      const out = [];
      for (const id in vectors) {
        if (id === b.excludeId) continue;
        const it = find(id); if (!it) continue;
        if (b.subject && it.subject !== b.subject) continue;
        const s = cosine(qv, vectors[id]);
        if (s >= 0.3) out.push({ id, question: it.question, score: +s.toFixed(3) });
      }
      out.sort((a, z) => z.score - a.score);
      return send(res, 200, { items: out.slice(0, 5) });
    }

    // OCR（可插拔）
    if (p === '/api/ocr' && req.method === 'POST') {
      const b = await readBody(req);
      const text = await ocrText(b.image);
      if (text === null) return send(res, 501, { error: 'OCR 未配置（在「设置 ⚙」中选择厂商并填写密钥后启用），请手动输入文本' });
      return send(res, 200, { text });
    }

    // AI 答疑 SSE 流式
    if (p === '/api/qa/stream' && req.method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const subject = url.searchParams.get('subject') || '';
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'connection': 'keep-alive',
        'access-control-allow-origin': '*',
        'x-accel-buffering': 'no'
      });
      const write = (data) => { try { res.write('data: ' + JSON.stringify(data) + '\n\n'); } catch {} };

      if (getLLMConfig().key) {
        try {
          const cfg = getLLMConfig();
          const base = cfg.base;
          const model = cfg.model;
          // 输出格式约束：禁用 LaTeX/Markdown 源码——前端是 textContent 直贴，源码会原样显示给用户
          // 强制用「自然语言 + HTML 表格 + 直接显示的中文标点」，让前端能直接渲染出漂亮的最终样式
          const sys = [
            '你是 AI 学伴，回答学生关于错题和学科的问题，简短、有条理，给出可执行建议。',
            '',
            '【输出格式硬性约束 — 必须遵守，违反会让用户看到乱码】',
            '1. 数学公式：用最朴素的方式写，如「π/2」「sin(x+y)」「(a+b)/c」「x²+y²=1」。',
            '   禁止使用任何 LaTeX 源码：禁止 $...$、\\frac{}{}、\\sin、\\alpha、\\left \\right 等。',
            '2. 标题与列表：用纯文字或数字编号(如「一、核心口诀」「(1)(2)(3)」），',
            '   禁止使用 Markdown 源码：禁止 ### ####、---、**粗体符号**、`代码`。',
            '3. 需要对比 / 列举 / 步骤时，**直接使用 HTML 表格 <table> 或 <ol><li> 标签**，',
            '   浏览器会原样渲染成漂亮格式。表格示例：<table><tr><th>情况</th><th>口诀</th></tr><tr><td>奇数</td><td>函数名变</td></tr></table>',
            '4. 强调可用【】包围关键词（比方括号更显眼）；避免单独一行「---」「===」',
            '5. 段落之间用空行分隔；不要用任何控制符号 / 转义符 / 反引号。'
          ].join('\n');
          const r = await fetch(base, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key },
            body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: sys }, { role: 'user', content: '[学科:' + subject + '] ' + q }] })
          });
          if (!r.ok || !r.body) {
            // 透传上游状态码 + body 截短，下次再炸不用瞎子摸象
            let bodyTxt = '';
            try { bodyTxt = (await r.text()).slice(0, 300); } catch {}
            write({ error: `LLM 调用失败：HTTP ${r.status} ${r.statusText || ''}${bodyTxt ? ' · ' + bodyTxt : ''}` });
            return res.end();
          }
          const reader = r.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split('\n'); buf = lines.pop();
            for (const ln of lines) {
              const t = ln.trim();
              if (!t.startsWith('data:')) continue;
              const payload = t.slice(5).trim();
              if (payload === '[DONE]') { write({ done: true }); return res.end(); }
              try {
                const j = JSON.parse(payload);
                const delta = j.choices?.[0]?.delta?.content || '';
                if (delta) write({ delta });
              } catch {}
            }
          }
          write({ done: true }); return res.end();
        } catch (e) {
          write({ error: String(e) }); return res.end();
        }
      }

      // 本地回退：模拟流式
      const answer = `（本地模式 · 未配置 LLM_API_KEY）关于「${q}」的简明思路：\n\n1. 先识别题目考点与设问。\n2. 回忆该考点常见解法与易错点。\n3. 套用方法逐步求解，写完后回头检查。\n\n建议把本题加入错题本并设置难度等级，每天先做今日到期复习。`;
      let i = 0;
      const id = setInterval(() => {
        if (i >= answer.length) { clearInterval(id); write({ done: true }); return res.end(); }
        write({ delta: answer.slice(i, i + 4) }); i += 4;
      }, 60);
      req.on('close', () => clearInterval(id));
      return;
    }

    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: String(e) });
  }
});

server.listen(PORT, () => {
  const llmOn = !!getLLMConfig().key, ocrOn = !!getOCRConfig().key;
  console.log(`[错题本后端] http://127.0.0.1:${PORT}  (LLM=${llmOn ? 'on' : 'off'} OCR=${ocrOn ? 'on' : 'off'})`);
  if (!llmOn) console.log('[提示] 未配置大模型：在「设置 ⚙」中填入 API Key / Base URL / Model 即可启用，或启动时设置 LLM_API_KEY 环境变量。');
});

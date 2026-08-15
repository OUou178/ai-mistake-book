/* ============================================================
 * AI 智能错题本 — 多页面应用
 * 页面：错题集 / AI 答疑 / 录入 / 复习（三阶段）/ 数据看板(ECharts) / 帮助中心
 * 组件：卡片 / 标签 / 空状态 / 骨架屏 / 5色评分 / 颜色选择器 / Toast / Modal
 * 数据：API（后端优先，离线 localStorage 兜底）
 * ============================================================ */

// —— 学段/考试分类 ——
const STAGES = {
  '小学': { grades: ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'], subjects: ['语文', '数学', '英语', '科学', '道德与法治', '其他'] },
  '初中': { grades: ['初一', '初二', '初三'], subjects: ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '道德与法治', '其他'] },
  '高中': { grades: ['高一', '高二', '高三'], subjects: ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治', '其他'] },
  '大学': { grades: ['大一', '大二', '大三', '大四', '研究生'], subjects: ['高等数学', '大学英语', '专业课', '考研公共课', '其他'] },
  '社会性考试': {
    grades: ['考研', '公务员', '教师资格', '法律职业资格', '注册会计师', '执业医师', '雅思', '托福', '英语四六级', '计算机等级', '其他'],
    examSubjects: {
      '考研': ['政治', '英语一/二', '数学一/二/三', '专业课'],
      '公务员': ['行测', '申论'],
      '教师资格': ['综合素质', '教育知识与能力', '学科知识'],
      '法律职业资格': ['客观题', '主观题'],
      '注册会计师': ['会计', '审计', '财务成本管理', '税法', '经济法', '公司战略'],
      '执业医师': ['临床', '口腔', '中医', '基础医学'],
      '雅思': ['听力', '阅读', '写作', '口语'],
      '托福': ['听力', '阅读', '写作', '口语'],
      '英语四六级': ['听力', '阅读', '写作', '翻译'],
      '计算机等级': ['选择题', '操作题'],
      '其他': ['其他']
    }
  }
};
const ERROR_TYPES = ['概念不清', '计算失误', '审题偏差', '知识遗忘', '思路错误', '粗心大意', '其他'];
const BOX_INTERVALS = [1, 3, 7, 16, 30];
const MAX_BOX = 5;
const DAY = 86400000;
const TAXONOMY = {
  数学: ['函数', '导数', '三角函数', '数列', '立体几何', '概率', '统计', '不等式', '向量', '解析几何', '复数', '圆锥曲线', '排列组合', '微积分'],
  英语: ['时态', '语态', '定语从句', '名词性从句', '状语从句', '非谓语', '虚拟语气', '介词', '词汇', '阅读理解', '完形填空', '语法填空', '书面表达', '冠词'],
  语文: ['文言文', '古诗词', '现代文阅读', '作文', '成语', '病句', '标点符号', '修辞手法', '文学常识', '古诗文默写'],
  物理: ['力学', '运动学', '电磁学', '能量', '动量', '热学', '光学', '原子物理', '电场', '磁场', '电路', '机械振动'],
  化学: ['氧化还原', '电解质', '有机化学', '化学平衡', '元素周期律', '电化学', '离子反应', '物质的量', '化学实验', '反应速率'],
  生物: ['细胞', '遗传', '进化', '神经调节', '光合作用', '呼吸作用', '生态系统', '免疫', '基因', '蛋白质'],
  历史: ['中国古代史', '中国近现代史', '世界史', '政治制度', '经济史', '思想文化', '改革', '战争'],
  地理: ['自然地理', '人文地理', '区域地理', '气候', '地形', '洋流', '人口', '城市', '农业', '工业'],
  政治: ['经济生活', '政治生活', '文化生活', '哲学', '法治', '国家制度', '国际社会', '马原', '毛中特', '史纲', '思修', '时政'],
  行测: ['资料分析', '判断推理', '言语理解', '数量关系', '常识'],
  申论: ['归纳概括', '对策建议', '综合分析', '公文写作', '大作文'],
  '高等数学': ['极限', '导数', '积分', '级数', '多元函数'],
  '大学英语': ['词汇', '语法', '阅读', '写作'],
  听力: ['主旨', '细节', '推断'],
  阅读: ['主旨', '细节', '词义', '推理'],
  写作: ['结构', '语法', '逻辑'],
  口语: ['流利', '词汇', '语法'],
  翻译: ['直译', '意译', '长难句'],
  会计: ['分录', '报表', '准则'],
  审计: ['风险评估', '内控', '证据'],
  财务成本管理: ['估值', '资本', '成本'],
  税法: ['增值税', '所得税', '稽查'],
  经济法: ['合同', '公司', '证券'],
  公司战略: ['战略', '风险', '内控'],
  临床: ['内科学', '外科学', '妇产科', '儿科'],
  基础医学: ['生理', '生化', '病理', '药理'],
  其他: []
};
const STAGE_COLOR = { '小学': 'left-blue', '初中': 'left-green', '高中': 'left-orange', '大学': 'left-purple', '社会性考试': 'left-pink' };

// —— 状态 ——
let state = { items: [] };
let pendingImg = null;
let pendingScore = null;
let pendingReviewQ = null;
let qaConversations = [];
let currentQaId = null;
let qaES = null;
let charts = {};

// —— 工具 ——
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const truncate = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : (s || ''));
const gradesOf = (stage) => (STAGES[stage]?.grades || []);
const subjectsOf = (stage, grade) => {
  if (stage === '社会性考试') return (STAGES['社会性考试'].examSubjects[grade] || ['其他']).slice();
  return (STAGES[stage]?.subjects || ['其他']).slice();
};
const allSubjects = () => {
  const set = new Set();
  for (const k of Object.keys(STAGES)) {
    if (k === '社会性考试') for (const ex of Object.keys(STAGES[k].examSubjects)) for (const s of STAGES[k].examSubjects[ex]) set.add(s);
    else for (const s of STAGES[k].subjects) set.add(s);
  }
  return Array.from(set);
};
const isDue = (m) => m.box < MAX_BOX && m.nextReviewAt <= Date.now();
const statusOf = (m) => (m.box >= MAX_BOX ? 'mastered' : (isDue(m) ? 'due' : 'learning'));

// —— 智能分析（本地规则） ——
function extractKnowledge(subject, text) {
  const pool = TAXONOMY[subject] || [];
  const hit = new Set();
  for (const kw of pool) if (text && text.includes(kw)) hit.add(kw);
  return Array.from(hit);
}
function guessErrorType(q, my, correct) {
  const m = (my || '').trim(), c = (correct || '').trim();
  if (!m) return '审题偏差';
  const n1 = parseFloat(m.replace(/[^d.-]/g, '')), n2 = parseFloat(c.replace(/[^d.-]/g, ''));
  if (!isNaN(n1) && !isNaN(n2) && n1 !== n2) {
    const close = Math.abs(n1 - n2) <= Math.max(1, Math.abs(n2) * 0.1);
    return close ? '计算失误' : '概念不清';
  }
  if (m.length === 1 && c.length === 1 && m !== c) return '粗心大意';
  return '概念不清';
}
function localAnalyze({ subject, question, myAnswer, correctAnswer }) {
  const text = [question, myAnswer, correctAnswer].join(' ');
  return {
    errorType: guessErrorType(question, myAnswer, correctAnswer),
    knowledgePoints: extractKnowledge(subject, text),
    subject: guessSubjectFromText(text) || subject
  };
}

// 学科自动识别（关键词匹配）
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
function guessSubjectFromText(text) {
  const t = (text || '').toLowerCase();
  for (const r of SUBJECT_RULES) for (const k of r.keys) if (t.includes(k)) return r.s;
  return null;
}

/* ---------- SM-2 间隔重复算法 ---------- */
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

/* ---------- 题目拆分（OCR 文本 → 多题候选） ---------- */
function splitQuestions(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const out = [];
  let cur = '';
  const isStart = (l) => /^(\d+[\.、\)]|第\s*\d+\s*题|（\s*\d+\s*）|\(\s*\d+\s*\)|[一二三四五六七八九十]+[\.、\)])\s*/.test(l);
  for (const l of lines) {
    if (isStart(l)) { if (cur.trim()) out.push(cur.trim()); cur = l; }
    else if (cur) cur += '\n' + l; else cur = l;
  }
  if (cur.trim()) out.push(cur.trim());
  if (out.length === 0 && text.trim()) out.push(text.trim());
  return out;
}

/* ---------- 一键变体复习 ---------- */
let vpVariants = [];     // 当前变体题列表
let vpGraded = [];       // 批改结果
let vpBaseQuestion = ''; // 模板题
async function initVariantPractice() {
  const stage = $('#vpStage');
  if (!stage) return;
  stage.innerHTML = '<option value="">选择学段</option>' + Object.keys(STAGES).map((s) => `<option>${s}</option>`).join('');
  $('#vpSubject').innerHTML = '<option value="">选择学科</option>' + allSubjects().map((s) => `<option>${s}</option>`).join('');
  refreshVpBase();
  refreshVpSubject();
}
function refreshVpSubject() {
  const stage = $('#vpStage').value;
  const subs = !stage ? allSubjects() : subjectsOfStage(stage);
  $('#vpSubject').innerHTML = '<option value="">选择学科</option>' + subs.map((s) => `<option>${s}</option>`).join('');
  refreshVpBase();
}
function refreshVpBase() {
  const stage = $('#vpStage').value, subject = $('#vpSubject').value;
  const items = state.items.filter((m) => (!stage || m.stage === stage) && (!subject || m.subject === subject));
  const sel = $('#vpBase');
  sel.innerHTML = '<option value="">从错题集挑选模板题（留空则自由出题）</option>' + items.slice(0, 50).map((m) => `<option value="${esc(m.question)}">${esc(truncate(m.question, 60))}</option>`).join('');
}
async function generateVariants() {
  const stage = $('#vpStage').value, subject = $('#vpSubject').value;
  const baseQ = $('#vpBase').value || vpBaseQuestion || '请基于数学学科出一道变体题';
  const count = Math.max(1, Math.min(10, parseInt($('#vpCount').value, 10) || 5));
  vpBaseQuestion = baseQ;
  $('#vpStatus').textContent = '🪄 生成中…（LLM 优先，本地数字变换兜底）';
  $('#vpArea').innerHTML = skeletonCards(2);
  const r = await API.variants(baseQ, subject, count);
  vpVariants = (r && r.items) || [];
  vpGraded = vpVariants.map(() => null);
  if (!vpVariants.length) {
    $('#vpStatus').textContent = '❌ 生成失败，请重试';
    $('#vpArea').innerHTML = '';
    return;
  }
  $('#vpStatus').textContent = `✓ 已生成 ${vpVariants.length} 道变体题，作答后点击「提交全部」获取 AI 批改`;
  renderVpArea();
}
function renderVpArea() {
  const html = vpVariants.map((v, i) => {
    const gr = vpGraded[i];
    const resultHtml = gr
      ? `<div class="vp-result ${gr.correct ? 'ok' : (gr.score >= 3 ? 'partial' : 'fail')}">
           <b>${gr.correct ? '✓ 正确' : (gr.score >= 3 ? '◐ 部分正确' : '✗ 错误')}</b> · 得分 ${gr.score}/5 · ${esc(gr.comment || '')}
         </div>`
      : '';
    return `<div class="vp-question">
      <div class="vp-q-num">第 ${i + 1} 题${v.hint ? ' · ' + esc(v.hint) : ''}</div>
      <div style="white-space:pre-wrap;font-weight:700;margin-bottom:8px">${esc(v.question)}</div>
      <textarea class="vp-ans" data-i="${i}" rows="2" placeholder="在此输入你的答案…"></textarea>
      ${resultHtml}
    </div>`;
  }).join('');
  $('#vpArea').innerHTML = html + (vpVariants.length
    ? '<div style="display:flex;gap:10px;flex-wrap:wrap"><button id="vpSubmitAll" class="btn primary">提交全部 · AI 批改</button><button id="vpSaveAll" class="btn ghost">📥 全部加入错题本</button></div>'
    : '');
  if (vpVariants.length) {
    $('#vpSubmitAll').addEventListener('click', gradeVariants);
    $('#vpSaveAll').addEventListener('click', saveVariantsAsMistakes);
  }
}
async function gradeVariants() {
  const baseQ = vpBaseQuestion;
  const subject = $('#vpSubject').value;
  for (let i = 0; i < vpVariants.length; i++) {
    const userAns = ($('.vp-ans[data-i="' + i + '"]').value || '').trim();
    const r = await API.grade(vpVariants[i].question, userAns, '', subject);
    vpGraded[i] = { score: r.score || 0, correct: !!r.correct, comment: r.comment || '' };
  }
  $('#vpStatus').textContent = `✓ 批改完成 · 总均分 ${(vpGraded.reduce((s, g) => s + (g ? g.score : 0), 0) / vpGraded.length).toFixed(1)}/5`;
  renderVpArea();
}
function saveVariantsAsMistakes() {
  let saved = 0;
  vpVariants.forEach((v, i) => {
    const gr = vpGraded[i];
    const userAns = $('.vp-ans[data-i="' + i + '"]').value || '';
    const m = {
      id: uid(),
      stage: $('#vpStage').value || '其他',
      grade: '',
      subject: $('#vpSubject').value || guessSubjectFromText(v.question) || '其他',
      question: v.question,
      myAnswer: userAns,
      correctAnswer: '',
      analysis: gr ? '一键变体复习 · 得分 ' + gr.score + '/5 · ' + (gr.comment || '') : '一键变体复习',
      errorType: gr && gr.correct ? '其他' : '概念不清',
      knowledgePoints: [],
      difficulty: 3,
      EF: 2.5, interval: 1, repetitions: 0,
      box: 1, nextReviewAt: Date.now() + DAY,
      createdAt: Date.now(), reviewCount: 0
    };
    state.items.push(m);
    API.add(m).catch(() => {});
    saved++;
  });
  saveLocal();
  toast('已导入 ' + saved + ' 道变体题到错题本');
  refresh();
}

// —— 组件：空状态 / 骨架屏 ——
function emptyState({ icon = '📭', title = '暂无数据', desc = '', action = null }) {
  const a = action ? `<button class="btn primary sm" onclick="location.hash='#/${action.href}'">${action.label}</button>` : '';
  return `<div class="empty-state">
    <div class="icon">${icon}</div>
    <h4>${esc(title)}</h4>
    <p>${esc(desc)}</p>
    ${a}
  </div>`;
}
function skeleton(rows = 3) {
  let h = '<div>';
  for (let i = 0; i < rows; i++) h += `<div class="skeleton" style="margin-bottom:8px;width:${60 + Math.random() * 35}%"></div>`;
  return h + '</div>';
}
// 卡片形骨架屏（列表加载占位）
function skeletonCards(rows = 6) {
  let h = '<div class="card-list">';
  for (let i = 0; i < rows; i++) {
    h += `<div class="skeleton-card">
      <div class="skeleton" style="width:42%;height:16px;margin-bottom:10px"></div>
      <div class="skeleton" style="width:92%;margin-bottom:8px"></div>
      <div class="skeleton" style="width:74%;margin-bottom:12px"></div>
      <div class="skeleton" style="width:52%;height:26px"></div>
    </div>`;
  }
  return h + '</div>';
}

// —— Toast ——
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

// —— 路由 ——
function navigate() {
  const hash = location.hash.replace(/^#\/?/, '') || 'notebook';
  const route = hash.split('/')[0];
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + route));
  $$('.tabs .tab').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
  switch (route) {
    case 'notebook': renderNotebook(); break;
    case 'qa': renderQa(); break;
    case 'add': break; // 静态表单
    case 'review': renderReview(); break;
    case 'plan': renderPlan(); break;
    case 'dashboard': renderDashboard(); break;
    case 'help': break;
  }
}
window.addEventListener('hashchange', navigate);

// —— 渲染：错题集 ——
function filterItems() {
  const q = $('#searchInput').value.trim().toLowerCase();
  const stage = $('#filterStage').value;
  const grade = $('#filterGrade').value;
  const subj = $('#filterSubject').value;
  const err = $('#filterError').value;
  const st = $('#filterStatus').value;
  let list = state.items.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (q) list = list.filter((m) => [m.question, m.myAnswer, m.correctAnswer, m.analysis, (m.knowledgePoints || []).join(' ')].join(' ').toLowerCase().includes(q));
  if (stage) list = list.filter((m) => m.stage === stage);
  if (grade) list = list.filter((m) => m.grade === grade);
  if (subj) list = list.filter((m) => m.subject === subj);
  if (err) list = list.filter((m) => m.errorType === err);
  if (st) list = list.filter((m) => statusOf(m) === st);
  return list;
}
function renderNotebook() {
  const hasItems = state.items.length > 0;
  const list = filterItems();
  const el = $('#notebookList');
  if (!list.length) {
    if (!hasItems) {
      // 整个库为空：引导首次录入
      el.innerHTML = emptyState({ icon: '🎯', title: '还没有错题', desc: '先去录入你的第一道错题吧', action: { label: '+ 录入错题', href: 'add' } });
    } else {
      // 有数据，但当前筛选/搜索无匹配：明确区分
      el.innerHTML = emptyState({ icon: '🔍', title: '没有匹配的错题', desc: '没有符合当前筛选或搜索条件的结果，换个关键词或点「重置」试试' });
    }
    return;
  }
  el.innerHTML = list.map(cardHTML).join('');
}
function cardHTML(m) {
  const st = statusOf(m);
  const stLabel = { due: '待复习', mastered: '已掌握', learning: '学习中' }[st];
  const stClass = { due: 'due', mastered: 'mastered', learning: 'box' }[st];
  const color = STAGE_COLOR[m.stage] || 'left-yellow';
  const kp = (m.knowledgePoints || []).map((k) => `<span class="tag kp">${esc(k)}</span>`).join(' ');
  return `<div class="card ${color}" data-id="${m.id}">
    <div class="head">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="tag">${esc(m.stage || '—')}·${esc(m.grade || '—')}</span>
        <span class="tag">${esc(m.subject)}</span>
      </div>
      <span class="tag ${stClass}">${stLabel}·L${m.box}</span>
    </div>
    <div class="q">${esc(truncate(m.question, 80))}</div>
    <div class="ans"><b>错：</b>${esc(truncate(m.myAnswer || '（空）', 36))} ｜ <b>对：</b>${esc(truncate(m.correctAnswer || '—', 36))}</div>
    <div>${kp}<span class="tag err" style="margin-left:4px">${esc(m.errorType)}</span> <span class="diff">${'★'.repeat(m.difficulty || 3)}</span></div>
    <div class="foot">
      <button class="btn sm ghost" data-act="detail">查看</button>
      <button class="btn sm" data-act="review-one">复习</button>
      <button class="btn sm danger" data-act="del">删除</button>
    </div>
  </div>`;
}

// —— 渲染：复习（三阶段） ——
function renderReview() {
  initVariantPractice();
  const items = state.items.slice();
  const due = items.filter(isDue).sort((a, b) => a.nextReviewAt - b.nextReviewAt);
  const learning = items.filter((m) => statusOf(m) === 'learning').sort((a, b) => b.createdAt - a.createdAt);
  const mastered = items.filter((m) => statusOf(m) === 'mastered').sort((a, b) => (m.lastReviewAt || m.createdAt) - (a.lastReviewAt || a.createdAt));
  $('#dueCount').textContent = due.length;
  $('#learningCount').textContent = learning.length;
  $('#masteredCount').textContent = mastered.length;
  $('#reviewSummary').textContent = `共 ${items.length} 道 · 待复习 ${due.length} · 已掌握 ${mastered.length}`;
  $('#dueList').innerHTML = due.length ? due.map(cardHTML).join('') : emptyState({ icon: '🎉', title: '今日没有到期错题', desc: '保持节奏，去添加新题或休息一下' });
  $('#learningList').innerHTML = learning.length ? learning.map(cardHTML).join('') : emptyState({ icon: '📖', title: '暂无学习中题目' });
  $('#masteredList').innerHTML = mastered.length ? mastered.map(cardHTML).join('') : emptyState({ icon: '🏆', title: '还没有掌握任何题目', desc: '坚持复习就能看到这里多起来' });
}

// —— 渲染：AI 答疑 ——
function loadQa() {
  try { qaConversations = JSON.parse(localStorage.getItem('qa_conversations_v1')) || []; } catch { qaConversations = []; }
}
function saveQa() { localStorage.setItem('qa_conversations_v1', JSON.stringify(qaConversations)); }
function renderQa() {
  loadQa();
  const h = $('#qaHistory');
  h.innerHTML = qaConversations.length
    ? qaConversations.map((c) => `<div class="qa-item ${c.id === currentQaId ? 'active' : ''}" data-id="${c.id}">
        <div>${esc(truncate(c.title || '新会话', 22))}</div>
        <div class="q-time">${new Date(c.createdAt).toLocaleString('zh-CN', { hour12: false })}</div>
      </div>`).join('')
    : '<div class="muted" style="font-size:12px">暂无会话</div>';
  const cur = qaConversations.find((c) => c.id === currentQaId);
  const msgs = $('#chatMsgs');
  if (!cur) {
    msgs.innerHTML = emptyState({ icon: '💬', title: '开始第一次对话', desc: '试着问「三角函数诱导公式怎么记？」' });
  } else {
    msgs.innerHTML = cur.messages.map((m) => `<div class="msg ${m.role}"><div class="bubble">${esc(m.text)}</div><div class="meta">${esc(m.role === 'user' ? '我' : 'AI')} · ${new Date(m.time).toLocaleTimeString('zh-CN', { hour12: false })}</div>${m.role === 'ai' ? `<div style="margin-top:4px"><button class="btn sm ghost" data-act="add-to-book" data-text="${esc(m.text)}">📋 加入错题本</button></div>` : ''}</div>`).join('');
    msgs.scrollTop = msgs.scrollHeight;
  }
  $('#qaStatus').textContent = navigator.onLine ? '就绪' : '离线';
  API.status().then((on) => {
    const s = $('#qaStatus'); if (s) s.textContent = on ? '已连接' : '后端未连接 · 本地模式';
  });
}
function startNewQa() {
  const c = { id: uid(), title: '新会话', messages: [], createdAt: Date.now() };
  qaConversations.unshift(c);
  currentQaId = c.id;
  saveQa(); renderQa();
  $('#chatInput').focus();
}
async function sendChat(text) {
  if (!text.trim()) return;
  if (!currentQaId) startNewQa();
  const cur = qaConversations.find((c) => c.id === currentQaId);
  cur.messages.push({ role: 'user', text, time: Date.now() });
  if (cur.title === '新会话') cur.title = text.slice(0, 18);
  saveQa();
  // 渲染用户消息
  const msgs = $('#chatMsgs');
  msgs.insertAdjacentHTML('beforeend', `<div class="msg user"><div class="bubble">${esc(text)}</div><div class="meta">我 · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}</div></div>`);
  msgs.scrollTop = msgs.scrollHeight;
  $('#chatInput').value = '';

  // 占位 AI 流式
  const aiId = 'ai_' + uid();
  msgs.insertAdjacentHTML('beforeend', `<div class="msg ai streaming" id="${aiId}"><div class="bubble"></div><div class="meta">AI · 正在思考…</div></div>`);
  const aiEl = document.getElementById(aiId);
  const bubble = aiEl.querySelector('.bubble');
  const meta = aiEl.querySelector('.meta');
  let acc = '';

  // 用 fetch 读取 SSE（EventSource 不支持自定义 header，便于扩展）
  try {
    const url = API_BASE + '/api/qa/stream?q=' + encodeURIComponent(text);
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
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
        try {
          const j = JSON.parse(t.slice(5).trim());
          if (j.delta) { acc += j.delta; bubble.textContent = acc; msgs.scrollTop = msgs.scrollHeight; }
          if (j.error) { acc = j.error; bubble.textContent = acc; }
        } catch {}
      }
    }
  } catch (e) {
    acc = '（连接后端失败）请确认 server.js 已启动：' + e.message;
    bubble.textContent = acc;
  }
  aiEl.classList.remove('streaming');
  meta.textContent = 'AI · ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });
  // 加入错题本按钮
  aiEl.insertAdjacentHTML('beforeend', `<div style="margin-top:4px"><button class="btn sm ghost" data-act="add-to-book" data-text="${esc(acc)}">📋 加入错题本</button></div>`);
  cur.messages.push({ role: 'ai', text: acc, time: Date.now() });
  saveQa();
}
const API_BASE = 'http://127.0.0.1:3000';

// —— 渲染：数据看板（ECharts） ——
function renderDashboard() {
  const items = state.items;
  const total = items.length;
  const due = items.filter(isDue).length;
  const mastered = items.filter((m) => m.box >= MAX_BOX).length;
  const rate = total ? Math.round((mastered / total) * 100) : 0;
  $('#statGrid').innerHTML = [
    ['错题总数', total, 'blue'],
    ['今日到期', due, 'green'],
    ['已掌握', mastered, 'orange'],
    ['掌握率', rate + '%', 'purple']
  ].map(([l, n]) => `<div class="stat-card"><div class="stat-num">${n}</div><div class="stat-label">${l}</div></div>`).join('');
  $('#dashSummary').textContent = `共 ${total} 道 · ${due} 待复习`;

  const palette = ['#5cc8ff', '#7ee787', '#ffb454', '#b692ff', '#ff5da2', '#ffd60a', '#ff5a5f', '#3aa1bf', '#5fd97e', '#c4a8ff'];
  const by = (keyFn) => {
    const m = {}; for (const x of items) { const k = keyFn(x) || '未分类'; m[k] = (m[k] || 0) + 1; } return m;
  };
  const toPie = (map) => Object.entries(map).map(([name, value], i) => ({ name, value, itemStyle: { color: palette[i % palette.length] } }));

  const ink = document.documentElement.getAttribute('data-theme') === 'dark' ? '#f4f4f0' : '#16161d';
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const buildOpts = () => {
    const base = { textStyle: { fontFamily: 'Inter', fontWeight: 700, color: ink }, tooltip: { trigger: 'item' } };
    const o = {};
    o.subject = { ...base, series: [{ type: 'pie', radius: ['38%', '70%'], label: { fontWeight: 800, color: ink }, data: toPie(by((m) => m.subject)) }] };
    o.error = { ...base, series: [{ type: 'pie', radius: ['38%', '70%'], data: toPie(by((m) => m.errorType)) }] };
    o.stage = { ...base, series: [{ type: 'pie', radius: ['38%', '70%'], data: toPie(by((m) => m.stage)) }] };
    o.progress = {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie', radius: ['55%', '78%'], avoidLabelOverlap: true,
        label: { show: true, formatter: '{b}\n{d}%', fontWeight: 800, color: ink },
        data: [
          { name: '已掌握', value: mastered, itemStyle: { color: '#b692ff' } },
          { name: '学习中', value: items.filter((m) => statusOf(m) === 'learning').length, itemStyle: { color: '#ffb454' } },
          { name: '待复习', value: due, itemStyle: { color: '#ff5a5f' } }
        ]
      }]
    };
    // 14 天趋势
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = []; const counts = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY);
      days.push((d.getMonth() + 1) + '/' + d.getDate());
      counts.push(items.filter((m) => {
        const t = new Date(m.createdAt); t.setHours(0, 0, 0, 0);
        return t.getTime() === d.getTime();
      }).length);
    }
    o.trend = {
      tooltip: { trigger: 'axis' },
      grid: { left: 36, right: 16, top: 16, bottom: 28 },
      xAxis: { type: 'category', data: days, axisLabel: { fontWeight: 700, color: ink } },
      yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } }, axisLabel: { color: ink } },
      series: [{
        type: 'line', data: counts, smooth: true, areaStyle: { opacity: .25, color: '#5cc8ff' },
        lineStyle: { width: 3, color: ink }, itemStyle: { color: '#ff5a5f' }, symbolSize: 8
      }]
    };
    return o;
  };

  if (window.echarts) {
    // 先展示 ECharts 加载动画，数据就绪后填充
    const map = { subject: '#chartSubject', error: '#chartError', stage: '#chartStage', progress: '#chartProgress', trend: '#chartTrend' };
    const opts = buildOpts();
    for (const k in map) {
      charts[k]?.dispose();
      charts[k] = echarts.init($(map[k]));
      charts[k].showLoading('default', {
        text: '加载中…', color: ink, textColor: ink,
        maskColor: dark ? 'rgba(35,35,44,.85)' : 'rgba(255,255,255,.85)', zlevel: 0
      });
    }
    // 短延时让加载态可见（体现看板加载过程）
    setTimeout(() => {
      for (const k in map) {
        const ch = charts[k];
        if (!ch || ch.isDisposed()) continue;
        ch.setOption(opts[k]);
        ch.hideLoading();
      }
    }, 300);
  } else {
    $('#chartSubject').innerHTML = skeletonCards(4);
  }
  renderKpMastery();
  renderRecommendations();
}
function renderRecommendations() {
  const items = state.items;
  const ul = $('#recommendList');
  if (!items.length) { ul.innerHTML = '<li class="empty">先录入几道错题，AI 就能给你个性化建议。</li>'; return; }
  const recs = [];
  const due = items.filter(isDue).length;
  if (due > 0) recs.push(`今天有 <b>${due}</b> 道错题到期，优先完成「复习」页的队列。`);
  else recs.push('当前没有到期复习，保持节奏 🎉');
  const bySubj = {};
  for (const m of items) (bySubj[m.subject] ||= []).push(m);
  const weak = Object.entries(bySubj).map(([s, arr]) => ({ s, rate: arr.filter((m) => m.box >= MAX_BOX).length / arr.length }))
    .sort((a, b) => a.rate - b.rate)[0];
  if (weak && weak.rate < 0.5) recs.push(`<b>${weak.s}</b> 掌握率较低，是薄弱学科，建议安排专项突破。`);
  const kpCount = {};
  for (const m of items) for (const k of (m.knowledgePoints || [])) kpCount[k] = (kpCount[k] || 0) + 1;
  const topKp = Object.entries(kpCount).sort((a, b) => b[1] - a[1])[0];
  if (topKp && topKp[1] >= 2) recs.push(`知识点 <b>${topKp[0]}</b> 出错 ${topKp[1]} 次，错得最集中，值得专项补漏。`);
  const errCount = {}; for (const m of items) errCount[m.errorType] = (errCount[m.errorType] || 0) + 1;
  const topErr = Object.entries(errCount).sort((a, b) => b[1] - a[1])[0];
  if (topErr) recs.push(`主要错因为 <b>${topErr[0]}</b>（${topErr[1]} 次），建议针对性训练。`);
  ul.innerHTML = recs.map((r) => `<li>${r}</li>`).join('');
}

// 知识点掌握度（按知识点聚合，mastery = avg(已掌握)）
function renderKpMastery() {
  const items = state.items;
  const el = $('#kpMastery');
  if (!el) return;
  const map = {};
  for (const m of items) for (const k of (m.knowledgePoints || [])) {
    if (!map[k]) map[k] = { total: 0, mastered: 0 };
    map[k].total += 1;
    if (m.box >= MAX_BOX) map[k].mastered += 1;
  }
  const list = Object.entries(map).map(([k, v]) => ({ k, ...v, pct: v.total ? Math.round((v.mastered / v.total) * 100) : 0 })).sort((a, b) => b.total - a.total).slice(0, 12);
  if (!list.length) { el.innerHTML = '<div class="muted" style="font-weight:700">还没有知识点数据，去录入错题或打开 AI 预分析试试。</div>'; return; }
  el.innerHTML = list.map((x) => `<div class="kp-row">
    <div class="kp-name">${esc(x.k)}</div>
    <div class="kp-bar ${x.pct < 50 ? 'weak' : ''}"><span style="width:${x.pct}%"></span></div>
    <div class="kp-pct">${x.pct}%</div>
  </div>`).join('');
}

// —— 渲染：复习计划（按学段/考试筛选，单独出计划） ——
function renderPlan() {
  const stage = $('#planStage').value;
  const grade = $('#planGrade').value;
  const body = $('#planBody');
  if (!stage) {
    body.innerHTML = emptyState({ icon: '🎯', title: '选择学段 / 考试', desc: '选一个学段或考试，自动生成专属复习计划', action: { label: '去错题集', href: 'notebook' } });
    return;
  }
  const items = state.items.filter((m) => m.stage === stage && (!grade || m.grade === grade));
  const subs = grade ? subjectsOf(stage, grade) : subjectsOfStage(stage);
  const total = items.length;
  const due = items.filter(isDue).length;
  const mastered = items.filter((m) => m.box >= MAX_BOX).length;
  const rate = total ? Math.round((mastered / total) * 100) : 0;
  $('#planSummary').textContent = `${stage}${grade ? ' · ' + grade : ''} · ${total} 题 · 待复习 ${due} · 掌握率 ${rate}%`;

  // 学科维度（只显示该学段/年级关联学科）
  const subStats = subs.map((s) => {
    const arr = items.filter((m) => m.subject === s);
    const t = arr.length;
    const m = arr.filter((x) => x.box >= MAX_BOX).length;
    const d = arr.filter(isDue).length;
    const r = t ? Math.round((m / t) * 100) : 0;
    const next = arr.filter((x) => x.box < MAX_BOX).reduce((mx, x) => Math.max(mx, x.nextReviewAt || 0), 0);
    return { s, t, m, d, r, next };
  });

  // 未来 7 天排期
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const dayTs = [], dayLabels = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() + i * DAY);
    dayTs.push(d.getTime());
    dayLabels.push(i === 0 ? '今天' : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + wd[d.getDay()]);
  }
  const week = dayTs.map((ts) => items.filter((m) => {
    if (m.box >= MAX_BOX) return false;
    const t = new Date(m.nextReviewAt); t.setHours(0, 0, 0, 0);
    return t.getTime() === ts;
  }).length);

  // 计划建议
  const recs = [];
  const weak = subStats.filter((x) => x.t >= 2 && x.r < 50).map((x) => x.s);
  if (weak.length) recs.push(`薄弱学科：${weak.join('、')}，建议优先安排专项突破。`);
  const errCount = {}; for (const m of items) errCount[m.errorType] = (errCount[m.errorType] || 0) + 1;
  const topErr = Object.entries(errCount).sort((a, b) => b[1] - a[1])[0];
  if (topErr) recs.push(`主要错因「${topErr[0]}」（${topErr[1]} 次）。`);
  const weekTotal = week.reduce((a, b) => a + b, 0);
  if (due > 0) recs.push(`未来 7 天有 ${weekTotal} 道到期，按下方排期分散练习，别堆到最后一天。`);
  else recs.push('当前没有到期复习，保持节奏即可。');

  const color = STAGE_COLOR[stage] || 'left-blue';
  const subCards = subStats.map((x) => `<div class="card ${color}">
      <div class="head"><b style="font-size:15px">${esc(x.s)}</b><span class="tag box">${x.r}%</span></div>
      <div class="plan-bar"><span style="width:${x.r}%"></span></div>
      <div class="plan-meta">总数 <b>${x.t}</b> · 待复习 <b>${x.d}</b> · 已掌握 <b>${x.m}</b></div>
      <div class="muted" style="font-size:12px;font-weight:700">${x.next ? '下次复习：' + new Date(x.next).toLocaleDateString('zh-CN') : '暂无排期'}</div>
    </div>`).join('');
  const weekChips = week.map((c, i) => `<div class="plan-day ${c > 0 ? 'on' : ''}">
      <div class="d">${dayLabels[i]}</div>
      <div class="n">${c}</div>
      <div class="u">道</div>
    </div>`).join('');

  body.innerHTML = `
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">学科错题</div></div>
      <div class="stat-card"><div class="stat-num">${due}</div><div class="stat-label">待复习</div></div>
      <div class="stat-card"><div class="stat-num">${mastered}</div><div class="stat-label">已掌握</div></div>
      <div class="stat-card"><div class="stat-num">${rate}%</div><div class="stat-label">掌握率</div></div>
    </div>
    <div class="panel" style="margin-bottom:18px">
      <h3>📅 未来 7 天复习排期</h3>
      <div class="plan-week">${weekChips}</div>
    </div>
    <div class="panel" style="margin-bottom:18px">
      <h3>📚 学科复习清单（${subs.length} 个关联学科）</h3>
      <div class="card-list" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${subCards}</div>
    </div>
    <div class="panel">
      <h3>💡 计划建议</h3>
      <ul style="margin:0;padding-left:20px;font-weight:600">${recs.map((r) => `<li>${r}</li>`).join('')}</ul>
    </div>`;
}

// —— Modal ——
function openModal(m) {
  const errOptions = ERROR_TYPES.map((e) => `<option ${e === m.errorType ? 'selected' : ''}>${e}</option>`).join('');
  const kp = (m.knowledgePoints || []).map((k) => `<span class="tag kp">${esc(k)}</span>`).join(' ');
  $('#modalBody').innerHTML = `
    <h2>${esc(m.stage || '—')} · ${esc(m.grade || '—')} · ${esc(m.subject)} · 错题详情</h2>
    <div class="block"><div class="k">题干</div><div>${esc(m.question)}</div></div>
    ${m.img ? `<div class="block"><img src="${m.img}" style="max-width:100%;border:3px solid #000"></div>` : ''}
    <div class="row" style="display:flex;gap:16px"><div class="block" style="flex:1"><div class="k">我的错误答案</div><div style="color:#ff5a5f;font-weight:800">${esc(m.myAnswer || '（空）')}</div></div><div class="block" style="flex:1"><div class="k">正确答案</div><div style="color:#1a7f37;font-weight:800">${esc(m.correctAnswer || '—')}</div></div></div>
    <div class="block"><div class="k">错因分析 / 备注</div><div>${esc(m.analysis || '（无）')}</div></div>
    <div class="block"><div class="k">错误类型</div><select id="mErr" class="select">${errOptions}</select></div>
    <div class="block"><div class="k">知识点（逗号分隔）</div><input id="mKp" class="input" value="${esc((m.knowledgePoints || []).join(', '))}" /></div>
    <div class="block">${kp} <span class="tag box">L${m.box}</span> <span class="muted">下次：${new Date(m.nextReviewAt).toLocaleString('zh-CN')}</span></div>
    <div class="block"><div class="k">SM-2 质量分（回忆难度）</div><div class="score-buttons" id="mQuality" style="grid-template-columns:repeat(6,1fr);display:grid;gap:6px">
      <button type="button" class="score s0" data-q="0">0 完全黑</button>
      <button type="button" class="score s1" data-q="1">1 错误</button>
      <button type="button" class="score s2" data-q="2">2 模糊</button>
      <button type="button" class="score s3" data-q="3">3 困难</button>
      <button type="button" class="score s4" data-q="4">4 正确</button>
      <button type="button" class="score s5" data-q="5">5 容易</button>
    </div><div class="muted" style="font-size:11px;font-weight:700;margin-top:6px">≥ 3 进入下一间隔；&lt; 3 重置间隔；EF=${esc((m.EF || 2.5).toFixed(2))} · 间隔=${m.interval || 0} 天 · 重复=${m.repetitions || 0} 次</div></div>
    <div class="foot" style="display:flex;gap:8px;margin-top:14px">
      <button class="btn primary" data-act="gotit" data-id="${m.id}">✓ 提交评分</button>
      <button class="btn ghost" data-act="savemeta" data-id="${m.id}">保存修改</button>
    </div>`;
  $('#modal').classList.remove('hidden');
  // 绑定质量分按钮：点击选中后保存并提交 reviewResult
  pendingReviewQ = null;
  $$('#mQuality .score').forEach((b) => b.addEventListener('click', () => {
    $$('#mQuality .score').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    pendingReviewQ = parseInt(b.dataset.q, 10);
  }));
  if (m.question) {
    API.similar(m.question, m.subject, m.id).then((r) => {
      if (r && r.items && r.items.length) {
        const html = '<div class="block"><div class="k">🔍 相似错题（向量库）</div>' +
          r.items.map((s) => `<div class="ans">· ${esc(truncate(s.question, 60))} <span class="muted">(相似度 ${s.score})</span></div>`).join('') + '</div>';
        $('#modalBody').insertAdjacentHTML('beforeend', html);
      }
    }).catch(() => {});
  }
}
function closeModal() { $('#modal').classList.add('hidden'); }

// —— 设置：配置大模型 / OCR（持久化到后端 data/config.json） ——
function openSettings() {
  const body = $('#settingsBody');
  body.innerHTML = `
    <h2 style="margin:0 0 4px;font-weight:900">⚙ 设置</h2>
    <p class="muted" style="font-weight:700;margin:0 0 14px">配置大模型后，AI 答疑 / 智能分析 / 变体题 / 批改将使用真实模型。</p>
    <form id="settingsForm" class="settings-form">
      <div class="sec-title">🤖 大模型（LLM）</div>
      <div class="field">
        <label>API Key</label>
        <input id="cfgKey" class="input" type="password" placeholder="sk-...（留空表示沿用已有配置）" autocomplete="off" />
      </div>
      <div class="field">
        <label>Base URL</label>
        <input id="cfgBase" class="input" type="text" placeholder="https://api.openai.com/v1/chat/completions" />
        <span class="hint">兼容 OpenAI 的 /chat/completions 接口，可填其他厂商地址。</span>
      </div>
      <div class="field">
        <label>Model Name</label>
        <input id="cfgModel" class="input" type="text" placeholder="gpt-4o-mini" />
      </div>
      <div class="sec-title">🔍 OCR（拍照识别，选填）</div>
      <div class="field">
        <label>OCR 厂商</label>
        <select id="cfgOcrVendor" class="select">
          <option value="openai">跟随大模型（OpenAI 兼容视觉）</option>
          <option value="baidu">百度智能云 OCR</option>
        </select>
      </div>
      <div id="ocrOpenaiNote">
        <span class="hint">复用上方「大模型」的 API Key / Base URL / Model。需模型支持视觉（如 gpt-4o、qwen-vl、glm-4v、deepseek-vl 等）。</span>
      </div>
      <div id="ocrBaiduFields" class="hidden">
        <div class="field">
          <label>API Key（百度智能云）</label>
          <input id="cfgOcrAk" class="input" type="password" placeholder="百度智能云 API Key" autocomplete="off" />
        </div>
        <div class="field">
          <label>Secret Key（百度智能云）</label>
          <input id="cfgOcrSk" class="input" type="password" placeholder="百度智能云 Secret Key" autocomplete="off" />
        </div>
      </div>
      <div id="cfgMsg" class="modal-msg"></div>
      <div class="foot" style="display:flex;gap:8px;margin-top:6px">
        <button type="submit" class="btn primary">保存并校验</button>
        <button type="button" class="btn ghost" data-close-settings>取消</button>
      </div>
    </form>`;
  $('#settingsModal').classList.remove('hidden');
  const syncOcrVendor = () => {
    const v = $('#cfgOcrVendor').value;
    $('#ocrBaiduFields').classList.toggle('hidden', v !== 'baidu');
    $('#ocrOpenaiNote').classList.toggle('hidden', v === 'baidu');
  };
  $('#cfgOcrVendor').addEventListener('change', syncOcrVendor);
  // 预填已有配置（不含 key）
  API.config().then((c) => {
    if (c && c.llm) {
      if (c.llm.base) $('#cfgBase').value = c.llm.base;
      if (c.llm.model) $('#cfgModel').value = c.llm.model;
    }
    if (c && c.ocr && c.ocr.vendor) $('#cfgOcrVendor').value = c.ocr.vendor;
    syncOcrVendor();
    if (c && c.ocr) {
      if (c.ocr.apiKey) $('#cfgOcrAk').value = c.ocr.apiKey;
      if (c.ocr.secretKey) $('#cfgOcrSk').value = c.ocr.secretKey;
    }
    setLlmDot(c && c.hasKey, c && c.llm && c.llm.model);
    const msg = $('#cfgMsg');
    if (msg) { msg.textContent = c && c.hasKey ? '✓ 当前已配置大模型（' + (c.llm?.model || '') + '）' : '尚未配置大模型，AI 功能将使用本地规则。'; msg.className = 'modal-msg ' + (c && c.hasKey ? 'ok' : 'err'); }
  }).catch(() => {});

  const form = $('#settingsForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#cfgMsg');
    msg.textContent = '校验中…'; msg.className = 'modal-msg';
    const payload = {
      llm: {
        apiKey: $('#cfgKey').value.trim(),
        baseUrl: $('#cfgBase').value.trim(),
        model: $('#cfgModel').value.trim()
      },
      ocr: {
        vendor: $('#cfgOcrVendor').value,
        apiKey: $('#cfgOcrAk').value.trim(),
        secretKey: $('#cfgOcrSk').value.trim()
      }
    };
    const res = await API.saveConfig(payload);
    if (res && res.ok) {
      if (res.savedWithWarning) {
        msg.textContent = '⚠ ' + (res.warning || '已保存，但网络校验未通过');
        msg.className = 'modal-msg err';
      } else {
        msg.textContent = '✓ 保存成功，大模型已启用（' + (res.llm?.model || '') + '）';
        msg.className = 'modal-msg ok';
      }
      setLlmDot(true, res.llm?.model || payload.llm.model);
      updateNetBanner();
      setTimeout(() => $('#settingsModal').classList.add('hidden'), 1200);
    } else {
      msg.textContent = '✗ ' + ((res && res.error) || '保存失败');
      msg.className = 'modal-msg err';
    }
  });
}

function setLlmDot(on, model) {
  const dot = $('#llmDot');
  if (!dot) return;
  dot.classList.toggle('on', !!on);
  dot.classList.toggle('off', !on);
  dot.title = on ? '大模型已接入' : '大模型未配置（本地规则模式）';
  const me = $('#llmModel');
  if (me) {
    if (on && model) { me.textContent = model; me.title = '当前模型：' + model; }
    else { me.textContent = '未配置'; me.title = '大模型未配置（本地规则模式）'; }
  }
  const s = $('#qaStatus');
  if (s) s.textContent = on ? '已接入大模型' : '本地规则模式';
}

// —— 操作：复习结果 / 保存 / 删除 / 新增 ——
// 复习结果：quality 0-5（SM-2）
function reviewResult(id, quality) {
  const m = state.items.find((x) => x.id === id);
  if (!m) return;
  const upd = sm2Update(m, quality);
  m.reviewCount = (m.reviewCount || 0) + 1;
  m.EF = upd.EF; m.interval = upd.interval; m.repetitions = upd.repetitions;
  m.box = boxFromSM2(upd.interval, upd.repetitions);
  m.nextReviewAt = upd.nextReviewAt;
  m.lastQuality = upd.lastQuality;
  m.lastReviewAt = Date.now();
  m.lastResult = quality >= 3 ? 'ok' : 'fail';
  saveLocal();
  API.reviewResult(id, quality).then((saved) => { if (saved) Object.assign(m, saved); }).catch(() => {});
  toast('SM-2 已更新 · 间隔 ' + upd.interval + ' 天 · EF ' + upd.EF);
  closeModal(); refresh();
}
// 从 AI 回答中抽取题目，加入错题本（填入录入页）
function addToBookFromAi(aiText) {
  if (!aiText) { toast('AI 回答为空'); return; }
  const extracted = extractQuestionFromText(aiText);
  location.hash = '#/add';
  setTimeout(() => {
    if (extracted && extracted.question) {
      $('#fQuestion').value = extracted.question;
      if (extracted.correct) $('#fCorrect').value = extracted.correct;
      if (extracted.subject) {
        const stage = $('#fStage').value, grade = $('#fGrade').value;
        const valid = subjectsOf(stage, grade);
        if (valid.indexOf(extracted.subject) !== -1) $('#fSubject').value = extracted.subject;
      }
    } else {
      $('#fQuestion').value = aiText;
    }
    toast('已从 AI 回答中提取题目，请核对后保存');
    $('#fQuestion').focus();
  }, 80);
}
// 简易题目抽取：从 AI 文本中识别「题干 / 正确答案 / 学科」
function extractQuestionFromText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let question = '', correct = '', subject = '';
  const qMatch = text.match(/[【\[『「]?\s*题[目干][：:]?\s*([\s\S]{1,400}?)(?=\n|答[：:]|$)/);
  if (qMatch) question = qMatch[1].trim();
  if (!question && lines.length) {
    const sorted = lines.slice().sort((a, b) => b.length - a.length);
    question = sorted[0];
  }
  const aMatch = text.match(/(?:正确答案|答案)[：:]\s*([^\n]{1,160})/);
  if (aMatch) correct = aMatch[1].trim();
  subject = guessSubjectFromText(question || text) || '';
  return { question, correct, subject };
}

function saveMeta(id) {
  const m = state.items.find((x) => x.id === id);
  if (!m) return;
  m.errorType = $('#mErr').value;
  m.knowledgePoints = $('#mKp').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  saveLocal();
  API.update(id, { errorType: m.errorType, knowledgePoints: m.knowledgePoints }).catch(() => {});
  toast('已保存修改'); refresh();
}
async function handleForm() {
  const stage = $('#fStage').value, grade = $('#fGrade').value;
  let subject = $('#fSubject').value;
  const question = $('#fQuestion').value.trim();
  const myAnswer = $('#fMyAnswer').value.trim();
  const correctAnswer = $('#fCorrect').value.trim();
  const analysis = $('#fAnalysis').value.trim();
  const difficulty = pendingScore || parseInt($('#fDifficulty').value, 10);
  if (!question) { toast('请填写题干'); return; }
  const ai = await API.analyze({ subject, question, myAnswer, correctAnswer });
  const local = localAnalyze({ subject, question, myAnswer, correctAnswer });
  // 学科自动识别：若当前 subject 不是该 stage/grade 合法集合，或 AI/LLM 给出了更可信的学科，则使用自动结果
  const validSubjects = subjectsOf(stage, grade);
  if (validSubjects.indexOf(subject) === -1) subject = ai?.subject || local.subject || subject;
  const errorType = (ai && ai.errorType) || local.errorType;
  const kp = (ai && ai.knowledgePoints && ai.knowledgePoints.length) ? ai.knowledgePoints : local.knowledgePoints;
  const m = {
    id: uid(), stage, grade, subject, question, myAnswer, correctAnswer, analysis,
    errorType, knowledgePoints: kp, difficulty,
    // 初始化 SM-2 字段
    EF: 2.5, interval: difficulty >= 4 ? 6 : 1, repetitions: difficulty >= 4 ? 1 : 0,
    box: difficulty >= 4 ? 3 : 1,
    nextReviewAt: Date.now() + (difficulty >= 4 ? 6 : 1) * DAY,
    createdAt: Date.now(), reviewCount: 0, img: pendingImg || null
  };
  state.items.push(m);
  saveLocal();
  API.add(m).then((saved) => { if (saved) Object.assign(m, saved); }).catch(() => {});
  pendingImg = null; pendingScore = null;
  $('#imgPreview').classList.add('hidden'); $('#imgPreview').innerHTML = '';
  clearUploadError(); setOcrProgress(false);
  $$('#fScore .score').forEach((b) => b.classList.remove('active'));
  $('#addForm').reset(); $('#fDifficulty').value = '3';
  toast('已保存，智能归类为「' + errorType + '」');
  refresh();
  location.hash = '#/notebook';
}
async function previewAI() {
  const subject = $('#fSubject').value, question = $('#fQuestion').value.trim();
  const myAnswer = $('#fMyAnswer').value.trim(), correctAnswer = $('#fCorrect').value.trim();
  if (!question) { toast('先填写题干'); return; }
  const local = localAnalyze({ subject, question, myAnswer, correctAnswer });
  const ai = await API.analyze({ subject, question, myAnswer, correctAnswer });
  const a = (ai && ai.errorType) ? { errorType: ai.errorType, knowledgePoints: (ai.knowledgePoints && ai.knowledgePoints.length) ? ai.knowledgePoints : local.knowledgePoints, subject: ai.subject || local.subject } : local;
  $('#aiPreview').classList.remove('muted');
  const subjNote = a.subject && a.subject !== subject ? `<b style="color:#ff5a5f">${esc(a.subject)}</b>（自动识别，可改）` : `${esc(subject || a.subject)}`;
  $('#aiPreview').innerHTML = `学科：${subjNote}\n推测错误类型：<b>${esc(a.errorType)}</b>\n抽取知识点：${a.knowledgePoints.length ? a.knowledgePoints.map((k) => esc(k)).join('、') : '（未匹配到关键词，可在保存后手动补充）'}`;
}

// —— 图片上传：格式/大小校验 + 预览 + OCR 进度 + 失败重试 ——
const MAX_IMG = 10 * 1024 * 1024;            // 10MB
const IMG_TYPES = ['image/jpeg', 'image/png'];
function showUploadError(msg, withRetry) {
  const e = $('#uploadError');
  e.innerHTML = '⚠ ' + esc(msg) + (withRetry ? ' <button type="button" id="ocrRetry" class="btn sm">重试</button>' : '');
  e.classList.remove('hidden');
  if (withRetry) $('#ocrRetry').addEventListener('click', () => { e.classList.add('hidden'); runOcr(); });
}
function clearUploadError() { $('#uploadError').classList.add('hidden'); $('#uploadError').innerHTML = ''; }
function setOcrProgress(on, text) {
  const p = $('#ocrProgress');
  if (on) { p.classList.remove('hidden'); if (text) $('#ocrProgressText').textContent = text; }
  else p.classList.add('hidden');
}
function renderImgPreview(file, dataUrl) {
  pendingImg = dataUrl;
  const sizeKb = (file.size / 1024).toFixed(0);
  $('#imgPreview').innerHTML =
    `<img src="${dataUrl}">
     <div style="display:flex;flex-direction:column;gap:8px">
       <div class="muted" style="font-size:11px;font-weight:700;max-width:200px">${esc(file.name || '粘贴图片')} · ${sizeKb}KB</div>
       <button type="button" id="ocrBtn" class="btn ghost sm">🔍 OCR 识别</button>
       <button type="button" id="imgClear" class="btn sm">移除</button>
     </div>`;
  $('#imgPreview').classList.remove('hidden');
  $('#ocrBtn').addEventListener('click', runOcr);
  $('#imgClear').addEventListener('click', () => {
    pendingImg = null; clearUploadError(); setOcrProgress(false);
    $('#imgPreview').classList.add('hidden'); $('#imgPreview').innerHTML = '';
  });
}
function handleImageFile(file) {
  clearUploadError(); setOcrProgress(false);
  if (!file) return;
  if (IMG_TYPES.indexOf(file.type) === -1) { showUploadError('仅支持 JPG / PNG / JPEG 格式'); return; }
  if (file.size > MAX_IMG) { showUploadError('图片大小超过 10MB，请压缩后重试'); return; }
  const r = new FileReader();
  r.onload = () => renderImgPreview(file, r.result);
  r.onerror = () => showUploadError('图片读取失败，请重试');
  r.readAsDataURL(file);
}
async function runOcr() {
  if (!pendingImg) { showUploadError('请先选择或粘贴图片'); return; }
  const ob = $('#ocrBtn');
  if (ob) { ob.disabled = true; ob.textContent = '识别中…'; }
  setOcrProgress(true, 'OCR 识别中…'); clearUploadError();
  const res = await API.ocr(pendingImg);
  setOcrProgress(false);
  if (ob) { ob.disabled = false; ob.textContent = '🔍 OCR 识别'; }
  if (res && res.text) {
    // 拆分多题（OCR 一次识别可能包含 N 道题）
    const qs = splitQuestions(res.text);
    if (qs.length >= 2) {
      showOcrSplitPreview(qs);
      setOcrProgress(true, '✓ 识别到 ' + qs.length + ' 道题，可勾选导入');
    } else {
      $('#fQuestion').value = ($('#fQuestion').value + '\n' + res.text).trim();
      toast('OCR 已填入题干');
      setOcrProgress(true, '✓ 识别完成');
      setTimeout(() => setOcrProgress(false), 1200);
    }
  } else {
    // OCR 失败：内联重试
    showUploadError(res && res.error ? res.error : 'OCR 识别失败，请重试或手动输入', true);
  }
}

// OCR 多题拆分预览：弹窗 + 复选框 → 选中后逐条入录入页（先进暂存，用户点击保存逐条提交）
function showOcrSplitPreview(questions) {
  const ids = questions.map((_, i) => 'ocrq_' + i);
  const items = questions.map((q, i) => {
    const subj = guessSubjectFromText(q) || '';
    return `<div style="border-top:${i ? '2px' : '0'} solid #000;padding:8px 0;display:flex;gap:10px;align-items:flex-start">
      <input type="checkbox" data-i="${i}" id="${ids[i]}" checked style="margin-top:6px;width:18px;height:18px">
      <div style="flex:1">
        <label for="${ids[i]}" style="cursor:pointer"><b style="margin-right:6px">第 ${i + 1} 题</b>${subj ? `<span class="tag">${esc(subj)}</span>` : ''}<span class="muted" style="font-weight:700">${q.length} 字</span></label>
        <div class="muted" style="font-size:12px;margin-top:4px;white-space:pre-wrap;font-weight:600">${esc(truncate(q, 140))}</div>
      </div>
    </div>`;
  }).join('');
  $('#modalBody').innerHTML = `
    <h2>📄 OCR 多题拆分预览</h2>
    <p class="muted" style="font-weight:700">共识别出 <b>${questions.length}</b> 道题。勾选要导入的题目，点「导入选中」会依次填入录入页。</p>
    <div style="max-height:50vh;overflow:auto;border:var(--border-w) solid var(--line);padding:8px 12px;margin:10px 0;background:var(--bg)">${items}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn primary" id="ocrImportSel">📥 导入选中</button>
      <button class="btn ghost" id="ocrImportAll">全选 / 全不选</button>
      <button class="btn" id="ocrClose">关闭</button>
    </div>
    <p class="muted" style="font-size:11px;font-weight:700;margin-top:8px">逐条导入：每次进入录入页填入一道，保存后自动跳到下一道。所有题导入完成后回到错题集。</p>`;
  $('#modal').classList.remove('hidden');
  $('#ocrClose').addEventListener('click', closeModal);
  $('#ocrImportAll').addEventListener('click', () => {
    const cbs = $$('#modalBody input[type="checkbox"][data-i]');
    const allChecked = cbs.every((c) => c.checked);
    cbs.forEach((c) => (c.checked = !allChecked));
  });
  $('#ocrImportSel').addEventListener('click', () => {
    const selected = $$('#modalBody input[type="checkbox"][data-i]:checked').map((c) => questions[+c.dataset.i]);
    if (!selected.length) { toast('请至少勾选一道题'); return; }
    closeModal();
    location.hash = '#/add';
    runOcrImportQueue(selected);
  });
}

// 把 OCR 拆分后的题目逐条写入录入页（用户保存后跳到下一道）
let ocrImportQueue = [];
function runOcrImportQueue(list) {
  ocrImportQueue = list.slice();
  if (!ocrImportQueue.length) { toast('全部导入完成'); return; }
  const next = ocrImportQueue.shift();
  $('#fQuestion').value = next;
  $('#fMyAnswer').value = '';
  $('#fCorrect').value = '';
  $('#fAnalysis').value = '';
  // 自动选择识别学科
  const guessed = guessSubjectFromText(next);
  if (guessed) {
    const stage = $('#fStage').value, grade = $('#fGrade').value;
    const valid = subjectsOf(stage, grade);
    if (valid.indexOf(guessed) !== -1) $('#fSubject').value = guessed;
  }
  toast('已填入第 1/' + (ocrImportQueue.length + 1) + ' 题，保存后导入下一题');
  // 监听下一次保存 → 自动推进队列
  const onSubmit = (e) => {
    if (!ocrImportQueue.length) { $('#addForm').removeEventListener('submit.ocr', onSubmit); return; }
    // 不阻止默认 submit（让 handleForm 跑），仅在保存完成（refresh 后）推下一题
    setTimeout(() => {
      if (!ocrImportQueue.length) return;
      const n = ocrImportQueue.shift();
      $('#fQuestion').value = n;
      $('#fMyAnswer').value = ''; $('#fCorrect').value = ''; $('#fAnalysis').value = '';
      const g2 = guessSubjectFromText(n);
      if (g2) { const valid = subjectsOf($('#fStage').value, $('#fGrade').value); if (valid.indexOf(g2) !== -1) $('#fSubject').value = g2; }
      toast('已填入下一题（剩 ' + ocrImportQueue.length + '）');
    }, 120);
  };
  // 使用一次性监听（命名空间），每次进入页面挂一次
  $('#addForm').addEventListener('submit.ocr', onSubmit);
}

// —— localStorage 兜底 ——
function saveLocal() { try { localStorage.setItem('ai_mistake_book_v1', JSON.stringify(state)); } catch {} }
function loadLocal() { try { return JSON.parse(localStorage.getItem('ai_mistake_book_v1')) || { items: [] }; } catch { return { items: [] }; } }

// —— Selects 填充 / 联动 ——
function fillSelects() {
  const stageOpts = Object.keys(STAGES).map((s) => `<option>${s}</option>`).join('');
  $('#fStage').innerHTML = stageOpts;
  $('#filterStage').innerHTML = '<option value="">全部学段</option>' + stageOpts;
  $('#filterError').innerHTML = '<option value="">全部错误类型</option>' + ERROR_TYPES.map((e) => `<option>${e}</option>`).join('');
  $('#planStage').innerHTML = '<option value="">选择学段 / 考试</option>' + stageOpts;
  refreshFormGradeSubject();
  refreshFilterSubject();
  refreshPlanGrade();
}
function refreshFormGradeSubject() {
  $('#fGrade').innerHTML = gradesOf($('#fStage').value).map((g) => `<option>${g}</option>`).join('');
  refreshFormSubject();
}
function refreshFormSubject() {
  const stage = $('#fStage').value, grade = $('#fGrade').value;
  $('#fSubject').innerHTML = subjectsOf(stage, grade).map((s) => `<option>${s}</option>`).join('');
}
function refreshFilterGrade() {
  $('#filterGrade').innerHTML = '<option value="">全部年级</option>' + gradesOf($('#filterStage').value).map((g) => `<option>${g}</option>`).join('');
}
// 学段下全部关联学科（社会性考试 = 各考试类别学科并集）
function subjectsOfStage(stage) {
  if (stage === '社会性考试') {
    const set = new Set();
    for (const ex of Object.keys(STAGES[stage].examSubjects)) for (const s of STAGES[stage].examSubjects[ex]) set.add(s);
    return Array.from(set);
  }
  return (STAGES[stage]?.subjects || []).slice();
}
// 错题集筛选：学科随「学段 + 年级」联动，只显示关联学科
function refreshFilterSubject() {
  const stage = $('#filterStage').value, grade = $('#filterGrade').value;
  const subs = !stage ? allSubjects() : (grade ? subjectsOf(stage, grade) : subjectsOfStage(stage));
  $('#filterSubject').innerHTML = '<option value="">全部学科</option>' + subs.map((s) => `<option>${s}</option>`).join('');
}
function refreshPlanGrade() {
  $('#planGrade').innerHTML = '<option value="">选择年级 / 考试类别</option>' + gradesOf($('#planStage').value).map((g) => `<option>${g}</option>`).join('');
}

// —— 事件 ——
function bindEvents() {
  // 筛选
  $('#searchInput').addEventListener('input', renderNotebook);
  $('#fStage').addEventListener('change', refreshFormGradeSubject);
  $('#fGrade').addEventListener('change', refreshFormSubject);
  $('#filterStage').addEventListener('change', () => { refreshFilterGrade(); refreshFilterSubject(); renderNotebook(); });
  $('#filterGrade').addEventListener('change', () => { refreshFilterSubject(); renderNotebook(); });
  $('#filterSubject').addEventListener('change', renderNotebook);
  $('#filterError').addEventListener('change', renderNotebook);
  $('#filterStatus').addEventListener('change', renderNotebook);
  $('#resetFilters').addEventListener('click', () => {
    ['#searchInput', '#filterStage', '#filterGrade', '#filterSubject', '#filterError', '#filterStatus'].forEach((s) => { $(s).value = ''; });
    refreshFilterGrade(); refreshFilterSubject(); renderNotebook();
  });
  $('#addForm').addEventListener('submit', (e) => { e.preventDefault(); handleForm(); });
  $('#aiAnalyzeBtn').addEventListener('click', previewAI);

  // 评分按钮
  $$('#fScore .score').forEach((b) => b.addEventListener('click', () => {
    $$('#fScore .score').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    pendingScore = parseInt(b.dataset.v, 10);
  }));

  // 图片：选择按钮 + 文件框 + 粘贴（统一走校验/OCR 流程）
  $('#uploadImgBtn').addEventListener('click', () => $('#imgFile').click());
  $('#imgFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    handleImageFile(f);
    e.target.value = ''; // 允许重复选择同一文件
  });
  $('#fQuestion').addEventListener('paste', (e) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (!item) return;
    handleImageFile(item.getAsFile());
  });

  // 卡片事件委托
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = e.target.closest('[data-id]');
    const id = card ? card.dataset.id : btn.dataset.id;
    const act = btn.dataset.act;
    if (act === 'detail') openModal(state.items.find((m) => m.id === id));
    else if (act === 'review-one') openModal(state.items.find((m) => m.id === id));
    else if (act === 'del') {
      if (confirm('确定删除这道错题？')) {
        state.items = state.items.filter((m) => m.id !== id);
        saveLocal(); API.remove(id).catch(() => {}); refresh(); toast('已删除');
      }
    } else if (act === 'gotit') {
      const q = pendingReviewQ;
      if (q === null || q === undefined) { toast('请先选择质量分（0-5）'); return; }
      reviewResult(id, q);
      pendingReviewQ = null;
    }
    else if (act === 'add-to-book') {
      addToBookFromAi(btn.dataset.text || '');
    }
    else if (act === 'savemeta') saveMeta(id);
  });

  // Modal
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  // Settings modal
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#settingsModal').addEventListener('click', (e) => { if (e.target.id === 'settingsModal' || e.target.dataset.closeSettings !== undefined) $('#settingsModal').classList.add('hidden'); });

  // QA
  $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); sendChat($('#chatInput').value); });
  $('#newQa').addEventListener('click', startNewQa);
  $('#qaHistory').addEventListener('click', (e) => {
    const item = e.target.closest('.qa-item');
    if (item) { currentQaId = item.dataset.id; renderQa(); }
  });

  // Plan（复习计划）
  $('#planStage').addEventListener('change', () => { refreshPlanGrade(); renderPlan(); });
  $('#planGrade').addEventListener('change', renderPlan);
  $('#planBtn').addEventListener('click', renderPlan);

  // 一键变体复习
  $('#vpStage').addEventListener('change', () => { refreshVpSubject(); });
  $('#vpSubject').addEventListener('change', refreshVpBase);
  $('#vpBase').addEventListener('change', () => { vpBaseQuestion = $('#vpBase').value; });
  $('#vpGenerate').addEventListener('click', generateVariants);

  // Theme toggle（粗野风夜间版）
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
    if (location.hash.indexOf('dashboard') !== -1) renderDashboard();
  });

  // Export / Import
  $('#exportBtn').addEventListener('click', openExportModal);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!Array.isArray(data.items)) throw new Error('格式错误');
        if (confirm('导入将覆盖当前数据，确定继续？')) {
          state = data; saveLocal(); refresh(); toast('导入成功，共 ' + state.items.length + ' 道');
        }
      } catch (err) { toast('导入失败：' + err.message); }
    };
    r.readAsText(f);
  });

  // Resize charts
  window.addEventListener('resize', () => {
    for (const k in charts) try { charts[k].resize(); } catch {}
  });

  // 网络状态：断开横幅 + 重试
  $('#netRetry').addEventListener('click', () => { toast('正在检测网络…'); updateNetBanner(); });
  window.addEventListener('offline', () => { $('#netBanner').classList.remove('hidden'); const s = $('#qaStatus'); if (s) s.textContent = '离线'; });
  window.addEventListener('online', updateNetBanner);
}

function refresh() {
  navigate();
}

// —— 主题：日间 / 粗野风夜间版 ——
function applyTheme(t) {
  if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  const btn = $('#themeBtn');
  if (btn) btn.textContent = t === 'dark' ? '☀️ 日间' : '🌙 夜间';
}
function initTheme() {
  let t = localStorage.getItem('theme');
  if (!t) t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  applyTheme(t);
}

// —— 网络断开横幅 ——
function updateNetBanner() {
  if (!navigator.onLine) { $('#netBanner').classList.remove('hidden'); return; }
  API.status().then((on) => {
    const b = $('#netBanner');
    if (on) { b.classList.add('hidden'); }
    else { b.classList.remove('hidden'); }
  });
}

// —— 导出：Anki / Notion / Markdown 复习卡 / JSON ——
function escMd(s) { return String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim(); }
function escTsv(s) { return String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim(); }
function joinKp(m) { return (m.knowledgePoints || []).join('、'); }
function dateStr() { return new Date().toISOString().slice(0, 10); }
function downloadText(name, text, mime) {
  const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('已导出：' + name);
}
function toAnki(items) {
  const rows = items.map((m) => {
    const front = escTsv(m.question);
    const back = `正确答案：${escTsv(m.correctAnswer || '—')}<br>我的答案：${escTsv(m.myAnswer || '（空）')}<br>错因：${escTsv(m.errorType)}<br>知识点：${escTsv(joinKp(m))}<br>学段：${escTsv(m.stage)} · ${escTsv(m.grade)} · ${escTsv(m.subject)}`;
    const tags = ['错题', m.stage, m.subject].filter(Boolean).map(escTsv).join(' ');
    return `${front}\t${back}\t${tags}`;
  });
  return '#separator:tab\n#html:true\n' + rows.join('\n') + '\n';
}
function toNotion(items) {
  const head = '# AI 智能错题本 · 复习卡\n\n| 题干 | 我的答案 | 正确答案 | 错因 | 知识点 | 学段/年级/学科 | 掌握度 |\n| --- | --- | --- | --- | --- | --- | --- |';
  const rows = items.map((m) => `| ${escMd(m.question)} | ${escMd(m.myAnswer || '—')} | ${escMd(m.correctAnswer || '—')} | ${escMd(m.errorType)} | ${escMd(joinKp(m))} | ${escMd(m.stage + '·' + m.grade + '·' + m.subject)} | L${m.box} |`);
  return head + '\n' + rows.join('\n') + '\n';
}
function toMarkdown(items) {
  const cards = items.map((m) => {
    const st = statusOf(m);
    const stLabel = st === 'mastered' ? '已掌握' : st === 'due' ? '待复习' : '学习中';
    return `## ❓ ${escTsv(m.question)}\n\n- **我的答案（错）**：${escTsv(m.myAnswer || '（空）')}\n- **正确答案**：${escTsv(m.correctAnswer || '—')}\n- **错因**：${escTsv(m.errorType)}\n- **知识点**：${escTsv(joinKp(m)) || '—'}\n- **学段/年级/学科**：${escTsv(m.stage)} · ${escTsv(m.grade)} · ${escTsv(m.subject)} · 难度${'★'.repeat(m.difficulty || 3)}\n- **掌握度**：L${m.box}（${stLabel}）\n\n> ${escTsv(m.analysis || '（无备注）')}\n`;
  });
  return '# AI 智能错题本 · 复习卡\n\n共 ' + items.length + ' 道错题\n\n' + cards.join('\n');
}
function openExportModal() {
  const count = filterItems().length;
  $('#modalBody').innerHTML = `
    <h2>导出复习卡</h2>
    <p class="muted" style="font-weight:700">当前筛选结果共 <b>${count}</b> 道错题，选择导出格式：</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0">
      <button class="btn primary" data-exp="anki">Anki (.txt)</button>
      <button class="btn" data-exp="notion">Notion (.md)</button>
      <button class="btn" data-exp="markdown">Markdown (.md)</button>
      <button class="btn" data-exp="pdf">PDF (打印)</button>
      <button class="btn ghost" data-exp="json">JSON 备份</button>
    </div>
    <p class="muted" style="font-size:12px;font-weight:600">Anki：导入时「分隔符 = 制表符」，字段对应 正面 / 背面 / 标签。<br>Notion：直接导入 .md 会自动生成表格，点「转为数据库」即可管理。<br>PDF：在新窗口打开排版好的页面，用浏览器「打印 → 另存为 PDF」。</p>`;
  $('#modal').classList.remove('hidden');
  $('#modalBody').querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', () => {
    const items = filterItems();
    if (!items.length) { toast('当前没有可导出的错题'); return; }
    const fmt = b.dataset.exp;
    if (fmt === 'anki') downloadText(`AI错题本_Anki_${dateStr()}.txt`, toAnki(items));
    else if (fmt === 'notion') downloadText(`AI错题本_Notion_${dateStr()}.md`, toNotion(items), 'text/markdown');
    else if (fmt === 'markdown') downloadText(`AI错题本_复习卡_${dateStr()}.md`, toMarkdown(items), 'text/markdown');
    else if (fmt === 'json') downloadText(`AI错题本_备份_${dateStr()}.json`, JSON.stringify({ items }, null, 2), 'application/json');
    else if (fmt === 'pdf') { toPDF(items); closeModal(); return; }
    closeModal();
  }));
}

// PDF 导出：打开排版好的新窗口，触发打印（用户保存为 PDF）
function toPDF(items) {
  const css = `
    body { font-family: 'Inter','PingFang SC','Microsoft YaHei',sans-serif; max-width: 760px; margin: 24px auto; color: #16161d; }
    h1 { font-size: 22px; border-bottom: 3px solid #000; padding-bottom: 8px; }
    .q { border: 2px solid #000; padding: 14px 16px; margin-bottom: 14px; page-break-inside: avoid; }
    .q h2 { font-size: 15px; margin: 0 0 6px; }
    .q .row { display: flex; gap: 12px; margin: 6px 0; font-size: 13px; }
    .q .row b { color: #16161d; }
    .meta { font-size: 11px; color: #555; margin-bottom: 4px; }
    .ans-wrong { color: #b3263b; font-weight: 800; }
    .ans-right { color: #1a7f37; font-weight: 800; }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0; }
    .tag { display: inline-block; font-size: 11px; padding: 2px 8px; border: 2px solid #000; font-weight: 800; }
    @media print { body { margin: 0; } .no-print { display: none; } }
  `;
  const cards = items.map((m, i) => {
    const kp = (m.knowledgePoints || []).map((k) => `<span class="tag">${esc(k)}</span>`).join('');
    return `<div class="q">
      <div class="meta">#${i + 1} · ${esc(m.stage || '—')} · ${esc(m.grade || '—')} · ${esc(m.subject || '—')} · 难度 ${'★'.repeat(m.difficulty || 3)} · L${m.box}</div>
      <h2>${esc(m.question)}</h2>
      <div class="row"><span class="ans-wrong">错：</span><b>${esc(m.myAnswer || '（空）')}</b></div>
      <div class="row"><span class="ans-right">对：</span><b>${esc(m.correctAnswer || '—')}</b></div>
      <div class="row"><b>错因：</b>${esc(m.errorType || '—')}</div>
      <div class="tags">${kp}</div>
      ${m.analysis ? `<div class="row"><b>备注：</b>${esc(m.analysis)}</div>` : ''}
    </div>`;
  }).join('');
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>AI 错题本 PDF · ${dateStr()}</title><style>${css}</style></head><body>
    <h1>📕 AI 智能错题本 · 复习卡</h1>
    <p class="meta">共 ${items.length} 道题 · 导出于 ${new Date().toLocaleString('zh-CN', { hour12: false })}</p>
    ${cards}
    <p class="meta no-print" style="margin-top:24px;text-align:center">↑ 浏览器「打印 → 另存为 PDF」即可保存</p>
    <script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 200); });</script>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('请允许弹窗以导出 PDF'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

// —— 启动 ——
async function init() {
  initTheme();
  // 先展示骨架屏（列表加载占位）
  $('#notebookList').innerHTML = skeletonCards(6);
  state = await API.list();
  fillSelects();
  bindEvents();
  refresh();
  updateNetBanner();
  API.config().then((c) => setLlmDot(c && c.hasKey, c && c.llm && c.llm.model)).catch(() => setLlmDot(false));
  API.status().then((on) => toast(on ? '已连接后端服务 (3000)' : '后端未连接，使用本地存储兜底'));
  if (!location.hash) location.hash = '#/notebook'; else navigate();
}
document.addEventListener('DOMContentLoaded', init);
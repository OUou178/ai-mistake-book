// 这是 config.js 的模板。复制为 config.js 并填入你的密钥即可启用「打开链接自动用大模型」。
// 详见帮助页「浏览器直连模式」。注意密钥安全（见 config.js 顶部说明）。
window.__APP_CONFIG__ = {
  llm: { apiKey: 'sk-xxx', baseUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  ocr: { vendor: 'openai', apiKey: '', secretKey: '' }
};

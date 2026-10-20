// Netlify Function —— 大模型代理（密钥仅存于环境变量，前端零密钥）
// 部署：本文件位于 /netlify/functions/llm.js，在 Netlify 项目「环境变量」中设置：
//   LLM_API_KEY=sk-...
//   LLM_BASE_URL=https://ws-bbn32z5uzkioccl6.cn-beijing.maas.aliyuncs.com/api/v1/chat/completions
//   LLM_MODEL=qwen-plus
// 可选：ALLOWED_ORIGIN=https://<你的github.io>
// 前端 config.js 设置： llm.baseUrl = "https://<你的netlify域名>/.netlify/functions/llm" ，apiKey 留空。
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

  const key = process.env.LLM_API_KEY;
  const base = process.env.LLM_BASE_URL || 'https://ws-bbn32z5uzkioccl6.cn-beijing.maas.aliyuncs.com/api/v1/chat/completions';
  const envModel = process.env.LLM_MODEL || 'gpt-4o-mini';
  if (!key) return { statusCode: 500, headers, body: JSON.stringify({ error: 'LLM_API_KEY 未配置' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: '请求体不是合法 JSON' }) }; }
  body.model = body.model || envModel;

  let upstream;
  try {
    upstream = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify(body)
    });
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: '上游调用失败: ' + String(e) }) };
  }

  // 注：Netlify Functions 以整块返回，SSE 为单块传输（功能正常，只是不是逐字流式）。
  const text = await upstream.text();
  return {
    statusCode: upstream.status,
    headers: {
      ...headers,
      'content-type': upstream.headers.get('content-type') || 'application/json',
      'cache-control': 'no-cache'
    },
    body: text
  };
};

// Vercel Serverless Function —— 大模型代理（密钥仅存于环境变量，前端零密钥）
// 部署：把本文件放到仓库 /api/llm.js，在 Vercel 项目「环境变量」中设置：
//   LLM_API_KEY=sk-...
//   LLM_BASE_URL=https://ws-bbn32z5uzkioccl6.cn-beijing.maas.aliyuncs.com/api/v1/chat/completions
//   LLM_MODEL=qwen-plus
// 可选：ALLOWED_ORIGIN=https://<你的github.io>  （限制仅你的 Pages 站可调用；不填则允许任意来源）
// 前端 config.js 设置： llm.baseUrl = "https://<你的vercel域名>/api/llm" ，apiKey 留空。
export const config = { runtime: 'nodejs' };

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const key = process.env.LLM_API_KEY;
  const base = process.env.LLM_BASE_URL || 'https://ws-bbn32z5uzkioccl6.cn-beijing.maas.aliyuncs.com/api/v1/chat/completions';
  const envModel = process.env.LLM_MODEL || 'gpt-4o-mini';
  if (!key) return res.status(500).json({ error: 'LLM_API_KEY 未配置' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: '请求体不是合法 JSON' });
  }
  body.model = body.model || envModel;

  let upstream;
  try {
    upstream = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify(body)
    });
  } catch (e) {
    return res.status(502).json({ error: '上游调用失败: ' + String(e) });
  }

  if (body.stream) {
    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('x-accel-buffering', 'no');
    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const ln of lines) res.write(ln + '\n');
      }
      if (buf) res.write(buf);
    } catch {}
    return res.end();
  }

  const text = await upstream.text();
  res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
  return res.status(upstream.status).send(text);
}

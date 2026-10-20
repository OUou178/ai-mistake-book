# AI 智能错题本 v3.0

> 基于 Neo-Brutalism 设计风格的本地优先错题管理系统，集成阿里云百炼大模型，支持智能分析、变体题、批改、拍照识别与 SM-2 间隔复习算法。

## 一、项目简介

错题本是学生学习中的刚需工具。本项目在传统错题录入/复习基础上，**接入阿里云百炼大模型（MaaS 工作空间）**，提供：
- 智能分析题干：自动归类学科、判断错误类型、抽取知识点
- 变体题生成：基于原题智能出 3~10 道变体练习
- 智能批改：自动判定主观题正误与讲解
- 拍照 OCR 识别：qwen-vl-plus 视觉模型识别题目图片
- SM-2 间隔复习算法：5 盒 Leitner 系统，按评分自动调整复习节奏
- 数据看板：ECharts 4 图可视化 + 个性化推荐
- 导出复习卡：Anki / Notion / Markdown / JSON 备份
- AI 答疑：流式对话，支持历史上下文

## 二、技术栈

- **前端**：纯 HTML / CSS / JavaScript（无构建步骤），单页 hash 路由，ECharts CDN
- **后端**：`server.js` 零依赖 Node.js（内置 `http` 模块），持久化 `data/store.json` + `data/vectors.json`
- **向量去重**：中文 bigram TF-IDF + 余弦相似度（阈值 0.82）
- **大模型**：阿里云百炼 MaaS 工作空间（OpenAI 兼容接口），文本 `qwen-plus` + 视觉 `qwen-vl-plus`
- **设计**：Neo-Brutalism（3px 黑边 + 4px 硬阴影 + 高饱和撞色），支持 light / dark 双主题

## 三、项目结构

```
.
├── index.html              # SPA 入口（7 页路由）
├── styles.css              # Neo-Brutalism 主题样式
├── app.js                  # 前端主逻辑（~1500 行）
├── api.js                  # 数据层 / LLM 客户端（后端优先 + 浏览器直连双通道）
├── config.js               # 自动 seed 配置（gitignore，不入库）
├── config.example.js       # 配置模板（提交仓库）
├── server.js               # Node 后端（API + 静态托管）
├── api/llm.js              # Vercel Serverless 函数（密钥仅在环境变量）
├── netlify/functions/llm.js# Netlify Serverless 函数（备选）
├── netlify.toml            # Netlify 配置
├── package.json            # npm 启动入口
├── data/                   # 运行时数据（gitignore）
│   ├── store.json          # 错题集
│   ├── config.json         # 后端 LLM 配置（密钥存放处）
│   └── vectors.json        # TF-IDF 索引
├── dist/                   # 纯前端部署目录（无 Node）
│   ├── index.html
│   ├── app.js
│   ├── api.js
│   ├── styles.css
│   └── config.js           # 演示用浏览器直连配置
└── .gitignore              # 忽略 data/、dist/config.js、.workbuddy/ 等
```

## 四、运行方式

### 方式 A：本地 Node 服务（推荐，含 AI）

```bash
# 1. 安装 Node.js 18+（已内置 http，无需 npm install）
# 2. 编辑 data/config.json，填入百炼 API Key 与端点（参考下方配置示例）
# 3. 启动
node server.js
# 4. 浏览器打开 http://localhost:3000
```

`data/config.json` 示例（**请勿提交**）：
```json
{
  "llm": {
    "apiKey": "<你的百炼 API Key>",
    "baseUrl": "https://ws-xxxxxx.cn-beijing.maas.aliyuncs.com/api/v1/chat/completions",
    "model": "qwen-plus",
    "vision": "qwen-vl-plus"
  }
}
```

### 方式 B：纯静态部署 + 浏览器直连（仅前端）

把 `dist/` 目录部署到任意静态托管（GitHub Pages / CloudStudio / Vercel）：
```bash
# 1. 编辑 dist/config.js，填入百炼 key 与端点
# 2. 上传 dist/* 即可（key 会出现在前端源码，注意保密）
```

### 方式 C：Serverless 代理（密钥零暴露）

部署 `api/llm.js`（Vercel）或 `netlify/functions/llm.js`（Netlify），密钥仅在函数环境变量。

## 五、AI 功能说明

| 功能 | 模型 | 入口 |
|---|---|---|
| 智能分析 | qwen-plus（文本） | 录入页 → 自动触发 |
| 变体题 | qwen-plus（文本） | 错题详情 → 生成变体 |
| 智能批改 | qwen-plus（文本） | 复习页 → 提交答案 |
| AI 答疑（流式） | qwen-plus（文本） | 顶部 "AI 答疑" tab |
| 拍照识别 | qwen-vl-plus（视觉） | 录入页 → 粘贴/上传图片 |

所有 AI 调用均支持 **后端代理 → 浏览器直连 → 本地规则** 三级降级，离线时仍可使用非 AI 功能。

## 六、特色功能

- **三级筛选级联**：学段 → 年级 → 学科，错题集与计划页同步联动
- **复习算法**：SM-2 简化版（5 盒 Leitner：1d / 3d / 7d / 16d / 30d），录入评分≥4 自动入盒 3
- **导出复习卡**：Anki (.txt) / Notion (.md) / Markdown / JSON 四种格式
- **主题切换**：light / dark 双模式，状态持久化
- **响应式布局**：桌面 + 移动端均可用

## 七、安全提示

- **API Key 严禁提交到 Git 仓库**：`config.js` 与 `data/config.json` 均在 `.gitignore` 中
- 生产部署建议走 Serverless 代理模式，避免 key 出现在前端源码
- 演示/作业场景使用 CloudStudio 静态部署时，建议演示结束后在百炼控制台**撤销或轮换** API Key

## 八、致谢

本项目为「AI 智能错题本」课程作业，融合了前端工程化、教育心理学（间隔重复）与大模型应用三个领域。
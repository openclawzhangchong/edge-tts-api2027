# edge-tts-api2027

融合版 **TTS API on Cloudflare Workers**：多后端语音合成 + OpenAI 兼容接口 + 内置 WebUI。

## 这是什么

把两个开源项目整合成了一个 Worker：

| 来源 | 贡献的能力 |
|---|---|
| [fengwm64/tts-api](https://github.com/fengwm64/TTS-API) | 多后端（Azure / 火山引擎 / Edge）、REST 接口 `/api/tts`、音色与情感表 |
| [samni728/edgetts-cloudflare-workers-webui](https://github.com/samni728/edgetts-cloudflare-workers-webui) | OpenAI 兼容接口 `/v1/audio/speech`、完整 WebUI、历史记录、分享、密码保护 |

一套代码，一个 `wrangler deploy` 部署，三种用法随你挑。

## 功能特性

- **三种 TTS 后端**：`azure`（29 音色 + 20 余种情感）、`volcengine`（火山引擎 10 音色）、`edge`（微软 Edge 免费音色，含方言）
- **两套接口**：简洁 REST（`/api/*`，无需鉴权）+ OpenAI 兼容（`/v1/audio/speech`，可加 API Key）
- **内置 WebUI**：浏览器打开根路径即可选后端、音色、情感、语速、音调，试听与下载
- **历史与分享**（可选，需 KV）：合成记录、分享链接、密码保护、实时流式播放
- **长文本自动分段**：超过 2000 字自动切块并行合成后拼接
- **流式输出**：`stream: true` 时边合成边播放

## 真实部署地址（2026-10-25 已部署）

**<https://edge-tts-api2027.240384195.workers.dev>**

- 部署账号：Cloudflare 账号 `15e81bc6f60df69a513d5c147d828215`（workers.dev 子域 `240384195`）
- 当前版本 ID：`8214f065-6ce2-47bb-b566-e50e862432e1`
- `/api/*` 无需鉴权可直接用；`/v1/*` 已设置 `API_KEY`（`wrangler secret`，需 `Authorization: Bearer <key>`）
- 验证方式：`curl https://edge-tts-api2027.240384195.workers.dev/api/providers`
- ⚠️ 国内直连 `*.workers.dev` 会被 DNS 污染 / SNI 阻断（实测 2026-10-25）。国内网络环境下
  请走代理，或给 Worker 绑定自定义域名（账号里暂无域名 zone）；也可用客户端内置的
  火山引擎直连后备（本项目 `src/providers/volcengine.js` 调的
  `translate.volcengine.com` 公开接口国内可达，实测合成正常）。

## 快速开始

```bash
npm install
npm run dev      # 本地调试
npm run deploy   # 部署到 Cloudflare Workers
```

部署完成后，Cloudflare 会给出形如 `https://edge-tts-api2027.<你的账号>.workers.dev` 的地址。

### 可选：绑定 KV（启用历史 / 分享）

```bash
npx wrangler kv namespace create TTS_HISTORY
```

把返回的 `id` 填进 `wrangler.toml` 的 `[[kv_namespaces]]`（去掉注释）。

### 可选：设置 API Key（保护 `/v1/*`）

```bash
npx wrangler secret put API_KEY
```

## 接口文档

### 1. 多后端 REST（无需鉴权）

**后端列表**

```bash
curl https://<your-domain>/api/providers
```

**音色列表**

```bash
curl "https://<your-domain>/api/voices?provider=azure"
```

**合成语音**

```bash
# GET
https://<your-domain>/api/tts?text=你好世界&provider=azure&voice=晓晓&emotion=温柔

# POST
curl -X POST https://<your-domain>/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"你好世界","voice":"晓晓","emotion":"温柔","provider":"azure"}' \
  --output output.mp3
```

参数：

| 参数 | 说明 | 默认值 |
|---|---|---|
| `text` | 待合成文本（必填） | — |
| `provider` | `azure` / `volcengine` / `edge` | `azure` |
| `voice` | 音色（中文标签或英文 ID） | 各后端默认 |
| `emotion` | 情感风格（仅 Azure 支持） | — |
| `rate` | 语速百分比，如 `10` 表示 +10% | `0` |
| `pitch` | 音调百分比 | `0` |

### 2. OpenAI 兼容（`/v1/*`，设了 API_KEY 才需要鉴权）

```bash
curl -X POST https://<your-domain>/v1/audio/speech \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"tts-1","input":"你好世界","voice":"alloy","provider":"edge"}' \
  --output output.mp3
```

- `provider` 默认 `edge`；填 `azure` / `volcengine` 则走多后端
- `voice` 支持 OpenAI 音色名（`alloy` / `shimmer` / `fable` / `onyx` / `nova` / `echo`），也支持直接写微软音色 ID
- `speed` / `pitch` 为倍数（`1.0` 表示原速），内部会换算成百分比
- `stream: true` 时返回流式音频

**模型列表**

```bash
curl https://<your-domain>/v1/models
```

### 3. 其它页面

| 路径 | 说明 |
|---|---|
| `/` | WebUI |
| `/history` | 历史记录（需 KV） |
| `/share/:id` | 分享页（需 KV） |
| `/play` | 播放页（需 KV） |

## 项目结构

```
src/
├── index.js              # Worker 入口：路由 + 各接口 handler + WebUI
├── voices.js             # 三个后端的音色与情感表
└── providers/
    ├── azure.js          # Azure 后端（含 endpoint/token 管理与签名）
    ├── volcengine.js     # 火山引擎后端
    └── edge.js           # Edge 后端（复用 azure 的 token）
```

## 免责声明

本项目**仅供学习与研究使用**。它调用的是微软与字节跳动公开可访问的 TTS 接口，与这些公司无任何隶属或背书关系。使用者需自行确保用途符合相关服务条款与法律法规。作者不对底层服务的可用性、稳定性或合法性作任何保证。

## 许可

MIT。整合自 [fengwm64/tts-api](https://github.com/fengwm64/TTS-API) 与 [samni728/edgetts-cloudflare-workers-webui](https://github.com/samni728/edgetts-cloudflare-workers-webui)，版权归各原作者所有。

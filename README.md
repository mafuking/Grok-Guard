# Grok Egress Guard

**中文** | [English](README.en.md)

本机 sidecar：给 **官方登录** 的 Cursor / Grok Build / Grok CLI 做质量与出口检测。默认判定 **v2.0.0**——Grok 看思考和探针，出口 IP 单独看，令牌/秒只作记录。

不是 xAI / Cursor 官方鉴定。启发式参考了 grok2api 那套 Quality Guard，见[参考项目](#参考项目)。

## 它做什么

| 信号 | 用途 |
|------|------|
| **思考过程** | Grok 确认 `reasoningTokens === 0` 且回答够长 → 疑似降智 |
| **质量探针** | 发给模型一段固定提示，最后一行必须是 `QUALITY_OK` |
| **出口 IP** | 机房 / 代理 / 国家只标「出口偏脏」，**不能单独证明降智** |
| **令牌/秒** | 仍计算并展示，高吞吐只记备注；短窗冲高当虚算 |

服务只绑 `127.0.0.1`，样本写在本地 `data/`（已 gitignore）。

## 判定口径（v2.0.0）

- **疑似降智**（仅 Grok）：确认没有思考，或质量探针缺 `QUALITY_OK`
- **没采到思考数据**：油猴 / hook 没上报 reasoning，不升格
- **SOL / Claude 等**：没有思考只备注，不升格
- **令牌/秒**：`outputTokens * 1000 / (总耗时 - 首字耗时)`；官方高速不算降智
- **出口**：机房 / 代理 / 国家只影响「出口偏脏」

## 架构

```
Cursor Agent  ── hooks ──►  本机 :3780 sidecar  ──►  浏览器面板
Grok Build    ── 油猴 ──►  /api/sample
Grok CLI      ── 监视 ~/.grok/sessions
出口查询      ── ipify + ip-api.com（只查 IP，不传对话）
```

sidecar 零运行时依赖（Node 标准库）。

## 安装

需要 **Node.js 22.5+**。不用 `npm install`，也没有扩展。

```bash
git clone https://github.com/mafuking/grok-egress-guard.git
cd grok-egress-guard
npm run install:hooks    # 只跑一次
npm start                # 窗口一直开着，或双击 start.bat
```

然后在 Cursor 按 `Ctrl+Shift+P`（macOS 用 `Cmd+Shift+P`），运行 **Developer: Reload Window** 重载窗口。再打开 [本机面板](http://127.0.0.1:3780/)，正常对话即可。工作区需先设为信任，hooks 才会跑。

只用 Grok CLI 时跳过 `install:hooks`。油猴只给 grok.com，见下。默认端口 `3780`。

### Grok Build（可选）

装 [Tampermonkey](https://www.tampermonkey.net/)，导入 `userscript/grok-build-guard.user.js`，允许访问 `127.0.0.1`。在 grok.com 聊一条，面板来源应出现 `grok-build`。脚本只报 token 和时间，不上传对话正文。

### 手改 hooks（可选）

把 `hooks/hooks.json.example` 的路径改成你的克隆目录，写入 `~/.cursor/hooks.json`。

| 事件 | 脚本 |
|------|------|
| `beforeSubmitPrompt` | `hooks/on-submit.mjs` |
| `afterAgentThought` | `hooks/on-thought.mjs` |
| `afterAgentResponse` | `hooks/on-response.mjs` |

`on-stop.mjs` 默认不装，避免和回复结束抢同一条会话。

## 各产品出口 IP 分别代表什么

| 产品 | 出口 IP 的意义 | 质量样本从哪来 |
|------|----------------|----------------|
| **Grok Build** | 浏览器直连 xAI，IP 就是对方看到的 | 油猴尽量读 usage；没有 reasoning 标「未知」 |
| **Grok CLI** | 本机出口 | `~/.grok/sessions` 官方 `reasoningTokens` |
| **Cursor 官方** | 流量先到 Cursor。面板看的是本机 / 代理出口 | hook 估算；Cursor 里的 Grok 才强制思考 |

主要用 Cursor 的话，**以本机面板为准**。机房 IP 仍会标出来，但不会因此写成降智。

## 隐私与边界

- 监听 `127.0.0.1`，不对外网开端口
- 样本和进行中的会话写在本地 `data/`，不进 git
- Cursor hook 会把**当前这一轮的提示**打到本机 sidecar，用来判断是不是探针、以及生成标题；不会发到第三方
- 出口查询会把**本机公网 IP** 发给 ipify 和 ip-api.com，用于 Geo / ASN
- 只读 Cursor 本地 `state.vscdb`，取对话标题和模型名
- 这是社区启发式。官方高速、缺 hook、模型本来不思考，都会让样本看起来「不像降智」或「采不到」

## 开发

```text
src/server.js            本机 HTTP + SSE
src/lib/score.js         判定（v2.0.0）
src/lib/ip.js            出口与 Geo
src/lib/grok-watch.js    Grok CLI 会话监视
src/lib/cursor-meta.js   读 Cursor 本地库
hooks/                   Cursor Agent hooks
userscript/              Grok Build 油猴
```

改判定逻辑后跑 `npm test`。hooks 路径变了再跑一次 `npm run install:hooks`。

## 参考项目

判定启发式（缺思考、`QUALITY_OK` 探针、令牌/秒公式）参考了 [lij768423-svg/grok2api-egress-enhancements](https://github.com/lij768423-svg/grok2api-egress-enhancements) 里的 Quality Guard。

## 许可

MIT。与 xAI、Cursor / Anysphere 无官方关系。

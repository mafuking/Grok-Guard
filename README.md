# Grok Egress Guard

**中文** | [English](README.en.md)

本机 sidecar：给 **官方登录** 的 Cursor / Grok Build / Grok CLI 做质量与出口检测。默认判定 **v2.0.0**——Grok 看思考和探针，出口 IP 单独看，令牌/秒只作记录。

不是 xAI / Cursor 官方鉴定。启发式参考了 grok2api 那套 Quality Guard，但本仓库**不是** [代理池 / 注册机](https://linux.do/t/topic/2688339) 的移植，见下方[参考项目](#参考项目)。

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

## 环境

- **Node.js 22.5+**（读取 Cursor 本地库用了 `node:sqlite`）
- 本机出网（查出口 IP 和 Geo）
- Cursor 侧需要 **信任工作区**，用户级 hooks 才会跑

Windows / macOS / Linux 都能跑 sidecar。Cursor 对话标题和模型读取已按各平台路径处理。

## 安装

```bash
git clone https://github.com/mafuking/grok-egress-guard.git
cd grok-egress-guard
```

仓库本身不用 `npm install`。**没有 Cursor 扩展**，结果一律看浏览器面板。

### 最短路径

```bash
npm start               # 本机面板 http://127.0.0.1:3780
npm run install:hooks   # 只写 Cursor Agents 的 hooks，不装扩展
# Reload Window 后正常对话，结果看浏览器面板
```

只用 Grok Build / Grok CLI、不用 Cursor Agents 的人，`install:hooks` 也可以不跑。主要用 Agents 的话，跑一次即可。

### 1. 启动本机服务

Windows 可双击 `start.bat`，或任意系统执行 `npm start`。打开 http://127.0.0.1:3780

自检：`npm test`

端口默认 `3780`，可用环境变量 `PORT` 改。

### 2. 接入 Cursor Agents

`npm run install:hooks` 只把三条 hook 合并进 `~/.cursor/hooks.json`（已有其他 hook 会保留），**不装扩展**。

然后：

1. `Ctrl+Shift+P`（macOS `Cmd+Shift+P`）→ **Developer: Reload Window**
2. 先让 sidecar 保持运行，再发一条 Agent 对话
3. 打开 http://127.0.0.1:3780 看综合判断和最近样本

手动安装也可以：把 `hooks/hooks.json.example` 里的路径改成你的克隆目录，写入用户级 `~/.cursor/hooks.json`（Windows 一般是 `%USERPROFILE%\.cursor\hooks.json`）。事件对应：

| Cursor 事件 | 脚本 | 作用 |
|-------------|------|------|
| `beforeSubmitPrompt` | `hooks/on-submit.mjs` | 开始计时 |
| `afterAgentThought` | `hooks/on-thought.mjs` | 累计思考 token |
| `afterAgentResponse` | `hooks/on-response.mjs` | 收尾并出判定 |

`hooks/on-stop.mjs` 是备用收尾，默认不装，避免和 `afterAgentResponse` 抢同一条会话。

### 3. Grok Build（浏览器）

1. 浏览器装 [Tampermonkey](https://www.tampermonkey.net/)
2. 导入 `userscript/grok-build-guard.user.js`
3. 允许脚本访问 `127.0.0.1`
4. 打开 grok.com，正常聊一条；面板「最近样本」应出现来源 `grok-build`

脚本只上报估算或解析到的 token 数和时间，**不上传对话正文**。

### 4. Grok CLI

sidecar 启动后会监视 `~/.grok/sessions`。用官方 CLI 聊完一轮，有 `reasoningTokens` 就会进样本，不用再装东西。

## 怎么用

1. 保持 sidecar 开着
2. 用你日常的官方登录方式发一条对话
3. 打开 http://127.0.0.1:3780 看综合判断
4. 想主动测质量：点「复制质量探针」，把提示发给 **Grok**，最后一行应出现 `QUALITY_OK`

把 sidecar 和 Cursor 放在同一条 TUN / 同一套代理下，面板上的 IP 才和 Agent 终端出口一致。

### 各产品出口 IP 分别代表什么

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

改判定逻辑后跑 `npm test`。hooks 脚本路径变了就重新 `npm run install:hooks`。不要再找扩展安装步骤。

## 参考项目

判定启发式（缺思考、`QUALITY_OK` 探针、令牌/秒公式）参考了 [lij768423-svg/grok2api-egress-enhancements](https://github.com/lij768423-svg/grok2api-egress-enhancements) 里的 Quality Guard。

那是给 **grok2api / 代理池 / 多账号** 用的出口熔断和隔离：不健康节点会摘流、换 sticky、换号。本仓库是给 **官方登录** 的本机观察面板，不管理节点、不换号、不拦请求。两边定位不同，不要混装。

## 许可

MIT。与 xAI、Cursor / Anysphere 无官方关系。

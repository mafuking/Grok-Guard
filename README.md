# Grok Egress Guard

给 **官方登录** 的 Cursor / Grok Build / Grok CLI 用的本机检测。默认 **v2**：模型质量看思考和探针，出口 IP 单独看，令牌/秒只作记录。

不是 [linux.do 那套 grok2api / 注册机 / 代理池](https://linux.do/t/topic/2688339) 的移植。

## 当前判定（v2）

- **疑似降智**（仅 Grok）：确认 `reasoningTokens === 0` 且回答够长，或质量探针缺 `QUALITY_OK`
- **没采到思考数据**：油猴/钩子没上报 reasoning，不升格
- **SOL / Claude 等**：没有思考只备注，不升格
- **令牌/秒**：公式仍是 `outputTokens * 1000 / (总耗时 - 首字耗时)`，高吞吐只记备注；短窗冲高当虚算
- **出口**：机房 / 代理 / 国家只影响「出口偏脏」，不能单独证明降智

这是社区启发式，**不是** xAI / Cursor 官方鉴定。

## 回滚到 v1（吞吐 + IP 合成总评）

v1 已钉在标签 `v1-tps-ip-verdict`（提交 `ed1b865`）。两种回法：

**不改代码，只切判定（推荐先试）：**

```bat
set GROK_GUARD_LOGIC=v1
D:\grok-egress-guard\start.bat
```

**整棵树回到 v1：**

```bat
cd D:\grok-egress-guard
git checkout v1-tps-ip-verdict
```

回到 v2：`git checkout master`，并确认没有 `GROK_GUARD_LOGIC=v1`。

v1 口径：硬吞吐 1000 → 疑似降智；软吞吐 / 短窗 / 中等 IP 风险 → 需关注。

## 两边分别代表什么

| 产品 | 出口 IP 的意义 | 质量样本 |
|------|----------------|----------|
| **Grok Build** | 浏览器直连 xAI，IP 就是对方看到的 | 油猴尽量读 usage；没有 reasoning 标「未知」 |
| **Grok CLI** | 本机出口 | `~/.grok/sessions` 官方 `reasoningTokens` |
| **Cursor 官方** | 流量先到 Cursor。状态栏看的是本机/代理出口 | hook 估算；Cursor 里的 Grok 才强制思考 |

把 sidecar 和 Cursor 放在同一条 TUN / 同一套代理下，状态栏 IP 才和 Agent 终端出口一致。

## 启动本机服务

需要本机已装 Node.js 18+。

```bat
D:\grok-egress-guard\start.bat
```

或：

```powershell
cd D:\grok-egress-guard
node src\server.js
```

打开 http://127.0.0.1:3780

质量探针：面板「复制质量探针」，发给 Grok 后应出现最后一行 `QUALITY_OK`。

自检：`npm test`

## Cursor Agents 怎么看

主要用 Cursor 的话，**看侧边栏「综合判断」**。机房 IP 仍会标出来，但不再因此写成降智。

1. 先开 `start.bat`（本机检测服务）
2. 扩展已可装到 `%USERPROFILE%\.cursor\extensions\local.grok-egress-guard-1.0.0`
3. 重载窗口：`Ctrl+Shift+P` → **Developer: Reload Window**
4. 左侧活动栏点地球图标

```powershell
cd D:\grok-egress-guard\cursor-extension
npm install
npm run compile
```

## Grok Build 脚本

1. 浏览器装 Tampermonkey
2. 导入 `userscript\grok-build-guard.user.js`
3. 允许访问 `127.0.0.1`
4. 打开 grok.com，正常聊一条；面板「最近样本」应出现 `grok-build`

脚本只上报估算或解析到的 token 数和时间，不上传对话正文。

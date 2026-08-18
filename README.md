# Grok Egress Guard

给 **官方登录** 的 Cursor / Grok Build 用的本机出口检测。只看你这台机器现在出去的 IP，以及 Grok Build 页面上估出来的吞吐。

不是 [linux.do 那套 grok2api / 注册机 / 代理池](https://linux.do/t/topic/2688339) 的移植。那边是多账号 + 换出口；这里只做检测。

## 用了原帖哪条口径

- 出口质量：机房 / 代理标记 / 国家
- 吞吐：`outputTokens * 1000 / (总耗时 - 首字耗时)`
- 软阈值 200 tok/s，硬阈值 1000 tok/s
- 生成窗口短于 1 秒又冲上软阈值 → `buffered_burst`（中间层缓冲，容易误报）
- 可选探针：回复最后一行必须是 `QUALITY_OK`

这是社区启发式，**不是** xAI / Cursor 官方鉴定。

## 两边分别代表什么

| 产品 | 出口 IP 的意义 | 吞吐样本 |
|------|----------------|----------|
| **Grok Build** | 浏览器直连 xAI，IP 就是对方看到的 | 油猴脚本自动上报 |
| **Cursor 官方** | 流量先到 Cursor。状态栏看的是本机/代理出口（地区目录、风控），不是 Cursor 内部转模型的 token/s | 不挂钩官方 Agent 请求 |

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

## Cursor Agents 怎么看

主要用 Cursor 的话，**看侧边栏「综合判断」就够了**。关心的是现在从哪个 IP 出国（机房还是宽带），不是令牌/秒。Agents 官方请求不会自动上报吞吐。

1. 先开 `start.bat`（本机检测服务）
2. 扩展已可装到 `%USERPROFILE%\.cursor\extensions\local.grok-egress-guard-1.0.0`
3. 重载窗口：`Ctrl+Shift+P` → **Developer: Reload Window**
4. 左侧活动栏点地球图标，或点底栏「需关注 机房 …」

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

脚本只上报估算 token 数和时间，不上传对话正文。

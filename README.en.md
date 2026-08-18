# Grok Egress Guard

[中文](README.md) | **English**

A local sidecar that checks quality and egress for **official-login** Cursor, Grok Build, and Grok CLI. Default logic is **v2.0.0**: Grok is judged by thinking and a probe; egress IP is scored on its own; tokens/sec is recorded only.

This is not an official xAI or Cursor verdict. The heuristics were informed by the grok2api Quality Guard, but this repo is **not** a port of [proxy-pool / account-farm stacks](https://linux.do/t/topic/2688339). See [Related work](#related-work).

## What it does

| Signal | Role |
|--------|------|
| **Thinking** | Grok with confirmed `reasoningTokens === 0` and a long enough reply → likely degraded |
| **Quality probe** | Send a fixed prompt; the last line must be `QUALITY_OK` |
| **Egress IP** | Datacenter / proxy / country only mark “dirty egress”; they **cannot** prove degradation alone |
| **Tokens/sec** | Still computed and shown; high throughput is a note; short-window spikes count as buffered burst |

The server binds `127.0.0.1` only. Samples live in local `data/` (gitignored).

## Verdict rules (v2.0.0)

- **Likely degraded** (Grok only): confirmed missing thinking, or the probe lacks `QUALITY_OK`
- **Thinking data missing**: userscript / hook did not report reasoning — do not escalate
- **SOL / Claude / etc.**: no thinking is a remark only, not an upgrade to degraded
- **Tokens/sec**: `outputTokens * 1000 / (total time - time to first token)`; official high speed is not degradation
- **Egress**: datacenter / proxy / country only affect the “dirty egress” label

## Architecture

```
Cursor Agent  ── hooks ──►  local :3780 sidecar  ──►  browser dashboard
Grok Build    ── userscript ──►  /api/sample
Grok CLI      ── watch ~/.grok/sessions
Egress lookup ── ipify + ip-api.com (IP only, no chat text)
```

The sidecar has zero runtime npm dependencies (Node stdlib).

## Requirements

- **Node.js 22.5+** (Cursor local DB is read with `node:sqlite`)
- Outbound network (egress IP and geo)
- For Cursor: the workspace must be **trusted**, or user-level hooks will not run

The sidecar runs on Windows, macOS, and Linux. Conversation title and model reads use the platform-specific Cursor DB path.

## Install

```bash
git clone https://github.com/mafuking/grok-egress-guard.git
cd grok-egress-guard
```

No `npm install` at the repo root. **There is no Cursor extension.** Results are always in the browser dashboard.

### Shortest path

```bash
npm start               # dashboard at http://127.0.0.1:3780
npm run install:hooks   # writes Cursor Agents hooks only; does not install an extension
# Reload Window, chat as usual, read results in the browser
```

If you only use Grok Build / Grok CLI and not Cursor Agents, you can skip `install:hooks`. If you mainly use Agents, run it once.

### 1. Start the local server

On Windows you can double-click `start.bat`, or run `npm start` on any OS. Open http://127.0.0.1:3780

Self-check: `npm test`

Default port is `3780`. Override with `PORT`.

### 2. Cursor Agents

`npm run install:hooks` merges three hooks into `~/.cursor/hooks.json` (existing hooks are kept). It does **not** install an extension.

Then:

1. `Ctrl+Shift+P` (macOS `Cmd+Shift+P`) → **Developer: Reload Window**
2. Keep the sidecar running, then send an Agent turn
3. Open http://127.0.0.1:3780 for the verdict and recent samples

Manual install: copy `hooks/hooks.json.example`, replace the path with your clone, and write it to user-level `~/.cursor/hooks.json` (on Windows usually `%USERPROFILE%\.cursor\hooks.json`). Events:

| Cursor event | Script | Role |
|--------------|--------|------|
| `beforeSubmitPrompt` | `hooks/on-submit.mjs` | Start timing |
| `afterAgentThought` | `hooks/on-thought.mjs` | Accumulate thinking tokens |
| `afterAgentResponse` | `hooks/on-response.mjs` | Finish and score |

`hooks/on-stop.mjs` is a fallback finisher. It is not installed by default, so it does not race `afterAgentResponse`.

### 3. Grok Build (browser)

1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Import `userscript/grok-build-guard.user.js`
3. Allow the script to reach `127.0.0.1`
4. Open grok.com and send a normal turn; the dashboard “recent samples” should show source `grok-build`

The script reports estimated or parsed token counts and timings only. **It does not upload chat text.**

### 4. Grok CLI

Once the sidecar is running it watches `~/.grok/sessions`. A finished official CLI turn with `reasoningTokens` becomes a sample. Nothing else to install.

## Usage

1. Keep the sidecar running
2. Send a turn with your usual official login
3. Open http://127.0.0.1:3780
4. To probe quality: click “Copy quality probe”, send it to **Grok**, and expect a last line of `QUALITY_OK`

Put the sidecar and Cursor on the same TUN / same proxy, or the dashboard IP will not match the Agent terminal egress.

### What egress IP means on each product

| Product | What the IP is | Where quality samples come from |
|---------|----------------|----------------------------------|
| **Grok Build** | Browser talks to xAI directly; this is what they see | Userscript usage when possible; missing reasoning is “unknown” |
| **Grok CLI** | Your machine egress | Official `reasoningTokens` in `~/.grok/sessions` |
| **Official Cursor** | Traffic hits Cursor first. The dashboard shows local / proxy egress | Hook estimates; only Grok inside Cursor requires thinking |

If you mainly use Cursor, **trust the local dashboard**. Datacenter IPs are still labeled, but they are not scored as degradation.

## Privacy and limits

- Listens on `127.0.0.1` only
- Samples and in-flight sessions stay in local `data/`, not in git
- Cursor hooks send **this turn’s prompt** to the local sidecar to detect probes and build a title; they are not sent to a third party
- Egress lookup sends **your public IP** to ipify and ip-api.com for geo / ASN
- Cursor’s local `state.vscdb` is opened read-only for title and model name
- This is a community heuristic. Official high speed, missing hooks, or models that do not think can look “fine” or “unsampled”

## Development

```text
src/server.js            local HTTP + SSE
src/lib/score.js         verdict (v2.0.0)
src/lib/ip.js            egress and geo
src/lib/grok-watch.js    Grok CLI session watcher
src/lib/cursor-meta.js   Cursor local DB
hooks/                   Cursor Agent hooks
userscript/              Grok Build userscript
```

Run `npm test` after changing verdict logic. If hook script paths change, run `npm run install:hooks` again. There is no extension install step.

## Related work

The heuristics (missing thinking, `QUALITY_OK` probe, tokens/sec formula) were informed by the Quality Guard in [lij768423-svg/grok2api-egress-enhancements](https://github.com/lij768423-svg/grok2api-egress-enhancements).

That project is an egress fuse for **grok2api / proxy pools / multi-account** setups: unhealthy nodes are isolated, stickies are rotated, accounts are switched. This repo is a local observer for **official login**. It does not manage nodes, switch accounts, or block requests. Do not treat them as the same stack.

## License

MIT. Not affiliated with xAI or Cursor / Anysphere.

# Grok Egress Guard

[中文](README.md) | **English**

Quality and egress checks for **official-login** Cursor, Grok Build, and Grok CLI.

This is not an official xAI or Cursor verdict. The heuristics were informed by the grok2api Quality Guard. See [Related work](#related-work).

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

## Install

You need **Node.js 22.5+**. No `npm install`, and no extension.

```bash
git clone https://github.com/mafuking/grok-egress-guard.git
# Windows: double-click start.bat
# elsewhere: npm start  or  ./start.sh
# writes hooks, then starts; hooks failure still starts. leave the window open.
```

Then press `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS) and run **Developer: Reload Window**. Open the [local dashboard](http://127.0.0.1:3780/) and chat as usual. The workspace must be trusted.

`npm run install:hooks`: write hooks only. Userscript: grok.com.

### Grok Build (optional)

Install [Tampermonkey](https://www.tampermonkey.net/), import `userscript/grok-build-guard.user.js`, allow `127.0.0.1`. Send a turn on grok.com; the dashboard source should be `grok-build`. Tokens and timing only — no chat text.

## What egress IP means on each product

| Product | What the IP is | Where quality samples come from |
|---------|----------------|----------------------------------|
| **Grok Build** | Browser talks to xAI directly; this is what they see | Userscript usage when possible; missing reasoning is “unknown” |
| **Grok CLI** | Your machine egress | Official `reasoningTokens` in `~/.grok/sessions` |
| **Official Cursor** | Traffic hits Cursor first. The dashboard shows local / proxy egress | Hook estimates; only Grok inside Cursor requires thinking |

If you mainly use Cursor, **trust the local dashboard**. Datacenter IPs are still labeled, but they are not scored as degradation. Put the sidecar and Cursor on the same TUN / proxy or the dashboard IP will not match Agent egress.

## Privacy and limits

- Listens on `127.0.0.1`; samples stay in local `data/`
- Cursor hooks send **this turn’s prompt** to the local sidecar for probe detection and titles, not to a third party
- Egress lookup sends your public IP to ipify and ip-api.com
- Cursor’s local `state.vscdb` is opened read-only for title and model name
- Community heuristic, not an official verdict

## Development

```text
src/server.js            local HTTP + SSE
src/lib/score.js         verdict (v2.0.0)
hooks/                   Cursor Agent hooks
userscript/              Grok Build userscript
```

`npm test`. Startup writes hooks as well. Manual example: `hooks/hooks.json.example`.

## Related work

The heuristics (missing thinking, `QUALITY_OK` probe, tokens/sec formula) were informed by the Quality Guard in [lij768423-svg/grok2api-egress-enhancements](https://github.com/lij768423-svg/grok2api-egress-enhancements).

## License

MIT. Not affiliated with xAI or Cursor / Anysphere.

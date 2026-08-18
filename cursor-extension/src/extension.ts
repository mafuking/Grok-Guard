import * as vscode from "vscode";

type Status = {
  ipv4?: string | null;
  ipv6?: string | null;
  ipv6Leak?: boolean;
  verdict?: string;
  verdictLabel?: string;
  ipRiskLabel?: string;
  summary?: string;
  checkedAt?: string;
  ipScore?: { band: string; risk: number };
  geo?: {
    country?: string;
    countryCode?: string;
    city?: string;
    hosting?: boolean;
    proxy?: boolean;
    isp?: string;
    as?: string;
  };
};

function sidecarUrl() {
  return vscode.workspace
    .getConfiguration("grokEgressGuard")
    .get<string>("sidecarUrl", "http://127.0.0.1:3780")
    .replace(/\/$/, "");
}

async function fetchStatus(): Promise<Status> {
  const res = await fetch(`${sidecarUrl()}/api/status`);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as Status;
}

class PanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = panelHtml();
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "refresh") {
        try {
          await fetch(`${sidecarUrl()}/api/refresh`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ source: "manual" }),
          });
        } catch {
          /* still try status */
        }
      }
      await this.push();
    });
    void this.push();
  }

  async push() {
    if (!this.view) return;
    try {
      this.view.webview.postMessage({ type: "status", data: await fetchStatus() });
    } catch {
      this.view.webview.postMessage({ type: "offline" });
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  const panel = new PanelProvider();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("grokEgressGuard.panel", panel, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("grokEgressGuard.refresh", () => panel.push()),
    vscode.commands.registerCommand("grokEgressGuard.focusPanel", async () => {
      await vscode.commands.executeCommand("grokEgressGuard.panel.focus");
    }),
    vscode.commands.registerCommand("grokEgressGuard.openDashboard", async () => {
      await vscode.env.openExternal(vscode.Uri.parse(sidecarUrl()));
    }),
  );
}

export function deactivate() {}

function panelHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    body { font: 13px/1.5 var(--vscode-font-family); color: var(--vscode-foreground); margin: 12px; }
    h2 { font-size: 12px; opacity: .7; margin: 0 0 8px; font-weight: 600; }
    .ip { font-size: 18px; font-weight: 650; margin: 0 0 6px; }
    .muted { opacity: .75; margin: 6px 0; }
    .badge { display: inline-block; padding: 1px 7px; border-radius: 999px; margin: 0 6px 6px 0; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    button { margin: 8px 6px 0 0; }
  </style>
</head>
<body>
  <h2>综合判断</h2>
  <div id="verdict" class="badge">检测中</div>
  <div class="ip" id="ip">…</div>
  <p class="muted" id="geo"></p>
  <p id="tags"></p>
  <p class="muted" id="summary">正在读取本机出口…</p>
  <p class="muted">Grok 看思考和探针；出口 IP 单独看。令牌/秒只记录。</p>
  <p class="muted">只在发送对话或手点时检测，不轮询。</p>
  <p class="muted" id="checked"></p>
  <button id="refresh">重新检测出口</button>
  <script>
    const vscode = acquireVsCodeApi();
    const btn = document.getElementById("refresh");
    btn.onclick = () => {
      btn.disabled = true;
      btn.textContent = "检测中…";
      vscode.postMessage({ type: "refresh" });
    };
    window.addEventListener("message", (event) => {
      const msg = event.data;
      btn.disabled = false;
      btn.textContent = "重新检测出口";
      if (msg.type === "offline") {
        document.getElementById("ip").textContent = "服务未开";
        document.getElementById("summary").textContent = "先在本仓库运行 npm start（或 start.bat），再点重新检测。";
        document.getElementById("verdict").textContent = "离线";
        return;
      }
      const d = msg.data || {};
      const g = d.geo || {};
      document.getElementById("ip").textContent = d.ipv4 || d.ipv6 || "未知";
      document.getElementById("geo").textContent = [g.locationText || [g.country, g.region, g.city].filter(Boolean).join(" · "), g.ispText || g.isp, g.asnText || g.as].filter(Boolean).join("  ·  ");
      document.getElementById("verdict").textContent = d.verdictLabel || "需关注";
      document.getElementById("summary").textContent = d.summary || "";
      document.getElementById("checked").textContent = d.checkedAt
        ? ("上次检测：" + new Date(d.checkedAt).toLocaleTimeString() + "（仅发送对话或手点）")
        : "尚未检测";
      const tags = [];
      if (d.ipRiskLabel) tags.push("风险" + d.ipRiskLabel);
      if (g.hosting) tags.push("机房");
      else tags.push("更像宽带");
      if (g.proxy) tags.push("代理标记");
      if (d.ipv6Leak) tags.push("IPv4/IPv6 不一致");
      document.getElementById("tags").innerHTML = tags.map((t) => '<span class="badge">' + t + "</span>").join("");
    });
    vscode.postMessage({ type: "load" });
  </script>
</body>
</html>`;
}

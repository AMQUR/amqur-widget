import { createRoot, type Root } from "react-dom/client";
import { assertValidInitConfig, initConnection } from "./connect";
import { WidgetProvider } from "./widget/WidgetContext";
import { WidgetRoot } from "./widget/WidgetRoot";
import themeCss from "./widget/theme.css?inline";
import type { AmqurWidgetConfig } from "./widget/types";

let reactRoot: Root | null = null;
let bootstrapped = false;

function disposeReact(): void {
  reactRoot?.unmount();
  reactRoot = null;
}

function cleanupHost(): void {
  disposeReact();
  document.getElementById("amqur-widget-host")?.remove();
  bootstrapped = false;
}

function mount(host: HTMLElement) {
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = themeCss;
  shadow.appendChild(style);

  const mountNode = document.createElement("div");
  mountNode.className = "amqur";
  shadow.appendChild(mountNode);

  reactRoot = createRoot(mountNode);
  reactRoot.render(
    <WidgetProvider>
      <WidgetRoot />
    </WidgetProvider>,
  );
}

function showFatalError(host: HTMLElement, message: string) {
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent =
    ":host{display:block;font-family:system-ui,sans-serif;font-size:14px;padding:12px;max-width:320px;border-radius:12px;background:#fee;color:#400;border:1px solid #f88;}";
  shadow.appendChild(style);
  const p = document.createElement("div");
  p.textContent = message;
  shadow.appendChild(p);
}

export type AmqurInitOptions = AmqurWidgetConfig;

function appendErrorHost(message: string): void {
  cleanupHost();
  const host = document.createElement("div");
  host.id = "amqur-widget-host";
  document.body.appendChild(host);
  showFatalError(host, message);
}

async function bootstrap(options: AmqurInitOptions) {
  if (bootstrapped) {
    console.warn("[AMQUR] init() called more than once; ignoring.");
    return;
  }

  try {
    assertValidInitConfig(options);
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Invalid tenant or location configuration";
    console.error("[AMQUR] Invalid init options:", msg);
    appendErrorHost(msg);
    return;
  }

  cleanupHost();

  const host = document.createElement("div");
  host.id = "amqur-widget-host";
  document.body.appendChild(host);

  try {
    await initConnection(options);
    mount(host);
    bootstrapped = true;
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "AMQUR failed to initialize.";
    console.error("[AMQUR] Bootstrap failed:", e);
    host.remove();
    appendErrorHost(msg);
  }
}

function destroy(): void {
  cleanupHost();
}

declare global {
  interface Window {
    AMQUR?: {
      init: (opts: AmqurInitOptions) => Promise<void>;
      destroy: () => void;
    };
  }
}

window.AMQUR = {
  init: bootstrap,
  destroy,
};

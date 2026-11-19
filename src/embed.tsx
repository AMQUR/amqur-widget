import { createRoot, type Root } from "react-dom/client";
import {
  assertValidInitConfig,
  initConnection,
  resetWidgetRuntime,
} from "./connect";
import { WidgetProvider } from "./widget/WidgetContext";
import { WidgetRoot } from "./widget/WidgetRoot";
import themeCss from "./widget/theme.css?inline";
import showroomCss from "./widget/theme-showroom.css?inline";
import { getWidgetBootstrap } from "./connect";
import { assetBaseFromScript, ensureShowroomFont, resolveTheme } from "./widget/theme";
import type { AmqurWidgetConfig } from "./widget/types";

/** Captured while the bundle is executing; null when loaded in a way that hides the script. */
const ASSET_BASE = assetBaseFromScript(
  typeof document !== "undefined" ? document.currentScript : null,
);

export const AMQUR_WIDGET_VERSION = "0.2.0";

let reactRoot: Root | null = null;
let bootstrapped = false;
/** In-flight init. A second init() while one is pending joins it instead of racing it. */
let initializing: Promise<void> | null = null;
/** Bumped by destroy(). A start-up that began before the bump must not mount afterwards. */
let generation = 0;

function disposeReact(): void {
  reactRoot?.unmount();
  reactRoot = null;
}

function cleanupHost(): void {
  disposeReact();
  document.getElementById("amqur-widget-host")?.remove();
  bootstrapped = false;
  resetWidgetRuntime();
}

function mount(host: HTMLElement, options: AmqurInitOptions) {
  const shadow = host.attachShadow({ mode: "open" });

  const theme = resolveTheme(getWidgetBootstrap().branding?.theme, options.theme);
  if (theme === "showroom") ensureShowroomFont(ASSET_BASE);

  const style = document.createElement("style");
  style.textContent = theme === "showroom" ? `${themeCss}\n${showroomCss}` : themeCss;
  shadow.appendChild(style);

  const mountNode = document.createElement("div");
  mountNode.className = "amqur";
  mountNode.dataset.theme = theme;
  shadow.appendChild(mountNode);

  reactRoot = createRoot(mountNode);
  reactRoot.render(
    <WidgetProvider>
      <WidgetRoot />
    </WidgetProvider>,
  );
}

export type AmqurInitOptions = AmqurWidgetConfig;

const DEBUG =
  typeof window !== "undefined" &&
  (window as Window & { __AMQUR_DEBUG__?: boolean }).__AMQUR_DEBUG__ === true;

/**
 * A failed boot must be invisible to shoppers: no launcher, no error box, nothing that could
 * expose server text on a dealer page. Operators get a short console line; the on-page panel
 * exists only when the integrator opts in with window.__AMQUR_DEBUG__ = true.
 */
function reportBootFailure(message: string): void {
  cleanupHost();
  if (!DEBUG) return;
  const host = document.createElement("div");
  host.id = "amqur-widget-host";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent =
    ":host{display:block;position:fixed;right:16px;bottom:16px;z-index:2147483000;font-family:system-ui,sans-serif;font-size:13px;padding:12px;max-width:320px;background:#fff;color:#400;border:1px solid #c00;}";
  shadow.appendChild(style);
  const p = document.createElement("div");
  p.textContent = `AMQUR debug: ${message.slice(0, 300)}`;
  shadow.appendChild(p);
}

function bootstrap(options: AmqurInitOptions): Promise<void> {
  if (bootstrapped) {
    console.warn("[AMQUR] init() called more than once; call destroy() first.");
    return Promise.resolve();
  }
  if (initializing) return initializing;
  const mine: Promise<void> = runBootstrap(options).finally(() => {
    // destroy() may have replaced this with a newer start-up; only clear our own.
    if (initializing === mine) initializing = null;
  });
  initializing = mine;
  return mine;
}

async function runBootstrap(options: AmqurInitOptions) {

  try {
    assertValidInitConfig(options);
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Invalid tenant or location configuration";
    console.error("[AMQUR] Invalid init options:", msg);
    reportBootFailure(msg);
    return;
  }

  cleanupHost();
  const startedIn = generation;

  const host = document.createElement("div");
  host.id = "amqur-widget-host";
  document.body.appendChild(host);

  try {
    await initConnection(options);
    // destroy() ran while we were connecting: this start-up is cancelled. Mounting now would
    // put the widget into a detached element and mark it ready with nothing on the page.
    if (startedIn !== generation) {
      host.remove();
      return;
    }
    mount(host, options);
    bootstrapped = true;
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "AMQUR failed to initialize.";
    // Short, PII-free line for operators; full detail only in debug mode.
    console.error("[AMQUR] widget did not start", DEBUG ? e : { reason: msg.slice(0, 120) });
    host.remove();
    if (startedIn !== generation) return;
    reportBootFailure(msg);
  }
}

function destroy(): void {
  generation += 1;
  // Let a later init() start fresh instead of joining the start-up just cancelled.
  initializing = null;
  cleanupHost();
}

function isReady(): boolean {
  return bootstrapped;
}

declare global {
  interface Window {
    AMQUR?: {
      init: (opts: AmqurInitOptions) => Promise<void>;
      destroy: () => void;
      isReady: () => boolean;
      version: string;
    };
  }
}

window.AMQUR = {
  init: bootstrap,
  destroy,
  isReady,
  version: AMQUR_WIDGET_VERSION,
};

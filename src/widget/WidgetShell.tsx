import { useEffect, useState, useCallback, useRef } from 'react';
import { LauncherButton } from './components/LauncherButton';
import { WidgetPanel } from './WidgetPanel';
import { useWidget } from './WidgetContext';
import { detectLocale } from './i18n';
import { c } from './concierge/copy';
import { resolveTheme } from './theme';
import { subscribeWidgetCommands } from './commands';

export function WidgetShell() {
  const { bootstrap, config } = useWidget();
  // Inline display: the chat fills the host's container and is always open.
  const inline = config.display === 'inline';
  const [openState, setOpen] = useState(false);
  const open = inline || openState;
  const portalRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const prevOverflow = useRef<string | null>(null);

  const primary = bootstrap.branding?.primaryColor || '#111111';
  const accent = bootstrap.branding?.accentColor || '#ffffff';
  const lang = detectLocale(config.locale ?? bootstrap.locales?.[0]) === 'es' ? 'es' : 'en';

  const close = useCallback(() => {
    setOpen(false);
    // Return focus to the launcher after the dialog unmounts.
    requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Host-page commands (AMQUR.open / close / send). A sent prompt opens the chat; the chat
  // itself picks the text up once it is on screen.
  useEffect(
    () =>
      subscribeWidgetCommands((command) => {
        if (command === 'close') {
          if (!inline) close();
        } else {
          setOpen(true);
        }
      }),
    [inline, close],
  );

  useEffect(() => {
    if (inline) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close, inline]);

  const theme = resolveTheme(bootstrap.branding?.theme, config.theme);

  useEffect(() => {
    const el = portalRef.current;
    if (!el) return;
    if (theme === 'showroom') {
      // Showroom owns its palette (one red for actions). The tenant colour is only the
      // thin store bar beside the store name.
      el.style.removeProperty('--amqur-primary');
      el.style.removeProperty('--amqur-accent');
      el.style.setProperty('--amq-store', primary);
      return;
    }
    el.style.setProperty('--amqur-primary', primary);
    el.style.setProperty('--amqur-accent', accent);
  }, [primary, accent, theme]);

  // Lock host page scroll while the mobile sheet (or desktop panel) is open.
  useEffect(() => {
    // An inline chat is part of the page: the page keeps scrolling.
    if (inline) return;
    if (!open) {
      if (prevOverflow.current != null) {
        document.documentElement.style.overflow = prevOverflow.current;
        prevOverflow.current = null;
      }
      return;
    }
    prevOverflow.current = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      if (prevOverflow.current != null) {
        document.documentElement.style.overflow = prevOverflow.current;
        prevOverflow.current = null;
      }
    };
  }, [open, inline]);

  return (
    <div className="amqur-portal" ref={portalRef} data-open={open ? "true" : "false"}>
      {inline ? null : (
        <LauncherButton ref={launcherRef} open={open} onToggle={toggle} openLabel={c(lang, 'openAssistant')} closeLabel={c(lang, 'closeAssistant')} />
      )}
      {open ? <WidgetPanel open onClose={close} lang={lang} inline={inline} /> : null}
    </div>
  );
}

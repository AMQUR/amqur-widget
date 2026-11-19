import { useEffect, useState, useCallback, useRef } from 'react';
import { LauncherButton } from './components/LauncherButton';
import { WidgetPanel } from './WidgetPanel';
import { useWidget } from './WidgetContext';
import { detectLocale } from './i18n';
import { c } from './concierge/copy';

export function WidgetShell() {
  const [open, setOpen] = useState(false);
  const { bootstrap, config } = useWidget();
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    const el = portalRef.current;
    if (!el) return;
    el.style.setProperty('--amqur-primary', primary);
    el.style.setProperty('--amqur-accent', accent);
  }, [primary, accent]);

  // Lock host page scroll while the mobile sheet (or desktop panel) is open.
  useEffect(() => {
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
  }, [open]);

  return (
    <div className="amqur-portal" ref={portalRef} data-open={open ? "true" : "false"}>
      <LauncherButton ref={launcherRef} open={open} onToggle={toggle} openLabel={c(lang, 'openAssistant')} closeLabel={c(lang, 'closeAssistant')} />
      {open ? <WidgetPanel open onClose={close} lang={lang} /> : null}
    </div>
  );
}

import { useEffect, useState, useCallback, useRef } from 'react';
import { LauncherButton } from './components/LauncherButton';
import { WidgetPanel } from './WidgetPanel';
import { useWidget } from './WidgetContext';

export function WidgetShell() {
  const [open, setOpen] = useState(false);
  const { bootstrap } = useWidget();
  const portalRef = useRef<HTMLDivElement | null>(null);

  const primary = bootstrap.branding?.primaryColor || '#111111';
  const accent = bootstrap.branding?.accentColor || '#ffffff';

  const close = useCallback(() => setOpen(false), []);
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

  return (
    <div className="amqur-portal" ref={portalRef}>
      <LauncherButton open={open} onToggle={toggle} />
      <WidgetPanel open={open} onClose={close} />
    </div>
  );
}

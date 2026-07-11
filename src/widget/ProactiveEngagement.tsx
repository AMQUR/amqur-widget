import { useEffect, useState } from 'react';
import { useWidget } from './WidgetContext';
import { t, type Locale } from './i18n';

/**
 * Non-intrusive proactive prompt. Feature-flagged; frequency-capped; dismissible.
 * Does not use dark patterns.
 */
export function ProactiveEngagement({
  locale,
}: {
  locale: Locale;
}) {
  const { bootstrap } = useWidget();
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!bootstrap.proactive?.enabled && !bootstrap.features?.proactiveEngagement) {
      return;
    }
    const max = bootstrap.proactive?.maxPerSession ?? 2;
    const timer = window.setTimeout(() => {
      if (shown >= max) return;
      setVisible(true);
      setShown((n) => n + 1);
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [bootstrap, shown]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Suggested help"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 72,
        padding: '12px 14px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.96)',
        border: '1px solid rgba(0,0,0,0.1)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        zIndex: 5,
        fontSize: 13,
      }}
    >
      <div>{t(locale, 'proactiveVdp')}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={() => setVisible(false)}
          style={{
            border: '1px solid rgba(0,0,0,0.12)',
            background: 'transparent',
            borderRadius: 8,
            padding: '6px 10px',
            cursor: 'pointer',
          }}
        >
          {t(locale, 'dismiss')}
        </button>
      </div>
    </div>
  );
}

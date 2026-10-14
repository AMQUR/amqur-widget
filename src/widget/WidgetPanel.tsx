import { useEffect, useRef, useState } from 'react';
import { ChatView } from './ChatView';
import { CloseIcon } from './icons';
import { detectLocale, t, type Locale } from './i18n';
import { useWidget } from './WidgetContext';
import { c } from './concierge/copy';
import { fetchStoreStatus, type StoreStatus } from './api/chat.api';

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter((w) => /^[A-Za-z]/.test(w))
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || 'AI'
  );
}

function useOnlineState(initial: boolean) {
  const [isOnline, setIsOnline] = useState(initial);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return isOnline;
}

export function WidgetPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { bootstrap, config } = useWidget();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const isOnline = useOnlineState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [locale] = useState<Locale>(() =>
    detectLocale(config.locale ?? bootstrap.locales?.[0]),
  );

  const { branding, location, features } = bootstrap;
  const logoUrl = branding?.logoUrl;
  const locationName = location?.name || 'Dealership Assistant';
  const headerTitle =
    (typeof branding?.assistantDisplayName === 'string' &&
      branding.assistantDisplayName.trim()) ||
    locationName;
  const logoAlt =
    (typeof branding?.logoAlt === 'string' && branding.logoAlt.trim()) ||
    `${locationName} logo`;
  const chatEnabled = features?.chat === true;
  const lang = locale === 'es' ? 'es' : 'en';
  const [store, setStore] = useState<StoreStatus>({ known: false });
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void fetchStoreStatus(lang).then((st) => alive && setStore(st));
    return () => {
      alive = false;
    };
  }, [open, lang]);
  // Staff availability comes from verified (or clearly labeled demo) hours — never implied by "online".
  const sales = store.known ? store.sales : null;
  const team = sales
    ? `${sales.open && sales.closesAt ? c(lang, 'teamOpen', { t: sales.closesAt }) : sales.nextOpen ? c(lang, 'teamClosed', { t: sales.nextOpen.at }) : ''}${store.simulated ? ` (${c(lang, 'demoHours')})` : ''}`
    : null;

  const disclaimerText =
    typeof branding?.disclaimerText === 'string'
      ? branding.disclaimerText.trim()
      : '';
  const consentText =
    (typeof bootstrap.consentText === 'string' && bootstrap.consentText.trim()) ||
    '';
  const privacyUrl =
    typeof branding?.privacyUrl === 'string' ? branding.privacyUrl.trim() : '';
  const termsUrl =
    typeof branding?.termsUrl === 'string' ? branding.termsUrl.trim() : '';
  const showFooter =
    disclaimerText || consentText || privacyUrl || termsUrl;

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="amqur-panel"
      role="dialog"
      aria-modal="true"
      aria-label={`${locationName} assistant`}
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <header className="amqur-header amq-header">
        <div className="amq-header__brand">
          {logoUrl ? (
            <img src={logoUrl} alt={logoAlt} className="amq-header__logo" />
          ) : (
            <div className="amq-avatar" aria-hidden>
              {initials(headerTitle)}
            </div>
          )}
          <div className="amq-header__text">
            <span className="amq-header__title">{headerTitle}</span>
            <span className="amq-header__status" aria-live="polite">
              <span className={`amq-dot${isOnline ? ' amq-dot--on' : ''}`} aria-hidden />
              {/* "Connected" = the AI assistant is reachable — NOT that a person is present. */}
              {isOnline ? `${c(lang, 'aiAssistant')} · ${c(lang, 'connected')}` : c(lang, 'reconnecting')}
            </span>
            {team && <span className="amq-header__team">{team}</span>}
          </div>
        </div>
        <button
          ref={closeRef}
          className="amqur-iconbtn amq-close"
          onClick={onClose}
          aria-label="Close chat"
          type="button"
        >
          <CloseIcon />
        </button>
      </header>

      <div
        className="amqur-body"
        style={{
          padding: 0,
          gap: 0,
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {chatEnabled ? (
          <ChatView />
        ) : (
          <div style={{ padding: 16, fontSize: 14 }}>
            Chat is not enabled for this location.
          </div>
        )}
      </div>

      {showFooter && (
        <footer
          style={{
            borderTop: '1px solid rgba(0,0,0,0.06)',
            padding: '10px 14px',
            fontSize: '11px',
            lineHeight: 1.45,
            color: 'var(--amqur-text, #141414)',
            opacity: 0.75,
            background: 'rgba(255,255,255,0.5)',
          }}
        >
          {disclaimerText && <p style={{ margin: '0 0 6px' }}>{disclaimerText}</p>}
          {consentText && <p style={{ margin: '0 0 6px' }}>{consentText}</p>}
          {(privacyUrl || termsUrl) && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {privacyUrl && (
                <a
                  href={privacyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'inherit' }}
                >
                  {t(locale, 'privacy')}
                </a>
              )}
              {termsUrl && (
                <a
                  href={termsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'inherit' }}
                >
                  {t(locale, 'terms')}
                </a>
              )}
            </div>
          )}
        </footer>
      )}
    </div>
  );
}

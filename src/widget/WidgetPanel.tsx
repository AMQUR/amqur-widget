import { useEffect, useRef, useState } from 'react';
import { ChatView } from './ChatView';
import { CloseIcon } from './icons';
import { detectLocale, t, type Locale } from './i18n';
import { useWidget } from './WidgetContext';

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
  const primaryColor = branding?.primaryColor || '#111111';
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
      style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}
    >
      <div
        className="amqur-header"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '0 12px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={logoAlt}
              style={{ height: '24px', width: 'auto', borderRadius: '4px' }}
            />
          ) : (
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: primaryColor,
                flexShrink: 0,
              }}
              aria-hidden
            />
          )}
          <span
            style={{
              fontSize: '14px',
              fontWeight: 620,
              color: 'var(--amqur-text, #141414)',
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {headerTitle}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            marginRight: '6px',
          }}
          aria-live="polite"
        >
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: isOnline ? '#22c55e' : '#a3a3a3',
            }}
            aria-hidden
          />
          <span style={{ fontSize: '12px', opacity: 0.55 }}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        <button
          ref={closeRef}
          className="amqur-iconbtn"
          onClick={onClose}
          aria-label="Close chat"
          type="button"
        >
          <CloseIcon />
        </button>
      </div>

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

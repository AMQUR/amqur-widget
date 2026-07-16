import { useEffect, useRef, useState } from 'react';
import { ChatView } from './ChatView';
import { CloseIcon } from './icons';
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
  const { bootstrap } = useWidget();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const isOnline = useOnlineState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  const { branding, location, features } = bootstrap;
  const primaryColor = branding?.primaryColor || '#111111';
  const logoUrl = branding?.logoUrl;
  const locationName = location?.name || 'Dealership Assistant';
  const chatEnabled = features?.chat === true;

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
      style={{ position: 'relative' }}
    >
      <div
        className="amqur-header"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '0 12px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
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
            {locationName}
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

      <div className="amqur-body" style={{ padding: '0', gap: '0' }}>
        {chatEnabled ? (
          <ChatView />
        ) : (
          <div style={{ padding: 16, fontSize: 14 }}>
            Chat is not enabled for this location.
          </div>
        )}
      </div>
    </div>
  );
}

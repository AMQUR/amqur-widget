import { forwardRef, useEffect, useState } from 'react';
import { useWidget } from '../WidgetContext';
import { ChatIcon, CloseIcon } from '../icons';
export const LauncherButton = forwardRef<
  HTMLButtonElement,
  {
    open: boolean;
    onToggle: () => void;
    openLabel: string;
    closeLabel: string;
  }
>(function LauncherButton(props, ref) {
    const { bootstrap } = useWidget();
    const iconUrl = bootstrap.branding?.launcherIconUrl;
    const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => {
            window.removeEventListener('online', on);
            window.removeEventListener('offline', off);
        };
    }, []);

    return (
        <button
            ref={ref}
            type="button"
            className={`amqur-launcher${!online ? ' amqur-launcher--offline' : ''}`}
            aria-label={props.open ? props.closeLabel : props.openLabel}
            aria-expanded={props.open}
            onClick={props.onToggle}
        >
            {props.open ? (
                <CloseIcon />
            ) : iconUrl ? (
                <img
                    src={iconUrl}
                    alt=""
                    aria-hidden
                    className="amqur-launcher__img"
                />
            ) : (
                <ChatIcon />
            )}
        </button>
    );
});

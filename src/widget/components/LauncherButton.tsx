import { useWidget } from '../WidgetContext';
import { EnvoyMark } from '../icons';

export function LauncherButton(props: { open: boolean; onToggle: () => void }) {
    const { bootstrap } = useWidget();
    const iconUrl = bootstrap.branding?.launcherIconUrl;

    return (
        <button
            type="button"
            className="amqur-launcher"
            aria-label={props.open ? 'Close assistant' : 'Open assistant'}
            onClick={props.onToggle}
        >
            {iconUrl ? (
                <img
                    src={iconUrl}
                    alt=""
                    aria-hidden
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        borderRadius: '50%',
                    }}
                />
            ) : (
                <EnvoyMark />
            )}
        </button>
    );
}

import { useEffect, useState } from 'react';
import { useWidget } from './WidgetContext';
import { c } from './concierge/copy';
import type { Lang, PageContext } from './concierge/types';
import type { SendOptions } from './concierge/useConcierge';

const DISMISS_KEY = 'amqur_proactive_dismissed_v2';

/**
 * Contextual, frequency-capped nudge (VDP dwell / service page). Never shown again after a
 * dismissal (persisted), never over an active conversation, never on generic pages, and it
 * does not obstruct content (inline above the composer). No fake urgency.
 */
export function ProactiveEngagement(props: { lang: Lang; pageContext: PageContext; hasConversation: boolean; onAccept: (opts: SendOptions) => void }) {
    const { bootstrap } = useWidget();
    const [visible, setVisible] = useState(false);
    const enabled = bootstrap.proactive?.enabled === true || bootstrap.features?.proactiveEngagement === true;
    const kind = props.pageContext.pageType === 'vdp' && props.pageContext.vin ? 'vdp' : props.pageContext.pageType === 'service' || props.pageContext.pageType === 'service_scheduler' ? 'service' : null;

    useEffect(() => {
        if (!enabled || !kind || props.hasConversation) return;
        try {
            if (sessionStorage.getItem(DISMISS_KEY) || localStorage.getItem(DISMISS_KEY)) return;
        } catch {
            /* storage blocked → still allow once per page view */
        }
        const timer = window.setTimeout(() => setVisible(true), kind === 'vdp' ? 20_000 : 12_000);
        return () => window.clearTimeout(timer);
    }, [enabled, kind, props.hasConversation]);

    if (!visible || props.hasConversation || !kind) return null;
    const dismiss = () => {
        setVisible(false);
        try {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch {
            /* ignore */
        }
    };
    return (
        <div className="amq-nudge" role="complementary" aria-label="Suggestion">
            <p>{kind === 'vdp' ? c(props.lang, 'welcomeVdp') : c(props.lang, 'welcomeService')}</p>
            <div className="amq-actions">
                <button
                    type="button"
                    className="amq-btn amq-btn--primary"
                    onClick={() => {
                        setVisible(false);
                        props.onAccept(kind === 'vdp' ? { action: 'vehicle_detail', vin: props.pageContext.vin, display: c(props.lang, 'welcomeVdp') } : { action: 'service', display: c(props.lang, 'service') });
                    }}
                >
                    {kind === 'vdp' ? c(props.lang, 'details') : c(props.lang, 'service')}
                </button>
                <button type="button" className="amq-btn amq-btn--ghost" onClick={dismiss}>
                    {c(props.lang, 'close')}
                </button>
            </div>
        </div>
    );
}

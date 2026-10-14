import { useEffect, useState } from 'react';
import type { Lang, PageContext } from './types';
import { c } from './copy';
import { fetchStoreStatus, type StoreStatus } from '../api/chat.api';

/** Opening "storefront": verified open/closed status, departments, context-aware nudge. */
export function Storefront(props: {
    lang: Lang;
    welcome: string;
    pageContext: PageContext;
    departments: { sales: boolean; service: boolean; parts: boolean };
    onPick: (action: 'sales' | 'service' | 'parts' | 'vdp') => void;
}) {
    const [status, setStatus] = useState<StoreStatus>({ known: false });
    useEffect(() => {
        let alive = true;
        void fetchStoreStatus(props.lang).then((s) => alive && setStatus(s));
        return () => {
            alive = false;
        };
    }, [props.lang]);
    const sales = status.known ? status.sales : null;
    return (
        <div className="amq-storefront">
            {sales && (
                <div className={`amq-chip amq-chip--${sales.open ? 'ok' : 'neutral'}`} role="status">
                    {sales.open
                        ? `${c(props.lang, 'openNow')} ${sales.closesAt ? c(props.lang, 'closesAt', { t: sales.closesAt }) : ''}`
                        : `${c(props.lang, 'closedNow')}${sales.nextOpen ? ` · ${c(props.lang, 'opens', { d: '', t: sales.nextOpen.at })}` : ''}`}
                </div>
            )}
            <p className="amq-storefront__welcome">{props.welcome}</p>
            {props.pageContext.pageType === 'vdp' && props.pageContext.vin && (
                <button type="button" className="amq-btn amq-btn--primary amq-btn--block" onClick={() => props.onPick('vdp')}>
                    {c(props.lang, 'welcomeVdp')}
                </button>
            )}
            <div className="amq-depts" role="group" aria-label="Departments">
                {props.departments.sales && (
                    <button type="button" className="amq-dept" onClick={() => props.onPick('sales')}>
                        {c(props.lang, 'sales')}
                    </button>
                )}
                {props.departments.service && (
                    <button type="button" className="amq-dept" onClick={() => props.onPick('service')}>
                        {c(props.lang, 'service')}
                    </button>
                )}
                {props.departments.parts && (
                    <button type="button" className="amq-dept" onClick={() => props.onPick('parts')}>
                        {c(props.lang, 'parts')}
                    </button>
                )}
            </div>
        </div>
    );
}

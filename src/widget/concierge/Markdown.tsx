import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckIcon, CopyIcon } from '../icons';
import { copyText } from './clipboard';
import { parseMarkdown } from './mdParse';
import type { Block, Inline } from './mdParse';

export interface MarkdownLabels {
    copy: string;
    copyCode: string;
    copied: string;
    copyFailed: string;
    code: string;
    table: string;
}

/** Icon button that copies `getText()` and shows a brief confirmation. */
export function CopyButton({
    getText,
    label,
    labels,
    className = '',
}: {
    getText: () => string;
    label: string;
    labels: Pick<MarkdownLabels, 'copied' | 'copyFailed'>;
    className?: string;
}) {
    const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );
    const onClick = () => {
        void copyText(getText()).then((ok) => {
            setState(ok ? 'done' : 'failed');
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setState('idle'), 1800);
        });
    };
    const text = state === 'done' ? labels.copied : state === 'failed' ? labels.copyFailed : null;
    return (
        <button type="button" className={`amq-copy ${className}`.trim()} data-state={state} aria-label={text ?? label} title={text ?? label} onClick={onClick}>
            {state === 'done' ? <CheckIcon /> : <CopyIcon />}
            {/* Visible text so the log's live region announces the result. */}
            {text && <span className="amq-copy__text">{text}</span>}
        </button>
    );
}

function renderInline(nodes: Inline[]): ReactNode[] {
    return nodes.map((n, i) => {
        switch (n.t) {
            case 'text':
                return n.v;
            case 'br':
                return <br key={i} />;
            case 'code':
                return <code key={i}>{n.v}</code>;
            case 'strong':
                return <strong key={i}>{renderInline(n.c)}</strong>;
            case 'em':
                return <em key={i}>{renderInline(n.c)}</em>;
            case 'del':
                return <del key={i}>{renderInline(n.c)}</del>;
            case 'link':
                // href has already passed safeHref(): https:, mailto: or tel: only.
                return (
                    <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow">
                        {renderInline(n.c)}
                    </a>
                );
        }
    });
}

function renderBlocks(blocks: Block[], labels: MarkdownLabels): ReactNode[] {
    return blocks.map((b, i) => {
        switch (b.t) {
            case 'p':
                return <p key={i}>{renderInline(b.c)}</p>;
            case 'h': {
                // Real heading semantics, sized for a chat bubble. The widget title is the h2.
                const Tag = b.level === 1 ? 'h3' : b.level === 2 ? 'h4' : 'h5';
                return (
                    <Tag key={i} className={`amq-md__h amq-md__h--${b.level}`}>
                        {renderInline(b.c)}
                    </Tag>
                );
            }
            case 'hr':
                return <hr key={i} />;
            case 'quote':
                return <blockquote key={i}>{renderBlocks(b.c, labels)}</blockquote>;
            case 'list': {
                const items = b.items.map((it, k) => (
                    <li key={k}>
                        {renderInline(it.c)}
                        {it.sub.length > 0 && renderBlocks(it.sub, labels)}
                    </li>
                ));
                return b.ordered ? (
                    <ol key={i} start={b.start !== 1 ? b.start : undefined}>
                        {items}
                    </ol>
                ) : (
                    <ul key={i}>{items}</ul>
                );
            }
            case 'code':
                return (
                    <div key={i} className="amq-md__code" data-open={b.open || undefined}>
                        <div className="amq-md__codebar">
                            <span className="amq-md__lang">{b.lang || labels.code}</span>
                            {!b.open && <CopyButton getText={() => b.v} label={labels.copyCode} labels={labels} />}
                        </div>
                        {/* Focusable so keyboard users can scroll long lines. */}
                        <pre tabIndex={0} role="group" aria-label={b.lang ? `${labels.code}: ${b.lang}` : labels.code}>
                            <code>{b.v}</code>
                        </pre>
                    </div>
                );
            case 'table':
                return (
                    <div key={i} className="amq-md__table" tabIndex={0} role="group" aria-label={labels.table}>
                        <table>
                            <thead>
                                <tr>
                                    {b.head.map((cell, k) => (
                                        <th key={k} scope="col" style={b.align[k] ? { textAlign: b.align[k]! } : undefined}>
                                            {renderInline(cell)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            {b.rows.length > 0 && (
                                <tbody>
                                    {b.rows.map((row, r) => (
                                        <tr key={r}>
                                            {row.map((cell, k) => (
                                                <td key={k} style={b.align[k] ? { textAlign: b.align[k]! } : undefined}>
                                                    {renderInline(cell)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            )}
                        </table>
                    </div>
                );
        }
    });
}

/**
 * Renders assistant Markdown as React elements. Nothing here uses innerHTML: text (including any
 * HTML the model emits) is escaped by React, and only allow-listed link schemes become anchors.
 */
export const Markdown = memo(function Markdown({ text, streaming = false, labels }: { text: string; streaming?: boolean; labels: MarkdownLabels }) {
    const blocks = useMemo(() => {
        try {
            return parseMarkdown(text, { lenient: streaming });
        } catch {
            // The parser should never throw; if it does, the customer still gets the words.
            return [{ t: 'p', c: [{ t: 'text', v: text }] }] as Block[];
        }
    }, [text, streaming]);
    return <div className="amq-md">{renderBlocks(blocks, labels)}</div>;
});

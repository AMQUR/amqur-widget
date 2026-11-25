/**
 * Small, dependency-free Markdown parser for assistant replies.
 *
 * Output is a plain data tree that `Markdown.tsx` turns into React elements, so text is always
 * escaped by React: there is no HTML passthrough and no innerHTML anywhere. Raw HTML in the
 * source is just text.
 *
 * `lenient` is set while a reply is still streaming: unclosed emphasis / code / fences / tables
 * are rendered as if they were already closed, so the bubble does not flip between raw symbols
 * and formatted text on every token.
 */

export type Inline =
    | { t: 'text'; v: string }
    | { t: 'br' }
    | { t: 'code'; v: string }
    | { t: 'strong' | 'em' | 'del'; c: Inline[] }
    | { t: 'link'; href: string; c: Inline[] };

export type Align = 'left' | 'center' | 'right' | null;

export interface ListItem {
    c: Inline[];
    /** Nested blocks (sub-lists, continuation paragraphs, code). */
    sub: Block[];
}

export type Block =
    | { t: 'p'; c: Inline[] }
    | { t: 'h'; level: 1 | 2 | 3; c: Inline[] }
    | { t: 'code'; lang: string; v: string; open: boolean }
    | { t: 'quote'; c: Block[] }
    | { t: 'list'; ordered: boolean; start: number; items: ListItem[] }
    | { t: 'table'; align: Align[]; head: Inline[][]; rows: Inline[][][] }
    | { t: 'hr' };

export interface ParseOptions {
    lenient?: boolean;
}

const MAX_BLOCK_DEPTH = 4;
const MAX_INLINE_DEPTH = 6;

/* ───────────── links ───────────── */

/**
 * Only https:, mailto: and tel: are ever clickable. Everything else (javascript:, data:, http:,
 * relative paths, protocol-relative, anything unparseable) returns null and renders as text.
 */
export function safeHref(raw: string): string | null {
    const url = raw.trim();
    // Whitespace / control characters are how scheme checks get smuggled past ("java\tscript:").
    // eslint-disable-next-line no-control-regex
    if (!url || url.length > 2048 || /[\u0000- \u007f-\u009f]/.test(url)) return null;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (parsed.protocol === 'https:') {
        if (!/^https:\/\//i.test(url) || !parsed.hostname || parsed.username || parsed.password) return null;
        return parsed.href;
    }
    if (parsed.protocol === 'mailto:' || parsed.protocol === 'tel:') return url;
    return null;
}

/* ───────────── inline ───────────── */

const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);
const isWord = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|<>~]/;

function runLength(s: string, at: number, ch: string): number {
    let n = 0;
    while (s[at + n] === ch) n++;
    return n;
}

interface InlineCtx {
    lenient: boolean;
    /** Delimiters already known to have no closer further on — keeps the scan linear. */
    dead: Set<string>;
}

/** Index of the closing delimiter for emphasis opened just before `from`, or -1. */
function findCloser(s: string, from: number, delim: string): number {
    const ch = delim[0]!;
    const want = delim.length;
    let k = from;
    while (k < s.length) {
        const cur = s[k]!;
        if (cur === '\\') {
            k += 2;
            continue;
        }
        if (cur === '`') {
            const n = runLength(s, k, '`');
            const end = s.indexOf('`'.repeat(n), k + n);
            k = end === -1 ? k + n : end + n;
            continue;
        }
        if (cur === ch) {
            const n = runLength(s, k, ch);
            const before = s[k - 1];
            const after = s[k + n];
            const canClose = k > from && !isSpace(before) && !(ch === '_' && isWord(after));
            if (canClose) {
                if (want === 2 && n >= 2) return k + (n - 2);
                if (want === 1 && n % 2 === 1) return k + (n - 1);
            }
            k += n;
            continue;
        }
        k++;
    }
    return -1;
}

/** Context for the inside of an already-closed construct: its own scan state, never lenient. */
const closedCtx = (): InlineCtx => ({ lenient: false, dead: new Set() });

/** Links cannot nest; a URL inside a link label is just part of the label. */
function unlink(nodes: Inline[]): Inline[] {
    const out: Inline[] = [];
    for (const n of nodes) {
        if (n.t === 'link') out.push(...unlink(n.c));
        else if (n.t === 'strong' || n.t === 'em' || n.t === 'del') out.push({ t: n.t, c: unlink(n.c) });
        else out.push(n);
    }
    return out;
}

function pushText(out: Inline[], v: string) {
    if (!v) return;
    const last = out[out.length - 1];
    if (last && last.t === 'text') last.v += v;
    else out.push({ t: 'text', v });
}

function trimUrlTail(url: string): string {
    let u = url;
    for (;;) {
        const last = u[u.length - 1];
        if (last === undefined) break;
        if (/[.,;:!?'"*_~]/.test(last)) u = u.slice(0, -1);
        else if (last === ')' && u.split('(').length <= u.split(')').length - 1) u = u.slice(0, -1);
        else break;
    }
    return u;
}

function plainOf(nodes: Inline[]): string {
    let s = '';
    for (const n of nodes) {
        if (n.t === 'text' || n.t === 'code') s += n.v;
        else if (n.t === 'br') s += '\n';
        else s += plainOf(n.c);
    }
    return s;
}

function parseInlineInto(s: string, out: Inline[], ctx: InlineCtx, depth: number): void {
    if (depth > MAX_INLINE_DEPTH) {
        pushText(out, s);
        return;
    }
    let i = 0;
    while (i < s.length) {
        const ch = s[i]!;

        if (ch === '\n') {
            // A single newline is a visible line break in chat.
            const last = out[out.length - 1];
            if (last && last.t === 'text') last.v = last.v.replace(/[ \t]+$/, '');
            out.push({ t: 'br' });
            i++;
            while (s[i] === ' ' || s[i] === '\t') i++;
            continue;
        }

        if (ch === '\\' && i + 1 < s.length && ESCAPABLE.test(s[i + 1]!)) {
            pushText(out, s[i + 1]!);
            i += 2;
            continue;
        }

        if (ch === '`') {
            const n = runLength(s, i, '`');
            const fence = '`'.repeat(n);
            const key = `code${n}`;
            let end = ctx.dead.has(key) ? -1 : s.indexOf(fence, i + n);
            // the closing run must be exactly n long
            while (end !== -1 && (s[end + n] === '`' || s[end - 1] === '`')) {
                const skip = end + runLength(s, end, '`');
                end = s.indexOf(fence, skip);
            }
            if (end !== -1) {
                out.push({ t: 'code', v: s.slice(i + n, end).replace(/\n/g, ' ').replace(/^ (.*[^ ].*) $/, '$1') });
                i = end + n;
                continue;
            }
            ctx.dead.add(key);
            if (ctx.lenient) {
                const rest = s.slice(i + n).replace(/\n/g, ' ');
                if (rest) out.push({ t: 'code', v: rest });
                return;
            }
            pushText(out, fence);
            i += n;
            continue;
        }

        if (ch === '!' && s[i + 1] === '[') {
            // Images are never loaded (remote content / tracking); show the alt text instead.
            const link = readLink(s, i + 1, ctx);
            if (link && link.kind === 'link') {
                pushText(out, link.label);
                i = link.end;
                continue;
            }
            if (link && link.kind === 'partial') {
                pushText(out, link.label);
                return;
            }
        }

        if (ch === '[') {
            const link = readLink(s, i, ctx);
            if (link && link.kind === 'partial') {
                for (const n of unlink(parseInline(link.label))) out.push(n);
                return;
            }
            if (link) {
                const href = safeHref(link.url);
                const parsed: Inline[] = [];
                parseInlineInto(link.label, parsed, closedCtx(), depth + 1);
                const label = unlink(parsed);
                if (href && label.length > 0) {
                    out.push({ t: 'link', href, c: label });
                } else {
                    // Unsafe or unsupported destination: keep the words, drop the link.
                    for (const n of label) {
                        if (n.t === 'text') pushText(out, n.v);
                        else out.push(n);
                    }
                    // A plain-http address is still useful to read; show it as text.
                    if (/^http:\/\//i.test(link.url.trim()) && plainOf(label).trim() !== link.url.trim()) pushText(out, ` (${link.url.trim()})`);
                }
                i = link.end;
                continue;
            }
        }

        if (ch === '<') {
            const m = /^<(https:\/\/[^\s<>]+)>/.exec(s.slice(i, i + 2100));
            const href = m ? safeHref(m[1]!) : null;
            if (m && href) {
                out.push({ t: 'link', href, c: [{ t: 'text', v: m[1]! }] });
                i += m[0].length;
                continue;
            }
        }

        if (ch === 'h' && s.startsWith('https://', i) && !isWord(s[i - 1])) {
            const m = /^https:\/\/[^\s<>]+/.exec(s.slice(i, i + 2100));
            const url = m ? trimUrlTail(m[0]) : '';
            const href = url.length > 'https://'.length ? safeHref(url) : null;
            if (href) {
                out.push({ t: 'link', href, c: [{ t: 'text', v: url }] });
                i += url.length;
                continue;
            }
        }

        if (ch === '*' || ch === '_' || ch === '~') {
            const n = runLength(s, i, ch);
            const next = s[i + n];
            const prev = s[i - 1];
            const want = ch === '~' ? (n >= 2 ? 2 : 0) : n >= 2 ? 2 : 1;
            const canOpen = want > 0 && !isSpace(next) && !(ch === '_' && isWord(prev));
            if (canOpen) {
                const delim = ch.repeat(want);
                const from = i + want;
                const close = ctx.dead.has(delim) ? -1 : findCloser(s, from, delim);
                const tag = want === 2 ? (ch === '~' ? 'del' : 'strong') : 'em';
                if (close !== -1) {
                    const inner: Inline[] = [];
                    parseInlineInto(s.slice(from, close), inner, closedCtx(), depth + 1);
                    out.push({ t: tag, c: inner });
                    i = close + want;
                    continue;
                }
                ctx.dead.add(delim);
                if (ctx.lenient) {
                    // Still streaming: format through to the end as though it were closed.
                    const inner: Inline[] = [];
                    parseInlineInto(s.slice(from), inner, ctx, depth + 1);
                    if (inner.length) out.push({ t: tag, c: inner });
                    return;
                }
            } else if (ctx.lenient && i + n === s.length) {
                // A delimiter that has only just started arriving; hide it for this frame.
                return;
            }
            pushText(out, ch.repeat(n));
            i += n;
            continue;
        }

        // plain run up to the next character that could start something
        let j = i + 1;
        while (j < s.length && !/[\n\\`![<h*_~]/.test(s[j]!)) j++;
        pushText(out, s.slice(i, j));
        i = j;
    }
}

type LinkRead = { kind: 'link'; label: string; url: string; end: number } | { kind: 'partial'; label: string };

/** Reads `[label](url "title")` starting at the `[` at `at`. */
function readLink(s: string, at: number, ctx: InlineCtx): LinkRead | null {
    let depth = 0;
    let k = at;
    let close = -1;
    const limit = Math.min(s.length, at + 600);
    for (; k < limit; k++) {
        const ch = s[k]!;
        if (ch === '\\') k++;
        else if (ch === '[') depth++;
        else if (ch === ']') {
            depth--;
            if (depth === 0) {
                close = k;
                break;
            }
        }
    }
    if (close === -1 || s[close + 1] !== '(') return null;
    const label = s.slice(at + 1, close);
    let parens = 0;
    let end = -1;
    for (k = close + 2; k < s.length; k++) {
        const ch = s[k]!;
        if (ch === '\\') k++;
        else if (ch === '\n') break;
        else if (ch === '(') parens++;
        else if (ch === ')') {
            if (parens === 0) {
                end = k;
                break;
            }
            parens--;
        }
    }
    if (end === -1) {
        // "[label](https://exa" mid-stream: show the label, not half a URL.
        return ctx.lenient && k >= s.length ? { kind: 'partial', label } : null;
    }
    let url = s.slice(close + 2, end).trim();
    const title = /^(\S+)\s+(?:"[^"]*"|'[^']*')$/.exec(url);
    if (title) url = title[1]!;
    if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1);
    return { kind: 'link', label, url, end: end + 1 };
}

export function parseInline(src: string, opts: ParseOptions = {}): Inline[] {
    const out: Inline[] = [];
    parseInlineInto(src, out, { lenient: opts.lenient === true, dead: new Set() }, 0);
    return out;
}

/* ───────────── blocks ───────────── */

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>[ \t]?/;
const LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const TABLE_DELIM = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

const indentOf = (line: string) => {
    let n = 0;
    for (const ch of line) {
        if (ch === ' ') n++;
        else if (ch === '\t') n += 4;
        else break;
    }
    return n;
};

function stripIndent(line: string, n: number): string {
    let cut = 0;
    let width = 0;
    while (cut < line.length && width < n) {
        if (line[cut] === ' ') width++;
        else if (line[cut] === '\t') width += 4;
        else break;
        cut++;
    }
    return line.slice(cut);
}

function splitRow(line: string): string[] {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    const cells: string[] = [];
    let cur = '';
    for (let k = 0; k < s.length; k++) {
        const ch = s[k]!;
        if (ch === '\\' && s[k + 1] === '|') {
            cur += '|';
            k++;
        } else if (ch === '|') {
            cells.push(cur.trim());
            cur = '';
        } else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
}

function isBlockStart(line: string): boolean {
    return FENCE_OPEN.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line);
}

function tableAt(lines: string[], i: number, lenient: boolean): boolean {
    const head = lines[i]!;
    if (!head.includes('|')) return false;
    const next = lines[i + 1];
    if (next !== undefined && TABLE_DELIM.test(next) && next.includes('-')) {
        if (splitRow(next).length === splitRow(head).length) return true;
    }
    if (!lenient || !head.trim().startsWith('|')) return false;
    // Mid-stream: a header row is on screen and its delimiter row is still arriving.
    if (next === undefined) return i === lines.length - 1 && splitRow(head).length >= 2;
    return i + 1 === lines.length - 1 && /^\s*\|?[\s|:-]*$/.test(next);
}

function parseBlocksFrom(lines: string[], lenient: boolean, depth: number): Block[] {
    const blocks: Block[] = [];
    const inline = (s: string) => parseInline(s, { lenient });
    let i = 0;

    while (i < lines.length) {
        const line = lines[i]!;
        if (!line.trim()) {
            i++;
            continue;
        }

        if (depth >= MAX_BLOCK_DEPTH) {
            // Pathologically deep nesting: stop structuring, keep the words.
            blocks.push({ t: 'p', c: inline(lines.slice(i).join('\n').trim()) });
            break;
        }

        const fence = FENCE_OPEN.exec(line);
        if (fence) {
            const mark = fence[1]!;
            const closeRe = new RegExp(`^ {0,3}${mark[0] === '`' ? '`' : '~'}{${mark.length},}[ \\t]*$`);
            const pad = indentOf(line);
            const body: string[] = [];
            let open = true;
            i++;
            while (i < lines.length) {
                if (closeRe.test(lines[i]!)) {
                    open = false;
                    i++;
                    break;
                }
                body.push(stripIndent(lines[i]!, pad));
                i++;
            }
            blocks.push({ t: 'code', lang: (fence[2] ?? '').slice(0, 24), v: body.join('\n'), open });
            continue;
        }

        const heading = HEADING.exec(line);
        if (heading) {
            blocks.push({ t: 'h', level: Math.min(heading[1]!.length, 3) as 1 | 2 | 3, c: inline(heading[2]!) });
            i++;
            continue;
        }

        if (HR.test(line)) {
            blocks.push({ t: 'hr' });
            i++;
            continue;
        }

        if (QUOTE.test(line)) {
            const inner: string[] = [];
            while (i < lines.length && QUOTE.test(lines[i]!)) {
                inner.push(lines[i]!.replace(QUOTE, ''));
                i++;
            }
            blocks.push({ t: 'quote', c: parseBlocksFrom(inner, lenient, depth + 1) });
            continue;
        }

        const item = LIST_ITEM.exec(line);
        if (item) {
            const base = indentOf(line);
            const ordered = /\d/.test(item[2]!);
            const items: { text: string; sub: string[]; content: number }[] = [];
            const start = ordered ? parseInt(item[2]!, 10) : 1;
            while (i < lines.length) {
                const cur = lines[i]!;
                if (!cur.trim()) {
                    // A blank line only continues the list if more of it follows.
                    let n = i + 1;
                    while (n < lines.length && !lines[n]!.trim()) n++;
                    const after = lines[n];
                    if (after === undefined) break;
                    const m = LIST_ITEM.exec(after);
                    const ind = indentOf(after);
                    const sameList = m && ind <= base + 1 && ind >= base && /\d/.test(m[2]!) === ordered;
                    if (!sameList && ind < base + 2) break;
                    const lastItem = items[items.length - 1];
                    if (lastItem && lastItem.sub.length) lastItem.sub.push('');
                    i = n;
                    continue;
                }
                const ind = indentOf(cur);
                const m = LIST_ITEM.exec(cur);
                const last = items[items.length - 1];
                if (m && ind >= base && ind <= base + 1) {
                    if (/\d/.test(m[2]!) !== ordered) break;
                    items.push({ text: m[3]!, sub: [], content: ind + m[2]!.length + 1 });
                } else if (ind >= base + 2 && last) {
                    if (m || last.sub.length || isBlockStart(cur)) last.sub.push(stripIndent(cur, Math.min(ind, last.content)));
                    else last.text += `\n${cur.trim()}`;
                } else if (ind < base || isBlockStart(cur) || m || !last) {
                    break;
                } else if (last.sub.length) {
                    break;
                } else {
                    last.text += `\n${cur.trim()}`;
                }
                i++;
            }
            blocks.push({
                t: 'list',
                ordered,
                start: Number.isFinite(start) ? start : 1,
                items: items.map((it) => ({ c: inline(it.text), sub: it.sub.length ? parseBlocksFrom(it.sub, lenient, depth + 1) : [] })),
            });
            continue;
        }

        if (tableAt(lines, i, lenient)) {
            const head = splitRow(line);
            const delim = lines[i + 1];
            const marks = delim !== undefined ? splitRow(delim) : [];
            const align: Align[] = head.map((_, k) => {
                const mk = marks[k] ?? '';
                const l = mk.startsWith(':');
                const r = mk.endsWith(':') && mk.length > 1;
                return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
            });
            i += delim !== undefined ? 2 : 1;
            const rows: Inline[][][] = [];
            while (i < lines.length && lines[i]!.trim() && lines[i]!.includes('|') && !isBlockStart(lines[i]!)) {
                const cells = splitRow(lines[i]!);
                rows.push(head.map((_, k) => inline(cells[k] ?? '')));
                i++;
            }
            blocks.push({ t: 'table', align, head: head.map(inline), rows });
            continue;
        }

        // paragraph
        const para: string[] = [line.trim()];
        i++;
        while (i < lines.length) {
            const cur = lines[i]!;
            if (!cur.trim() || isBlockStart(cur) || tableAt(lines, i, lenient)) break;
            const m = LIST_ITEM.exec(cur);
            // As in CommonMark, an ordered list only interrupts a paragraph when it starts at 1.
            if (m && (!/\d/.test(m[2]!) || parseInt(m[2]!, 10) === 1)) break;
            para.push(cur.trim());
            i++;
        }
        blocks.push({ t: 'p', c: inline(para.join('\n')) });
    }
    return blocks;
}

export function parseMarkdown(src: string, opts: ParseOptions = {}): Block[] {
    const lines = src.replace(/\r\n?/g, '\n').split('\n');
    return parseBlocksFrom(lines, opts.lenient === true, 0);
}

/* ───────────── plain text (for "Copy") ───────────── */

function inlineText(nodes: Inline[]): string {
    let s = '';
    for (const n of nodes) {
        if (n.t === 'text' || n.t === 'code') s += n.v;
        else if (n.t === 'br') s += '\n';
        else if (n.t === 'link') {
            const label = inlineText(n.c);
            const bare = n.href.replace(/^(mailto|tel):/, '');
            s += label === n.href || label === bare || `${label}/` === n.href ? label : `${label} (${bare})`;
        } else s += inlineText(n.c);
    }
    return s;
}

function blocksText(blocks: Block[], indent = ''): string {
    const parts: string[] = [];
    for (const b of blocks) {
        if (b.t === 'p' || b.t === 'h') parts.push(indent + inlineText(b.c).replace(/\n/g, `\n${indent}`));
        else if (b.t === 'code') parts.push(b.v.split('\n').map((l) => indent + l).join('\n'));
        else if (b.t === 'quote') parts.push(blocksText(b.c, `${indent}> `));
        else if (b.t === 'hr') parts.push(`${indent}———`);
        else if (b.t === 'table') {
            parts.push([b.head, ...b.rows].map((r) => indent + r.map(inlineText).join('\t')).join('\n'));
        } else {
            parts.push(
                b.items
                    .map((it, k) => {
                        const mark = b.ordered ? `${b.start + k}. ` : '• ';
                        const own = indent + mark + inlineText(it.c).replace(/\n/g, `\n${indent}  `);
                        return it.sub.length ? `${own}\n${blocksText(it.sub, `${indent}  `).replace(/\n\n/g, '\n')}` : own;
                    })
                    .join('\n'),
            );
        }
    }
    return parts.join('\n\n');
}

/** Readable plain text for the clipboard: no Markdown symbols, links keep their address. */
export function markdownToPlainText(src: string): string {
    return blocksText(parseMarkdown(src)).trim();
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CopyButton, Markdown } from './Markdown';
import type { MarkdownLabels } from './Markdown';
import { markdownToPlainText, parseInline, parseMarkdown, safeHref } from './mdParse';
import { copyText } from './clipboard';
import { nextPinned } from './scrollPin';
import { c } from './copy';

const labels: MarkdownLabels = { copy: 'Copy reply', copyCode: 'Copy code', copied: 'Copied', copyFailed: 'Couldn’t copy', code: 'Code', table: 'Table' };
const md = (text: string, streaming = false) => renderToStaticMarkup(<Markdown text={text} streaming={streaming} labels={labels} />);
/** Markup inside the bubble wrapper. */
const inner = (text: string, streaming = false) => md(text, streaming).replace(/^<div class="amq-md">/, '').replace(/<\/div>$/, '');
const LINK_ATTRS = 'target="_blank" rel="noopener noreferrer nofollow"';

describe('Markdown: XSS and unsafe content', () => {
    it('renders raw HTML as literal text, never as elements', () => {
        const html = md('Hi <script>alert(1)</script> <b>bold</b>\n\n<img src=x onerror=alert(1)>\n\n<iframe src="https://evil.example"></iframe>');
        expect(html).not.toMatch(/<script|<img|<iframe|<b>/i);
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).toContain('&lt;iframe');
    });
    it('never creates an anchor for javascript:, data:, vbscript:, file: or http: links', () => {
        const cases = [
            '[x](javascript:alert(1))',
            '[x](JaVaScRiPt:alert(1))',
            '[x](data:text/html,<script>alert(1)</script>)',
            '[x](vbscript:msgbox(1))',
            '[x](file:///etc/passwd)',
            '[x](http://insecure.example/path)',
            '[x](//evil.example)',
            '[x](/relative/path)',
            '[x](java\tscript:alert(1))',
            '[x]( javascript:alert(1) )',
            '[x](https://user:pass@evil.example)',
            '<javascript:alert(1)>',
        ];
        for (const src of cases) {
            const html = md(src);
            expect(html, src).not.toContain('<a');
            expect(html, src).not.toContain('href');
        }
        expect(inner('[x](javascript:alert(1))')).toBe('<p>x</p>');
        // a plain-http address stays readable, just not clickable
        expect(inner('[site](http://insecure.example)')).toBe('<p>site (http://insecure.example)</p>');
        expect(inner('see http://insecure.example now')).toBe('<p>see http://insecure.example now</p>');
    });
    it('cannot break out of the href attribute', () => {
        const html = md('[x](https://a.example/"onmouseover="alert(1))');
        expect(html).not.toMatch(/<a[^>]*\sonmouseover=/);
    });
    it('does not load images; shows the alt text', () => {
        const html = md('![a tracking pixel](https://evil.example/p.gif)');
        expect(html).not.toContain('<img');
        expect(html).toContain('a tracking pixel');
    });
    it('safeHref allows only https, mailto and tel', () => {
        expect(safeHref('https://dial.example/inventory?x=1')).toBe('https://dial.example/inventory?x=1');
        expect(safeHref('mailto:sales@example.invalid')).toBe('mailto:sales@example.invalid');
        expect(safeHref('tel:+13125550100')).toBe('tel:+13125550100');
        for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'http://a.example', 'ftp://a.example', '//a.example', '/x', 'x', '', 'https:/a', 'blob:https://a.example/1', 'https://a.example/\u0000']) {
            expect(safeHref(bad), bad).toBeNull();
        }
    });
});

describe('Markdown: inline features', () => {
    it('bold, italic, strikethrough and inline code', () => {
        expect(inner('**bold** *it* _it2_ ~~gone~~ `x < y`')).toBe('<p><strong>bold</strong> <em>it</em> <em>it2</em> <del>gone</del> <code>x &lt; y</code></p>');
        expect(inner('***both***')).toBe('<p><strong><em>both</em></strong></p>');
        expect(inner('**a *b* c**')).toBe('<p><strong>a <em>b</em> c</strong></p>');
    });
    it('leaves non-emphasis symbols alone', () => {
        expect(inner('2 * 3 * 4')).toBe('<p>2 * 3 * 4</p>');
        expect(inner('snake_case_name and file_name.ts')).toBe('<p>snake_case_name and file_name.ts</p>');
        expect(inner('a lone * star and unclosed **bold')).toBe('<p>a lone * star and unclosed **bold</p>');
        expect(inner('\\*not italic\\*')).toBe('<p>*not italic*</p>');
        expect(inner('`code with **stars**`')).toBe('<p><code>code with **stars**</code></p>');
    });
    it('links: https, mailto, tel become anchors with safe attributes', () => {
        expect(inner('[Inventory](https://dial.example/new)')).toBe(`<p><a href="https://dial.example/new" ${LINK_ATTRS}>Inventory</a></p>`);
        expect(inner('[Call](tel:+13125550100) or [email](mailto:sales@example.invalid)')).toBe(
            `<p><a href="tel:+13125550100" ${LINK_ATTRS}>Call</a> or <a href="mailto:sales@example.invalid" ${LINK_ATTRS}>email</a></p>`,
        );
        expect(inner('[**Bold** link](https://dial.example/a_(b) "title")')).toBe(`<p><a href="https://dial.example/a_(b)" ${LINK_ATTRS}><strong>Bold</strong> link</a></p>`);
    });
    it('bare https URLs are linked, without trailing punctuation', () => {
        expect(inner('See https://dial.example/a?b=1, then (https://dial.example/x).')).toBe(
            `<p>See <a href="https://dial.example/a?b=1" ${LINK_ATTRS}>https://dial.example/a?b=1</a>, then (<a href="https://dial.example/x" ${LINK_ATTRS}>https://dial.example/x</a>).</p>`,
        );
        expect(inner('<https://dial.example>')).toBe(`<p><a href="https://dial.example/" ${LINK_ATTRS}>https://dial.example</a></p>`);
    });
    it('never nests anchors', () => {
        const html = inner('[https://dial.example](https://dial.example)');
        expect(html.match(/<a /g)).toHaveLength(1);
    });
    it('single newlines are line breaks; blank lines split paragraphs', () => {
        expect(inner('one\ntwo\n\nthree')).toBe('<p>one<br/>two</p><p>three</p>');
    });
});

describe('Markdown: block features', () => {
    it('headings render as modest in-bubble headings', () => {
        expect(inner('# One\n## Two\n### Three\n#### Four')).toBe(
            '<h3 class="amq-md__h amq-md__h--1">One</h3><h4 class="amq-md__h amq-md__h--2">Two</h4><h5 class="amq-md__h amq-md__h--3">Three</h5><h5 class="amq-md__h amq-md__h--3">Four</h5>',
        );
        expect(inner('#hashtag')).toBe('<p>#hashtag</p>');
    });
    it('unordered, ordered and nested lists', () => {
        expect(inner('- a\n- b\n* c')).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>');
        expect(inner('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
        expect(inner('3. c\n4. d')).toBe('<ol start="3"><li>c</li><li>d</li></ol>');
        expect(inner('- a\n  - a1\n  - a2\n- b')).toBe('<ul><li>a<ul><li>a1</li><li>a2</li></ul></li><li>b</li></ul>');
        expect(inner('1. step\n   - detail\n2. next')).toBe('<ol><li>step<ul><li>detail</li></ul></li><li>next</li></ol>');
        expect(inner('Options:\n- **a**\n- b\n\nDone.')).toBe('<p>Options:</p><ul><li><strong>a</strong></li><li>b</li></ul><p>Done.</p>');
        expect(inner('- a\n\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
    });
    it('fenced code blocks with language label, copy button and escaped content', () => {
        const html = md('```ts\nconst a = "<b>";\n  **not bold**\n```\nafter');
        expect(html).toContain('<span class="amq-md__lang">ts</span>');
        expect(html).toContain('aria-label="Copy code"');
        expect(html).toContain('<code>const a = &quot;&lt;b&gt;&quot;;\n  **not bold**</code>');
        expect(html).toContain('<p>after</p>');
        expect(md('```\nplain\n```')).toContain('<span class="amq-md__lang">Code</span>');
        expect(md('~~~\ntilde\n~~~')).toContain('<code>tilde</code>');
    });
    it('blockquotes and rules', () => {
        expect(inner('> quoted **text**\n> more\n\n---\n\nend')).toBe('<blockquote><p>quoted <strong>text</strong><br/>more</p></blockquote><hr/><p>end</p>');
    });
    it('GFM tables render in a scrollable wrapper with alignment', () => {
        const html = inner('| Trim | Price | Qty |\n|:-----|------:|:---:|\n| Laredo | $41,000 | 2 |\n| **Limited** | $48,500 |\n\nafter');
        expect(html).toContain('<div class="amq-md__table" tabindex="0" role="group" aria-label="Table"><table>');
        expect(html).toContain('<thead><tr><th scope="col" style="text-align:left">Trim</th><th scope="col" style="text-align:right">Price</th><th scope="col" style="text-align:center">Qty</th></tr></thead>');
        expect(html).toContain('<tr><td style="text-align:left">Laredo</td><td style="text-align:right">$41,000</td><td style="text-align:center">2</td></tr>');
        // short rows are padded to the header width
        expect(html).toContain('<tr><td style="text-align:left"><strong>Limited</strong></td><td style="text-align:right">$48,500</td><td style="text-align:center"></td></tr>');
        expect(html).toContain('<p>after</p>');
    });
    it('a table without outer pipes and with escaped pipes', () => {
        const blocks = parseMarkdown('a | b\n--- | ---\n1 \\| one | 2');
        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({ t: 'table', rows: [[[{ t: 'text', v: '1 | one' }], [{ t: 'text', v: '2' }]]] });
    });
    it('text with pipes but no delimiter row is not a table', () => {
        expect(inner('a | b\nc | d')).toBe('<p>a | b<br/>c | d</p>');
    });
});

describe('Markdown: incomplete input while streaming', () => {
    it('never throws for any prefix of a rich reply, streaming or not', () => {
        const full =
            '# Title\n\nSome **bold** and *italic* with `code` and [a link](https://dial.example/x).\n\n' +
            '- one\n  - nested `x`\n- two\n\n1. first\n2. second\n\n> quote **here**\n\n' +
            '| A | B |\n|---|:-:|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n---\nhttps://dial.example/end ~~x~~ <script>';
        for (let n = 0; n <= full.length; n++) {
            const part = full.slice(0, n);
            expect(() => md(part, true), `streaming prefix ${n}`).not.toThrow();
            expect(() => md(part, false), `final prefix ${n}`).not.toThrow();
            expect(md(part, true)).not.toMatch(/<script|javascript:/i);
        }
    });
    it('formats unclosed emphasis and code instead of flashing raw symbols', () => {
        expect(inner('This is **impor', true)).toBe('<p>This is <strong>impor</strong></p>');
        expect(inner('This is *impor', true)).toBe('<p>This is <em>impor</em></p>');
        expect(inner('run `npm inst', true)).toBe('<p>run <code>npm inst</code></p>');
        // a delimiter that has only just arrived is held back for a frame
        expect(inner('This is **', true)).toBe('<p>This is </p>');
        expect(inner('This is *', true)).toBe('<p>This is </p>');
        expect(inner('done **bold*', true)).toBe('<p>done <strong>bold</strong></p>');
    });
    it('shows the label, not half a URL, for a link still arriving', () => {
        expect(inner('See [our inventory](https://dial.exa', true)).toBe('<p>See our inventory</p>');
        expect(inner('See [our inventory](javascript:al', true)).toBe('<p>See our inventory</p>');
    });
    it('renders an unclosed fence as a code block in progress, without a copy button', () => {
        const html = md('Here:\n\n```python\nprint("hi")\nfor x in y:', true);
        expect(html).toContain('<div class="amq-md__code" data-open="true">');
        expect(html).toContain('<span class="amq-md__lang">python</span>');
        expect(html).toContain('<code>print(&quot;hi&quot;)\nfor x in y:</code>');
        expect(html).not.toContain('amq-copy');
        expect(md('```', true)).toContain('amq-md__code');
        // the same input once the stream has ended still renders as code, not raw backticks
        expect(md('```python\nprint(1)')).toContain('<code>print(1)</code>');
    });
    it('renders half a table as a table as soon as the header row is recognisable', () => {
        expect(inner('| Trim | Price |', true)).toContain('<th scope="col">Trim</th><th scope="col">Price</th>');
        expect(inner('| Trim | Price |\n|---', true)).toContain('<table>');
        expect(inner('| Trim | Price |\n|---|---|\n| Lar', true)).toContain('<td>Lar</td><td></td>');
        // once finished, a lone pipe row is ordinary text
        expect(inner('| Trim | Price |')).toBe('<p>| Trim | Price |</p>');
    });
    it('stays fast on pathological input', () => {
        const nasty = '*a '.repeat(4000) + '['.repeat(4000) + '`'.repeat(999) + '_x'.repeat(4000) + '> '.repeat(500) + '\n' + '  '.repeat(200) + '- x';
        const t0 = Date.now();
        expect(() => md(nasty)).not.toThrow();
        expect(() => md(nasty, true)).not.toThrow();
        expect(Date.now() - t0).toBeLessThan(2000);
    });
});

describe('copy', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('plain-text copy drops Markdown symbols and keeps link addresses', () => {
        const text = markdownToPlainText('## Plan\n\n**Bold** and `code` — [inventory](https://dial.example/new)\n\n- a\n  - a1\n- b\n\n1. x\n2. y\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nlet a;\n```');
        expect(text).toBe('Plan\n\nBold and code — inventory (https://dial.example/new)\n\n• a\n  • a1\n• b\n\n1. x\n2. y\n\nA\tB\n1\t2\n\nlet a;');
    });
    it('copy button is labelled and localized', () => {
        const html = renderToStaticMarkup(<CopyButton getText={() => 'x'} label={c('es', 'copyMessage')} labels={{ copied: c('es', 'copied'), copyFailed: c('es', 'copyFailed') }} />);
        expect(html).toContain('<button type="button" class="amq-copy" data-state="idle" aria-label="Copiar respuesta"');
        expect(c('en', 'copyMessage')).toBe('Copy reply');
        expect(c('en', 'copied')).toBe('Copied');
        expect(c('es', 'copied')).toBe('Copiado');
    });
    it('copyText uses the clipboard API and reports success', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { clipboard: { writeText } });
        await expect(copyText('hello')).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith('hello');
    });
    it('copyText fails gracefully when the clipboard is blocked or missing', async () => {
        vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) } });
        await expect(copyText('hello')).resolves.toBe(false);
        vi.stubGlobal('navigator', {});
        await expect(copyText('hello')).resolves.toBe(false);
        await expect(copyText('')).resolves.toBe(false);
    });
});

describe('message log auto-scroll', () => {
    it('stays pinned while content grows or our own scroll runs', () => {
        expect(nextPinned(true, { top: 500, lastTop: 400, distance: 300 })).toBe(true);
        expect(nextPinned(true, { top: 800, lastTop: 500, distance: 0 })).toBe(true);
    });
    it('releases as soon as the customer scrolls up, and does not re-pin on its own', () => {
        expect(nextPinned(true, { top: 760, lastTop: 800, distance: 40 })).toBe(false);
        expect(nextPinned(false, { top: 760, lastTop: 760, distance: 400 })).toBe(false);
        expect(nextPinned(false, { top: 600, lastTop: 760, distance: 560 })).toBe(false);
    });
    it('re-pins when the customer returns to the bottom', () => {
        expect(nextPinned(false, { top: 1150, lastTop: 900, distance: 10 })).toBe(true);
    });
    it('ignores bounce and layout-shrink jitter at the bottom', () => {
        expect(nextPinned(true, { top: 790, lastTop: 800, distance: 6 })).toBe(true);
    });
});

describe('parseInline', () => {
    it('returns a data tree, not markup', () => {
        expect(parseInline('a **b**')).toEqual([{ t: 'text', v: 'a ' }, { t: 'strong', c: [{ t: 'text', v: 'b' }] }]);
    });
});

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardView } from './Cards';
import { VehicleCard, VehicleCarousel } from './VehicleCard';
import type { Card, Vehicle } from './types';

const render = (card: Card) => renderToStaticMarkup(<CardView card={card} lang="en" apiBaseUrl="http://localhost:3001" />);

describe('credit application card', () => {
    const base: Card = {
        kind: 'credit_application',
        label: 'Secure Credit Application',
        url: '/public/credit-link/abc.def',
        providerName: 'Tekion',
        cta: 'Apply for Financing',
        note: 'Opens securely in a new tab.',
        preview: false,
    };
    it('links only through the signed backend endpoint, in a new tab, without leaking a vendor URL', () => {
        const html = render(base);
        expect(html).toContain('href="http://localhost:3001/api/public/credit-link/abc.def"');
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
        expect(html).toContain('Apply for Financing');
        expect(html).toContain('Tekion');
        expect(html).not.toMatch(/tekioncloud|token=/);
        expect(html).not.toContain('Demo preview');
    });
    it('labels demo previews', () => {
        expect(render({ ...base, preview: true } as Card)).toContain('Demo preview');
    });
});

describe('out-the-door card', () => {
    it('requested quotes never show a total', () => {
        const html = render({
            kind: 'otd_quote',
            id: 'q1',
            vin: 'V',
            vehicleLabel: '2025 Jeep Compass Latitude 4x4',
            status: 'requested',
            paymentMethod: 'CASH',
            lines: [],
            total: null,
            assumptions: [],
            missingInputs: ['tax_rate'],
            preliminary: true,
        });
        expect(html).toContain('Quote requested');
        expect(html).toContain('Cash');
        expect(html).not.toMatch(/Estimated total|\$\d/);
    });
    it('estimates are itemized and labeled preliminary', () => {
        const html = render({
            kind: 'otd_quote',
            id: 'q1',
            vin: 'V',
            vehicleLabel: 'Car',
            status: 'estimate',
            paymentMethod: 'UNDECIDED',
            lines: [
                { label: 'Vehicle price', amount: 30000, kind: 'price' },
                { label: 'Sales tax (6%)', amount: 1800, kind: 'tax' },
            ],
            total: 31800,
            assumptions: ['Registration in IL'],
            missingInputs: [],
            preliminary: true,
        });
        expect(html).toContain('$31,800');
        expect(html).toContain('Preliminary — not a written offer.');
    });
});

describe('payment card', () => {
    it('shows one concise disclosure; full terms are collapsed', () => {
        const html = render({
            kind: 'payment',
            vin: 'V',
            monthly: 732,
            apr: 7.9,
            aprSource: 'ILLUSTRATIVE',
            termMonths: 72,
            downPayment: 0,
            tradeEquity: 0,
            price: 41890,
            includesTaxAndFees: false,
            disclaimer: 'Illustrative estimate only — long legal text',
            policyVersion: 'v1',
        });
        expect(html).toContain('$732');
        expect(html.match(/not a financing offer/gi)?.length).toBe(1);
        expect(html).toContain('aria-expanded="false"');
        expect(html).not.toContain('long legal text'); // inside collapsed details
    });
});

describe('vehicle card + carousel', () => {
    const v: Vehicle = { vin: 'DEMO1', year: 2025, make: 'Jeep', model: 'Wrangler', trim: 'Sport S 4x4', price: 41890, simulated: true, photos: [], condition: 'new', stock: 'DEMO-WR1' };
    const card = (x: Vehicle) => (
        <VehicleCard v={x} lang="en" paymentsEnabled savedEnabled compareEnabled saved={false} inCompare={false} onAsk={() => undefined} onToggleSave={() => undefined} onToggleCompare={() => undefined} />
    );
    it('badges simulated vehicles and uses a neutral placeholder (no stock photo)', () => {
        const html = renderToStaticMarkup(card(v));
        expect(html).toContain('Demo vehicle');
        expect(html).toContain('Photo coming soon');
        expect(html).not.toContain('<img');
        expect(html).toContain('Stock #DEMO-WR1');
    });
    it('renders exactly the vehicles given, with accessible prev/next controls', () => {
        const html = renderToStaticMarkup(
            <VehicleCarousel count={3} lang="en">
                {[v, { ...v, vin: 'D2' }, { ...v, vin: 'D3' }].map((x) => (
                    <div role="listitem" key={x.vin}>
                        {card(x)}
                    </div>
                ))}
            </VehicleCarousel>,
        );
        expect(html.match(/role="listitem"/g)?.length).toBe(3);
        expect(html).toContain('aria-label="Previous vehicle"');
        expect(html).toContain('aria-label="Next vehicle"');
        expect(html).toContain('1 of 3');
    });
    it('a single vehicle has no carousel chrome', () => {
        const html = renderToStaticMarkup(<VehicleCarousel count={1} lang="en">{card(v)}</VehicleCarousel>);
        expect(html).not.toContain('Next vehicle');
    });
});

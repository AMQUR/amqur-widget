import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompareTable } from './CompareTable';

describe('CompareTable', () => {
    it('limits to 3, highlights differing rows, never invents missing data', () => {
        const html = renderToStaticMarkup(
            <CompareTable
                vehicles={[
                    { vin: 'A', year: 2024, make: 'Jeep', model: 'Wrangler', price: 41995, features: ['Heated front seats'] },
                    { vin: 'B', year: 2024, make: 'Jeep', model: 'Wrangler', price: 44500, features: [] },
                    { vin: 'C', year: 2024, make: 'Jeep', model: 'Wrangler', price: 44500 },
                    { vin: 'D', year: 2024, make: 'Jeep', model: 'Wrangler', price: 1 },
                ]}
            />,
        );
        expect((html.match(/<th scope="col">/g) ?? []).length).toBe(4); // label + 3 vehicles
        expect(html).toContain('amq-compare__diff');
        expect(html).toContain('$41,995');
        expect(html).not.toContain('$1<');
        expect(html).toContain('not in listing data'); // unknown features shown as unknown, not "no"
    });
});

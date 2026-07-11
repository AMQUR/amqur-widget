import { describe, expect, it } from 'vitest';
import { t, detectLocale } from '../widget/i18n';
import { CompareTable } from '../widget/CompareTable';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

describe('i18n', () => {
  it('detects spanish', () => {
    expect(detectLocale('es')).toBe('es');
  });

  it('interpolates location welcome', () => {
    expect(t('en', 'welcome', { location: 'Main' })).toContain('Main');
  });
});

describe('CompareTable', () => {
  it('renders verified compare rows', () => {
    const html = renderToStaticMarkup(
      createElement(CompareTable, {
        vehicles: [
          {
            vin: '1C4RJFBG0JC123456',
            year: 2024,
            make: 'Jeep',
            model: 'Wrangler',
            price: 42000,
          },
          {
            vin: '1C4RJFBG0JC654321',
            year: 2023,
            make: 'Jeep',
            model: 'Gladiator',
            price: 39000,
          },
        ],
      }),
    );
    expect(html).toContain('Vehicle comparison');
    expect(html).toContain('Wrangler');
    expect(html).toContain('Gladiator');
  });
});

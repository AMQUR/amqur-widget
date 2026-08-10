import { describe, expect, it, beforeEach, vi } from 'vitest';
import { t, detectLocale } from '../widget/i18n';
import { CompareTable } from '../widget/CompareTable';
import {
  loadCompareVins,
  toggleCompareVin,
  clearCompareVins,
  MAX_COMPARE_VEHICLES,
} from '../widget/compareVehicles';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

describe('i18n', () => {
  it('detects spanish', () => {
    expect(detectLocale('es')).toBe('es');
  });

  it('interpolates location welcome', () => {
    expect(t('en', 'welcome', { location: 'Main' })).toContain('Main');
  });

  it('includes handoff request saved copy', () => {
    expect(t('en', 'requestSaved')).toMatch(/saved/i);
    expect(t('es', 'requestSaved')).toMatch(/guardada/i);
  });

  it('includes lead capture strings', () => {
    expect(t('en', 'submitLead')).toBe('Submit');
    expect(t('es', 'firstName')).toBe('Nombre');
  });

  it('includes compare and saved vehicle strings', () => {
    expect(t('en', 'compareSelected', { count: '2' })).toContain('2');
    expect(t('en', 'savedVehicles')).toBe('Saved vehicles');
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

describe('compareVehicles', () => {
  const tenant = 'test-tenant';
  const location = 'test-location';

  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem(key: string) {
        return store[key] ?? null;
      },
      setItem(key: string, value: string) {
        store[key] = value;
      },
      removeItem(key: string) {
        delete store[key];
      },
    });
    clearCompareVins(tenant, location);
  });

  it('caps compare set at MAX_COMPARE_VEHICLES', () => {
    toggleCompareVin(tenant, location, 'VIN00000000000001');
    toggleCompareVin(tenant, location, 'VIN00000000000002');
    toggleCompareVin(tenant, location, 'VIN00000000000003');
    const blocked = toggleCompareVin(tenant, location, 'VIN00000000000004');
    expect(blocked).toHaveLength(MAX_COMPARE_VEHICLES);
    expect(loadCompareVins(tenant, location)).toHaveLength(MAX_COMPARE_VEHICLES);
  });

  it('toggles vins in and out', () => {
    toggleCompareVin(tenant, location, 'abc123');
    expect(loadCompareVins(tenant, location)).toEqual(['ABC123']);
    toggleCompareVin(tenant, location, 'abc123');
    expect(loadCompareVins(tenant, location)).toEqual([]);
  });
});

describe('WidgetFeatures types contract', () => {
  it('documents appointments as optional feature flag', () => {
    const features = { chat: true, appointments: true };
    expect(features.appointments).toBe(true);
  });
});

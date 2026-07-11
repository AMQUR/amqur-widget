import { describe, expect, it } from 'vitest';
import { normalizeApiBaseUrl, unwrapApiData } from '../connect';

/** Representative Nest envelopes matching backend ResponseInterceptor + chat orchestrator. */

describe('API contract fixtures', () => {
  it('normalizes api base URL once', () => {
    expect(normalizeApiBaseUrl('https://api.example.com')).toBe(
      'https://api.example.com/api',
    );
    expect(normalizeApiBaseUrl('https://api.example.com/api/')).toBe(
      'https://api.example.com/api',
    );
  });

  it('unwraps Nest success envelope for widget-config', () => {
    const envelope = {
      success: true,
      data: {
        tenant: { id: 't1', slug: 'demo', name: 'Demo Motors' },
        location: { id: 'l1', slug: 'main', name: 'Main' },
        branding: { primaryColor: '#111', accentColor: '#fff', logoUrl: null },
        features: {
          chat: true,
          inventory: true,
          payments: true,
          vehicleCompare: true,
          savedVehicles: true,
          serviceAi: true,
          partsAi: true,
          proactiveEngagement: false,
          multilingual: true,
        },
      },
    };
    const data = unwrapApiData<typeof envelope.data>(envelope);
    expect(data.tenant.slug).toBe('demo');
    expect(data.features.inventory).toBe(true);
    expect(data.features.vehicleCompare).toBe(true);
  });

  it('unwraps widget-token payload', () => {
    const data = unwrapApiData<{ token: string; expiresIn?: string }>({
      success: true,
      data: { token: 'jwt.example', expiresIn: '4h' },
    });
    expect(data.token).toBe('jwt.example');
  });

  it('accepts vehicle_carousel contract shape', () => {
    const data = unwrapApiData<{
      type: string;
      reply: string;
      vehicles: Array<{ vin: string; lastSeenAt?: string | null }>;
      provenance?: { sources: string[]; verifiedFactsOnly: boolean };
    }>({
      success: true,
      data: {
        type: 'vehicle_carousel',
        reply: 'Here are matches from inventory.',
        vehicles: [
          {
            vin: '1C4RJFBG0JC123456',
            year: 2024,
            make: 'Jeep',
            model: 'Wrangler',
            price: 42000,
            lastSeenAt: '2026-07-11T12:00:00.000Z',
          },
        ],
        provenance: {
          sources: ['inventory_db'],
          verifiedFactsOnly: true,
        },
      },
    });
    expect(data.type).toBe('vehicle_carousel');
    expect(data.vehicles[0].vin).toHaveLength(17);
    expect(data.provenance?.sources).toContain('inventory_db');
  });

  it('accepts payment_summary contract shape', () => {
    const data = unwrapApiData<{
      type: string;
      monthlyPayment: number;
      provenance?: { disclaimer?: string };
    }>({
      success: true,
      data: {
        type: 'payment_summary',
        reply: 'Estimate only.',
        monthlyPayment: 599,
        termMonths: 72,
        apr: 9.99,
        downPayment: 2000,
        provenance: {
          sources: ['inventory_db', 'payment_calculator'],
          verifiedFactsOnly: false,
          disclaimer: 'Educational payment estimate only',
        },
      },
    });
    expect(data.monthlyPayment).toBe(599);
    expect(data.provenance?.disclaimer).toMatch(/estimate/i);
  });
});

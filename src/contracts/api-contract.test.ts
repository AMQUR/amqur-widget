import { describe, expect, it } from 'vitest';
import {
  normalizeApiBaseUrl,
  unwrapApiData,
  validateBootstrapPayload,
} from '../connect';

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
        // Public contract: no internal database ids — slugs and names only.
        tenant: { slug: 'demo', name: 'Demo Motors' },
        location: { slug: 'main', name: 'Main', timezone: 'America/Chicago' },
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

  it('accepts an id-free bootstrap payload (new public contract)', () => {
    const payload = validateBootstrapPayload({
      tenant: { slug: 'demo', name: 'Demo Motors' },
      location: { slug: 'main', name: 'Main', timezone: 'America/Chicago' },
      branding: { primaryColor: '#111', accentColor: '#fff', logoUrl: null },
      features: { chat: true },
      consentText: 'Internal staging environment for authorized testing only.',
      configVersion: 2,
    });
    expect(payload.tenant.slug).toBe('demo');
    expect(payload.location.slug).toBe('main');
    expect(payload.tenant).not.toHaveProperty('id');
    expect(payload.location).not.toHaveProperty('id');
  });

  it('rejects bootstrap payloads missing tenant or location slug', () => {
    expect(() =>
      validateBootstrapPayload({
        tenant: { name: 'No Slug Motors' },
        location: { slug: 'main', name: 'Main' },
        branding: {},
        features: {},
      }),
    ).toThrow(/missing tenant/);
    expect(() =>
      validateBootstrapPayload({
        tenant: { slug: 'demo', name: 'Demo' },
        location: { name: 'Main' },
        branding: {},
        features: {},
      }),
    ).toThrow(/missing location/);
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

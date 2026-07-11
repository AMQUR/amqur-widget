import { describe, it, expect } from 'vitest';
import { normalizeApiBaseUrl, unwrapApiData } from './connect';

describe('normalizeApiBaseUrl', () => {
  it('appends /api once', () => {
    expect(normalizeApiBaseUrl('https://api.example.com')).toBe(
      'https://api.example.com/api',
    );
    expect(normalizeApiBaseUrl('https://api.example.com/api')).toBe(
      'https://api.example.com/api',
    );
    expect(normalizeApiBaseUrl('https://api.example.com/api/')).toBe(
      'https://api.example.com/api',
    );
  });

  it('collapses /api/api', () => {
    expect(normalizeApiBaseUrl('https://api.example.com/api/api')).toBe(
      'https://api.example.com/api',
    );
  });
});

describe('unwrapApiData', () => {
  it('unwraps Nest envelope', () => {
    expect(unwrapApiData({ success: true, data: { ok: 1 } })).toEqual({
      ok: 1,
    });
  });

  it('passes through raw objects', () => {
    expect(unwrapApiData({ reply: 'hi' })).toEqual({ reply: 'hi' });
  });
});

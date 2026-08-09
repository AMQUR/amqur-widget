const KEY = 'amqur_compare_vins_v1';
const MAX_COMPARE = 3;

export function loadCompareVins(
  tenantSlug: string,
  locationSlug: string,
): string[] {
  try {
    const raw = localStorage.getItem(`${KEY}_${tenantSlug}_${locationSlug}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .filter((v): v is string => typeof v === 'string')
          .slice(0, MAX_COMPARE)
      : [];
  } catch {
    return [];
  }
}

export function toggleCompareVin(
  tenantSlug: string,
  locationSlug: string,
  vin: string,
): string[] {
  const storageKey = `${KEY}_${tenantSlug}_${locationSlug}`;
  const current = loadCompareVins(tenantSlug, locationSlug);
  const upper = vin.toUpperCase();
  const next = current.includes(upper)
    ? current.filter((v) => v !== upper)
    : current.length >= MAX_COMPARE
      ? current
      : [...current, upper];
  localStorage.setItem(storageKey, JSON.stringify(next));
  return next;
}

export function clearCompareVins(
  tenantSlug: string,
  locationSlug: string,
): void {
  localStorage.removeItem(`${KEY}_${tenantSlug}_${locationSlug}`);
}

export const MAX_COMPARE_VEHICLES = MAX_COMPARE;

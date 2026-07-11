const KEY = 'amqur_saved_vins_v1';

export function loadSavedVins(tenantSlug: string, locationSlug: string): string[] {
  try {
    const raw = localStorage.getItem(`${KEY}_${tenantSlug}_${locationSlug}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : [];
  } catch {
    return [];
  }
}

export function toggleSavedVin(
  tenantSlug: string,
  locationSlug: string,
  vin: string,
): string[] {
  const key = `${KEY}_${tenantSlug}_${locationSlug}`;
  const current = loadSavedVins(tenantSlug, locationSlug);
  const upper = vin.toUpperCase();
  const next = current.includes(upper)
    ? current.filter((v) => v !== upper)
    : [...current, upper].slice(0, 50);
  localStorage.setItem(key, JSON.stringify(next));
  return next;
}

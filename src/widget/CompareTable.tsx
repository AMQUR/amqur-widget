import type { CSSProperties } from 'react';

type CompareVehicle = {
  vin: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  mileage?: number | null;
  price?: number | null;
  drivetrain?: string | null;
  photos?: string[];
};

const cell: CSSProperties = {
  fontSize: '12px',
  padding: '6px 4px',
  borderBottom: '1px solid rgba(0,0,0,0.06)',
};

export function CompareTable({ vehicles }: { vehicles: CompareVehicle[] }) {
  const cols = vehicles.slice(0, 4);
  if (cols.length < 2) return null;

  const rows: Array<{ label: string; value: (v: CompareVehicle) => string }> = [
    {
      label: 'Vehicle',
      value: (v) => [v.year, v.make, v.model].filter(Boolean).join(' '),
    },
    { label: 'Trim', value: (v) => v.trim ?? '—' },
    {
      label: 'Price',
      value: (v) =>
        v.price != null ? `$${v.price.toLocaleString()}` : 'Ask dealership',
    },
    {
      label: 'Mileage',
      value: (v) =>
        v.mileage != null ? v.mileage.toLocaleString() : '—',
    },
    { label: 'Drivetrain', value: (v) => v.drivetrain ?? '—' },
    { label: 'VIN', value: (v) => v.vin },
  ];

  return (
    <div
      role="table"
      aria-label="Vehicle comparison"
      style={{
        overflowX: 'auto',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.9)',
        padding: '8px',
      }}
    >
      <div style={{ fontSize: '11px', opacity: 0.7, marginBottom: 6 }}>
        Comparison uses verified inventory fields only.
      </div>
      {rows.map((row) => (
        <div
          key={row.label}
          role="row"
          style={{ display: 'grid', gridTemplateColumns: `90px repeat(${cols.length}, minmax(100px, 1fr))` }}
        >
          <div role="rowheader" style={{ ...cell, fontWeight: 600 }}>
            {row.label}
          </div>
          {cols.map((v) => (
            <div key={v.vin + row.label} role="cell" style={cell}>
              {row.value(v)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

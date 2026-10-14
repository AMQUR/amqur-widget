import type { Vehicle } from './concierge/types';

type Row = { label: string; value: (v: Vehicle) => string };

const ROWS: Row[] = [
    { label: 'Price', value: (v) => (v.price != null ? `$${v.price.toLocaleString('en-US')}` : '—') },
    { label: 'Est. payment', value: (v) => (v.estimatedPayment != null ? `$${Math.round(v.estimatedPayment).toLocaleString('en-US')}/mo` : '—') },
    { label: 'Trim', value: (v) => v.trim ?? '—' },
    { label: 'Miles', value: (v) => (v.mileage != null ? v.mileage.toLocaleString('en-US') : '—') },
    { label: 'Drivetrain', value: (v) => v.drivetrain ?? '—' },
    { label: 'Fuel', value: (v) => v.fuelType ?? '—' },
    { label: 'Color', value: (v) => v.color ?? '—' },
    { label: 'Condition', value: (v) => v.condition ?? '—' },
];

/**
 * Up to three vehicles. Rows where vehicles differ are emphasized; identical rows collapse
 * to the bottom. Missing data shows "—" — never inferred.
 */
export function CompareTable({ vehicles }: { vehicles: Vehicle[] }) {
    const cols = vehicles.slice(0, 3);
    if (cols.length < 2) return null;
    const rows = ROWS.map((r) => {
        const vals = cols.map(r.value);
        const known = vals.filter((x) => x !== '—');
        return { ...r, vals, differs: new Set(known).size > 1 };
    }).sort((a, b) => Number(b.differs) - Number(a.differs));
    const allFeatures = [...new Set(cols.flatMap((v) => v.features ?? []))].slice(0, 12);
    return (
        <div className="amq-compare" role="region" aria-label="Vehicle comparison">
            <table>
                <thead>
                    <tr>
                        <th scope="col"><span className="amq-sr">Attribute</span></th>
                        {cols.map((v) => (
                            <th key={v.vin} scope="col">
                                {[v.year, v.make, v.model].filter(Boolean).join(' ')}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.label} className={r.differs ? 'amq-compare__diff' : undefined}>
                            <th scope="row">{r.label}</th>
                            {r.vals.map((val, i) => (
                                <td key={cols[i].vin}>{val}</td>
                            ))}
                        </tr>
                    ))}
                    {allFeatures.map((f) => {
                        const has = cols.map((v) => (v.features?.length ? (v.features.some((x) => x.toLowerCase() === f.toLowerCase()) ? '✓' : '—') : '?'));
                        return (
                            <tr key={f} className={new Set(has).size > 1 ? 'amq-compare__diff' : undefined}>
                                <th scope="row">{f}</th>
                                {has.map((h, i) => (
                                    <td key={cols[i].vin} aria-label={h === '✓' ? 'listed' : h === '?' ? 'not in listing data' : 'not listed'}>
                                        {h}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

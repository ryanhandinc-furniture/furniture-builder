import { useState } from 'react';
import type { UnitType } from '../types';
import { api } from '../api/client';

interface Row {
  unitNumber: string;
  floor: number;
  unitType: UnitType;
  squareFootage: number;
}

const EMPTY: Row = { unitNumber: '', floor: 1, unitType: '1BR', squareFootage: 500 };
const UNIT_TYPES: UnitType[] = ['studio', '1BR', '2BR', '3BR', '4BR', 'other'];

/**
 * Fallback UI when AI extraction fails. Lets a user type in the unit matrix
 * manually, then POSTs to /api/plans/:id/units. Once saved, the parent plan
 * is marked `complete` by the backend and the dashboard re-renders normally.
 */
export function ManualMatrixEntry({
  planId,
  onSaved,
}: {
  planId: string;
  onSaved: () => void | Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY }]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const updateRow = (i: number, patch: Partial<Row>) => {
    setRows((curr) => curr.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const valid = rows.every(
    (r) => r.unitNumber.trim().length > 0 && r.floor >= 0 && r.squareFootage > 0,
  );

  return (
    <div>
      <table className="matrix-manual">
        <thead>
          <tr>
            <th>Unit #</th>
            <th>Floor</th>
            <th>Type</th>
            <th>Sq Ft</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <input
                  value={r.unitNumber}
                  onChange={(e) => updateRow(i, { unitNumber: e.target.value })}
                  placeholder="101"
                />
              </td>
              <td>
                <input
                  type="number"
                  value={r.floor}
                  onChange={(e) => updateRow(i, { floor: Number(e.target.value) })}
                />
              </td>
              <td>
                <select
                  value={r.unitType}
                  onChange={(e) => updateRow(i, { unitType: e.target.value as UnitType })}
                >
                  {UNIT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  type="number"
                  value={r.squareFootage}
                  onChange={(e) =>
                    updateRow(i, { squareFootage: Number(e.target.value) })
                  }
                />
              </td>
              <td style={{ width: 40 }}>
                <button
                  className="btn secondary"
                  style={{ padding: '2px 8px' }}
                  onClick={() => setRows((curr) => curr.filter((_, idx) => idx !== i))}
                  disabled={rows.length === 1}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          className="btn secondary"
          onClick={() => setRows((curr) => [...curr, { ...EMPTY }])}
        >
          + Add row
        </button>
        <button
          className="btn"
          disabled={!valid || saving}
          onClick={async () => {
            setSaving(true);
            setErr(null);
            try {
              await api.manualUnits(planId, rows);
              await onSaved();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving…' : 'Save unit matrix'}
        </button>
        {err && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</span>}
      </div>
    </div>
  );
}

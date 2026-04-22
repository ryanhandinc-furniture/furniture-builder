import { useEffect, useMemo, useState } from 'react';
import type { Plan, Unit, UnitType } from '../types';
import { api } from '../api/client';
import { ManualMatrixEntry } from './ManualMatrixEntry';

const UNIT_TYPES: UnitType[] = ['studio', '1BR', '2BR', '3BR', '4BR', 'other'];

export function UnitDashboard({
  planId,
  onOpenUnit,
  onReturnToUpload,
}: {
  planId: string;
  onOpenUnit: (unit: Unit, plan: Plan) => void;
  onReturnToUpload: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [floorFilter, setFloorFilter] = useState<'all' | number>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | UnitType>('all');
  const [minSqft, setMinSqft] = useState<number>(0);

  const refresh = async () => {
    try {
      const { plan, units } = await api.getPlan(planId);
      setPlan(plan);
      setUnits(units);
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  // Poll while the plan is still being processed.
  useEffect(() => {
    if (!plan) return;
    if (plan.status === 'complete' || plan.status === 'failed') return;
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.status]);

  const floors = useMemo(() => {
    const set = new Set<number>();
    units.forEach((u) => set.add(u.floor));
    return [...set].sort((a, b) => a - b);
  }, [units]);

  const filtered = useMemo(() => {
    return units.filter((u) => {
      if (floorFilter !== 'all' && u.floor !== floorFilter) return false;
      if (typeFilter !== 'all' && u.unitType !== typeFilter) return false;
      if (u.squareFootage < minSqft) return false;
      return true;
    });
  }, [units, floorFilter, typeFilter, minSqft]);

  if (loadError) {
    return (
      <div className="card">
        <h2>Could not load plan</h2>
        <p style={{ color: 'var(--danger)' }}>{loadError}</p>
        <button className="btn secondary" onClick={onReturnToUpload}>
          Upload a new plan
        </button>
      </div>
    );
  }

  if (!plan) {
    return <div className="empty">Loading plan…</div>;
  }

  return (
    <div>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ marginBottom: 4 }}>{plan.filename}</h2>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            <span className={`status-badge status-${plan.status}`}>{plan.status}</span>
            {' · '}
            {plan.pageCount} page{plan.pageCount === 1 ? '' : 's'} · uploaded{' '}
            {new Date(plan.uploadedAt).toLocaleString()}
          </div>
        </div>
        <button className="btn secondary" onClick={onReturnToUpload}>
          Upload another
        </button>
      </header>

      {plan.status === 'processing' || plan.status === 'pending' ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>AI analysis in progress…</h3>
          <p style={{ color: 'var(--muted)' }}>
            We're running the plan through a vision model to extract the unit
            matrix. This typically takes 10-40 seconds per page.
          </p>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: '60%',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          </div>
        </div>
      ) : plan.status === 'failed' ? (
        <div className="card">
          <h3 style={{ marginTop: 0, color: 'var(--danger)' }}>
            AI extraction didn't produce a unit matrix.
          </h3>
          <p style={{ color: 'var(--muted)' }}>
            {plan.errorMessage ??
              'The model may not have found unit layouts on this plan.'}{' '}
            Enter units manually below to continue.
          </p>
          <ManualMatrixEntry
            planId={plan.id}
            onSaved={async () => {
              await refresh();
            }}
          />
        </div>
      ) : (
        <>
          <div className="filters">
            <label>
              Floor{' '}
              <select
                value={floorFilter}
                onChange={(e) =>
                  setFloorFilter(
                    e.target.value === 'all' ? 'all' : Number(e.target.value),
                  )
                }
              >
                <option value="all">All</option>
                {floors.map((f) => (
                  <option key={f} value={f}>
                    Floor {f}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type{' '}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as UnitType | 'all')}
              >
                <option value="all">All</option>
                {UNIT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Min sqft{' '}
              <input
                type="number"
                min={0}
                step={50}
                value={minSqft}
                onChange={(e) => setMinSqft(Number(e.target.value) || 0)}
                style={{ width: 90 }}
              />
            </label>
            <span
              style={{
                marginLeft: 'auto',
                color: 'var(--muted)',
                fontSize: 12,
                alignSelf: 'center',
              }}
            >
              {filtered.length} / {units.length} units
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="empty">No units match the current filters.</div>
          ) : (
            <div className="unit-grid">
              {filtered.map((u) => (
                <button
                  key={u.id}
                  className="unit-card"
                  onClick={() => onOpenUnit(u, plan)}
                >
                  <div className="unit-no">Unit {u.unitNumber}</div>
                  <div className="unit-meta">
                    Floor {u.floor} · {u.squareFootage.toLocaleString()} sqft
                  </div>
                  <div className="unit-type-pill">{u.unitType}</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

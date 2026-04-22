import { useEffect, useState } from 'react';
import type {
  FurnitureCatalogItem,
  FurniturePlacement,
  Plan,
  Unit,
} from '../types';
import { api } from '../api/client';
import { FurnitureCanvas } from './FurnitureCanvas';
import { FurnitureSidebar } from './FurnitureSidebar';

export function UnitDetail({
  unit,
  plan,
  onBack,
}: {
  unit: Unit;
  plan: Plan;
  onBack: () => void;
}) {
  const [catalog, setCatalog] = useState<FurnitureCatalogItem[]>([]);
  const [placements, setPlacements] = useState<FurniturePlacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [{ items }, { placements }] = await Promise.all([
          api.catalog(),
          api.getUnit(unit.id),
        ]);
        setCatalog(items);
        setPlacements(placements);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [unit.id]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div>
          <button className="btn secondary" onClick={onBack}>
            ← Back to {plan.filename}
          </button>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 600 }}>Unit {unit.unitNumber}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Floor {unit.floor} · {unit.unitType} ·{' '}
            {unit.squareFootage.toLocaleString()} sqft
          </div>
        </div>
      </div>

      {err ? (
        <div className="card">
          <p style={{ color: 'var(--danger)' }}>Failed to load unit: {err}</p>
        </div>
      ) : loading ? (
        <div className="empty">Loading…</div>
      ) : (
        <div className="detail-layout">
          <aside className="detail-sidebar">
            <FurnitureSidebar items={catalog} />
          </aside>
          <div className="canvas-panel">
            <FurnitureCanvas
              unit={unit}
              catalog={catalog}
              placements={placements}
              onPlacementsChange={setPlacements}
            />
          </div>
        </div>
      )}
    </div>
  );
}

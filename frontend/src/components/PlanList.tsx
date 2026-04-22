import type { Plan } from '../types';

export function PlanList({
  plans,
  activePlanId,
  onSelect,
}: {
  plans: Plan[];
  activePlanId?: string;
  onSelect: (p: Plan) => void;
}) {
  if (plans.length === 0) {
    return <div style={{ color: 'var(--muted)', fontSize: 12 }}>No plans yet.</div>;
  }
  return (
    <div>
      {plans.map((p) => (
        <button
          key={p.id}
          className={`plan-item ${activePlanId === p.id ? 'active' : ''}`}
          onClick={() => onSelect(p)}
          title={p.filename}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.filename}
            </span>
          </div>
          <div className="meta">
            <span className={`status-badge status-${p.status}`}>{p.status}</span>
            {' · '}
            {new Date(p.uploadedAt).toLocaleDateString()}
          </div>
        </button>
      ))}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import type { Plan, Unit } from './types';
import { api } from './api/client';
import { UploadView } from './components/UploadView';
import { PlanList } from './components/PlanList';
import { UnitDashboard } from './components/UnitDashboard';
import { UnitDetail } from './components/UnitDetail';

type View =
  | { kind: 'upload' }
  | { kind: 'plan'; planId: string }
  | { kind: 'unit'; unit: Unit; plan: Plan };

export function App() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [view, setView] = useState<View>({ kind: 'upload' });

  const refreshPlans = useCallback(async () => {
    try {
      const { plans } = await api.listPlans();
      setPlans(plans);
    } catch (err) {
      console.error('Failed to load plans', err);
    }
  }, []);

  useEffect(() => {
    refreshPlans();
  }, [refreshPlans]);

  // Keep plans list fresh while anything is processing.
  useEffect(() => {
    const hasPending = plans.some(
      (p) => p.status === 'pending' || p.status === 'processing',
    );
    if (!hasPending) return;
    const timer = setInterval(refreshPlans, 2500);
    return () => clearInterval(timer);
  }, [plans, refreshPlans]);

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Furniture Builder</h1>
        <button
          className="btn"
          style={{ width: '100%' }}
          onClick={() => setView({ kind: 'upload' })}
        >
          + New Upload
        </button>
        <div className="nav-section">
          <div className="label">Your Plans</div>
          <PlanList
            plans={plans}
            activePlanId={view.kind === 'plan' ? view.planId : undefined}
            onSelect={(plan) => setView({ kind: 'plan', planId: plan.id })}
          />
        </div>
      </aside>

      <main className="main">
        {view.kind === 'upload' && (
          <UploadView
            onUploaded={async (plan) => {
              await refreshPlans();
              setView({ kind: 'plan', planId: plan.id });
            }}
          />
        )}

        {view.kind === 'plan' && (
          <UnitDashboard
            planId={view.planId}
            onOpenUnit={(unit, plan) => setView({ kind: 'unit', unit, plan })}
            onReturnToUpload={() => setView({ kind: 'upload' })}
          />
        )}

        {view.kind === 'unit' && (
          <UnitDetail
            unit={view.unit}
            plan={view.plan}
            onBack={() => setView({ kind: 'plan', planId: view.plan.id })}
          />
        )}
      </main>
    </div>
  );
}

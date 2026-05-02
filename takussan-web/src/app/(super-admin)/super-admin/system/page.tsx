import { SystemMetricsGrid } from '@/components/admin/super/SystemMetricsGrid';

export const metadata = {
  title: 'Système — Console Takussan',
};

export default function SuperAdminSystemPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">Système</h1>
        <p className="mt-1 text-sm text-stone-600">
          Mesures plateforme et paramètres globaux.
        </p>
      </header>

      <SystemMetricsGrid />

      <section className="rounded-xl bg-white p-6 ring-1 ring-stone-200">
        <h2 className="text-base font-semibold text-stone-900">Paramètres globaux</h2>
        <p className="mt-2 text-sm text-stone-500">
          Intégrations tierces, mode maintenance et feature flags arriveront avec les
          tickets P3 dédiés. Cette section reste un emplacement neutre — pas de
          stub interactif tant que le backend ne livre pas l&apos;endpoint correspondant.
        </p>
      </section>
    </div>
  );
}

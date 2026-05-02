import { SystemMetricsGrid } from '@/components/admin/super/SystemMetricsGrid';

export const metadata = {
  title: 'Console Takussan',
};

export default function SuperAdminDashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">Console Takussan</h1>
        <p className="mt-1 text-sm text-stone-600">
          Vue plateforme — agences, utilisateurs, modération et revenu.
        </p>
      </header>
      <SystemMetricsGrid />
    </div>
  );
}

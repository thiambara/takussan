import { SystemMetricsGrid } from '@/components/admin/super/SystemMetricsGrid';

export const metadata = {
  title: 'Console Takussan',
};

export default function SuperAdminDashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Console Takussan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vue plateforme — agences, utilisateurs, modération et revenu.
        </p>
      </header>
      <SystemMetricsGrid />
    </div>
  );
}

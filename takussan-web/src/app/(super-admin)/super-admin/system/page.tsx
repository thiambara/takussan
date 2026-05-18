import Link from 'next/link';
import { SystemMetricsGrid } from '@/components/admin/super/SystemMetricsGrid';
import { buttonVariants } from '@/components/ui/button';

export const metadata = {
  title: 'Système — Console Takussan',
};

export default function SuperAdminSystemPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Système</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mesures plateforme et paramètres globaux.
        </p>
      </header>

      <SystemMetricsGrid />

      <section className="rounded-xl bg-card p-6 ring-1 ring-border">
        <h2 className="text-base font-semibold text-foreground">Paramètres globaux</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Les devises, formats, frais et limites techniques se règlent dans la page
          paramètres dédiée. Intégrations tierces, mode maintenance et feature flags
          arriveront avec les tickets dédiés.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/super-admin/settings" className={buttonVariants()}>
            Ouvrir les paramètres
          </Link>
          <Link
            href="/super-admin/system/maintenance"
            className={buttonVariants({ variant: 'outline' })}
          >
            Mode maintenance
          </Link>
          <Link
            href="/super-admin/system/health"
            className={buttonVariants({ variant: 'outline' })}
          >
            Healthcheck
          </Link>
          <Link
            href="/super-admin/system/scheduler"
            className={buttonVariants({ variant: 'outline' })}
          >
            Scheduler
          </Link>
        </div>
      </section>
    </div>
  );
}

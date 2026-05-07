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
        <h1 className="text-2xl font-bold text-stone-900">Système</h1>
        <p className="mt-1 text-sm text-stone-600">
          Mesures plateforme et paramètres globaux.
        </p>
      </header>

      <SystemMetricsGrid />

      <section className="rounded-xl bg-white p-6 ring-1 ring-stone-200">
        <h2 className="text-base font-semibold text-stone-900">Paramètres globaux</h2>
        <p className="mt-2 text-sm text-stone-500">
          Les devises, formats, frais et limites techniques se règlent dans la page
          paramètres dédiée. Intégrations tierces, mode maintenance et feature flags
          arriveront avec les tickets dédiés.
        </p>
        <Link href="/super-admin/settings" className={buttonVariants({ className: 'mt-4' })}>
          Ouvrir les paramètres
        </Link>
        <Link href="/super-admin/system/maintenance" className={buttonVariants({ variant: 'outline', className: 'ml-2 mt-4' })}>
          Mode maintenance
        </Link>
      </section>
    </div>
  );
}

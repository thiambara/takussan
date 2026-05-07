import { AdminPlansClient } from '@/components/billing/AdminPlansClient';

export default function Page() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Plans plateforme</h1>
        <p className="mt-1 text-sm text-muted-foreground">Catalogue SaaS, commissions et quotas agence.</p>
      </header>
      <AdminPlansClient />
    </div>
  );
}

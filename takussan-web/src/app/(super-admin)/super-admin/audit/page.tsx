import { CrossTenantAuditTable } from '@/components/admin/super/CrossTenantAuditTable';

export const metadata = {
  title: 'Audit cross-tenant — Console Takussan',
};

export default function SuperAdminAuditPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Audit cross-tenant</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Toutes les actions sensibles enregistrées par le journal d&apos;activité plateforme.
        </p>
      </header>
      <CrossTenantAuditTable />
    </div>
  );
}

'use client';

import { useMyProfiles } from '@/hooks/useProfiles';
import { AdminFinancesTabs } from '@/components/admin/finances/AdminFinancesTabs';
import { FinanceKpis } from '@/components/admin/finances/FinanceKpis';
import { useTranslations } from 'next-intl';

interface AdminFinancesClientProps {
  /**
   * `true` when the actor has at least one of the finance read perms
   * (`payments.view_in_agency`, `invoices.view_in_agency`,
   * `payouts.view_in_agency`). Resolved server-side from the user's role
   * (admin / super_admin / agency_admin) and forwarded here so the
   * client can render the degraded state without re-fetching `auth/me`.
   */
  readonly canViewFinances: boolean;
  /**
   * `true` when the actor can write — issue invoices, launch payouts.
   * Currently aligned with `canViewFinances` (any agency_admin / admin).
   */
  readonly canEmitFinances: boolean;
}

export function AdminFinancesClient({
  canViewFinances,
  canEmitFinances,
}: AdminFinancesClientProps) {
  const t = useTranslations('admin.finances');
  const profilesQuery = useMyProfiles();
  const activeProfileId = profilesQuery.data?.meta.active_profile_id ?? null;

  // AC8 — après un changement de profil, les lectures des finances suivent le nouvel espace :
  // `useSwitchActiveProfile` oublie tout le cache hors des profils quand le serveur le confirme
  // (TCK-2091, P197.05). Plus rien à invalider ici.

  if (!canViewFinances) {
    return (
      <div
        data-testid="finances-degraded"
        role="alert"
        className="rounded-2xl border border-border bg-card p-8 text-center"
      >
        <p className="text-sm font-semibold text-foreground">{t('denied.title')}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('denied.body', {
            capabilities:
              'payments.view_in_agency, invoices.view_in_agency, payouts.view_in_agency',
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FinanceKpis activeProfileId={activeProfileId} />
      <AdminFinancesTabs canEmit={canEmitFinances} />
    </div>
  );
}

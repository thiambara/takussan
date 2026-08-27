'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
  /**
   * Taux de commission de l'AGENCE (`agencies.commission_rate`, en pourcentage), résolu en SSR
   * et transmis tel quel à `AdminFinancesTabs` puis au dialogue de reversement.
   *
   * TCK-370 — `AdminFinancesTabs` acceptait déjà `defaultCommissionRate` et personne ne le lui
   * passait : ce composant ne portait même pas la prop. Le curseur du dialogue démarrait donc
   * toujours à `0`, jamais au taux de l'agence.
   */
  readonly defaultCommissionRate?: number;
}

export function AdminFinancesClient({
  canViewFinances,
  canEmitFinances,
  defaultCommissionRate,
}: AdminFinancesClientProps) {
  const t = useTranslations('admin.finances');
  const profilesQuery = useMyProfiles();
  const queryClient = useQueryClient();
  const activeProfileId = profilesQuery.data?.meta.active_profile_id ?? null;

  // AC8: when the user switches profile via the topbar (TCK-143), the
  // backend rotates `team_id` and the existing cached pages now belong to
  // the previous agency. `useSwitchActiveProfile` only invalidates
  // `['auth', 'me']` and `['me', 'profiles']` (it's the lowest-common
  // change for app-wide consumers); we lift the page-local cache here so
  // every finance query refetches without a full reload.
  const lastProfileIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (lastProfileIdRef.current === undefined) {
      lastProfileIdRef.current = activeProfileId;
      return;
    }
    if (lastProfileIdRef.current !== activeProfileId) {
      lastProfileIdRef.current = activeProfileId;
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-finances'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-agency'] });
    }
  }, [activeProfileId, queryClient]);

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
      <AdminFinancesTabs
        canEmit={canEmitFinances}
        defaultCommissionRate={defaultCommissionRate}
      />
    </div>
  );
}

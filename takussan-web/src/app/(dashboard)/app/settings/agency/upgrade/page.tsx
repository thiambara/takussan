import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { getToken } from '@/lib/session';
import { fetchAgency } from '@/lib/queries/agencies';
import { fetchAgencyUpgradeRequests } from '@/lib/queries/agency-upgrade';
import { UpgradeRequestForm } from '@/components/agency/UpgradeRequestForm';
import { UpgradeRequestStatus } from '@/components/agency/UpgradeRequestStatus';

export const metadata: Metadata = { title: 'Passer en pro' };
export const dynamic = 'force-dynamic';

/**
 * TCK-267 — agency upgrade page (`individual → standard`).
 *
 * Visibility:
 *  - Reachable only by the active agency's `agency_admin` (or super_admin).
 *  - When the agency is already `standard`, we render a "no-op" success
 *    panel rather than redirecting — links from the dashboard banner can
 *    still land here without an error.
 *  - When `individual`: shows the active pending request status (if any)
 *    OR the legal submission form.
 *
 * The backend re-asserts every gate via {@see App\Policies\AgencyUpgradeRequestPolicy}.
 */
export default async function Page() {
  const user = await getMeAction();
  const token = await getToken();
  if (!token) redirect('/auth/login?redirect=/app/settings/agency/upgrade');

  const isAdmin =
    user.roles.includes('agency_admin') || user.roles.includes('super_admin');
  if (!isAdmin) redirect('/app');

  const agencyId = user.agency_id;
  if (!agencyId) redirect('/app');

  const [agency, listing] = await Promise.all([
    fetchAgency(token, agencyId),
    fetchAgencyUpgradeRequests(token, agencyId),
  ]);

  const t = await getTranslations('agency.upgrade.page');

  // Already standard — surface a calm confirmation message instead of
  // redirecting (the link still works from notifications / banners).
  if (agency.kind === 'standard') {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t('eyebrow')}
          </p>
          <h1 className="font-display text-3xl tracking-tight text-foreground">
            {t('already_standard.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('already_standard.body')}
          </p>
        </header>
      </main>
    );
  }

  const pending = listing.data.find((r) => r.status === 'pending') ?? null;
  // Otherwise show the latest historical request (most recent first —
  // the API already sorts by `-submitted_at`).
  const latest = pending ?? listing.data[0] ?? null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t('eyebrow')}
        </p>
        <h1 className="font-display text-3xl tracking-tight text-foreground">
          {t('title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <section
        aria-label={t('benefits.aria_label')}
        className="rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 className="text-base font-semibold text-foreground">
          {t('benefits.title')}
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>• {t('benefits.items.team')}</li>
          <li>• {t('benefits.items.multi_admin')}</li>
          <li>• {t('benefits.items.custom_roles')}</li>
        </ul>
        <p className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">
          {t('benefits.sla')}
        </p>
      </section>

      {latest ? (
        <UpgradeRequestStatus agencyId={agencyId} request={latest} />
      ) : null}

      {/* Form is hidden while a pending request is in flight — the user
          must revoke the current one first (also enforced server-side
          with a 422). */}
      {!pending ? <UpgradeRequestForm agencyId={agencyId} /> : null}
    </main>
  );
}

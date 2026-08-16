import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Building2 } from 'lucide-react';

import { getMeAction } from '@/app/actions/auth';
import { fetchAgencyAction } from '@/app/actions/admin-agency';
import { isAdmin } from '@/lib/roles';
import { AgencyConfigForm } from '@/components/admin-agency/AgencyConfigForm';
import { EmptyState, ErrorState } from '@/components/feedback';

/**
 * Admin — agency configuration page (TCK-064).
 *
 * Loads the current user's agency via SSR so the form is pre-filled with
 * no flash of empty inputs. Users without an attached agency are bounced
 * to the admin root (the layout already gates by admin-level role).
 */

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) {
    redirect('/admin');
  }
  const t = await getTranslations('agency.config');

  if (!user.agency_id) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl font-bold text-foreground">Configuration de l&apos;agence</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aucune agence n&apos;est rattachée à votre compte.
          </p>
        </header>
        <EmptyState
          icon={<Building2 className="size-8" aria-hidden="true" />}
          title={t('no_agency_title')}
          description={t('no_agency_description')}
        />
      </div>
    );
  }

  const result = await fetchAgencyAction(user.agency_id);
  if (!result.ok || !result.data) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl font-bold text-foreground">Configuration de l&apos;agence</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Impossible de charger les informations de l&apos;agence.
          </p>
        </header>
        {/* Pas d'`onRetry` : server component, aucun gestionnaire d'événement possible ici. */}
        <ErrorState message={result.ok ? t('not_found') : result.message} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Configuration de l&apos;agence</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Identité, contact, logo et paramètres métier.
        </p>
      </header>
      <AgencyConfigForm agency={result.data} />
    </div>
  );
}

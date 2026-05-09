import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { fetchAgencyAction } from '@/app/actions/admin-agency';
import { isAdmin } from '@/lib/roles';
import { AgencyConfigForm } from '@/components/admin-agency/AgencyConfigForm';

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
  if (!user.agency_id) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl font-bold text-foreground">Configuration de l&apos;agence</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aucune agence n&apos;est rattachée à votre compte.
          </p>
        </header>
        <div className="rounded-xl border border-dashed border-input bg-card p-8 text-sm text-muted-foreground">
          Contactez un super-administrateur pour être rattaché à une agence avant de
          configurer ses paramètres.
        </div>
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
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          {result.ok ? 'Agence introuvable.' : result.message}
        </div>
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

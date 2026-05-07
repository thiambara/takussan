import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { AgencyKycClient } from '@/components/kyc/AgencyKycClient';

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
          <h1 className="font-display text-2xl font-bold text-foreground">Dossier KYC</h1>
          <p className="mt-1 text-sm text-muted-foreground">Aucune agence n&apos;est rattachée à votre compte.</p>
        </header>
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-sm text-muted-foreground">
          Contactez un super-administrateur pour être rattaché à une agence.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Dossier KYC</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pièces administratives et statut de vérification.</p>
      </header>
      <AgencyKycClient agencyId={user.agency_id} />
    </div>
  );
}

import { getMeAction } from '@/app/actions/auth';
import { capacitesDuProfilActif, garderPageAdmin } from '@/lib/access/pages-admin-server';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { getToken } from '@/lib/session';
import { origineSite } from '@/lib/config-publique';
import { peutEcrireLaVitrine } from '@/lib/vitrine-agence';
import { CadreDeLaFiche } from '@/components/admin-agency/fiche/CadreDeLaFiche';
import { VerificationDeLAgence } from '@/components/kyc/VerificationDeLAgence';
import { PageHeader } from '@/components/console';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.pages.verification');
  return { title: t('title') };
}

export const dynamic = 'force-dynamic';

/**
 * TCK-2671 — « Vérification de l'agence » (plus « Dossier KYC ») : un état, une phrase, une action.
 * Les numéros RCCM et NINEA des mentions légales (source unique, ADR-0104) préremplissent ceux des
 * pièces ; une agence illisible ne bloque pas la vérification, elle ne préremplit rien — et la page
 * perd alors le cadre de la fiche (tête, jauge, navigation), qui se lit de l'agence.
 */
export default async function Page() {
  await garderPageAdmin('/app/agency/kyc');
  const t = await getTranslations('admin.pages.kyc');
  const tVerification = await getTranslations('kyc.verification');
  const user = await getMeAction();

  if (!user.agency_id) {
    return (
      <div className="space-y-6">
        <PageHeader title={tVerification('titre')} description={t('noAgency')} />
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-sm text-muted-foreground">{t('contactAdmin')}</div>
      </div>
    );
  }

  const token = await getToken();
  const agence = token ? await resolveAgencyOrNull(token, user.agency_id, 'app/agency/kyc (mentions)') : null;

  const verification = <VerificationDeLAgence agencyId={user.agency_id} numeros={{ rccm: agence?.rccm ?? null, ninea: agence?.ninea ?? null }} />;

  if (!agence) {
    return (
      <div className="space-y-6">
        <PageHeader title={tVerification('titre')} description={tVerification('texte')} />
        {verification}
      </div>
    );
  }

  // Une section de la fiche de l'agence : son cadre (maquette `app-identite-agence`, écran 5).
  return (
    <CadreDeLaFiche
      agency={agence}
      vitrine={peutEcrireLaVitrine(await capacitesDuProfilActif(), agence, user.id)}
      origineSite={origineSite()}
      section="verification"
      titre={tVerification('titre')}
      texte={tVerification('texte')}
    >
      {verification}
    </CadreDeLaFiche>
  );
}

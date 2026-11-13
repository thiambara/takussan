import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { fetchAgencyAction } from '@/app/actions/admin-agency';
import { CeMois } from '@/components/accueil/CeMois';
import { SocleDeLAccueil } from '@/components/accueil/SocleDeLAccueil';
import { BrandingBanner } from '@/components/agency/BrandingBanner';
import { DashboardEmpty } from '@/components/dashboard/DashboardEmpty';
import { MaJournee } from '@/components/journee/MaJournee';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { TenantOnboardingChecklistWidget } from '@/components/tenant/TenantOnboardingChecklistWidget';
import { WizardDraftsBanner } from '@/components/wizard/WizardDraftsBanner';
import { chiffresDuMois, rapportDuMois } from '@/lib/accueil/chiffres-du-mois';
import { prenomDe } from '@/lib/identite';
import { jourEnClair } from '@/lib/journee/jour-en-clair';
import { jourADakar } from '@/lib/journee/journee';
import { accueilNommeAujourdhui } from '@/lib/navigation/accueil-nomme';
import { profilLieDeLaCoque, resoudrePersona, typeDuProfilActif } from '@/lib/navigation/personas';
import { aDesChiffres, fetchDashboardMe, type DashboardMePayload } from '@/lib/queries/dashboard-me';
import { fetchKpisActifs } from '@/lib/queries/kpis';
import { isAgencyAdmin, isSuperAdmin, isTenant } from '@/lib/roles';
import { getActiveProfileId } from '@/lib/session';
import type { AgencyKind } from '@/types/agency';

/** TCK-2622 — « Accueil — Takussan » ; « Aujourd'hui — Takussan » chez l'agent (TCK-2596, TCK-2618). */
export async function generateMetadata(): Promise<Metadata> {
  // Un traducteur nommé `t`, ouvert sur l'espace du titre : la forme que lit la garde des titres
  // d'onglet (titres-onglets.test.ts, TCK-382 / AC4).
  const t = await getTranslations('dashboard.pages.home');
  const tAccueil = await getTranslations('accueil');
  const user = await getMeAction();
  const typeProfilActif = typeDuProfilActif(profilLieDeLaCoque(await getActiveProfileId(), user));
  return { title: accueilNommeAujourdhui({ roles: user.roles, typeProfilActif }) ? tAccueil('metaAujourdhui') : t('metaTitle') };
}

/**
 * La lecture de `/dashboard/me` : `null` sans chiffres (404 d'une API ancienne), `'echec'` sur toute
 * autre panne. TCK-2622 — une panne n'éteint plus la page : « Ce mois » dit son erreur, le reste rend.
 */
async function lireLeTableau(): Promise<{ data: DashboardMePayload } | null | 'echec'> {
  try {
    return await fetchDashboardMe();
  } catch {
    return 'echec';
  }
}

export default async function DashboardPage() {
  const t = await getTranslations('dashboard.pages.home');
  const user = await getMeAction();

  // TCK-115: super_admin without agency_id has no data to display.
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title={t('noAgency')} />;
  }

  const lecture = await lireLeTableau();
  const payload = lecture === 'echec' ? null : lecture;

  // TCK-270 — le bandeau « Personnalisez votre agence » (logo manquant) ; TCK-777 — le `kind` filtre
  // les étapes de la mise en service. Une agence illisible ne casse rien : bandeau caché, `kind` nul.
  let showBrandingBanner = false;
  let kind: AgencyKind | null = null;
  const adminDAgence = isAgencyAdmin(user.roles) && !!user.agency_id;
  if (adminDAgence) {
    const agencyResult = await fetchAgencyAction(user.agency_id!);
    if (agencyResult.ok && agencyResult.data) {
      showBrandingBanner = !agencyResult.data.logo_url;
      kind = agencyResult.data.kind ?? null;
    }
  }

  // TCK-2622 — les blocs se choisissent par PERSONA (ADR-0089), celui de la coque : le profil actif,
  // jamais l'union des rôles (la cause des raccourcis faux du client).
  const persona = resoudrePersona({
    roles: user.roles,
    typeProfilActif: typeDuProfilActif(profilLieDeLaCoque(await getActiveProfileId(), user)),
    agenceIndividuelle: kind === 'individual',
  });

  // TCK-2596 (ADR-0096) — l'accueil de l'AGENT est sa journée : « À régler », la chronologie, ses
  // chiffres en bas. Le rôle est celui du profil ACTIF (`dashboard/me`) ; si la lecture a échoué, le
  // persona décide, et la journée montre ses chiffres en « — ».
  if (payload ? payload.data.role === 'agent' : lecture === 'echec' && persona === 'agent') {
    return <MaJournee chiffres={payload?.data.metrics ?? {}} bandeau={<WizardDraftsBanner />} />;
  }

  const prenom = prenomDe(user);
  const locale = await getLocale();

  // « Ce mois » : `null` = la lecture a échoué (le bloc le dit), `[]` = rien à compter pour ce persona.
  const chiffres =
    lecture === 'echec'
      ? null
      : aDesChiffres(payload)
        ? chiffresDuMois({
            persona,
            role: payload.data.role,
            metrics: payload.data.metrics,
            kpis: payload.data.role === 'agency_admin' ? await fetchKpisActifs() : [],
            agenceStandard: kind === 'standard',
          })
        : [];

  return (
    <SocleDeLAccueil
      titre={prenom ? t('greeting', { name: prenom }) : t('greetingNoName')}
      ligne={jourEnClair(locale, jourADakar(new Date()))}
      // TCK-777 (P15.08) — la mise en service, pour tout admin d'agence, individuelle comprise ; elle
      // disparaît une fois l'agence prête. TCK-2622 — repliée en une ligne.
      miseEnService={adminDAgence ? { agencyId: user.agency_id!, kind } : null}
      bandeaux={
        <>
          {showBrandingBanner ? <BrandingBanner /> : null}
          {/* TCK-250 — Resumable wizard drafts banner. Renders nothing when no drafts. */}
          <WizardDraftsBanner />
          {/* TCK-266 / TCK-492 — la check-list d'entrée dans les lieux. `tenant` est le prédicat JUSTE
              (le persona ne l'est pas : un bailleur qui loue aussi un logement la perdrait). */}
          {isTenant(user.roles) ? <TenantOnboardingChecklistWidget /> : null}
        </>
      }
      // TCK-595 — un compte sans chiffres (client sans fiche, prestataire) garde son état vide, en
      // attendant les blocs de son persona (TCK-2625).
      vide={chiffres !== null && chiffres.length === 0 ? <DashboardEmpty roles={user.roles} /> : null}
      ceMois={chiffres === null || chiffres.length > 0 ? <CeMois chiffres={chiffres} rapport={payload ? rapportDuMois(payload.data.role) : null} pleineLargeur /> : null}
    />
  );
}

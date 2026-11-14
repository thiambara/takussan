import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { fetchAgencyAction } from '@/app/actions/admin-agency';
import { AFaireAdmin } from '@/components/accueil/admin/AFaireAdmin';
import { EquipeDuJour } from '@/components/accueil/admin/EquipeDuJour';
import { ResumeDuJour } from '@/components/accueil/admin/ResumeDuJour';
import { AFaireBailleur, type FilesDeLHote } from '@/components/accueil/bailleur/AFaireBailleur';
import { EnCoursSurVosBiens } from '@/components/accueil/bailleur/EnCoursSurVosBiens';
import { LoyersDuMois } from '@/components/accueil/bailleur/LoyersDuMois';
import { ResumeDuBailleur } from '@/components/accueil/bailleur/ResumeDuBailleur';
import { CeMois } from '@/components/accueil/CeMois';
import { FavorisQuiBougent } from '@/components/accueil/client/FavorisQuiBougent';
import { InvitationARechercher, lireInvitationARechercher } from '@/components/accueil/client/InvitationARechercher';
import { VosRecherches } from '@/components/accueil/client/VosRecherches';
import { VosVisites, type VisiteAVenir } from '@/components/accueil/client/VosVisites';
import { CarteDuLoyer } from '@/components/accueil/locataire/CarteDuLoyer';
import { EcheancesDes30Jours } from '@/components/accueil/locataire/EcheancesDes30Jours';
import { ErreurDeLaSituation } from '@/components/accueil/locataire/ErreurDeLaSituation';
import { CeQuiMAttend, DocumentsRecents } from '@/components/accueil/locataire/MaSituation';
import { MonLogement } from '@/components/accueil/locataire/MonLogement';
import { ResumeDuLocataire } from '@/components/accueil/locataire/ResumeDuLocataire';
import { AChiffrer, JourneeDuPrestataire, ResumeDuPrestataire } from '@/components/accueil/prestataire/AccueilDuPrestataire';
import { SocleDeLAccueil } from '@/components/accueil/SocleDeLAccueil';
import { BrandingBanner } from '@/components/agency/BrandingBanner';
import { DashboardEmpty } from '@/components/dashboard/DashboardEmpty';
import { MaJournee } from '@/components/journee/MaJournee';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { TenantOnboardingChecklistWidget } from '@/components/tenant/TenantOnboardingChecklistWidget';
import { WizardDraftsBanner } from '@/components/wizard/WizardDraftsBanner';
import { localeDeLaRequete } from '@/i18n/locale-serveur';
import { chiffresDuMois, rapportDuMois } from '@/lib/accueil/chiffres-du-mois';
import { lireLoyersDuMois } from '@/lib/accueil/loyers-du-mois';
import { vueBailleurOuverte } from '@/lib/access/tableau-du-bailleur';
import { fetchOwnerDashboard } from '@/lib/queries/dashboard';
import { prenomDe } from '@/lib/identite';
import { jourEnClair } from '@/lib/journee/jour-en-clair';
import { jourADakar } from '@/lib/journee/journee';
import { accueilNommeAujourdhui } from '@/lib/navigation/accueil-nomme';
import { profilLieDeLaCoque, resoudrePersona, typeDuProfilActif } from '@/lib/navigation/personas';
import { aDesChiffres, fetchDashboardMe, type DashboardMePayload, type DashboardMeRecentDocument } from '@/lib/queries/dashboard-me';
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

/**
 * TCK-2624 (lot 2) — « Réservations à traiter » et « Avis sans réponse » de l'hôte, lus comme la Vue
 * bailleur les lisait (`GET /api/dashboard/owner`, ouvert à qui `vueBailleurOuverte` admet). Une vue
 * fermée : les deux files ne s'appliquent pas ; une panne : elles le disent (le bloc ne dit pas « Tout
 * est à jour »).
 */
async function lireLesFilesDeLHote(user: Awaited<ReturnType<typeof getMeAction>>): Promise<FilesDeLHote | null> {
  if ((await vueBailleurOuverte(user)) !== true) return null;
  try {
    const lue = await fetchOwnerDashboard({ include: [] });
    if (!lue) return null;
    const { data } = lue;
    return { reservations: { etat: 'pret', total: data.bookings?.pending ?? 0 }, avis: { etat: 'pret', total: data.reviews?.unanswered ?? 0 } };
  } catch {
    return { reservations: { etat: 'echec' }, avis: { etat: 'echec' } };
  }
}

/**
 * TCK-2625 — ce que « Ma situation » lisait de la vue `tenant` de `/dashboard/me` (`TenantMeMetrics`),
 * typé une fois : les visites à venir, les échéances des 30 jours, les documents récents, les
 * interventions ouvertes et les réservations en attente.
 */
function lireLaSituation(metrics: Record<string, unknown>) {
  const liste = <T,>(v: unknown): readonly T[] => (Array.isArray(v) ? (v as T[]) : []);
  const nombre = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    aUneFiche: metrics.has_customer_profile === true,
    visites: liste<VisiteAVenir>(metrics.visits_upcoming),
    documents: liste<DashboardMeRecentDocument>(metrics.recent_documents),
    interventionsOuvertes: nombre(metrics.maintenance_open),
    reservationsEnAttente: nombre(metrics.bookings_pending),
  };
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
  // TCK-2625 — typée `Locale` : les blocs du locataire et du client formatent dates et montants avec.
  const locale = await localeDeLaRequete();

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

  // TCK-2624 — l'admin d'une agence (standard : l'agence individuelle est l'hôte) voit ce qui attend
  // sa décision, et son équipe du jour. Les lectures sont bornées à l'agence active par l'API.
  const accueilAdmin = persona === 'admin-agence' && adminDAgence ? user.agency_id! : null;
  const aujourdhui = jourADakar(new Date());
  const jour = jourEnClair(locale, aujourdhui);

  // TCK-2624 (lot 2) — le bailleur et l'hôte voient ce qui attend LEUR réponse (visites, devis, loyers
  // en retard), les loyers du mois et ce qui est en cours sur leurs biens. L'hôte confirme ses visites ;
  // le bailleur d'un bien d'agence, non (`PropertyVisitPolicy::agitPourLeBien`, décision 7).
  const accueilBailleur = persona === 'bailleur' || persona === 'hote';
  const loyers = accueilBailleur && payload?.data.role === 'owner' ? lireLoyersDuMois(payload.data.metrics) : null;
  const filesDeLHote = persona === 'hote' ? await lireLesFilesDeLHote(user) : null;

  // TCK-2625 — le locataire et le client : « Ma situation » (`/app/overview/tenant`) est absorbée ici,
  // rien ne s'y perd. Ses données sont celles de `/dashboard/me` (vue `tenant`), déjà lues ; le loyer
  // vient du résumé de l'API (`CarteDuLoyer`). Le client reçoit l'invitation à chercher de TCK-595.
  // Le prestataire arrive sur sa liste de travail (spec § 2.5 : ni tableau de bord ni rapports).
  const accueilLocataire = persona === 'locataire';
  const accueilClient = persona === 'client';
  const accueilPrestataire = persona === 'prestataire';
  const situation = (accueilLocataire || accueilClient) && payload?.data.role === 'tenant' ? lireLaSituation(payload.data.metrics) : null;
  const invitation = accueilClient ? await lireInvitationARechercher(user.preferences, locale) : null;

  return (
    <SocleDeLAccueil
      titre={prenom ? t('greeting', { name: prenom }) : t('greetingNoName')}
      ligne={
        accueilAdmin !== null ? (
          <ResumeDuJour jour={jour} agencyId={accueilAdmin} />
        ) : accueilBailleur ? (
          <ResumeDuBailleur jour={jour} landlordId={user.id} loyers={loyers} />
        ) : accueilLocataire ? (
          <ResumeDuLocataire jour={jour} />
        ) : accueilPrestataire ? (
          <ResumeDuPrestataire jour={jour} />
        ) : (
          jour
        )
      }
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
      // TCK-595 — un compte sans chiffres ni blocs de son persona garde son état vide (TCK-2625 : le
      // locataire, le client et le prestataire ont désormais les leurs).
      vide={chiffres !== null && chiffres.length === 0 && !accueilClient && !accueilPrestataire ? <DashboardEmpty roles={user.roles} /> : null}
      blocs={
        accueilAdmin !== null ? (
          <AFaireAdmin agencyId={accueilAdmin} />
        ) : accueilBailleur ? (
          <>
            {loyers ? <LoyersDuMois loyers={loyers} jour={aujourdhui} className="max-md:mx-4 md:mb-5" /> : null}
            <AFaireBailleur landlordId={user.id} confirmeLesVisites={persona === 'hote'} hote={filesDeLHote} />
          </>
        ) : accueilLocataire ? (
          // TCK-2625 — la carte du loyer, SEULE à gauche au bureau (« la carte du loyer à gauche, le reste à
          // droite ») ; au téléphone, la colonne suit : la carte, puis « Mon logement » et ses trois gestes,
          // puis ce que « Ma situation » montrait — l'ordre du ticket et de la maquette (a-3).
          <CarteDuLoyer className="max-md:mx-4" />
        ) : accueilClient ? (
          <>
            <VosVisites visites={situation?.visites ?? []} />
            <FavorisQuiBougent />
            <VosRecherches />
            {situation?.aUneFiche ? <DocumentsRecents documents={situation.documents} className="max-md:mx-4" /> : null}
            {invitation ? <InvitationARechercher invitation={invitation} locale={locale} className="max-md:mx-4" /> : null}
          </>
        ) : accueilPrestataire ? (
          <JourneeDuPrestataire />
        ) : undefined
      }
      colonne={
        accueilAdmin !== null ? (
          <EquipeDuJour agencyId={accueilAdmin} />
        ) : accueilBailleur ? (
          <EnCoursSurVosBiens />
        ) : accueilLocataire ? (
          <>
            <MonLogement />
            {/* Les échéances lisent les dus, pas `/dashboard/me` : elles rendent même quand celui-ci est en panne. */}
            <EcheancesDes30Jours className="max-md:mx-4" />
            {lecture === 'echec' ? <ErreurDeLaSituation className="max-md:mx-4" /> : null}
            {situation ? (
              <>
                <CeQuiMAttend
                  visites={situation.visites}
                  interventionsOuvertes={situation.interventionsOuvertes}
                  reservationsEnAttente={situation.reservationsEnAttente}
                  locale={locale}
                  className="max-md:mx-4"
                />
                <DocumentsRecents documents={situation.documents} className="max-md:mx-4" />
              </>
            ) : null}
          </>
        ) : accueilClient && situation?.aUneFiche ? (
          <CeQuiMAttend
            visites={situation.visites}
            interventionsOuvertes={situation.interventionsOuvertes}
            reservationsEnAttente={situation.reservationsEnAttente}
            locale={locale}
            className="max-md:mx-4"
          />
        ) : accueilPrestataire ? (
          <AChiffrer />
        ) : undefined
      }
      // TCK-2625 — pas de « Ce mois » pour le locataire : la maquette (a-3) n'en dessine pas, et ses chiffres
      // (`overdue_amount` de `/dashboard/me`) contredisaient la carte du loyer — « En retard 0 F » à côté de
      // « 338 250 F à régler » (relevé du 2026-11-13). Une seule vérité du montant : la carte.
      ceMois={
        !accueilLocataire && (chiffres === null || chiffres.length > 0) ? (
          <CeMois
            chiffres={chiffres}
            rapport={payload ? rapportDuMois(payload.data.role) : null}
            pleineLargeur={accueilAdmin === null && !accueilBailleur && !accueilLocataire && !accueilClient && !accueilPrestataire}
          />
        ) : null
      }
    />
  );
}

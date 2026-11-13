import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { getToken } from '@/lib/session';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { fetchAgencyUpgradeRequests } from '@/lib/queries/agency-upgrade';
import { fetchAbonnement, fetchOffreDePassage, fetchQuotaDeLAgence } from '@/lib/queries/offre';
import { AvantagesDuPassage } from '@/components/agency/AvantagesDuPassage';
import { OffreDeLAgencePro } from '@/components/agency/OffreDeLAgencePro';
import { UpgradeRequestForm } from '@/components/agency/UpgradeRequestForm';
import { UpgradeRequestStatus } from '@/components/agency/UpgradeRequestStatus';
import { CadreDeLaFiche } from '@/components/admin-agency/fiche/CadreDeLaFiche';
import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { origineSite } from '@/lib/config-publique';
import { peutEcrireLaVitrine } from '@/lib/vitrine-agence';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.upgrade');
  return { title: t('metaTitle') };
}
export const dynamic = 'force-dynamic';

/**
 * TCK-267 — agency upgrade page (`individual → standard`).
 *
 * Visibility:
 *  - Reachable only by the active agency's `agency_admin` (or super_admin).
 *  - When the agency is already `standard`: TCK-2671, the « Offre » screen — « déjà
 *    professionnelle », the plan's price and gauges, what going pro unlocked.
 *  - When `individual`: the latest request's state first (a declined one is taken up again by
 *    the form, `resubmit_of`), the price read from the API (`GET /api/me/upgrade-offer`), and the
 *    prefilled form — unless a request is pending.
 *
 * The backend re-asserts every gate via {@see App\Policies\AgencyUpgradeRequestPolicy}.
 */
/** TCK-2608 — la raison sociale proposée par l'orientation (« Keur Immo ») : bornée, et jamais au-dessus de la fiche. */
function raisonSocialeProposee(brute: string | string[] | undefined): string | null {
  const valeur = typeof brute === 'string' ? brute.trim() : '';
  return valeur !== '' && valeur.length <= 160 ? valeur : null;
}

export default async function Page({ searchParams }: { readonly searchParams?: Promise<{ raison_sociale?: string | string[] }> } = {}) {
  const user = await getMeAction();
  const proposee = raisonSocialeProposee((await searchParams)?.raison_sociale);

  // TCK-426 — les QUATRE refus de cette page (jeton absent, rôle non-admin, absence de contexte
  // d'agence, agence illisible) ont remonté dans `settings/agency/upgrade/layout.tsx`. Sous le
  // `loading.tsx` de ce segment, aucun ne rendait son statut. Ne reste ici que du narrowing.
  const token = await getToken();
  const agencyId = user.agency_id;
  if (!token || !agencyId) return null;

  // TCK-2671 — une liste illisible est un ÉTAT, jamais le formulaire vide : sans elle, on ne sait
  // pas si une demande est déjà en cours.
  const [agency, listing] = await Promise.all([
    resolveAgencyOrNull(token, agencyId, 'settings/agency/upgrade', 'decision'),
    fetchAgencyUpgradeRequests(token, agencyId).catch(() => null),
  ]);

  // `decision`, et cette page est la seule des trois « non gardées » à le mériter.
  //
  // Le commentaire précédent affirmait que sur une panne « l'utilisateur voit le formulaire ».
  // C'était faux : en `affichage`, `resolveAgencyOrNull` rend `null` AUSSI pour le verdict
  // `explique` (429, 5xx, réseau), et la ligne d'en dessous renvoyait alors vers `/app` — le
  // déclassement apparent que tout ce travail existe pour supprimer, sur la page où la
  // distinction compte le plus : celle où l'on vient DEMANDER un changement de formule.
  //
  // En `decision`, une panne mène à `/verification-indisponible` (« ce n'est pas un changement
  // de votre formule ») et seuls 401/403/404 mènent à `/app`. Le `kind` ne garde toujours aucun
  // accès ici — il choisit le contenu — mais ce qu'on RACONTE à l'utilisateur, si.
  //
  // *Quand le commentaire et le code divergent, vérifier lequel des deux avait raison ; ici,
  // c'était le commentaire.*
  //
  // ⚠ TCK-426 — le REFUS lui-même est dans `layout.tsx`, avec ce raisonnement et ce même
  // `'decision'` ; la résolution est mémoïsée, donc la rappeler ici ne coûte rien. Ce qui reste
  // ci-dessous est du narrowing : le layout a déjà renvoyé, `agency` ne peut pas être `null`.
  if (!agency) return null;

  const t = await getTranslations('agency.upgrade.page');
  // TCK-2671 — la section « Offre » de la fiche de l'agence : son cadre (tête, jauge, navigation).
  const vitrine = peutEcrireLaVitrine(await capacitesDuProfilActif(), agency, user.id);
  const cadre = { agency, vitrine, origineSite: origineSite(), section: 'offre' as const };

  // Already standard — surface a calm confirmation message instead of
  // redirecting (the link still works from notifications / banners).
  // ⚠ Un `<div>`, pas un `<main>` : `AppShell` rend déjà le repère principal, et son
  // rembourrage aussi — le `p-6 mx-auto` d'ici décalait le titre de 171 px à 1366 et rognait
  // 48 px de plus à 360.
  if (agency.kind === 'standard') {
    // TCK-2671 — l'écran « Offre » : ce que l'agence paie et ce qu'elle consomme. Une lecture qui
    // échoue se dit à sa place ; elle ne fait pas tomber la page.
    const [abonnement, quota] = await Promise.all([
      fetchAbonnement(token).catch(() => 'illisible' as const),
      fetchQuotaDeLAgence(token).catch(() => null),
    ]);
    const approuvee = listing?.data.find((r) => r.status === 'approved') ?? null;
    return (
      <CadreDeLaFiche {...cadre} titre={t('offre.titre')} texte={t('offre.texte')} jauge>
        <OffreDeLAgencePro abonnement={abonnement} quota={quota} approuveeLe={approuvee?.reviewed_at ?? null} />
      </CadreDeLaFiche>
    );
  }

  if (!listing) {
    return (
      <CadreDeLaFiche {...cadre} titre={t('title')} texte={t('subtitle')}>
        <section role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <h2 className="text-corps font-semibold">{t('lectureImpossible.titre')}</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">{t('lectureImpossible.texte')}</p>
        </section>
      </CadreDeLaFiche>
    );
  }

  const offre = await fetchOffreDePassage(token).catch(() => 'illisible' as const);
  const pending = listing.data.find((r) => r.status === 'pending') ?? null;
  // Sinon la dernière demande (l'API trie par `-submitted_at`).
  const latest = pending ?? listing.data[0] ?? null;
  // ADR-0104 § 5 — seule la DERNIÈRE demande, refusée, se reprend (`resubmit_of`).
  const refusee = latest?.status === 'rejected' ? latest : null;

  // TCK-2671 (maquette `app-identite-agence`, écran 9) — l'état de la demande puis le prix, en tête
  // au téléphone ; au bureau dès `xl`, une colonne de 20 rem à droite du formulaire, qui reste
  // visible. L'ordre du DOM est celui du téléphone : le motif d'un refus se lit avant tout (AC4).
  return (
    <CadreDeLaFiche {...cadre} titre={t('title')} texte={t('subtitle')}>
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="space-y-4 xl:order-2 xl:w-80 xl:flex-none">
          {latest ? <UpgradeRequestStatus agencyId={agencyId} request={latest} /> : null}
          <AvantagesDuPassage offre={offre} />
        </div>
        {/* Une demande en cours ferme le formulaire : la révoquer d'abord (l'API répond 422 aussi). */}
        {!pending ? (
          <div className="min-w-0 flex-1 xl:order-1">
            <UpgradeRequestForm
              agencyId={agencyId}
              refusee={refusee}
              prefill={{
                // TCK-2608 — le nom saisi à l'ouverture de l'espace, seulement quand la fiche n'en porte aucun.
                company_legal_name: agency.legal_name || proposee,
                rc: agency.rccm,
                ninea: agency.ninea,
                address_fiscale: agency.legal_address,
              }}
            />
          </div>
        ) : null}
      </div>
    </CadreDeLaFiche>
  );
}

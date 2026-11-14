import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';

import { getMeAction } from '@/app/actions/auth';
import { fetchListingQuotaAction } from '@/app/actions/dashboard-properties';
import {
  gestionProposee,
  lireVoir,
  resoudreMode,
  suivantsProposes,
  type ModeDeListe,
} from '@/lib/biens/mode-de-liste';
import { modeMemoriseDesBiens } from '@/lib/biens/mode-memorise';
import { nomAffichable } from '@/lib/identite';
import { getToken } from '@/lib/session';
import { isOwner, isSuperAdmin } from '@/lib/roles';
import {
  fetchDashboardProperties,
  fetchPortfolioSummary,
  type FetchDashboardPropertiesParams,
} from '@/lib/queries/properties-server';
import {
  AfficherLesSuivants,
  JaugeDuQuota,
  OngletsAnnonces,
  PastillesAnnonces,
  PastillesGestion,
  SelecteurDeMode,
  TuilesGestion,
} from '@/components/property-dashboard/ModesDeLaListe';
import { PropertyList } from '@/components/property-dashboard/PropertyList';
import { PropertyListFilters } from '@/components/property-dashboard/PropertyListFilters';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import { AvertissementNumeroNonVerifie } from '@/components/contact/AvertissementNumeroNonVerifie';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/console';
import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { RESERVE_SOUS_LANCEUR } from '@/components/chat-widget/reserve';
import { cn } from '@/lib/utils';
import type { ResumeDuPortefeuille } from '@/types/property';
import { jourDeLApiOuRien } from '@/lib/jour-de-l-api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.properties');
  return { title: t('metaTitle') };
}

/**
 * TCK-041 — dashboard agent, liste des biens.
 *
 * Auth gate : enforced by the `(dashboard)` layout (redirects to
 * `/auth/login`). Role gate : agents / agency_admin / super_admin / owner.
 * Scoping by agency is handled server-side by the `PropertyPolicy` +
 * controller query in takussan-api.
 */

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * TCK-2637 — les états d'occupation que `filter[occupancy]` accepte (pastilles du mode Gestion).
 * TCK-2638 — `not_rental`, la liste de la tuile « À vendre » : hors de cette liste, le paramètre
 * est écarté et la tuile ouvrirait tous les biens.
 */
const ETATS_D_OCCUPATION = ['occupied', 'vacant', 'notice', 'not_rental'] as const;

/** TCK-2638 (lot B) — les états d'annonce que `filter[listing]` accepte (pastilles du mode Annonces). */
const ETATS_D_ANNONCE = ['online', 'pending', 'draft', 'offline'] as const;

/** Les tris de la liste ; `retard` (« Retards d'abord », TCK-2637) n'a de sens qu'en mode Gestion. */
const TRIS = ['-created_at', 'created_at', 'price', '-price', 'views_count', '-views_count'] as const;

const ALLOWED_PER_PAGE = [10, 20, 50] as const;
type AllowedPerPage = (typeof ALLOWED_PER_PAGE)[number];

function parsePerPage(value: string | undefined): AllowedPerPage {
  const parsed = Number.parseInt(value ?? '20', 10);
  return (ALLOWED_PER_PAGE as readonly number[]).includes(parsed)
    ? (parsed as AllowedPerPage)
    : 20;
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations('dashboard.properties');
  const tNav = await getTranslations('nav.sidebar');
  const tAnnonces = await getTranslations('propertyDashboard.annonces');
  const user = await getMeAction();
  // TCK-426 — la garde de rôle est REMONTÉE dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la route interdite.

  const params = await searchParams;
  const token = await getToken();
  // TCK-426 — NARROWING DE TYPE, PAS UNE DÉCISION. Le `layout.tsx` de ce segment a déjà refusé
  // l'absence de jeton, au-dessus de la frontière de suspension ; et `getMeAction()` redirige
  // vers `/auth/login` bien avant, depuis `(dashboard)/layout.tsx`. Cette branche est donc
  // inatteignable — mais `getToken()` rend `string | null` et le typage exige qu'on le dise.
  // *Ce qu'elle ne fait SURTOUT pas, c'est rediriger : sous un `loading.tsx`, un `redirect()` de
  // page rend 200 + le squelette au lieu du 307.*
  if (!token) return null;

  const page = Number.parseInt(asString(params.page) ?? '1', 10) || 1;
  const perPage = parsePerPage(asString(params.per_page));
  const filters = {
    status: asString(params.status),
    type: asString(params.type),
    contract_type: asString(params.contract_type),
    visibility: asString(params.visibility),
    // TCK-2036 (P198.03) — « publiés » au sens du catalogue, le lien de la tuile.
    public: asString(params.public) === '1' ? '1' : undefined,
    search: asString(params.search),
    city: asString(params.city),
    user_id: asString(params.only_mine) === '1' ? String(user.id) : asString(params.user_id),
    price_min: asString(params.price_min),
    price_max: asString(params.price_max),
    // TCK-2768 (q2) — une borne que l'API refuserait (un favori « 12/11/2026 ») est ignorée, pas relayée en 422.
    created_from: jourDeLApiOuRien(asString(params.created_from)),
    created_to: jourDeLApiOuRien(asString(params.created_to)),
    include_archived: asString(params.include_archived),
  };
  const sort = asString(params.sort);

  // TCK-2638 — le mode : l'URL, sinon la mémoire de l'appareil, sinon « Gestion ». Le résumé du
  // portefeuille part EN MÊME TEMPS que la liste : il compte les pastilles des deux modes, et dit si le
  // compte a des biens à louer (décision 4 a) — sans eux, la liste n'a que ses annonces.
  const modeDemande = resoudreMode({
    url: asString(params.mode),
    memoire: await modeMemoriseDesBiens(),
    gestionProposee: true,
  });

  // TCK-662 (P01.01) — un tri absent ou inconnu reste absent : `fetchDashboardProperties` pose
  // `-created_at` hors recherche, et n'en pose aucun pendant une recherche, que l'API classe alors
  // par pertinence. « Retards d'abord » (`retard`) n'a de sens qu'en mode Gestion.
  const triPermis = (gestion: boolean) =>
    sort && ((TRIS as readonly string[]).includes(sort) || (gestion && sort === 'retard')) ? sort : undefined;

  // TCK-2638 — au téléphone, « Afficher les 20 suivants » : `voir` biens sur la première page.
  const voir = lireVoir(asString(params.voir));
  const pagination = voir ? { page: 1, perPage: voir } : { page, perPage };

  const listeDuMode = (m: ModeDeListe): FetchDashboardPropertiesParams =>
    m === 'gestion'
      ? {
          ...pagination,
          // TCK-2638 (lot B2) — « Retards d'abord » est le tri par défaut de la Gestion (maquette retenue par
          // le porteur), posé ICI par le serveur et jamais écrit dans l'URL. Pendant une recherche, aucun
          // défaut : l'API classe par pertinence (TCK-662).
          sort: triPermis(true) ?? (filters.search ? undefined : 'retard'),
          filters: {
            ...filters,
            occupancy: (ETATS_D_OCCUPATION as readonly string[]).includes(asString(params.occupancy) ?? '')
              ? asString(params.occupancy)
              : undefined,
            rent_late: asString(params.rent_late) === '1' ? '1' : undefined,
            tenant: asString(params.tenant),
          },
          inclusions: ['occupancy', 'online'],
        }
      : {
          ...pagination,
          sort: triPermis(false),
          filters: {
            ...filters,
            listing: (ETATS_D_ANNONCE as readonly string[]).includes(asString(params.listing) ?? '')
              ? asString(params.listing)
              : undefined,
          },
          // TCK-2678 — la carte d'un bien hors ligne dit son premier motif.
          inclusions: ['online', 'offlineReasons'],
        };

  const agence = estDeLAgence(user.roles);
  const [premiere, resume, quota] = await Promise.all([
    listeDansLesBornes(token, listeDuMode(modeDemande)),
    fetchPortfolioSummary(token, { user_id: filters.user_id, include_archived: filters.include_archived }),
    // Le quota est celui de l'AGENCE (`GET /api/me/quota`) : le bailleur ne le consomme pas (TCK-627).
    agence ? fetchListingQuotaAction() : Promise.resolve(null),
  ]);

  // Décision 4 a — le sélecteur n'est proposé qu'à un compte qui a des biens à louer. Sous une portée
  // (« Mes biens », un agent choisi), le résumé ne compte que cette portée : le sélecteur reste, pour
  // que la bascule ne change pas de mode.
  const selecteur = Boolean(filters.user_id) || gestionProposee(resume);
  const mode: ModeDeListe = selecteur ? modeDemande : 'annonces';
  const response = mode === modeDemande ? premiere : await listeDansLesBornes(token, listeDuMode(mode));

  const contexte: ContexteDeLaPage = {
    user,
    response,
    resume,
    selecteur,
    titre: t(agence ? 'titleAgency' : 'title'),
    sousTitre: t('subtitle'),
    // « Proposer un bien à mon agence » pour le bailleur, en-tête comme barre (TCK-587, TCK-2638).
    publier: proposeAuBailleur(user.roles) ? tNav('proposeProperty') : t('publish'),
  };

  if (mode === 'gestion') return pageGestion(contexte);
  return pageAnnonces({
    ...contexte,
    // Maquette a-1 : le portefeuille et ce qui en est en ligne, sous le titre (bureau).
    sousTitre: tAnnonces('sousTitre', { total: resume.total, online: resume.online }),
    quota: quota && quota.limit !== null ? { used: quota.used, limit: quota.limit } : null,
  });
}

type Utilisateur = Awaited<ReturnType<typeof getMeAction>>;

/** TCK-2638 — « Biens » pour l'agence, « Mes biens » pour le bailleur. */
function estDeLAgence(roles: Utilisateur['roles']): boolean {
  return roles.includes('agency_admin') || roles.includes('agent');
}

/** Le bailleur PROPOSE un bien à son agence (TCK-587) ; le personnel et le super-admin publient. */
function proposeAuBailleur(roles: Utilisateur['roles']): boolean {
  return isOwner(roles) && !estDeLAgence(roles) && !isSuperAdmin(roles);
}

/**
 * TCK-2638 — la page demandée, ramenée dans les bornes : changer de mode ou de pastille garde la
 * page de l'URL, et le nouveau filtre peut en compter moins. Une page au-delà de la dernière se
 * relit à la dernière, plutôt que d'afficher « filtre sans résultat » sur une liste qui en a.
 */
async function listeDansLesBornes(
  token: string,
  params: FetchDashboardPropertiesParams,
): ReturnType<typeof fetchDashboardProperties> {
  const reponse = await fetchDashboardProperties(token, params);
  const derniere = reponse.meta.last_page;
  if (reponse.data.length === 0 && derniere >= 1 && (params.page ?? 1) > derniere) {
    return fetchDashboardProperties(token, { ...params, page: derniere });
  }
  return reponse;
}

/** L'en-tête : sous `lg`, une rangée (titre, « Publier un bien ») ; dès `lg`, celui de la console. */
function EnTeteDesBiens({
  titre,
  sousTitre,
  publier,
}: {
  readonly titre: string;
  readonly sousTitre: string;
  readonly publier: string;
}) {
  return (
    <PageHeader
      title={titre}
      description={<span className="hidden sm:inline">{sousTitre}</span>}
      className="flex-row items-center justify-between lg:items-start"
      actions={
        <Link
          href="/app/properties/new"
          className={cn(buttonVariants({ size: 'lg' }), 'h-10 rounded-xl px-3.5 lg:h-9 lg:rounded-lg lg:px-2.5')}
        >
          <Plus className="size-4" aria-hidden="true" />
          {publier}
        </Link>
      }
    />
  );
}

/** Ce que les deux modes de la page reçoivent, déjà résolu. */
type ContexteDeLaPage = {
  readonly user: Utilisateur;
  readonly response: Awaited<ReturnType<typeof fetchDashboardProperties>>;
  readonly resume: ResumeDuPortefeuille;
  /** Le sélecteur de mode est-il proposé (décision 4 a) ? */
  readonly selecteur: boolean;
  readonly titre: string;
  readonly sousTitre: string;
  readonly publier: string;
};

/**
 * Au téléphone, la page est PLEINE LARGEUR (TCK-2691), dans les deux modes : chaque élément pose sa
 * marge, et la liste va bord à bord ; l'en-tête de la coque porte le titre et « + ». Sous `md`,
 * l'enveloppe perd son `py-6` : la page rend ses 24 px du bas (`max-md:pb-6`) ; dès `md`, l'enveloppe
 * et la réserve du lanceur les portent (TCK-2481, revue M2).
 */
function CoqueDeLaListe({
  publier,
  titre,
  sousTitre,
  selecteur,
  mode,
  user,
  resume,
  children,
}: Pick<ContexteDeLaPage, 'publier' | 'titre' | 'sousTitre' | 'selecteur' | 'user' | 'resume'> & {
  readonly mode: ModeDeListe;
  readonly children: ReactNode;
}) {
  return (
    <PagePleineLargeur className={cn('space-y-3 pt-3 max-md:pb-6 md:pt-0 lg:space-y-6', RESERVE_SOUS_LANCEUR)}>
      <DeclarerEnTete
        action={<ActionDEnTete libelle={publier} icone={<Plus className="size-5" aria-hidden="true" />} href="/app/properties/new" primaire />}
      />
      <div className="max-md:hidden">
        <EnTeteDesBiens titre={titre} sousTitre={sousTitre} publier={publier} />
      </div>
      {selecteur ? <SelecteurDeMode mode={mode} className="px-4 md:px-0" /> : null}
      {/* TCK-633 (lot C, tour 2) — un numéro non vérifié n'est pas servi sur les annonces en ligne ; le
          compte « en ligne » est celui du résumé (`is_online`, ADR-0097). */}
      <div className="px-4 empty:hidden md:px-0">
        <AvertissementNumeroNonVerifie phoneVerifiedAt={user.phone_verified_at} annoncesEnLigne={resume.online} />
      </div>
      {children}
    </PagePleineLargeur>
  );
}

/**
 * TCK-2638 — le mode Gestion : la liste avec l'occupation (`include=occupancy,online`) et les comptes
 * des pastilles et des tuiles en UN appel `portfolio-summary` — aucune liste `per_page=1` (AC3).
 */
function pageGestion(contexte: ContexteDeLaPage) {
  const { user, response, resume } = contexte;
  const agentOptions = buildAgentOptions(response.data, user);
  // TCK-2638 (lot B2) — au bureau, le panneau de filtres et UNE carte : barre, table, pagination en pied.
  return (
    <CoqueDeLaListe {...contexte} mode="gestion">
      <TuilesGestion resume={resume} className="hidden lg:grid" />
      <PropertyListFilters
        currentUserId={user.id}
        agentOptions={agentOptions}
        mode="gestion"
        basculeMesBiens={estDeLAgence(user.roles)}
        resume={resume}
        total={response.meta.total}
        sousLaBarre={<PastillesGestion resume={resume} className="md:-mx-6 md:px-6 lg:hidden" />}
        pied={<Pagination meta={response.meta} dansLaCarte />}
      >
        <PropertyList page={response} currentUserId={user.id} agentOptions={agentOptions} presentation="gestion" />
      </PropertyListFilters>
    </CoqueDeLaListe>
  );
}

/**
 * TCK-2638 (lot B) — le mode Annonces (maquette a-1) : les pastilles (téléphone) ou les onglets (bureau)
 * de `filter[listing]`, comptés par le MÊME `portfolio-summary` — plus aucune liste `per_page=1` de
 * comptage, ni la bande de tuiles d'avant (« Publiés » comptait `filter[public]`, que « En ligne » dit
 * désormais). Les cartes à grande photo, puis le quota : discret en bas de liste au téléphone, en jauge
 * fine à côté des onglets au bureau.
 */
function pageAnnonces(contexte: ContexteDeLaPage & { readonly quota: { readonly used: number; readonly limit: number } | null }) {
  const { user, response, resume, quota } = contexte;
  const agentOptions = buildAgentOptions(response.data, user);
  return (
    <CoqueDeLaListe {...contexte} mode="annonces">
      <div className="hidden items-end gap-8 lg:flex">
        <OngletsAnnonces resume={resume} className="flex-1" />
        {quota ? <JaugeDuQuota used={quota.used} limit={quota.limit} presentation="bureau" /> : null}
      </div>
      <PropertyListFilters
        currentUserId={user.id}
        agentOptions={agentOptions}
        basculeMesBiens={estDeLAgence(user.roles)}
        sousLaBarre={<PastillesAnnonces resume={resume} className="md:-mx-6 md:px-6 lg:hidden" />}
        pied={<Pagination meta={response.meta} />}
      >
        <PropertyList page={response} currentUserId={user.id} agentOptions={agentOptions} presentation="annonces" />
      </PropertyListFilters>
      {quota ? (
        <div className="px-4 md:px-0 lg:hidden">
          <JaugeDuQuota used={quota.used} limit={quota.limit} presentation="telephone" />
        </div>
      ) : null}
    </CoqueDeLaListe>
  );
}

/**
 * La pagination des deux modes : au téléphone, « Afficher les 20 suivants » tant qu'il en reste sur la
 * première page ; sinon, et toujours au bureau, 10 / 20 / 50 et Précédent / Suivant (jamais les deux).
 */
function Pagination({
  meta,
  dansLaCarte = false,
}: {
  readonly meta: Awaited<ReturnType<typeof fetchDashboardProperties>>['meta'];
  /** TCK-2638 (lot B2) — Gestion, bureau : le pied de la carte de la table (bordure du haut, marge intérieure). */
  readonly dansLaCarte?: boolean;
}) {
  const suivants = suivantsProposes(meta);
  return (
    <div className="px-4 md:px-0">
      {suivants ? <AfficherLesSuivants meta={meta} className="lg:hidden" /> : null}
      <div className={cn(suivants && 'max-lg:hidden', dansLaCarte && 'empty:hidden lg:border-t lg:border-border lg:px-4')}>
        <PropertyPagination meta={meta} />
      </div>
    </div>
  );
}

function buildAgentOptions(
  properties: Awaited<ReturnType<typeof fetchDashboardProperties>>['data'],
  user: Utilisateur,
) {
  const map = new Map<number, string>();
  map.set(user.id, nomAffichable(user));
  for (const property of properties) {
    if (property.owner) {
      map.set(property.owner.id, property.owner.name);
    }
    for (const collaborator of property.collaborators ?? []) {
      if (collaborator.user) {
        map.set(collaborator.user.id, collaborator.user.name);
      }
    }
  }

  return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
}

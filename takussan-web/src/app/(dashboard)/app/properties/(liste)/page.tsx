import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { getMeAction } from '@/app/actions/auth';
import { resoudreMode } from '@/lib/biens/mode-de-liste';
import { modeMemoriseDesBiens } from '@/lib/biens/mode-memorise';
import { nomAffichable } from '@/lib/identite';
import { getToken } from '@/lib/session';
import {
  countDashboardProperties,
  fetchDashboardProperties,
  fetchPortfolioSummary,
  type FetchDashboardPropertiesParams,
} from '@/lib/queries/properties-server';
import { PastillesGestion, SelecteurDeMode, TuilesGestion } from '@/components/property-dashboard/ModesDeLaListe';
import { PropertyList } from '@/components/property-dashboard/PropertyList';
import { PropertyListFilters } from '@/components/property-dashboard/PropertyListFilters';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import { PropertyKpiStrip } from '@/components/property-dashboard/PropertyKpiStrip';
import { AvertissementNumeroNonVerifie } from '@/components/contact/AvertissementNumeroNonVerifie';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/console';
import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { RESERVE_SOUS_LANCEUR } from '@/components/chat-widget/reserve';
import { cn } from '@/lib/utils';

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

/** TCK-2637 — les états d'occupation que `filter[occupancy]` accepte (pastilles du mode Gestion). */
const ETATS_D_OCCUPATION = ['occupied', 'vacant', 'notice'] as const;

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
    created_from: asString(params.created_from),
    created_to: asString(params.created_to),
    include_archived: asString(params.include_archived),
  };
  const sort = asString(params.sort);

  // TCK-2638 — le mode : l'URL, sinon la mémoire de l'appareil, sinon « Gestion ».
  const mode = resoudreMode({
    url: asString(params.mode),
    memoire: await modeMemoriseDesBiens(),
    gestionProposee: true,
  });
  const gestion = mode === 'gestion';

  // TCK-662 (P01.01) — un tri absent ou inconnu reste absent : `fetchDashboardProperties` pose
  // `-created_at` hors recherche, et n'en pose aucun pendant une recherche, que l'API classe alors
  // par pertinence.
  const safeSort =
    sort && ((TRIS as readonly string[]).includes(sort) || (gestion && sort === 'retard'))
      ? sort
      : undefined;

  if (gestion) {
    return pageGestion({
      token,
      user,
      titre: t(estDeLAgence(user.roles) ? 'titleAgency' : 'title'),
      sousTitre: t('subtitle'),
      publier: t('publish'),
      liste: {
        page,
        perPage,
        sort: safeSort,
        filters: {
          ...filters,
          occupancy: (ETATS_D_OCCUPATION as readonly string[]).includes(asString(params.occupancy) ?? '')
            ? asString(params.occupancy)
            : undefined,
          rent_late: asString(params.rent_late) === '1' ? '1' : undefined,
          tenant: asString(params.tenant),
        },
        inclusions: ['occupancy', 'online'],
      },
    });
  }

  // Main list + KPI counts run in parallel. KPI requests use per_page=1 to
  // only pull `meta.total` — keeps the dashboard snappy. TCK-865 (P02.08) : « vendus » et
  // « loués » partent chacun de leur côté ; « loués » attendait la réponse de « vendus ».
  const [response, totalCompte, publishedCount, soldCount, rentedCount, archivedCount] =
    await Promise.all([
      listeDansLesBornes(token, {
        page,
        perPage,
        filters,
        sort: safeSort,
      }),
      // TCK-1382 (P138.08) — sans autre filtre que la portée, « Total » est le `meta.total` de la
      // liste elle-même : on ne le redemande pas.
      sansFiltreHorsPortee(filters) ? null : countProperties(token, { user_id: filters.user_id }),
      // TCK-2036 (P198.03) — « Publiés » est la règle du catalogue (`Property::public()`,
      // TCK-1115), celle de l'accueil d'agence : `visibility=public` seul gardait les biens loués,
      // vendus ou en revue restés publics, et l'avertissement de numéro non vérifié le lisait.
      countProperties(token, {
        user_id: filters.user_id,
        filter: { public: '1' },
      }),
      countProperties(token, {
        user_id: filters.user_id,
        filter: { status: 'sold' },
      }),
      countProperties(token, {
        user_id: filters.user_id,
        filter: { status: 'rented' },
      }),
      countProperties(token, {
        user_id: filters.user_id,
        filter: { status: 'archived' },
        include_archived: true,
      }),
    ]);

  const totalCount = totalCompte ?? response.meta.total;
  const agentOptions = buildAgentOptions(response.data, user);
  const currentVisibility = asString(params.visibility);
  const currentStatus = filters.status;
  const includeArchived = filters.include_archived === '1';

  // TCK-1289 (P131.02) — chaque tuile garde la portée sous laquelle son nombre est compté
  // (`only_mine=1` ou l'agent choisi) : sous « mes biens », elle ouvrait les biens de toute
  // l'agence.
  const userIdChoisi = asString(params.user_id);
  const portee =
    asString(params.only_mine) === '1'
      ? 'only_mine=1'
      : userIdChoisi
        ? `user_id=${encodeURIComponent(userIdChoisi)}`
        : undefined;
  const lienTuile = (requete?: string) => {
    const parties = [requete, portee].filter(Boolean);
    return parties.length > 0 ? `/app/properties?${parties.join('&')}` : '/app/properties';
  };

  const kpiTiles = [
    {
      label: 'Total',
      value: totalCount,
      href: lienTuile(),
      tone: 'neutral' as const,
      active:
        !currentStatus &&
        !currentVisibility &&
        !includeArchived &&
        Object.values(filters).filter(Boolean).length === 0,
    },
    {
      label: t('published'),
      value: publishedCount,
      href: lienTuile('public=1'),
      tone: 'accent' as const,
      active: filters.public === '1',
    },
    {
      label: t('soldRented'),
      value: soldCount + rentedCount,
      // TCK-1289 — la tuile compte les vendus ET les loués : elle ouvre les deux statuts.
      href: lienTuile('status=sold,rented'),
      tone: 'success' as const,
      active: currentStatus === 'sold,rented',
    },
    {
      label: t('archived'),
      value: archivedCount,
      href: lienTuile('include_archived=1&status=archived'),
      tone: 'muted' as const,
      active: currentStatus === 'archived',
    },
  ];

  return (
    // TCK-644 — sous `lg`, l'écart vertical se resserre (16 px au lieu de 24) et la page réserve
    // en bas la place du lanceur de messagerie (AC4 : la dernière carte défile au-dessus).
    <div className={cn('space-y-4 lg:space-y-6', RESERVE_SOUS_LANCEUR)}>
      {/* TCK-644 — sous `lg`, une seule rangée : le titre à gauche, « Publier un bien » à droite ;
          la ligne de contexte attend `sm` (à 390 px elle coûtait deux lignes avant la première
          carte). Dès `lg`, l'en-tête de la console à l'identique. */}
      <EnTeteDesBiens
        titre={t(estDeLAgence(user.roles) ? 'titleAgency' : 'title')}
        sousTitre={t('subtitle')}
        publier={t('publish')}
      />

      <SelecteurDeMode mode={mode} />

      {/* TCK-633 (lot C, tour 2) — un numéro non vérifié n'est pas servi sur les annonces en ligne. */}
      <AvertissementNumeroNonVerifie phoneVerifiedAt={user.phone_verified_at} annoncesEnLigne={publishedCount} />

      <PropertyKpiStrip tiles={kpiTiles} label={t('countersAria')} />

      <PropertyListFilters currentUserId={user.id} agentOptions={agentOptions} />

      <PropertyList
        page={response}
        currentUserId={user.id}
        agentOptions={agentOptions}
      />

      <PropertyPagination meta={response.meta} />
    </div>
  );
}

type Utilisateur = Awaited<ReturnType<typeof getMeAction>>;

/** TCK-2638 — « Biens » pour l'agence, « Mes biens » pour le bailleur. */
function estDeLAgence(roles: Utilisateur['roles']): boolean {
  return roles.includes('agency_admin') || roles.includes('agent');
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

/**
 * TCK-2638 — le mode Gestion : la liste avec l'occupation (`include=occupancy,online`) et les
 * comptes des pastilles et des tuiles en UN appel `portfolio-summary` — aucune liste `per_page=1`
 * (AC3). Le résumé porte aussi le compte « en ligne » que lit l'avertissement de numéro. Une
 * fonction et non un composant : la page la rend déjà résolue, comme le mode Annonces.
 */
async function pageGestion({
  token,
  user,
  titre,
  sousTitre,
  publier,
  liste,
}: {
  readonly token: string;
  readonly user: Utilisateur;
  readonly titre: string;
  readonly sousTitre: string;
  readonly publier: string;
  readonly liste: FetchDashboardPropertiesParams;
}) {
  const [response, resume] = await Promise.all([
    listeDansLesBornes(token, liste),
    fetchPortfolioSummary(token, {
      user_id: liste.filters?.user_id,
      include_archived: liste.filters?.include_archived,
    }),
  ]);
  const agentOptions = buildAgentOptions(response.data, user);

  // Au téléphone, la page est PLEINE LARGEUR (TCK-2691) : chaque élément pose sa marge, et la maquette
  // enchaîne sans marge la recherche, les pastilles (leur rangée porte son `py-2.5`) et la liste bord
  // à bord ; l'en-tête de la coque porte le titre et « + ». Sous `md`, l'enveloppe perd son `py-6` :
  // la page rend ses 24 px du bas (`max-md:pb-6`) ; dès `md`, l'enveloppe et la réserve du lanceur les
  // portent, comme en « Annonces » (TCK-2481, revue M2).
  return (
    <PagePleineLargeur className={cn('space-y-3 pt-3 max-md:pb-6 md:pt-0 lg:space-y-6', RESERVE_SOUS_LANCEUR)}>
      <DeclarerEnTete
        action={<ActionDEnTete libelle={publier} icone={<Plus className="size-5" aria-hidden="true" />} href="/app/properties/new" primaire />}
      />
      <div className="max-md:hidden">
        <EnTeteDesBiens titre={titre} sousTitre={sousTitre} publier={publier} />
      </div>
      <SelecteurDeMode mode="gestion" className="px-4 md:px-0" />
      <div className="px-4 empty:hidden md:px-0">
        <AvertissementNumeroNonVerifie phoneVerifiedAt={user.phone_verified_at} annoncesEnLigne={resume.online} />
      </div>
      <TuilesGestion resume={resume} className="hidden lg:grid" />
      <div className="lg:space-y-6">
        <div className="px-4 md:px-0">
          <PropertyListFilters currentUserId={user.id} agentOptions={agentOptions} mode="gestion" />
        </div>
        <PastillesGestion resume={resume} className="md:-mx-6 md:px-6 lg:hidden" />
        <PropertyList page={response} currentUserId={user.id} agentOptions={agentOptions} presentation="gestion" />
      </div>
      <div className="px-4 md:px-0">
        <PropertyPagination meta={response.meta} />
      </div>
    </PagePleineLargeur>
  );
}

async function countProperties(
  token: string,
  opts: {
    readonly user_id?: string;
    readonly filter?: Record<string, string>;
    readonly include_archived?: boolean;
  } = {},
): Promise<number> {
  const filter: Record<string, string> = { ...(opts.filter ?? {}) };
  if (opts.user_id) filter.user_id = opts.user_id;
  // TCK-1382 (P138.08) — un compte, pas une page de liste : ni `include` ni le sparse fieldset.
  return countDashboardProperties(token, {
    ...filter,
    include_archived: opts.include_archived ? '1' : undefined,
  });
}

/** La liste porte-t-elle les seuls filtres du compte « Total » (la portée, sans archives) ? */
function sansFiltreHorsPortee(filters: Record<string, string | undefined>): boolean {
  return Object.entries(filters).every(([cle, valeur]) => cle === 'user_id' || !valeur);
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

'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import { cheminApi } from '@/lib/chemin-api';

/**
 * TCK-590 — la boîte « Demandes » : `/api/contact-leads`.
 *
 * Les demandes déposées sur le site public étaient enregistrées et ILLISIBLES : aucune route ne
 * les relisait. La lecture est jugée par `PropertyContactLeadPolicy` côté API — le destinataire
 * lit les siennes, le personnel titulaire de `crm.view_all` toute la boîte de l'agence ; ce
 * module ne filtre rien lui-même. Les clics WhatsApp / Appeler n'y sont pas : `filter[channel]`
 * vaut `form` par défaut côté serveur.
 */

/** TCK-2582 — la fiche de l'agence au même téléphone ou au même e-mail que la demande. */
export interface DemandeDejaCliente {
  /** `null` : une fiche que le lecteur ne voit pas — elle se signale sans nom ni lien. */
  readonly id: number | null;
  readonly name: string | null;
  readonly visits_count: number | null;
}

export interface ContactLead {
  readonly id: number;
  readonly property_id: number | null;
  readonly agency_id: number | null;
  readonly recipient_user_id: number | null;
  readonly channel: 'form' | 'whatsapp' | 'call';
  readonly source: string | null;
  readonly medium: string | null;
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly message: string | null;
  readonly handled_at: string | null;
  readonly handled_by_id: number | null;
  readonly customer_id: number | null;
  /** TCK-2583 — le premier geste de contact : répondre ne vaut pas traiter (`handled_at`). */
  readonly first_responded_at?: string | null;
  /**
   * TCK-2582 — « déjà client » : clé ABSENTE pour qui n'est pas du personnel de l'agence de la
   * demande (le bailleur destinataire), `null` sans fiche.
   */
  readonly known_customer?: DemandeDejaCliente | null;
  readonly created_at: string;
  readonly property?: { id: number; title: string; slug: string } | null;
  readonly recipient?: { id: number; first_name: string | null; last_name: string | null } | null;
}

export const CONTACT_LEAD_FIELDS: string[] = [
  'id',
  'property_id',
  'agency_id',
  'recipient_user_id',
  'channel',
  'source',
  'medium',
  'name',
  'email',
  'phone',
  'message',
  'handled_at',
  'handled_by_id',
  'customer_id',
  'first_responded_at',
  'created_at',
];

/**
 * Les vues de la boîte. TCK-2584 — « Non attribuées » et « À moi » sont des vues À TRAITER : une
 * demande traitée n'attend plus personne ; « Traitées » et « Toutes » montrent l'historique.
 */
export type FiltreDesDemandes = 'todo' | 'unassigned' | 'mine' | 'handled' | 'all';

export type CanalDeDemande = ContactLead['channel'];

/** TCK-2584 — ce qui affine la vue : la recherche, et les filtres du bureau (Bien, Agent, Canal). */
export interface AffinageDesDemandes {
  readonly recherche?: string | null;
  readonly bien?: number | null;
  readonly agent?: number | null;
  readonly canal?: CanalDeDemande | null;
}

export const contactLeadsQueryKeys = {
  list: (filtre: FiltreDesDemandes, page: number, affinage: AffinageDesDemandes = {}) =>
    ['contact-leads', 'list', filtre, page, affinage] as const,
  detail: (id: number) => ['contact-leads', 'detail', id] as const,
  /** Le compteur du menu : une clé à part, ce n'est pas une page de liste. */
  unhandledCount: () => ['contact-leads', 'unhandled-count'] as const,
  /** TCK-2584 — le compte d'une vue, pour sa puce (« Non attribuées 1 »). */
  compteDeLaVue: (filtre: FiltreDesDemandes) => ['contact-leads', 'compte', filtre] as const,
  /** TCK-2584 — les demandes à traiter reçues avant `avant` (« 1 depuis plus de 24 h »). */
  enRetard: (avant: string) => ['contact-leads', 'en-retard', avant] as const,
  responseStats: () => ['contact-leads', 'response-stats'] as const,
};

/**
 * Le `filter[...]` de chaque vue de la boîte. TCK-2479 (revue) — partagé par la liste et par le
 * compteur du menu : la garde `a-traiter-lu-par-sa-page.test.ts` exige que la pastille compte
 * EXACTEMENT ce que la vue où elle mène montre.
 */
export function filtreSpatieDesDemandes(filtre: FiltreDesDemandes): Record<string, string> {
  switch (filtre) {
    case 'all':
      return {};
    case 'handled':
      return { handled: '1' };
    case 'unassigned':
      return { handled: '0', unassigned: '1' };
    case 'mine':
      return { handled: '0', mine: '1' };
    default:
      return { handled: '0' };
  }
}

/**
 * TCK-2584 — l'ordre d'une vue : ce qui attend se lit des plus anciennes aux plus récentes (la
 * demande oubliée d'abord, « Les plus anciennes d'abord ») ; l'historique (Traitées, Toutes), des
 * plus récentes aux plus anciennes, comme avant.
 */
export function triDesDemandes(filtre: FiltreDesDemandes): string {
  return filtre === 'handled' || filtre === 'all' ? '-created_at' : 'created_at';
}

/** Les paramètres de la liste : la vue, puis la recherche et les filtres du bureau. */
export function parametresDesDemandes(
  filtre: FiltreDesDemandes,
  page: number,
  affinage: AffinageDesDemandes = {},
): SpatieQueryParams {
  const filtres: Record<string, string> = { ...filtreSpatieDesDemandes(filtre) };
  const recherche = affinage.recherche?.trim();
  if (recherche) filtres.search = recherche;
  if (affinage.bien) filtres.property_id = String(affinage.bien);
  if (affinage.agent) filtres.recipient_user_id = String(affinage.agent);
  if (affinage.canal) filtres.channel = affinage.canal;
  return {
    fields: {
      property_contact_leads: CONTACT_LEAD_FIELDS,
      properties: ['id', 'title', 'slug'],
      users: ['id', 'first_name', 'last_name'],
    },
    filter: filtres,
    include: ['property', 'recipient'],
    sort: [triDesDemandes(filtre)],
    page,
    per_page: 20,
  };
}

export function useContactLeads(filtre: FiltreDesDemandes, page = 1, affinage: AffinageDesDemandes = {}) {
  return useApiQuery<PaginatedResponse<ContactLead>>(
    contactLeadsQueryKeys.list(filtre, page, affinage),
    '/api/contact-leads',
    { params: parametresDesDemandes(filtre, page, affinage) },
  );
}

/**
 * P97.04 (TCK-1120) — la demande que désigne la cible `lead` (`/app/leads?lead={id}`), lue par
 * `GET /api/contact-leads/{id}` sous la même policy `view` que la liste. `null` : aucune lecture.
 */
export function useContactLead(id: number | null) {
  // Ni `fields` ni `include` : un `show` rend la ressource entière, `property` et `recipient`
  // compris (`ContactLeadController::show`) — garde P60.03.
  return useApiQuery<ApiResponse<ContactLead>>(
    contactLeadsQueryKeys.detail(id ?? 0),
    cheminApi`/api/contact-leads/${id ?? 0}`,
    { enabled: id !== null },
  );
}

/**
 * Le nombre de demandes NON TRAITÉES, pour la pastille du menu — lu dans `meta.total`, comme le
 * compteur des visites (TCK-377) : `per_page: 1` et le seul `id`.
 */
export const PARAMETRES_DU_COMPTE_DES_DEMANDES: SpatieQueryParams = {
  fields: { property_contact_leads: ['id'] },
  filter: filtreSpatieDesDemandes('todo'),
  page: 1,
  per_page: 1,
};

export function useUnhandledLeadsCount(options: { enabled?: boolean } = {}) {
  return useApiQuery<PaginatedResponse<ContactLead>>(
    contactLeadsQueryKeys.unhandledCount(),
    '/api/contact-leads',
    {
      params: PARAMETRES_DU_COMPTE_DES_DEMANDES,
      enabled: options.enabled ?? true,
      refetchInterval: 60_000,
      staleTime: 30_000,
    },
  );
}

/**
 * TCK-2584 — le nombre de demandes d'une vue (la puce « Non attribuées 1 »), lu dans `meta.total` :
 * `per_page: 1` et le seul `id`, comme le compteur du menu.
 */
export function useCompteDeLaVue(filtre: FiltreDesDemandes, options: { enabled?: boolean } = {}) {
  return useApiQuery<PaginatedResponse<ContactLead>>(contactLeadsQueryKeys.compteDeLaVue(filtre), '/api/contact-leads', {
    params: { fields: { property_contact_leads: ['id'] }, filter: filtreSpatieDesDemandes(filtre), page: 1, per_page: 1 },
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  });
}

/**
 * TCK-2584 — « 1 depuis plus de 24 h » : les demandes à traiter reçues avant `avant` (ISO : l'instant
 * moins 24 h, arrondi à la minute par l'appelant, pour que la clé ne change pas à chaque rendu). Une
 * page n'en porte que 20 : le compte se demande à l'API.
 */
export function useDemandesEnRetard(avant: string, options: { enabled?: boolean } = {}) {
  return useApiQuery<PaginatedResponse<ContactLead>>(contactLeadsQueryKeys.enRetard(avant), '/api/contact-leads', {
    params: {
      fields: { property_contact_leads: ['id'] },
      filter: { ...filtreSpatieDesDemandes('todo'), created_at_max: avant },
      page: 1,
      per_page: 1,
    },
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  });
}

/** TCK-2583 — les délais de première réponse de l'agence et de chaque agent. */
export interface DelaisDeReponse {
  readonly period_days: number;
  readonly agency: {
    readonly median_first_response_seconds: number | null;
    readonly responded_count: number;
    readonly open_over_24h_count: number;
  };
  readonly agents: readonly {
    readonly user: { readonly id: number; readonly first_name: string | null; readonly last_name: string | null };
    readonly median_first_response_seconds: number | null;
    readonly responded_count: number;
    readonly open_over_24h_count: number;
  }[];
}

/**
 * Le bandeau de l'administrateur. L'API le réserve à `crm.view_all`, que l'agent porte aussi : la
 * décision de le montrer (le rôle) est celle de l'appelant, par `enabled`.
 */
export function useDelaisDeReponse(options: { enabled?: boolean } = {}) {
  return useApiQuery<ApiResponse<DelaisDeReponse>>(contactLeadsQueryKeys.responseStats(), '/api/contact-leads/response-stats', {
    enabled: options.enabled ?? true,
    staleTime: 60_000,
  });
}

/**
 * TCK-2584 — le bien de la demande ouverte : sa carte (vignette, prix) et la visite préremplie. La
 * ressource de la demande n'en porte que `{id, title, slug}`. `GET /api/properties/{id}` est un
 * `show` : il rend le bien entier et ignore `fields` (P60.03) — d'où aucun paramètre.
 */
export interface BienDeLaDemande {
  readonly id: number;
  readonly title: string;
  readonly slug?: string | null;
  readonly reference_number?: string | null;
  readonly price?: number | string | null;
  readonly currency?: string | null;
  readonly contract_type?: string | null;
  readonly main_photo_url?: string | null;
}

export function useBienDeLaDemande(id: number | null) {
  return useApiQuery<ApiResponse<BienDeLaDemande>>(['properties', 'demande', id ?? 0], cheminApi`/api/properties/${id ?? 0}`, {
    enabled: id !== null,
    staleTime: 5 * 60_000,
  });
}

const INVALIDER = { invalidate: [['contact-leads']] };

export function useHandleLead() {
  return useApiMutation<ApiResponse<ContactLead>, { id: number }>(
    { path: ({ id }) => cheminApi`/api/contact-leads/${id}/handle`, method: 'POST', body: () => ({}) },
    INVALIDER,
  );
}

/**
 * TCK-1343 — un 409 `customer.duplicate` signale une fiche existante de l'agence (comme la création
 * d'un client) ; `allow_duplicate` convertit quand même.
 */
export function useConvertLead() {
  return useApiMutation<
    ApiResponse<ContactLead> & { customer: { id: number } },
    { id: number; allow_duplicate?: boolean }
  >(
    {
      path: ({ id }) => cheminApi`/api/contact-leads/${id}/convert`,
      method: 'POST',
      body: ({ allow_duplicate }) => (allow_duplicate ? { allow_duplicate: true } : {}),
    },
    INVALIDER,
  );
}

export function useAssignLead() {
  return useApiMutation<ApiResponse<ContactLead>, { id: number; user_id: number }>(
    {
      path: ({ id }) => cheminApi`/api/contact-leads/${id}/assign`,
      method: 'POST',
      body: ({ user_id }) => ({ user_id }),
    },
    INVALIDER,
  );
}

/**
 * TCK-2583 — un geste de contact ENREGISTRÉ au toucher : `POST /api/contact-leads/{id}/contacts
 * {channel}` pose la première réponse de la demande (204). Le lien s'ouvre de lui-même ; l'envoi
 * part à côté, sans le retenir.
 */
export type CanalDeContact = 'whatsapp' | 'call' | 'email';

export function useEnregistrerContact() {
  return useApiMutation<void, { id: number; channel: CanalDeContact }>(
    {
      path: ({ id }) => cheminApi`/api/contact-leads/${id}/contacts`,
      method: 'POST',
      body: ({ channel }) => ({ channel }),
    },
    INVALIDER,
  );
}

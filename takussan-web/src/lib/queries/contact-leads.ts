'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';

/**
 * TCK-590 — la boîte « Demandes » : `/api/contact-leads`.
 *
 * Les demandes déposées sur le site public étaient enregistrées et ILLISIBLES : aucune route ne
 * les relisait. La lecture est jugée par `PropertyContactLeadPolicy` côté API — le destinataire
 * lit les siennes, le personnel titulaire de `crm.view_all` toute la boîte de l'agence ; ce
 * module ne filtre rien lui-même. Les clics WhatsApp / Appeler n'y sont pas : `filter[channel]`
 * vaut `form` par défaut côté serveur.
 */

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
  'created_at',
];

export type FiltreDesDemandes = 'todo' | 'handled' | 'all';

export const contactLeadsQueryKeys = {
  list: (filtre: FiltreDesDemandes, page: number) => ['contact-leads', 'list', filtre, page] as const,
  /** Le compteur du menu : une clé à part, ce n'est pas une page de liste. */
  unhandledCount: () => ['contact-leads', 'unhandled-count'] as const,
};

export function useContactLeads(filtre: FiltreDesDemandes, page = 1) {
  const params: SpatieQueryParams = {
    fields: {
      property_contact_leads: CONTACT_LEAD_FIELDS,
      properties: ['id', 'title', 'slug'],
      users: ['id', 'first_name', 'last_name'],
    },
    filter: filtre === 'all' ? {} : { handled: filtre === 'handled' ? '1' : '0' },
    include: ['property', 'recipient'],
    sort: ['-created_at'],
    page,
    per_page: 20,
  };

  return useApiQuery<PaginatedResponse<ContactLead>>(
    contactLeadsQueryKeys.list(filtre, page),
    '/api/contact-leads',
    { params },
  );
}

/**
 * Le nombre de demandes NON TRAITÉES, pour la pastille du menu — lu dans `meta.total`, comme le
 * compteur des visites (TCK-377) : `per_page: 1` et le seul `id`.
 */
export function useUnhandledLeadsCount(options: { enabled?: boolean } = {}) {
  const params: SpatieQueryParams = {
    fields: { property_contact_leads: ['id'] },
    filter: { handled: '0' },
    page: 1,
    per_page: 1,
  };

  return useApiQuery<PaginatedResponse<ContactLead>>(
    contactLeadsQueryKeys.unhandledCount(),
    '/api/contact-leads',
    {
      params,
      enabled: options.enabled ?? true,
      refetchInterval: 60_000,
      staleTime: 30_000,
    },
  );
}

const INVALIDER = { invalidate: [['contact-leads']] };

export function useHandleLead() {
  return useApiMutation<ApiResponse<ContactLead>, { id: number }>(
    { path: ({ id }) => `/api/contact-leads/${id}/handle`, method: 'POST', body: () => ({}) },
    INVALIDER,
  );
}

export function useConvertLead() {
  return useApiMutation<ApiResponse<ContactLead> & { customer: { id: number } }, { id: number }>(
    { path: ({ id }) => `/api/contact-leads/${id}/convert`, method: 'POST', body: () => ({}) },
    INVALIDER,
  );
}

export function useAssignLead() {
  return useApiMutation<ApiResponse<ContactLead>, { id: number; user_id: number }>(
    {
      path: ({ id }) => `/api/contact-leads/${id}/assign`,
      method: 'POST',
      body: ({ user_id }) => ({ user_id }),
    },
    INVALIDER,
  );
}

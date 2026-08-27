import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KycDossierStatus } from '@/types/super-admin';

/**
 * TCK-375 (revue adverse) — les DEUX décisions de `agency-queues.ts` que le ticket argumente et
 * qu'aucun test ne gardait.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * 1. LA TABLE `KYC_STATUSES_A_TRAITER`
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Mesuré le 2026-08-27 : l'élargir à ses quatre cas laissait **16 fichiers / 118 tests verts**.
 * `kycDemandeUnGeste` n'alimente que l'emphase de la pastille d'`AgencyQueues`, et aucune
 * assertion ne la lisait — le test qui portait le sujet s'appelle « ne signale un geste que
 * quand il y en a un » et n'assérait en fait que le TON.
 *
 * ⚠ **La garde va dans les DEUX sens, et c'est le point.** Un cliquet qui ne refuse que
 * l'élargissement est une tolérance : rétrécir la table à `['pending']` ferait disparaître le
 * signal d'un dossier REJETÉ — celui qui appelle précisément un geste — sans qu'aucun test ne
 * bronche. Les quatre cas de `KycDossierStatus` sont donc énumérés, chacun avec sa réponse.
 *
 * La forme `Record<KycDossierStatus, boolean>` n'est pas un ornement : elle fait échouer
 * `tsc --noEmit` le jour où un cinquième statut apparaît côté API. *Une table de vérité qui ne
 * connaît pas tous les cas n'est pas une table de vérité.*
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * 2. LE COMPTE DE MODÉRATION
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Il se lit dans `meta.total` et jamais dans `data.length` (avec `per_page=1`, `data.length` vaut
 * 1 pour une file de quarante), et sa requête nomme ses colonnes. ⚠ Ce que ce test éprouve est
 * l'URL ÉMISE : côté serveur, `PropertyModerationController` n'instancie pas spatie et ces
 * paramètres sont aujourd'hui inertes — c'est écrit dans `property-moderation.ts`, et c'est un
 * delta d'API.
 */

const mockApiRequest = vi.fn();

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...reel,
    // `buildQueryString` reste le VRAI : c'est l'URL réellement construite qu'on éprouve.
    apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  };
});

const {
  KYC_STATUSES_A_TRAITER,
  kycDemandeUnGeste,
  fetchPropertyModerationCount,
  fetchPendingInvitationsCount,
} = await import('@/lib/queries/agency-queues');

function urlAppelee(): URLSearchParams {
  const appel = mockApiRequest.mock.calls.at(-1);
  if (!appel) throw new Error('apiRequest n’a pas été appelé');
  const url = String(appel[0]);
  return new URLSearchParams(url.split('?')[1] ?? '');
}

/**
 * La table de vérité, EXHAUSTIVE par construction. Ajouter un statut à `KycDossierStatus` sans
 * décider ici s'il appelle un geste ne compile pas.
 */
const GESTE_ATTENDU: Record<KycDossierStatus, boolean> = {
  // L'agence doit déposer ses pièces.
  pending: true,
  // L'agence doit corriger et redéposer.
  rejected: true,
  // Le dossier est chez la plateforme : l'agence n'a rien à faire.
  submitted: false,
  // Le dossier est clos.
  verified: false,
};

describe('agency-queues — KYC_STATUSES_A_TRAITER (TCK-375)', () => {
  it.each(Object.entries(GESTE_ATTENDU) as ReadonlyArray<[KycDossierStatus, boolean]>)(
    'un dossier « %s » demande un geste de l’agence : %s',
    (statut, attendu) => {
      expect(kycDemandeUnGeste(statut)).toBe(attendu);
    },
  );

  it('un statut inconnu (dossier jamais ouvert) ne demande aucun geste', () => {
    expect(kycDemandeUnGeste(undefined)).toBe(false);
  });

  /**
   * L'assertion sur la table elle-même, en plus des quatre cas : elle nomme la décision là où un
   * lecteur la cherchera, et elle rougit sur un élargissement comme sur un rétrécissement.
   */
  it('la table est EXACTEMENT « pending, rejected » — ni plus, ni moins', () => {
    expect([...KYC_STATUSES_A_TRAITER]).toEqual(['pending', 'rejected']);
  });

  it('les statuts qui NE sont PAS dans la table sont ceux dont l’agence n’est pas responsable', () => {
    const horsTable = (Object.keys(GESTE_ATTENDU) as KycDossierStatus[]).filter(
      (statut) => !KYC_STATUSES_A_TRAITER.includes(statut),
    );
    expect(horsTable.sort()).toEqual(['submitted', 'verified']);
  });
});

describe('agency-queues — les comptes de file (TCK-375)', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
  });

  it('le compte de modération lit meta.total, JAMAIS data.length', async () => {
    // Une file de 40 rendue en page d'UN élément : `data.length` vaudrait 1.
    mockApiRequest.mockResolvedValue({
      data: [{ id: 1 }],
      meta: { total: 40, current_page: 1, last_page: 40, per_page: 1, pending_count: 40 },
    });

    await expect(fetchPropertyModerationCount('jeton')).resolves.toBe(40);
  });

  it('le compte de modération nomme ses colonnes, ses relations et son tri (sparse fieldsets)', async () => {
    mockApiRequest.mockResolvedValue({
      data: [],
      meta: { total: 0, current_page: 1, last_page: 1, per_page: 1, pending_count: 0 },
    });

    await fetchPropertyModerationCount('jeton');

    const params = urlAppelee();
    expect(params.get('fields[properties]')).toBe(
      'id,reference_number,title,slug,status,type,price,currency,submitted_at,rejection_reason,user_id,agency_id',
    );
    expect(params.get('include')).toBe('owner,agency,address');
    expect(params.get('sort')).toBe('submitted_at');
    // Le compte se demande sur UNE ligne, pas sur la file entière.
    expect(params.get('per_page')).toBe('1');
  });

  it('le compte d’invitations lit meta.total et n’envoie AUCUN filter[agency_id]', async () => {
    mockApiRequest.mockResolvedValue({
      data: [{ id: 1 }],
      meta: { total: 3, current_page: 1, last_page: 3, per_page: 1 },
    });

    await expect(fetchPendingInvitationsCount('jeton')).resolves.toBe(3);

    const params = urlAppelee();
    expect(params.get('filter[status]')).toBe('sent');
    expect(params.get('fields[invitations]')).toBe('id');
    expect(params.get('per_page')).toBe('1');
    // La portée vient du profil actif côté serveur — c'est la frontière d'isolation.
    expect(params.has('filter[agency_id]')).toBe(false);
  });
});

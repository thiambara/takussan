import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2611 (ADR-0094 § 1-3) — l'aperçu de l'invitation, lu au rendu serveur par
 * `GET /api/public/invitations/{token}` : trois issues, jamais deux. Un 404 seul dit « inconnu », un
 * 410 seul dit « fermé » (avec l'agence et la date que l'API y joint) ; un 429, un 5xx, une panne ne
 * disent rien de l'invitation.
 */
const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return { ...reel, apiRequest: (...a: unknown[]) => apiRequest(...a) };
});

import { ApiError } from '@/lib/api';

import { lireInvitation } from '../invitation-apercu';

/** La forme exacte de `PublicInvitationPreviewResource` (TCK-2609). */
const APERCU = {
  role: 'owner',
  agency: { name: 'Dakar Immo', logo_url: null, city: 'Dakar', public_properties_count: 214, verified: true, public_phone: '+221338200000' },
  inviter: { first_name: 'Aïssatou' },
  recipient: { channel: 'phone', masked: '77 ••• 45 67' },
  recipient_has_account: false,
  expires_at: '2026-11-17T10:00:00+00:00',
  invited_at: '2026-11-10T10:00:00+00:00',
  prefill: { first_name: 'Moussa', last_name: 'Ndiaye' },
  awaiting: { properties_count: 3 },
};

describe('lireInvitation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lit l’aperçu par un GET (aucune option d’écriture), et le relit champ par champ', async () => {
    apiRequest.mockResolvedValue({ data: APERCU });

    const lecture = await lireInvitation('jeton abc');

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith('/api/public/invitations/jeton%20abc');
    expect(lecture).toEqual({
      issue: 'valide',
      apercu: {
        role: 'owner',
        agence: { nom: 'Dakar Immo', logo: null, ville: 'Dakar', biensPublics: 214, verifiee: true, telephone: '+221338200000' },
        invitant: 'Aïssatou',
        destinataire: { canal: 'phone', masque: '77 ••• 45 67' },
        compteExistant: false,
        expireLe: '2026-11-17T10:00:00+00:00',
        inviteeLe: '2026-11-10T10:00:00+00:00',
        prerempli: { prenom: 'Moussa', nom: 'Ndiaye' },
        attente: { biens: 3, intervention: null },
      },
    });
  });

  it('l’intervention qui attend un prestataire, et un `awaiting` vide (`{}`)', async () => {
    apiRequest.mockResolvedValueOnce({
      data: { ...APERCU, role: 'service_provider', awaiting: { maintenance_request: { title: 'Fuite sous évier', property_label: 'F4 Mermoz', reported_at: null } } },
    });
    const prestataire = await lireInvitation('j');
    expect(prestataire.issue === 'valide' && prestataire.apercu.attente).toEqual({ biens: null, intervention: { titre: 'Fuite sous évier', bien: 'F4 Mermoz' } });

    apiRequest.mockResolvedValueOnce({ data: { ...APERCU, role: 'agent', agency: null, inviter: null, awaiting: {} } });
    const agent = await lireInvitation('j');
    expect(agent.issue === 'valide' && agent.apercu).toMatchObject({ agence: null, invitant: null, attente: { biens: null, intervention: null } });
  });

  it('404 : lien inconnu, sans rien d’autre', async () => {
    apiRequest.mockRejectedValue(new ApiError(404, { code: 'invitation.token_not_found', message: 'x' }));
    await expect(lireInvitation('j')).resolves.toEqual({ issue: 'inconnue' });
  });

  it.each([
    ['invitation.token_expired', 'expiree'],
    ['invitation.token_revoked', 'annulee'],
    ['invitation.token_accepted', 'acceptee'],
  ] as const)('410 %s : fermée (%s), avec l’agence et la date', async (code, etat) => {
    apiRequest.mockRejectedValue(
      new ApiError(410, { code, message: 'x', agency: { name: 'Dakar Immo', logo_url: null, public_phone: '+221338200000' }, invited_at: '2026-11-03T09:00:00+00:00' }),
    );
    await expect(lireInvitation('j')).resolves.toEqual({
      issue: 'fermee',
      fermee: { etat, agence: { nom: 'Dakar Immo', logo: null, telephone: '+221338200000' }, inviteeLe: '2026-11-03T09:00:00+00:00' },
    });
  });

  it('410 d’une agence supprimée : fermée, sans agence', async () => {
    apiRequest.mockRejectedValue(new ApiError(410, { code: 'invitation.token_revoked', message: 'x', agency: null, invited_at: null }));
    await expect(lireInvitation('j')).resolves.toEqual({ issue: 'fermee', fermee: { etat: 'annulee', agence: null, inviteeLe: null } });
  });

  it.each([
    ['429', new ApiError(429, { message: 'Too Many Attempts.' })],
    ['500', new ApiError(500, { message: 'x' })],
    ['410 sans code connu', new ApiError(410, { message: 'x' })],
    ['panne réseau', new TypeError('fetch failed')],
  ])('%s : indisponible — rien n’est affirmé de l’invitation', async (_cas, erreur) => {
    apiRequest.mockRejectedValue(erreur);
    await expect(lireInvitation('j')).resolves.toEqual({ issue: 'indisponible' });
  });

  it('un corps sans rôle : indisponible, jamais un écran valide inventé', async () => {
    apiRequest.mockResolvedValue({ data: { agency: APERCU.agency } });
    await expect(lireInvitation('j')).resolves.toEqual({ issue: 'indisponible' });
  });
});

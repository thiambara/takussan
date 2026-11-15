import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '@/types/profile';
import type { UserRole } from '@/types/user';
import type { FaitsDuSommaire } from '../sommaire';

/**
 * TCK-2635 (AC5) — la note de « Mes avis » est celle de la fiche publique de l'agent : la même
 * requête que sa page publique (`GET /public/agents/{slug}`), et rien quand il n'y a rien à montrer.
 */
const FICHE = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', () => ({ apiFetch: FICHE.apiFetch }));

const { noteDeLaFiche } = await import('../note-de-la-fiche');

const agent = (autre: Partial<Profile> = {}): Profile => ({
  id: 'agent:1', type: 'agent', numeric_id: 1, agency_id: 1, status: 'active', created_at: null, public_slug: 'sokhna-ba', ...autre,
});
const faits = (roles: UserRole[], profils: Profile[] | null): FaitsDuSommaire => ({
  user: { roles, phone: null, phone_verified_at: null, two_factor_enabled: true, listed_in_public_directory: false, timezone: null },
  profils,
});

beforeEach(() => {
  FICHE.apiFetch.mockReset();
  FICHE.apiFetch.mockResolvedValue({ data: { reviews: { average: 4.1, count: 12, recent: [] } } });
});

describe('noteDeLaFiche (TCK-2635)', () => {
  it('rend la moyenne et le nombre de la fiche publique, lue par son slug et la langue', async () => {
    expect(await noteDeLaFiche(faits(['agent'], [agent()]), 'fr')).toEqual({ moyenne: 4.1, nombre: 12 });
    expect(FICHE.apiFetch).toHaveBeenCalledWith('/public/agents/sokhna-ba', undefined, { locale: 'fr' });
  });

  it('rien sans fiche publique, sans avis, ou si la fiche est illisible — jamais un zéro', async () => {
    expect(await noteDeLaFiche(faits(['agent'], [agent({ public_slug: null })]), 'fr')).toBeNull();
    expect(FICHE.apiFetch).not.toHaveBeenCalled();

    FICHE.apiFetch.mockResolvedValueOnce({ data: { reviews: { average: null, count: 0, recent: [] } } });
    expect(await noteDeLaFiche(faits(['agent'], [agent({ public_slug: 'sans-avis' })]), 'fr')).toBeNull();

    FICHE.apiFetch.mockRejectedValueOnce(new Error('503'));
    expect(await noteDeLaFiche(faits(['agent'], [agent({ public_slug: 'illisible' })]), 'fr')).toBeNull();
  });

  it('pas de note pour qui n’est pas agent, ni sur des profils illisibles', async () => {
    expect(await noteDeLaFiche(faits(['owner'], [agent()]), 'fr')).toBeNull();
    expect(await noteDeLaFiche(faits(['agent'], null), 'fr')).toBeNull();
    expect(FICHE.apiFetch).not.toHaveBeenCalled();
  });
});

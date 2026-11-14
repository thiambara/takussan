import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-2602 — `/app/properties/{id}/en-ligne` : la page relit le bien (la lecture mémoïsée du layout),
 * ne sert que l'annonce d'un espace particulier — la fiche sinon —, compose l'adresse PUBLIQUE de la
 * fiche (origine du site, langue), et ne cite le numéro de l'auteur que vérifié ET déclaré WhatsApp.
 */
const lecture = vi.hoisted(() => ({ bien: vi.fn(), moi: vi.fn(), capacites: vi.fn() }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/detail/ressource-de-detail', () => ({ lireBienDuRendu: (...a: unknown[]) => lecture.bien(...a) }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => lecture.moi() }));
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: () => lecture.capacites() }));
vi.mock('@/lib/config-publique', () => ({ origineSite: () => 'https://preview.takussan.com' }));
vi.mock('@/components/entree/libelles-de-la-coque', () => ({
  libellesDeLaCoque: async () => ({
    marque: 'Takussan', retourAuSite: 'Retour au site', fermer: 'Fermer', quitter: 'Quitter', avancement: 'Étape {pas} sur {total}',
    sortie: { titre: 't', texte: 't', partir: 'p', rester: 'r' },
  }),
}));
vi.mock('@/components/entree/CoqueDEntree', () => ({
  CoqueDEntree: ({ children }: { children: React.ReactNode }) => <div data-testid="coque">{children}</div>,
}));
vi.mock('@/components/publication/RenvoiVersLaFiche', () => ({
  RenvoiVersLaFiche: ({ href }: { href: string }) => <a data-testid="renvoi" href={href}>fiche</a>,
}));
vi.mock('@/components/publication/AnnonceEnLigne', () => ({
  AnnonceEnLigne: (props: Record<string, unknown>) => <pre data-testid="ecran">{JSON.stringify(props)}</pre>,
}));

import Page from '../page';

const BIEN = {
  id: 42, title: 'Studio meublé lumineux à Mermoz', reference_number: 'TK-58204', slug: 'studio-mermoz-42',
  status: 'available', visibility: 'public', type: 'studio', type_label: 'Studio', contract_type: 'rent', rent_period: 'monthly',
  price: 250000, currency: 'XOF', location: { quarter: 'Mermoz', city: 'Dakar' }, furnished: true, area: 38, floor_number: 2,
  entry_cost: { total: 1015000 }, photos: [{ preview: 'https://media/1.jpg' }, { preview: 'https://media/2.jpg' }], main_photo_url: null,
  agency: { id: 9, kind: 'individual' },
};

async function rendre() {
  render(withIntl(await Page({ params: Promise.resolve({ id: '42' }) })));
  return JSON.parse(screen.getByTestId('ecran').textContent ?? '{}') as {
    annonce: Record<string, unknown>;
    numeroWhatsApp: string | null;
    peutBooster: boolean;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  lecture.bien.mockResolvedValue(BIEN);
  lecture.moi.mockResolvedValue({ id: 1, phone: '+221771234567', phone_verified_at: '2026-11-01', phone_whatsapp: true });
  lecture.capacites.mockResolvedValue(['boost.spend']);
});

describe('TCK-2602 — la page « en ligne »', () => {
  it('l’annonce d’un espace particulier : l’adresse publique localisée, le numéro WhatsApp, le boost', async () => {
    const props = await rendre();
    expect(lecture.bien).toHaveBeenCalledWith('jeton', 42);
    expect(props.annonce).toMatchObject({
      id: 42, etat: 'en-ligne', urlPublique: 'https://preview.takussan.com/fr/properties/studio-mermoz-42',
      reference: 'TK-58204', nombrePhotos: 2, photo: 'https://media/1.jpg', entree: 1015000, typeLibelle: 'Studio',
    });
    expect(props.numeroWhatsApp).toBe('+221771234567');
    expect(props.peutBooster).toBe(true);
  });

  it('un numéro non vérifié, ou non déclaré WhatsApp, n’est pas cité', async () => {
    lecture.moi.mockResolvedValue({ id: 1, phone: '+221771234567', phone_verified_at: null, phone_whatsapp: true });
    expect((await rendre()).numeroWhatsApp).toBeNull();
  });

  it('sans `boost.spend` (ou capacités illisibles), pas de boost', async () => {
    lecture.capacites.mockResolvedValue(null);
    expect((await rendre()).peutBooster).toBe(false);
  });

  it('un bien d’agence `standard` : la fiche, pas l’écran', async () => {
    lecture.bien.mockResolvedValue({ ...BIEN, agency: { id: 9, kind: 'standard' } });
    render(withIntl(await Page({ params: Promise.resolve({ id: '42' }) })));
    expect(screen.getByTestId('renvoi').getAttribute('href')).toBe('/app/properties/42');
    expect(screen.queryByTestId('ecran')).toBeNull();
  });

  it('en vérification : l’écran, dans cet état', async () => {
    lecture.bien.mockResolvedValue({ ...BIEN, status: 'pending_review', visibility: 'private' });
    expect((await rendre()).annonce).toMatchObject({ etat: 'verification' });
  });
});

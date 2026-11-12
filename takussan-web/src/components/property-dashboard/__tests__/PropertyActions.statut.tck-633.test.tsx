import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyDetail, PropertyListItem } from '@/types/property';
import { PropertyHeaderActions } from '../PropertyHeaderActions';
import { PropertyRowActions } from '../PropertyRowActions';

/**
 * Correction du lot C, tour 2 (TCK-633) — l'impasse du menu « Statut ». Un bien en ligne, retiré
 * par son statut (« Indisponible »), garde `visibility = public` : le menu propose « Dépublier »
 * et non « Publier ». Le remettre « Disponible » est une publication que l'API garde
 * (`property.publish_contact_incomplete`) ; tout compte antérieur au lot C (CGU non datées) la
 * recevait en message brut, sans moyen de la lever. Le refus doit ouvrir la MÊME boîte que
 * « Publier », dont le bouton rejoue le changement de statut avec `accept_terms`.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));

const m = vi.hoisted(() => ({
  publier: vi.fn(),
  changerStatut: vi.fn(),
  statutBrut: vi.fn(),
  user: null as Record<string, unknown> | null,
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  deletePropertyAction: vi.fn(),
  duplicatePropertyAction: vi.fn(),
  updatePropertyStatusAction: (...a: unknown[]) => m.statutBrut(...a),
  updatePropertyVisibilityAction: vi.fn(),
}));
// Réserve de verif-patrimoine (2026-11-12) — l'en-tête de la fiche et la ligne de liste disent
// l'issue d'un geste par un toast.
const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@/components/ui/toast', async (original) => ({
  ...(await original<typeof import('@/components/ui/toast')>()),
  useToast: () => toast,
}));
vi.mock('@/components/documents/AddDocumentButton', () => ({ AddDocumentButton: () => null }));
vi.mock('@/app/actions/publish-property', () => ({
  publishPropertyAction: (...a: unknown[]) => m.publier(...a),
  changePropertyStatusAction: (...a: unknown[]) => m.changerStatut(...a),
}));
vi.mock('@/app/actions/contact-preferences', () => ({ updateContactPreferencesAction: vi.fn() }));
vi.mock('@/app/actions/security', () => ({ phoneSendOtpAction: vi.fn(), phoneVerifyOtpAction: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: m.user, setUser: vi.fn(), refreshUser: vi.fn() }),
}));

/** En ligne, puis retiré par son statut : `visibility` est restée `public`. */
const BIEN = { id: 47, title: 'Studio à Ouakam', slug: 'studio-ouakam', status: 'unavailable', visibility: 'public' } as const;

/** L'en-tête de la fiche dit « Plus d'actions » ; la ligne de liste y ajoute le bien (TCK-1035). */
const MENU_DU_BIEN = (nom: string) => nom === 'Plus d’actions' || nom === `Plus d’actions — ${BIEN.title}`;

type Ton = 'success' | 'error';

/** Les deux menus disent l'issue d'un geste par un toast (`useGestesRapides`). */
const parUnToast = {
  dit: (ton: Ton, texte: string | RegExp) =>
    waitFor(() =>
      expect(toast.add).toHaveBeenCalledWith(
        expect.objectContaining({ type: ton, title: typeof texte === 'string' ? texte : expect.stringMatching(texte) }),
      ),
    ),
  rienDit: () => expect(toast.add).not.toHaveBeenCalled(),
};

const MENUS = {
  'ligne de la liste': { rendre: () => <PropertyRowActions property={BIEN as unknown as PropertyListItem} layout="card" />, ...parUnToast },
  'en-tête de la fiche': { rendre: () => <PropertyHeaderActions property={BIEN as unknown as PropertyDetail} />, ...parUnToast },
};

/** Un compte antérieur au lot C : numéro vérifié, CGU jamais datées. */
const ANCIEN_COMPTE = {
  id: 1, first_name: 'Awa', phone: '+221770000901', phone_verified_at: '2026-10-01T00:00:00Z',
  phone_whatsapp: false, terms_accepted_at: null,
};

async function choisirStatut(user: ReturnType<typeof userEvent.setup>, libelle: string) {
  await user.click(screen.getByRole('button', { name: MENU_DU_BIEN }));
  await user.click(await screen.findByRole('menuitem', { name: libelle }));
}

describe.each(Object.entries(MENUS))('remettre en ligne par le statut depuis « %s »', (_nom, menu) => {
  beforeEach(() => {
    toast.add.mockReset();
    m.publier.mockReset();
    m.changerStatut.mockReset();
    m.statutBrut.mockReset();
    m.user = ANCIEN_COMPTE;
  });

  it('Indisponible → Disponible sans CGU : la boîte s’ouvre, et son « Publier » rejoue le statut avec accept_terms', async () => {
    m.changerStatut
      .mockResolvedValueOnce({ ok: false, status: 422, message: 'Pour publier, les conditions…', missing: ['terms'], contactIsSelf: true })
      .mockResolvedValueOnce({ ok: true, data: { id: 47, status: 'available' } });
    const user = userEvent.setup();
    render(withIntl(menu.rendre()));

    // Le menu propose « Dépublier », pas « Publier » : le bien est encore `public`.
    await user.click(screen.getByRole('button', { name: MENU_DU_BIEN }));
    expect(await screen.findByRole('menuitem', { name: 'Dépublier' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Publier' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Disponible' }));

    expect(m.changerStatut).toHaveBeenCalledWith(47, 'available', { acceptTerms: false });
    const dialogue = await screen.findByRole('dialog', { name: 'Avant de publier' });
    expect(within(dialogue).getByTestId('phrase-cgu')).toBeInTheDocument();
    // Pas de message brut de l'API à côté du menu.
    expect(screen.queryByText('Pour publier, les conditions…')).not.toBeInTheDocument();

    // La boîte s'ouvre AVANT que la transition du premier geste finisse : son « Publier » est
    // encore `disabled={enCours}` quand elle paraît, et un clic sur lui serait perdu sans bruit.
    // Attendre qu'il soit actif, comme l'attend la personne qui le voit grisé.
    const publier = within(dialogue).getByRole('button', { name: 'Publier' });
    await waitFor(() => expect(publier).toBeEnabled());
    await user.click(publier);

    await waitFor(() => expect(m.changerStatut).toHaveBeenLastCalledWith(47, 'available', { acceptTerms: true }));
    await menu.dit('success', /^Statut mis à jour\.$/);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(m.publier).not.toHaveBeenCalled();
    expect(m.statutBrut).not.toHaveBeenCalled();
  });

  it('un statut qui ne remet pas en ligne passe au premier geste, sans boîte', async () => {
    m.changerStatut.mockResolvedValue({ ok: true, data: { id: 47, status: 'under_maintenance' } });
    const user = userEvent.setup();
    render(withIntl(menu.rendre()));

    await choisirStatut(user, 'En maintenance');

    await menu.dit('success', /^Statut mis à jour\.$/);
    expect(m.changerStatut).toHaveBeenCalledWith(47, 'under_maintenance', { acceptTerms: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('un refus qui n’est pas un manque de coordonnées se dit, sans boîte', async () => {
    m.changerStatut.mockResolvedValue({ ok: false, status: 403, message: 'Action non autorisée.', missing: null, contactIsSelf: true });
    const user = userEvent.setup();
    render(withIntl(menu.rendre()));

    await choisirStatut(user, 'Disponible');

    await menu.dit('error', 'Action non autorisée.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

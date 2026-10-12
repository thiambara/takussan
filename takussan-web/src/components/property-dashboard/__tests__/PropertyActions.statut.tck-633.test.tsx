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

const MENUS = {
  'ligne de la liste': () => <PropertyRowActions property={BIEN as unknown as PropertyListItem} layout="card" />,
  'en-tête de la fiche': () => <PropertyHeaderActions property={BIEN as unknown as PropertyDetail} />,
};

/** Un compte antérieur au lot C : numéro vérifié, CGU jamais datées. */
const ANCIEN_COMPTE = {
  id: 1, first_name: 'Awa', phone: '+221770000901', phone_verified_at: '2026-10-01T00:00:00Z',
  phone_whatsapp: false, terms_accepted_at: null,
};

async function choisirStatut(user: ReturnType<typeof userEvent.setup>, libelle: string) {
  await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
  await user.click(await screen.findByRole('menuitem', { name: libelle }));
}

describe.each(Object.entries(MENUS))('remettre en ligne par le statut depuis « %s »', (_nom, menu) => {
  beforeEach(() => {
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
    render(withIntl(menu()));

    // Le menu propose « Dépublier », pas « Publier » : le bien est encore `public`.
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Dépublier' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Publier' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Disponible' }));

    expect(m.changerStatut).toHaveBeenCalledWith(47, 'available', { acceptTerms: false });
    const dialogue = await screen.findByRole('dialog', { name: 'Avant de publier' });
    expect(within(dialogue).getByTestId('phrase-cgu')).toBeInTheDocument();
    // Pas de message brut de l'API à côté du menu.
    expect(screen.queryByText('Pour publier, les conditions…')).not.toBeInTheDocument();

    await user.click(within(dialogue).getByRole('button', { name: 'Publier' }));

    await waitFor(() => expect(m.changerStatut).toHaveBeenLastCalledWith(47, 'available', { acceptTerms: true }));
    expect(await screen.findByRole('status')).toHaveTextContent(/^Statut mis à jour\.$/);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(m.publier).not.toHaveBeenCalled();
    expect(m.statutBrut).not.toHaveBeenCalled();
  });

  it('un statut qui ne remet pas en ligne passe au premier geste, sans boîte', async () => {
    m.changerStatut.mockResolvedValue({ ok: true, data: { id: 47, status: 'under_maintenance' } });
    const user = userEvent.setup();
    render(withIntl(menu()));

    await choisirStatut(user, 'En maintenance');

    expect(await screen.findByRole('status')).toHaveTextContent(/^Statut mis à jour\.$/);
    expect(m.changerStatut).toHaveBeenCalledWith(47, 'under_maintenance', { acceptTerms: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('un refus qui n’est pas un manque de coordonnées se dit, sans boîte', async () => {
    m.changerStatut.mockResolvedValue({ ok: false, status: 403, message: 'Action non autorisée.', missing: null, contactIsSelf: true });
    const user = userEvent.setup();
    render(withIntl(menu()));

    await choisirStatut(user, 'Disponible');

    expect(await screen.findByRole('alert')).toHaveTextContent('Action non autorisée.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

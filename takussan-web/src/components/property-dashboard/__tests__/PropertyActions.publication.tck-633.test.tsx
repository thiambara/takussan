import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyDetail, PropertyListItem } from '@/types/property';
import { PropertyHeaderActions } from '../PropertyHeaderActions';
import { PropertyRowActions } from '../PropertyRowActions';

/**
 * TCK-633 (lot C, décision 3 du porteur) — « Publier » depuis la liste et depuis l'en-tête d'un
 * bien : un compte prêt publie au premier geste ; sinon « Vos coordonnées pour les intéressés »
 * s'ouvre en boîte de dialogue, avec la phrase des CGU, puis la publication part. Les deux menus
 * passent par la MÊME règle — l'API — et ce fichier les éprouve tous les deux.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));
vi.mock('@/app/actions/dashboard-properties', () => ({
  deletePropertyAction: vi.fn(),
  duplicatePropertyAction: vi.fn(),
  updatePropertyStatusAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
}));
vi.mock('@/components/documents/AddDocumentButton', () => ({ AddDocumentButton: () => null }));

const m = vi.hoisted(() => ({
  publier: vi.fn(),
  user: null as Record<string, unknown> | null,
}));
vi.mock('@/app/actions/publish-property', () => ({
  publishPropertyAction: (...a: unknown[]) => m.publier(...a),
}));
vi.mock('@/app/actions/contact-preferences', () => ({ updateContactPreferencesAction: vi.fn() }));
vi.mock('@/app/actions/security', () => ({ phoneSendOtpAction: vi.fn(), phoneVerifyOtpAction: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: m.user, setUser: vi.fn(), refreshUser: vi.fn() }),
}));

const BIEN = { id: 47, title: 'Studio à Ouakam', slug: 'studio-ouakam', status: 'draft', visibility: 'private' } as const;

const MENUS = {
  'ligne de la liste': () => <PropertyRowActions property={BIEN as unknown as PropertyListItem} layout="card" />,
  'en-tête de la fiche': () => <PropertyHeaderActions property={BIEN as unknown as PropertyDetail} />,
};

const PRET = {
  id: 1, first_name: 'Awa', phone: '+221770000901', phone_verified_at: '2026-10-01T00:00:00Z',
  terms_accepted_at: '2026-10-01T00:00:00Z',
};

/**
 * La boîte s'ouvre avant la fin de la transition qui l'a ouverte (`setOuvert` suit l'`await`) :
 * son « Publier » est encore `disabled={enCours}` à l'apparition. Un clic dans cette fenêtre est
 * ignoré, et rien ne vient. Sous la charge de la CI, `userEvent` y tombe (PR #644, run 39130984729).
 */
async function publierDansLaBoite(dialogue: HTMLElement) {
  const bouton = within(dialogue).getByRole('button', { name: 'Publier' });
  await waitFor(() => expect(bouton).toBeEnabled());
  return bouton;
}

async function cliquerPublier(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Publier' }));
}

describe.each(Object.entries(MENUS))('publier depuis « %s » (TCK-633)', (_nom, menu) => {
  beforeEach(() => {
    m.publier.mockReset();
    m.user = PRET;
  });

  it('un compte prêt publie au premier geste, sans boîte de dialogue', async () => {
    m.publier.mockResolvedValue({ ok: true, data: { id: 47, status: 'available' } });
    const user = userEvent.setup();
    render(withIntl(menu()));

    await cliquerPublier(user);

    expect(await screen.findByRole('status')).toHaveTextContent(/^Bien publié\.$/);
    expect(m.publier).toHaveBeenCalledWith(47, { acceptTerms: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('CGU jamais acceptées : la boîte s’ouvre sur la phrase, et son « Publier » les accepte', async () => {
    m.user = { ...PRET, terms_accepted_at: null };
    m.publier
      .mockResolvedValueOnce({ ok: false, status: 422, message: 'x', missing: ['terms'], contactIsSelf: true })
      .mockResolvedValueOnce({ ok: true, data: { id: 47, status: 'available' } });
    const user = userEvent.setup();
    render(withIntl(menu()));

    await cliquerPublier(user);

    const dialogue = await screen.findByRole('dialog', { name: 'Avant de publier' });
    expect(within(dialogue).getByTestId('phrase-cgu')).toBeInTheDocument();
    await user.click(await publierDansLaBoite(dialogue));

    await waitFor(() => expect(m.publier).toHaveBeenLastCalledWith(47, { acceptTerms: true }));
    expect(await screen.findByRole('status')).toHaveTextContent(/^Bien publié\.$/);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('numéro non vérifié : le bloc « Vos coordonnées » dans la boîte, rien n’est publié', async () => {
    m.user = { ...PRET, phone: null, phone_verified_at: null };
    m.publier.mockResolvedValue({ ok: false, status: 422, message: 'x', missing: ['verified_phone'], contactIsSelf: true });
    const user = userEvent.setup();
    render(withIntl(menu()));

    await cliquerPublier(user);

    const dialogue = await screen.findByRole('dialog', { name: 'Avant de publier' });
    expect(within(dialogue).getByLabelText('Votre numéro')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('un second refus dans la boîte dit ce qui manque, sans parler d’un brouillon', async () => {
    m.user = { ...PRET, phone: null, phone_verified_at: null };
    m.publier.mockResolvedValue({ ok: false, status: 422, message: 'x', missing: ['verified_phone'], contactIsSelf: true });
    const user = userEvent.setup();
    render(withIntl(menu()));

    await cliquerPublier(user);
    const dialogue = await screen.findByRole('dialog', { name: 'Avant de publier' });
    await user.click(await publierDansLaBoite(dialogue));

    const alerte = await within(dialogue).findByRole('alert');
    expect(alerte).toHaveTextContent('Il manque encore des informations pour publier');
    // Aucun brouillon n'est en jeu depuis la liste ou l'en-tête d'un bien (vérification adverse).
    expect(alerte).not.toHaveTextContent(/brouillon/i);
  });

  it('un refus qui n’est pas un manque de coordonnées se dit, sans boîte', async () => {
    m.publier.mockResolvedValue({ ok: false, status: 422, message: 'Limite d’annonces atteinte.', missing: null, contactIsSelf: true });
    const user = userEvent.setup();
    render(withIntl(menu()));

    await cliquerPublier(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Limite d’annonces atteinte.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

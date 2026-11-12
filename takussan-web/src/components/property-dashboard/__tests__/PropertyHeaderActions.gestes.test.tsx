import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PropertyHeaderActions } from '@/components/property-dashboard/PropertyHeaderActions';
import {
  deletePropertyAction,
  duplicatePropertyAction,
  updatePropertyStatusAction,
  updatePropertyVisibilityAction,
} from '@/app/actions/dashboard-properties';
import { changePropertyStatusAction, publishPropertyAction } from '@/app/actions/publish-property';
import { withIntl } from '@/test/intl';
import type { PropertyDetail } from '@/types/property';

/**
 * Réserve de verif-patrimoine (2026-11-12), décisions de la session — les gestes de la fiche du
 * bien, au téléphone (feuille « ⋯ ») comme au bureau : c'est le même composant.
 *
 * Relevé au navigateur avant le correctif, non-GET bloqués : « Dupliquer » levait
 * `TypeError: Failed to fetch` hors de tout `catch`, la frontière `(dashboard)/error.tsx` le
 * recevait (« erreur non rattrapée ») et la PAGE ENTIÈRE passait à l'écran d'erreur. Dépublier et
 * Archiver partaient au premier toucher.
 *
 * (a) tout échec est rattrapé et dit par un toast ; (b) Archiver et Dépublier demandent une
 * confirmation qui nomme le bien et l'effet ; Dupliquer et les statuts restent en un geste et
 * confirment par un toast.
 */
const m = vi.hoisted(() => ({
  toast: { add: vi.fn() },
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, replace: vi.fn(), refresh: m.refresh }),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));
vi.mock('@/components/ui/toast', async (original) => ({
  ...(await original<typeof import('@/components/ui/toast')>()),
  useToast: () => m.toast,
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  deletePropertyAction: vi.fn(),
  duplicatePropertyAction: vi.fn(),
  updatePropertyStatusAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
}));
vi.mock('@/app/actions/publish-property', () => ({
  publishPropertyAction: vi.fn(),
  changePropertyStatusAction: vi.fn(),
}));
vi.mock('@/components/documents/AddDocumentButton', () => ({ AddDocumentButton: () => null }));

const EN_LIGNE = { id: 47, title: 'Studio à Ouakam', slug: 'studio-ouakam', status: 'available', visibility: 'public' };
const HORS_LIGNE = { ...EN_LIGNE, visibility: 'private' };

/** L'échec réseau d'une action serveur, tel que `fetchServerAction` le lève. */
const PANNE = () => new TypeError('Failed to fetch');
const INJOIGNABLE = 'Le serveur est injoignable pour le moment. Réessayez dans un instant.';

function rendre(bien: Record<string, unknown> = EN_LIGNE) {
  render(withIntl(<PropertyHeaderActions property={bien as unknown as PropertyDetail} />));
  return userEvent.setup();
}

async function choisir(user: ReturnType<typeof userEvent.setup>, geste: string) {
  await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
  await user.click(await screen.findByRole('menuitem', { name: geste }));
}

function toastAttendu(type: 'success' | 'error', title: string | RegExp) {
  return waitFor(() =>
    expect(m.toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ type, title: typeof title === 'string' ? title : expect.stringMatching(title) }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('les gestes de la fiche du bien : rattrapés, dits par un toast', () => {
  it('« Dupliquer » en panne réseau : un toast d’erreur, la page reste', async () => {
    vi.mocked(duplicatePropertyAction).mockRejectedValue(PANNE());
    const user = rendre();

    await choisir(user, 'Dupliquer');

    await toastAttendu('error', INJOIGNABLE);
    expect(duplicatePropertyAction).toHaveBeenCalledWith(47);
    expect(m.push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Plus d’actions' })).toBeEnabled();
  });

  it('« Dupliquer » réussi : un geste, sans dialogue, confirmé par un toast', async () => {
    vi.mocked(duplicatePropertyAction).mockResolvedValue({ ok: true, data: { id: 48 } as unknown as PropertyDetail });
    const user = rendre();

    await choisir(user, 'Dupliquer');

    await toastAttendu('success', 'Bien dupliqué.');
    expect(m.push).toHaveBeenCalledWith('/app/properties/48');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('un statut en panne réseau : un toast d’erreur', async () => {
    vi.mocked(changePropertyStatusAction).mockRejectedValue(PANNE());
    const user = rendre();

    await choisir(user, 'En maintenance');

    await toastAttendu('error', INJOIGNABLE);
    expect(changePropertyStatusAction).toHaveBeenCalledWith(47, 'under_maintenance', { acceptTerms: false });
  });

  it('un statut réussi : un geste, sans dialogue, confirmé par un toast', async () => {
    vi.mocked(changePropertyStatusAction).mockResolvedValue({ ok: true, data: { id: 47, status: 'under_maintenance' } as never });
    const user = rendre();

    await choisir(user, 'En maintenance');

    await toastAttendu('success', 'Statut mis à jour.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('« Publier » refusé par l’API : son message, en toast', async () => {
    vi.mocked(publishPropertyAction).mockResolvedValue({ ok: false, status: 403, message: 'Action non autorisée.', missing: null, contactIsSelf: true } as never);
    const user = rendre(HORS_LIGNE);

    await choisir(user, 'Publier');

    await toastAttendu('error', 'Action non autorisée.');
  });

  it('« Supprimer » en panne réseau : l’erreur dans le dialogue, rattrapée', async () => {
    vi.mocked(deletePropertyAction).mockRejectedValue(PANNE());
    const user = rendre();

    await choisir(user, 'Supprimer');
    const dialogue = await screen.findByRole('dialog', { name: 'Supprimer ce bien ?' });
    await user.click(within(dialogue).getByRole('button', { name: 'Supprimer' }));

    expect(await within(dialogue).findByRole('alert')).toHaveTextContent(INJOIGNABLE);
    expect(m.push).not.toHaveBeenCalled();
  });
});

describe.each([
  {
    geste: 'Archiver',
    bien: EN_LIGNE,
    titre: 'Archiver ce bien ?',
    action: () => vi.mocked(updatePropertyStatusAction),
    appel: [47, 'archived'],
    succes: 'Bien archivé.',
  },
  {
    geste: 'Dépublier',
    bien: EN_LIGNE,
    titre: 'Dépublier ce bien ?',
    action: () => vi.mocked(updatePropertyVisibilityAction),
    appel: [47, 'private'],
    succes: 'Bien dépublié.',
  },
])('« $geste » demande une confirmation', ({ geste, bien, titre, action, appel, succes }) => {
  it('le dialogue nomme le bien et l’effet ; rien ne part avant la confirmation', async () => {
    const user = rendre(bien);

    await choisir(user, geste);

    const dialogue = await screen.findByRole('dialog', { name: titre });
    expect(dialogue).toHaveTextContent('Studio à Ouakam');
    expect(dialogue).toHaveTextContent('ne sera plus visible sur le site');
    expect(action()).not.toHaveBeenCalled();
  });

  it('« Annuler » ne fait rien', async () => {
    const user = rendre(bien);

    await choisir(user, geste);
    const dialogue = await screen.findByRole('dialog', { name: titre });
    await user.click(within(dialogue).getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(action()).not.toHaveBeenCalled();
    expect(m.toast.add).not.toHaveBeenCalled();
  });

  it('confirmé : l’action part, un toast le dit, le dialogue se ferme', async () => {
    action().mockResolvedValue({ ok: true, data: { status: 'archived' } } as never);
    const user = rendre(bien);

    await choisir(user, geste);
    const dialogue = await screen.findByRole('dialog', { name: titre });
    await user.click(within(dialogue).getByRole('button', { name: geste }));

    expect(action()).toHaveBeenCalledWith(...appel);
    await toastAttendu('success', succes);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('confirmé en panne réseau : un toast d’erreur, rien ne remonte', async () => {
    action().mockRejectedValue(PANNE());
    const user = rendre(bien);

    await choisir(user, geste);
    const dialogue = await screen.findByRole('dialog', { name: titre });
    await user.click(within(dialogue).getByRole('button', { name: geste }));

    await toastAttendu('error', INJOIGNABLE);
    expect(m.refresh).not.toHaveBeenCalled();
  });
});

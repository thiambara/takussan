import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PropertyHeaderActions } from '@/components/property-dashboard/PropertyHeaderActions';
import { PropertyRowActions } from '@/components/property-dashboard/PropertyRowActions';
import {
  deletePropertyAction,
  duplicatePropertyAction,
  updatePropertyStatusAction,
  updatePropertyVisibilityAction,
} from '@/app/actions/dashboard-properties';
import { changePropertyStatusAction, publishPropertyAction } from '@/app/actions/publish-property';
import { withIntl } from '@/test/intl';
import type { PropertyDetail, PropertyListItem } from '@/types/property';

/**
 * Réserve de verif-patrimoine (2026-11-12), décisions de la session — les gestes rapides d'un
 * bien, depuis la fiche (au téléphone dans la feuille « ⋯ », au bureau dans l'en-tête : c'est le
 * même composant) ET depuis la ligne de la liste des biens (décision a : même lot, mêmes règles).
 * Les deux menus passent par `useGestesRapides`.
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
vi.mock('@/components/boost/BoostDialog', () => ({ BoostDialog: () => null }));
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

const MENUS = {
  'en-tête de la fiche': (bien: Record<string, unknown>) => (
    <PropertyHeaderActions property={bien as unknown as PropertyDetail} />
  ),
  'ligne de la liste': (bien: Record<string, unknown>) => (
    <PropertyRowActions property={bien as unknown as PropertyListItem} layout="card" />
  ),
};
type NomDuMenu = keyof typeof MENUS;

/** L'en-tête de la fiche dit « Plus d'actions » ; la ligne de liste y ajoute le bien (TCK-1035). */
const MENU_DU_BIEN = (nom: string) => nom === 'Plus d’actions' || nom === `Plus d’actions — ${EN_LIGNE.title}`;

function rendre(menu: NomDuMenu, bien: Record<string, unknown> = EN_LIGNE) {
  render(withIntl(MENUS[menu](bien)));
  return userEvent.setup();
}

async function choisir(user: ReturnType<typeof userEvent.setup>, geste: string) {
  await user.click(screen.getByRole('button', { name: MENU_DU_BIEN }));
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

const NOMS = Object.keys(MENUS) as NomDuMenu[];

describe.each(NOMS)('les gestes du bien depuis « %s » : rattrapés, dits par un toast', (menu) => {
  it('« Dupliquer » en panne réseau : un toast d’erreur, la page reste', async () => {
    vi.mocked(duplicatePropertyAction).mockRejectedValue(PANNE());
    const user = rendre(menu);

    await choisir(user, 'Dupliquer');

    await toastAttendu('error', INJOIGNABLE);
    expect(duplicatePropertyAction).toHaveBeenCalledWith(47);
    expect(m.push).not.toHaveBeenCalled();
    // Le toast part DANS la transition : le menu ne se rend qu'au rendu qui la clôt, un temps plus
    // tard. L'attendre, sans quoi l'assertion lit l'état en attente quand la machine est chargée
    // (rouge intermittent sous charge, reproduit en retardant la fin de la transition de 300 ms).
    await waitFor(() => expect(screen.getByRole('button', { name: MENU_DU_BIEN })).toBeEnabled());
  });

  it('« Dupliquer » réussi : un geste, sans dialogue, confirmé par un toast', async () => {
    vi.mocked(duplicatePropertyAction).mockResolvedValue({ ok: true, data: { id: 48 } as unknown as PropertyDetail });
    const user = rendre(menu);

    await choisir(user, 'Dupliquer');

    await toastAttendu('success', 'Bien dupliqué.');
    expect(m.push).toHaveBeenCalledWith('/app/properties/48');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('un statut en panne réseau : un toast d’erreur', async () => {
    vi.mocked(changePropertyStatusAction).mockRejectedValue(PANNE());
    const user = rendre(menu);

    await choisir(user, 'En maintenance');

    await toastAttendu('error', INJOIGNABLE);
    expect(changePropertyStatusAction).toHaveBeenCalledWith(47, 'under_maintenance', { acceptTerms: false });
  });

  it('un statut réussi : un geste, sans dialogue, confirmé par un toast', async () => {
    vi.mocked(changePropertyStatusAction).mockResolvedValue({ ok: true, data: { id: 47, status: 'under_maintenance' } as never });
    const user = rendre(menu);

    await choisir(user, 'En maintenance');

    await toastAttendu('success', 'Statut mis à jour.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('« Publier » refusé par l’API : son message, en toast', async () => {
    vi.mocked(publishPropertyAction).mockResolvedValue({ ok: false, status: 403, message: 'Action non autorisée.', missing: null, contactIsSelf: true } as never);
    const user = rendre(menu, HORS_LIGNE);

    await choisir(user, 'Publier');

    await toastAttendu('error', 'Action non autorisée.');
  });

  it('« Supprimer » en panne réseau : l’erreur dans le dialogue, rattrapée', async () => {
    vi.mocked(deletePropertyAction).mockRejectedValue(PANNE());
    const user = rendre(menu);

    await choisir(user, 'Supprimer');
    const dialogue = await screen.findByRole('dialog', { name: 'Supprimer ce bien ?' });
    await user.click(within(dialogue).getByRole('button', { name: 'Supprimer' }));

    expect(await within(dialogue).findByRole('alert')).toHaveTextContent(INJOIGNABLE);
    expect(m.push).not.toHaveBeenCalled();
  });
});

describe.each(
  NOMS.flatMap((menu) => [
  {
    menu,
    geste: 'Archiver',
    bien: EN_LIGNE,
    titre: 'Archiver ce bien ?',
    action: () => vi.mocked(updatePropertyStatusAction),
    appel: [47, 'archived'],
    succes: 'Bien archivé.',
  },
  {
    menu,
    geste: 'Dépublier',
    bien: EN_LIGNE,
    titre: 'Dépublier ce bien ?',
    action: () => vi.mocked(updatePropertyVisibilityAction),
    appel: [47, 'private'],
    succes: 'Bien dépublié.',
  },
  ]),
)('« $geste » depuis « $menu » demande une confirmation', ({ menu, geste, bien, titre, action, appel, succes }) => {
  it('le dialogue nomme le bien et l’effet ; rien ne part avant la confirmation', async () => {
    const user = rendre(menu, bien);

    await choisir(user, geste);

    const dialogue = await screen.findByRole('dialog', { name: titre });
    expect(dialogue).toHaveTextContent('Studio à Ouakam');
    expect(dialogue).toHaveTextContent('ne sera plus visible sur le site');
    expect(action()).not.toHaveBeenCalled();
  });

  it('« Annuler » ne fait rien', async () => {
    const user = rendre(menu, bien);

    await choisir(user, geste);
    const dialogue = await screen.findByRole('dialog', { name: titre });
    await user.click(within(dialogue).getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(action()).not.toHaveBeenCalled();
    expect(m.toast.add).not.toHaveBeenCalled();
  });

  it('confirmé : l’action part, un toast le dit, le dialogue se ferme', async () => {
    action().mockResolvedValue({ ok: true, data: { status: 'archived' } } as never);
    const user = rendre(menu, bien);

    await choisir(user, geste);
    const dialogue = await screen.findByRole('dialog', { name: titre });
    await user.click(within(dialogue).getByRole('button', { name: geste }));

    expect(action()).toHaveBeenCalledWith(...appel);
    await toastAttendu('success', succes);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('confirmé en panne réseau : un toast d’erreur, rien ne remonte', async () => {
    action().mockRejectedValue(PANNE());
    const user = rendre(menu, bien);

    await choisir(user, geste);
    const dialogue = await screen.findByRole('dialog', { name: titre });
    await user.click(within(dialogue).getByRole('button', { name: geste }));

    await toastAttendu('error', INJOIGNABLE);
    expect(m.refresh).not.toHaveBeenCalled();
  });
});

/**
 * Contre-vérification de 263df479b par verif-commercial (2026-11-12) — les statuts partent par la
 * transition de la publication (`usePublicationAvecCoordonnees`), mais le « ⋯ » ne se désactivait
 * que par celle de l'en-tête : pendant un statut en vol, le menu se rouvrait, et un second statut
 * ou « Dupliquer » pouvait partir. Un seul état « en vol » (`enVol` de `useGestesRapides`) les
 * tient désormais tous, et un second appui ne relance rien.
 */
describe.each(NOMS)('un geste en vol depuis « %s » : un seul part', (menu) => {
  /** Une action serveur qui ne répond pas avant qu'on la libère. */
  function enAttente() {
    let liberer: (valeur: unknown) => void = () => {};
    const promesse = new Promise((resolve) => {
      liberer = resolve;
    });
    return { promesse, liberer };
  }

  it('un statut en vol : le « ⋯ » est désactivé, ni second statut ni « Dupliquer » ne part', async () => {
    const vol = enAttente();
    vi.mocked(changePropertyStatusAction).mockReturnValue(vol.promesse as never);
    const user = rendre(menu);

    await choisir(user, 'En maintenance');

    const declencheur = screen.getByRole('button', { name: MENU_DU_BIEN });
    await waitFor(() => expect(declencheur).toBeDisabled());
    // Le second appui : le menu ne se rouvre pas, rien ne part.
    await user.click(declencheur);
    expect(screen.queryByRole('menuitem', { name: 'Dupliquer' })).not.toBeInTheDocument();
    expect(changePropertyStatusAction).toHaveBeenCalledTimes(1);
    expect(duplicatePropertyAction).not.toHaveBeenCalled();

    vol.liberer({ ok: true, data: { id: 47, status: 'under_maintenance' } });
    await toastAttendu('success', 'Statut mis à jour.');
    await waitFor(() => expect(declencheur).toBeEnabled());
  });

  it.each([
    { geste: 'Archiver', action: () => vi.mocked(updatePropertyStatusAction) },
    { geste: 'Dépublier', action: () => vi.mocked(updatePropertyVisibilityAction) },
  ])('« $geste » confirmé puis rappuyé pendant l’envoi : une seule action part', async ({ geste, action }) => {
    const vol = enAttente();
    action().mockReturnValue(vol.promesse as never);
    const user = rendre(menu);

    await choisir(user, geste);
    const dialogue = await screen.findByRole('dialog');
    const confirmer = within(dialogue).getByRole('button', { name: geste });
    await user.click(confirmer);
    await waitFor(() => expect(confirmer).toBeDisabled());
    expect(within(dialogue).getByRole('button', { name: 'Annuler' })).toBeDisabled();
    await user.click(confirmer);

    expect(action()).toHaveBeenCalledTimes(1);
    vol.liberer({ ok: true, data: { status: 'archived' } });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

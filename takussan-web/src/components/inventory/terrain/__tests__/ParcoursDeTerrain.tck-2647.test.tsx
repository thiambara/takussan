/**
 * TCK-2647 — le parcours de terrain d'un brouillon d'état des lieux (maquette `app-etats-des-lieux`,
 * approche A) : une pièce par écran.
 *
 *  · AC3 — chaque élément montre son libellé et son propre groupe Bon · Usé · Abîmé ; un élément
 *    non touché reste NON QUALIFIÉ (`state: null`), il ne prend pas « Bon » par défaut ;
 *  · AC4 — la photo s'ouvre sur l'appareil arrière, part une par une, et un échec ne bloque pas la
 *    suivante : la refusée est réessayée à la fin du passage, puis au retour du réseau ;
 *  · AC5 — « Pièce suivante » ENREGISTRE (un `PATCH`, la pièce marquée terminée) AVANT d'avancer ; un
 *    échec garde la saisie, le dit et propose « Réessayer » ; la reprise rouvre la première pièce
 *    non terminée ;
 *  · AC6 — en sortie, l'état d'entrée est rappelé, l'élément pire qu'à l'entrée se dit « Dégradé »,
 *    une retenue ne se propose que pour « Abîmé », et les retenues se somment face à la caution.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import type { Inventory, InventoryRoom } from '@/types/inventory';

const { etat, patch, upload, routeur, reduire, journal } = vi.hoisted(() => ({
  etat: { bureau: false, bail: null as unknown, entree: null as unknown },
  patch: { mutateAsync: vi.fn(), isPending: false },
  upload: { mutateAsync: vi.fn(), isPending: false },
  routeur: { push: vi.fn(), replace: vi.fn() },
  reduire: vi.fn(),
  // L'ordre des appels au réseau, `PATCH` et `POST …/room-photos` mêlés.
  journal: [] as string[],
}));

vi.mock('@/lib/queries/inventory', () => ({
  inventoryKeys: { detail: (id: number) => ['inventory', 'detail', id] },
  useContexteDuBail: () => ({ data: etat.bail ? { data: etat.bail } : undefined }),
  useInventory: () => ({ data: etat.entree ? { data: etat.entree } : undefined }),
  useUpdateInventory: () => patch,
  useUploadInventoryRoomPhotos: () => upload,
}));
vi.mock('next/navigation', () => ({ useRouter: () => routeur }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => etat.bureau, useMatchesMaxWidth: () => !etat.bureau }));
// La réduction sous 5 Mo a ses propres tests (TCK-596) : ici, on vérifie qu'elle est APPELÉE, avec le
// plafond de l'API, et que c'est sa sortie qui part.
vi.mock('@/lib/reduire-photo', () => ({ reduirePhotosSousPlafond: reduire }));

import { ParcoursDeTerrain } from '../ParcoursDeTerrain';

function piece(name: string, completed: boolean, labels: readonly string[] = ['Murs', 'Sol', 'Fenêtre']): InventoryRoom {
  return { name, condition: 'good', notes: null, completed, elements: labels.map((label) => ({ label, state: null, notes: null })) };
}

function brouillon(overrides: Partial<Inventory> = {}): Inventory {
  return {
    id: 7,
    lease_id: 208,
    property_id: 2,
    type: 'move_in',
    conducted_by: 1,
    tenant_id: 4,
    conducted_at: '2026-11-13T09:00:00Z',
    status: 'draft',
    general_condition: 'good',
    rooms: [piece('Séjour', false), piece('Cuisine', false), piece('Chambre 1', false)],
    notes: null,
    tenant_signed: false,
    tenant_signed_at: null,
    owner_signed: false,
    owner_signed_at: null,
    created_at: '2026-11-13T09:00:00Z',
    room_photos: [],
    can_sign_as: [],
    sign_on_behalf_of: null,
    abilities: { update: true },
    ...overrides,
  };
}

function ouvrir(inventory: Inventory, pieceDemandee: number | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><ParcoursDeTerrain inventory={inventory} pieceDemandee={pieceDemandee} /></QueryClientProvider>));
}

/** Le corps du dernier `PATCH` envoyé. */
function dernierPatch(): { rooms: InventoryRoom[] } {
  return patch.mutateAsync.mock.calls.at(-1)?.[0] as { rooms: InventoryRoom[] };
}

const titreDeLaPiece = () => screen.getByRole('heading', { level: 1 }).textContent;

beforeEach(() => {
  etat.bureau = false;
  etat.bail = { id: 208, reference_number: 'BL-208', status: 'active', start_date: null, end_date: null, deposit_amount: '150000.00', property_id: 2, property: { id: 2, title: 'F3 Grand Yoff', type: 'apartment', bedrooms: 2 }, tenant: { first_name: 'Yacine', last_name: 'Ndiaye' } };
  etat.entree = null;
  journal.length = 0;
  patch.mutateAsync.mockReset().mockImplementation(async () => {
    journal.push('PATCH');
    return { data: {} };
  });
  upload.mutateAsync.mockReset().mockImplementation(async (v: { roomName: string; elementLabel?: string }) => {
    journal.push(`PHOTO ${v.roomName}${v.elementLabel ? ` / ${v.elementLabel}` : ''}`);
    return { data: {} };
  });
  reduire.mockReset().mockImplementation(async (f: File[]) => f);
  routeur.push.mockReset();
  routeur.replace.mockReset();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:apercu'), revokeObjectURL: vi.fn() }));
});

afterEach(() => vi.unstubAllGlobals());

describe('TCK-2647 — une pièce par écran (AC3)', () => {
  it('chaque élément montre son libellé et son propre groupe Bon · Usé · Abîmé, aucun pré-choisi', () => {
    ouvrir(brouillon());
    for (const label of ['Murs', 'Sol', 'Fenêtre']) {
      const groupe = screen.getByRole('radiogroup', { name: `État : ${label}` });
      expect(within(groupe).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Bon', 'Usé', 'Abîmé']);
      expect(within(groupe).getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(0);
    }
    expect(screen.getByText('0 élément sur 3')).toBeInTheDocument();
  });

  it('un toucher qualifie l’élément ; les autres partent NON qualifiés (`state: null`), sans retenue en entrée', async () => {
    const user = userEvent.setup();
    ouvrir(brouillon());
    await user.click(within(screen.getByRole('radiogroup', { name: 'État : Sol' })).getByRole('radio', { name: 'Usé' }));
    expect(screen.getByText('1 élément sur 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Pièce suivante : Cuisine/ }));
    await waitFor(() => expect(patch.mutateAsync).toHaveBeenCalledTimes(1));
    const [sejour] = dernierPatch().rooms;
    expect(sejour.elements).toEqual([
      { label: 'Murs', state: null, notes: null },
      { label: 'Sol', state: 'usé', notes: null },
      { label: 'Fenêtre', state: null, notes: null },
    ]);
  });

  it('« Abîmé » ouvre « Précisez » et la photo de l’élément', async () => {
    const user = userEvent.setup();
    ouvrir(brouillon());
    expect(screen.queryByRole('button', { name: 'Photo de l’élément : Murs' })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('radiogroup', { name: 'État : Murs' })).getByRole('radio', { name: 'Abîmé' }));
    expect(screen.getByRole('button', { name: 'Photo de l’élément : Murs' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Précisez/)).toBeInTheDocument();
  });
});

describe('TCK-2647 — enregistrer avant d’avancer, et reprendre (AC5)', () => {
  it('« Pièce suivante » envoie UN `PATCH` (la pièce terminée) et n’avance qu’à sa réponse', async () => {
    const user = userEvent.setup();
    let repondre: (v: unknown) => void = () => undefined;
    patch.mutateAsync.mockReturnValueOnce(new Promise((r) => (repondre = r)));
    ouvrir(brouillon());
    expect(titreDeLaPiece()).toBe('Séjour');

    await user.click(screen.getByRole('button', { name: /Pièce suivante : Cuisine/ }));
    expect(patch.mutateAsync).toHaveBeenCalledTimes(1);
    expect(dernierPatch().rooms.map((r) => r.completed)).toEqual([true, false, false]);
    // La réponse n'est pas arrivée : l'écran reste sur la pièce.
    expect(titreDeLaPiece()).toBe('Séjour');

    await act(async () => repondre({ data: {} }));
    expect(titreDeLaPiece()).toBe('Cuisine');
    expect(screen.getByText(/^2/, { selector: 'span' })).toHaveTextContent('2 / 3');
  });

  it('un échec du réseau garde la saisie, le dit, propose « Réessayer » — et réessayer avance', async () => {
    const user = userEvent.setup();
    patch.mutateAsync.mockRejectedValueOnce(new Error('réseau'));
    ouvrir(brouillon());
    await user.click(within(screen.getByRole('radiogroup', { name: 'État : Murs' })).getByRole('radio', { name: 'Bon' }));

    await user.click(screen.getByRole('button', { name: /Pièce suivante : Cuisine/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Le brouillon n’a pas pu être enregistré : votre saisie est gardée.');
    expect(titreDeLaPiece()).toBe('Séjour');
    expect(within(screen.getByRole('radiogroup', { name: 'État : Murs' })).getByRole('radio', { name: 'Bon' })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('button', { name: /^Réessayer/ }));
    await waitFor(() => expect(titreDeLaPiece()).toBe('Cuisine'));
    expect(patch.mutateAsync).toHaveBeenCalledTimes(2);
    expect(dernierPatch().rooms[0].elements?.[0]).toMatchObject({ label: 'Murs', state: 'bon' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reprend à la première pièce non terminée', () => {
    ouvrir(brouillon({ rooms: [piece('Séjour', true), piece('Cuisine', true), piece('Chambre 1', false), piece('Salle de bain', false)] }));
    expect(titreDeLaPiece()).toBe('Chambre 1');
    expect(screen.getByText('3', { exact: false, selector: 'span' })).toHaveTextContent('3 / 4');
  });

  it('`?piece=` l’emporte sur la reprise (« Revoir les pièces »)', () => {
    ouvrir(brouillon({ rooms: [piece('Séjour', true), piece('Cuisine', true), piece('Chambre 1', false)] }), 1);
    expect(titreDeLaPiece()).toBe('Séjour');
  });

  it('la dernière pièce « Terminer les pièces » enregistre puis mène au récapitulatif et aux signatures (TCK-2648)', async () => {
    const user = userEvent.setup();
    ouvrir(brouillon({ rooms: [piece('Séjour', true), piece('Cuisine', false)] }));
    await user.click(screen.getByRole('button', { name: /Terminer les pièces/ }));
    await waitFor(() => expect(routeur.replace).toHaveBeenCalledWith('/app/inventories/7?etape=signatures'));
    expect(dernierPatch().rooms.map((r) => r.completed)).toEqual([true, true]);
  });
});

describe('TCK-2647 — les photos sur le terrain (AC4)', () => {
  const photo = (n: number) => new File([`photo-${n}`], `photo-${n}.jpg`, { type: 'image/jpeg' });
  const entreeAppareil = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[data-slot="entree-appareil"]')!;
  const entreeGalerie = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[data-slot="entree-galerie"]')!;

  it('« Prendre une photo » ouvre l’appareil ARRIÈRE (`capture="environment"`), la galerie non', () => {
    const { container } = ouvrir(brouillon());
    expect(entreeAppareil(container)).toHaveAttribute('capture', 'environment');
    expect(entreeGalerie(container)).not.toHaveAttribute('capture');
    expect(screen.getByRole('button', { name: 'Prendre une photo' })).toBeInTheDocument();
  });

  it('trois photos partent une par une ; la 2ᵉ refusée n’arrête pas la 3ᵉ et est réessayée à la fin', async () => {
    const user = userEvent.setup();
    upload.mutateAsync.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('réseau')).mockResolvedValue({});
    const { container } = ouvrir(brouillon());
    await user.upload(entreeGalerie(container), [photo(1), photo(2), photo(3)]);

    await waitFor(() => expect(upload.mutateAsync).toHaveBeenCalledTimes(4));
    const envoyes = upload.mutateAsync.mock.calls.map(([v]) => (v as { files: File[] }).files.map((f) => f.name));
    expect(envoyes).toEqual([['photo-1.jpg'], ['photo-2.jpg'], ['photo-3.jpg'], ['photo-2.jpg']]);
    for (const [v] of upload.mutateAsync.mock.calls) expect(v).toMatchObject({ roomName: 'Séjour' });
    await waitFor(() => expect(screen.queryByAltText('Photo en attente d’envoi')).not.toBeInTheDocument());
  });

  it('refusée deux fois, la photo reste « en attente du réseau » et repart au retour du réseau', async () => {
    const user = userEvent.setup();
    upload.mutateAsync.mockRejectedValueOnce(new Error('réseau')).mockRejectedValueOnce(new Error('réseau')).mockResolvedValue({});
    const { container } = ouvrir(brouillon());
    await user.upload(entreeAppareil(container), [photo(1)]);

    expect(await screen.findByText(/1 en attente du réseau/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer l’envoi' })).toBeInTheDocument();
    expect(upload.mutateAsync).toHaveBeenCalledTimes(2);

    await act(async () => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(upload.mutateAsync).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByText(/en attente du réseau/)).not.toBeInTheDocument());
  });

  it('une photo prise pendant le second tour d’un passage part quand même', async () => {
    const user = userEvent.setup();
    let liberer: (v: unknown) => void = () => undefined;
    upload.mutateAsync
      .mockRejectedValueOnce(new Error('réseau')) // photo 1, premier tour
      .mockImplementationOnce(() => new Promise((r) => (liberer = r))); // photo 1, second tour : en vol
    const { container } = ouvrir(brouillon());
    await user.upload(entreeGalerie(container), [photo(1)]);
    await waitFor(() => expect(upload.mutateAsync).toHaveBeenCalledTimes(2));

    // La photo 2 arrive pendant que le second tour réessaie la photo 1.
    await user.upload(entreeGalerie(container), [photo(2)]);
    await act(async () => liberer({ data: {} }));

    await waitFor(() => expect(upload.mutateAsync).toHaveBeenCalledTimes(3));
    expect((upload.mutateAsync.mock.calls[2][0] as { files: File[] }).files[0].name).toBe('photo-2.jpg');
    await waitFor(() => expect(screen.queryByAltText('Photo en attente d’envoi')).not.toBeInTheDocument());
  });

  it('chaque photo est réduite sous le plafond de l’API (5 Mo), et c’est la réduite qui part', async () => {
    const user = userEvent.setup();
    const reduite = new File(['r'], 'reduite.jpg', { type: 'image/jpeg' });
    reduire.mockResolvedValueOnce([reduite]);
    const { container } = ouvrir(brouillon());
    await user.upload(entreeAppareil(container), [photo(1)]);
    await waitFor(() => expect(upload.mutateAsync).toHaveBeenCalledTimes(1));
    expect(reduire).toHaveBeenCalledWith([expect.objectContaining({ name: 'photo-1.jpg' })], 5 * 1024 * 1024);
    expect((upload.mutateAsync.mock.calls[0][0] as { files: File[] }).files).toEqual([reduite]);
  });

  it('une photo d’un élément AJOUTÉ depuis le dernier enregistrement enregistre la pièce d’abord (l’API ne connaît que les pièces enregistrées)', async () => {
    const user = userEvent.setup();
    const { container } = ouvrir(brouillon());
    await user.click(screen.getByRole('button', { name: 'Ajouter un élément' }));
    await user.type(screen.getByRole('textbox', { name: 'Nom de l’élément' }), 'Climatiseur{Enter}');
    await user.click(within(screen.getByRole('radiogroup', { name: 'État : Climatiseur' })).getByRole('radio', { name: 'Abîmé' }));
    const entrees = container.querySelectorAll<HTMLInputElement>('input[data-slot="entree-appareil"]');
    await user.upload(entrees[entrees.length - 1], photo(4));

    await waitFor(() => expect(journal).toEqual(['PATCH', 'PHOTO Séjour / Climatiseur']));
    expect(dernierPatch().rooms[0].elements?.map((e) => e.label)).toEqual(['Murs', 'Sol', 'Fenêtre', 'Climatiseur']);
  });

  it('sans changement depuis le dernier enregistrement, la photo part sans `PATCH`', async () => {
    const user = userEvent.setup();
    const { container } = ouvrir(brouillon());
    await user.upload(entreeAppareil(container), [photo(1)]);
    await waitFor(() => expect(journal).toEqual(['PHOTO Séjour']));
  });

  it('une photo REFUSÉE (422) quitte la file sans attendre le réseau, et l’écran le dit', async () => {
    const user = userEvent.setup();
    upload.mutateAsync.mockRejectedValueOnce(new ApiError(422, { message: 'La photo est illisible.' }));
    const { container } = ouvrir(brouillon());
    await user.upload(entreeAppareil(container), [photo(1)]);
    expect(await screen.findByRole('alert')).toHaveTextContent('La photo est illisible.');
    expect(upload.mutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/en attente du réseau/)).not.toBeInTheDocument();
  });

  it('« Terminer les pièces » ne quitte pas le parcours tant qu’une photo attend le réseau', async () => {
    const user = userEvent.setup();
    upload.mutateAsync.mockRejectedValue(new Error('réseau'));
    const { container } = ouvrir(brouillon({ rooms: [piece('Séjour', false)] }));
    await user.upload(entreeAppareil(container), [photo(1)]);
    expect(await screen.findByText(/1 en attente du réseau/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Terminer les pièces/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('1 photo n’est pas encore envoyée');
    expect(routeur.replace).not.toHaveBeenCalled();

    // Le réseau revient : « Terminer » rend la main.
    upload.mutateAsync.mockImplementation(async () => ({ data: {} }));
    await user.click(screen.getByRole('button', { name: /Terminer les pièces/ }));
    await waitFor(() => expect(routeur.replace).toHaveBeenCalledWith('/app/inventories/7?etape=signatures'));
  });

  it('« Enregistrer et quitter » non plus', async () => {
    const user = userEvent.setup();
    etat.bureau = true;
    upload.mutateAsync.mockRejectedValue(new Error('réseau'));
    const { container } = ouvrir(brouillon());
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!, [photo(1)]);
    await waitFor(() => expect(upload.mutateAsync).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: 'Enregistrer et quitter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('1 photo n’est pas encore envoyée');
    expect(routeur.push).not.toHaveBeenCalled();
  });

  it('la photo d’un élément abîmé porte le libellé de l’élément', async () => {
    const user = userEvent.setup();
    const { container } = ouvrir(brouillon());
    await user.click(within(screen.getByRole('radiogroup', { name: 'État : Murs' })).getByRole('radio', { name: 'Abîmé' }));
    const entree = container.querySelectorAll<HTMLInputElement>('input[data-slot="entree-appareil"]');
    // La première est celle de la pièce, la seconde celle de l'élément.
    expect(entree).toHaveLength(2);
    await user.upload(entree[1], photo(9));
    await waitFor(() => expect(upload.mutateAsync).toHaveBeenCalledWith({ files: [expect.any(File)], roomName: 'Séjour', elementLabel: 'Murs' }));
  });
});

describe('TCK-2647 — la sortie comparée à l’entrée (AC6)', () => {
  function sortie(elements: InventoryRoom['elements']): Inventory {
    return brouillon({
      type: 'move_out',
      entry_inventory_id: 19,
      rooms: [{ name: 'Séjour', condition: 'good', notes: null, completed: false, elements }],
    });
  }

  it('rappelle l’état d’entrée, dit « Dégradé » et ne propose la retenue que pour « Abîmé »', () => {
    ouvrir(
      sortie([
        { label: 'Murs', state: 'endommagé', notes: 'trou', entry_state: 'bon' },
        { label: 'Sol', state: 'usé', notes: null, entry_state: 'bon' },
        { label: 'Porte', state: 'bon', notes: null, entry_state: 'bon' },
      ]),
    );
    const lignes = document.querySelectorAll<HTMLElement>('[data-slot="ligne-d-element"]');
    expect(lignes).toHaveLength(3);
    const [murs, sol, porte] = Array.from(lignes);
    for (const l of [murs, sol, porte]) expect(l).toHaveTextContent('Entrée : Bon');
    expect(murs).toHaveTextContent('Dégradé');
    expect(within(murs).getByRole('button', { name: 'Ajouter une retenue' })).toBeInTheDocument();
    // « Usé » est une usure normale : ni « Dégradé », ni retenue.
    expect(sol).not.toHaveTextContent('Dégradé');
    expect(within(sol).queryByRole('button', { name: 'Ajouter une retenue' })).not.toBeInTheDocument();
    expect(porte).not.toHaveTextContent('Dégradé');
  });

  it('35 000 + 50 000 font « 85 000 F » de retenues proposées, sur la caution du bail', async () => {
    const user = userEvent.setup();
    ouvrir(
      sortie([
        { label: 'Murs', state: 'endommagé', notes: 'trou', entry_state: 'bon', retention_amount: '35000.00' },
        { label: 'Fenêtre', state: 'endommagé', notes: 'vitre fêlée', entry_state: 'bon' },
      ]),
    );
    const total = () => screen.getByText('Retenues proposées').closest('p') as HTMLElement;
    expect(total()).toHaveTextContent(/35\s000\sF/);

    const fenetre = document.querySelectorAll<HTMLElement>('[data-slot="ligne-d-element"]')[1];
    await user.click(within(fenetre).getByRole('button', { name: 'Ajouter une retenue' }));
    const champ = screen.getByRole('textbox', { name: 'Montant de la retenue : Fenêtre' });
    expect(champ).toHaveFocus();
    await user.type(champ, '50000');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(total()).toHaveTextContent(/85\s000\sF/);
    expect(total()).toHaveTextContent(/sur 150\s000\sF/);

    await user.click(screen.getByRole('button', { name: /Terminer les pièces/ }));
    await waitFor(() => expect(patch.mutateAsync).toHaveBeenCalled());
    expect(dernierPatch().rooms[0].elements?.map((e) => e.retention_amount)).toEqual([35000, 50000]);
  });
});

describe('TCK-2647 — au bureau, la liste des pièces à côté de la pièce', () => {
  it('rend la liste des pièces (la courante marquée) et la pièce en tableau, dans une grille à deux colonnes', () => {
    etat.bureau = true;
    const { container } = ouvrir(brouillon({ rooms: [piece('Séjour', true), piece('Cuisine', false), piece('Chambre 1', false)] }));
    const liste = screen.getByRole('region', { name: 'Les pièces' });
    expect(within(liste).getByRole('button', { name: /2\. Cuisine/ })).toHaveAttribute('aria-current', 'step');
    expect(within(liste).getByLabelText('terminée')).toBeInTheDocument();
    const tableau = screen.getByRole('table');
    expect(within(tableau).getAllByRole('radiogroup')).toHaveLength(3);
    const grille = liste.parentElement as HTMLElement;
    expect(grille).toContainElement(tableau);
    expect(grille.className).toMatch(/xl:grid-cols-\[/);
    expect(container.querySelector('[data-slot="parcours-de-terrain"]')).not.toBeNull();
  });
});

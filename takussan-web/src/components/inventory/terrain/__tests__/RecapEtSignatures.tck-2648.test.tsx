/**
 * TCK-2648 — « Récapitulatif et signatures » (maquette `app-etats-des-lieux`, approche A, écran a-2).
 *
 *  · AC1 — « Lui envoyer un code par SMS » appelle `POST …/sign/onsite-code` ; le bon code et le tracé
 *    partent ensemble (`POST …/sign`, `role=tenant`, `code`, `signature`). Un code faux se dit SOUS
 *    les cases, et le tracé reste ;
 *  · les erreurs de l'API se disent sur le bon champ : pas de téléphone et SMS non parti sous l'envoi,
 *    verrou sous le code (qui se ferme) ; un code déjà parti (429) ouvre quand même les cases ;
 *  · un brouillon se FIGE au premier geste (`POST …/submit`) : refusé, rien ne part ;
 *  · l'agence signe pour le bailleur (`role=landlord`) ;
 *  · le récapitulatif : les comptes, les réserves (Usé, Abîmé, Manquant) avec leur note et leur photo ;
 *  · « Terminer » ne s'active que les deux signatures posées, et ne promet aucun envoi ;
 *  · AC5 — le tracé plein écran : « Effacer » et « Valider » à 44 px (`h-11`).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import type { Inventory, InventoryRoom } from '@/types/inventory';

const { etat, envoyer, signer, soumettre, patch, routeur, journal } = vi.hoisted(() => ({
  etat: { bureau: false },
  envoyer: { mutateAsync: vi.fn(), isPending: false },
  signer: { mutateAsync: vi.fn(), isPending: false },
  soumettre: { mutateAsync: vi.fn(), isPending: false },
  patch: { mutateAsync: vi.fn(), isPending: false },
  routeur: { push: vi.fn(), replace: vi.fn() },
  // L'ordre des appels au réseau.
  journal: [] as string[],
}));

vi.mock('@/lib/queries/inventory', () => ({
  inventoryKeys: { detail: (id: number) => ['inventory', 'detail', id] },
  useContexteDuBail: () => ({
    data: {
      data: {
        id: 208,
        reference_number: 'LS-7KQ2ME',
        status: 'active',
        start_date: null,
        end_date: null,
        deposit_amount: null,
        property_id: 2,
        property: { id: 2, title: 'Appartement F3 · Mermoz' },
        tenant: { first_name: 'Aminata', last_name: 'Diop' },
      },
    },
  }),
  useEnvoyerCodeSurPlace: () => envoyer,
  useSignInventory: () => signer,
  useSubmitInventory: () => soumettre,
  useUpdateInventory: () => patch,
}));
vi.mock('next/navigation', () => ({ useRouter: () => routeur }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => etat.bureau, useMatchesMaxWidth: () => !etat.bureau }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { full_name: 'Sokhna Sène' } }) }));

import { RecapEtSignatures } from '../RecapEtSignatures';
import { elide } from '../SignaturesSurPlace';

const TRACE = 'data:image/png;base64,TRACE';

function stubCanvas() {
  const context = {
    lineCap: '',
    lineJoin: '',
    lineWidth: 0,
    strokeStyle: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    scale: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  HTMLCanvasElement.prototype.getContext = vi.fn((id: string) => (id === '2d' ? context : null)) as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = () => TRACE;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
}

const piece = (name: string, elements: InventoryRoom['elements']): InventoryRoom => ({ name, condition: 'good', notes: null, completed: true, elements });

function etatDesLieux(overrides: Partial<Inventory> = {}): Inventory {
  return {
    id: 19,
    lease_id: 208,
    property_id: 2,
    property: { id: 2, title: 'Appartement F3 · Mermoz', slug: 'f3-mermoz' },
    type: 'move_in',
    conducted_by: 1,
    tenant_id: 4,
    conducted_at: '2026-11-13T10:30:00Z',
    status: 'pending_signature',
    general_condition: 'good',
    rooms: [
      piece('Séjour', [
        { label: 'Murs', state: 'bon', notes: null },
        { label: 'Porte', state: 'endommagé', notes: 'Poignée intérieure cassée' },
      ]),
      piece('Cuisine', [
        { label: 'Évier', state: 'usé', notes: 'Joint noirci' },
        { label: 'Hotte', state: 'manquant', notes: null },
        { label: 'Sol', state: 'bon', notes: null },
      ]),
    ],
    notes: null,
    tenant_signed: false,
    tenant_signed_at: null,
    owner_signed: false,
    owner_signed_at: null,
    created_at: '2026-11-13T09:00:00Z',
    room_photos: [
      { room_name: 'Séjour', photos: [{ id: 1, url: 'https://x/1', preview_url: 'https://x/1p', room_name: 'Séjour', element_label: 'Porte' }] },
      { room_name: 'Cuisine', photos: [{ id: 2, url: 'https://x/2', preview_url: 'https://x/2p', room_name: 'Cuisine', element_label: null }] },
    ],
    can_sign_as: ['tenant_onsite', 'landlord'],
    sign_on_behalf_of: { id: 9, full_name: 'Mouhamed Sène' },
    abilities: { update: true, dispute: false },
    tenant: { id: 4, full_name: 'Aminata Diop', first_name: 'Aminata' },
    landlord: { id: 9, full_name: 'Mouhamed Sène' },
    ...overrides,
  };
}

function ouvrir(inventory: Inventory = etatDesLieux()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>
    <RecapEtSignatures inventory={inventory} />
  </QueryClientProvider>));
}

const blocDuLocataire = () => screen.getByRole('heading', { name: 'Locataire · Aminata Diop' }).closest('section') as HTMLElement;
const blocDeLAgence = () => screen.getByRole('heading', { name: 'Agence, pour le bailleur · Sokhna Sène' }).closest('section') as HTMLElement;

/** Ouvre le tracé plein écran du bloc, trace un trait, et valide. */
async function tracer(user: ReturnType<typeof userEvent.setup>, bloc: HTMLElement) {
  await user.click(within(bloc).getByRole('button', { name: /Signer ici/ }));
  const fenetre = await screen.findByRole('dialog');
  const canevas = within(fenetre).getByTestId('signature-canvas');
  fireEvent.pointerDown(canevas, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerMove(canevas, { clientX: 40, clientY: 40, pointerId: 1, buttons: 1 });
  fireEvent.pointerUp(canevas, { clientX: 40, clientY: 40, pointerId: 1 });
  await user.click(within(fenetre).getByRole('button', { name: 'Valider' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

beforeEach(() => {
  stubCanvas();
  etat.bureau = false;
  journal.length = 0;
  for (const m of [envoyer, signer, soumettre, patch]) {
    m.mutateAsync.mockReset();
    m.isPending = false;
  }
  routeur.replace.mockReset();
  envoyer.mutateAsync.mockImplementation(async () => {
    journal.push('POST onsite-code');
    return { data: { channel: 'sms', destination: '+221 77 ••• 18 90' } };
  });
  signer.mutateAsync.mockImplementation(async (corps: { role: string }) => {
    journal.push(`POST sign ${corps.role}`);
    return { data: {} };
  });
  soumettre.mutateAsync.mockImplementation(async () => {
    journal.push('POST submit');
    return { data: {} };
  });
  patch.mutateAsync.mockResolvedValue({ data: {} });
});

describe('TCK-2648 — la signature du locataire sur place (AC1)', () => {
  it('le code part par SMS, puis le tracé et les six chiffres partent ensemble', async () => {
    const user = userEvent.setup();
    ouvrir();

    await user.click(within(blocDuLocataire()).getByRole('button', { name: 'Lui envoyer un code par SMS' }));
    expect(journal).toEqual(['POST onsite-code']);
    expect(blocDuLocataire()).toHaveTextContent('Code reçu par Aminata au +221 77 ••• 18 90');
    expect(within(blocDuLocataire()).getByText('Code attendu')).toBeInTheDocument();

    await tracer(user, blocDuLocataire());
    expect(within(blocDuLocataire()).getByRole('img', { name: 'Signature de Aminata Diop' })).toHaveAttribute('src', TRACE);

    await user.type(within(blocDuLocataire()).getByRole('textbox'), '123456');
    await waitFor(() => expect(signer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(signer.mutateAsync).toHaveBeenCalledWith({ role: 'tenant', signature: TRACE, code: '123456' });
    expect(journal).toEqual(['POST onsite-code', 'POST sign tenant']);
  });

  it('un code faux se dit sous les cases, le tracé reste, et le même code ne repart pas', async () => {
    const user = userEvent.setup();
    signer.mutateAsync.mockRejectedValueOnce(new ApiError(422, { message: 'Code invalide ou expiré.', errors: { code: ['Code invalide ou expiré.'] } }));
    ouvrir();

    await user.click(within(blocDuLocataire()).getByRole('button', { name: 'Lui envoyer un code par SMS' }));
    await tracer(user, blocDuLocataire());
    const champ = within(blocDuLocataire()).getByRole('textbox');
    await user.type(champ, '111111');

    const alerte = await within(blocDuLocataire()).findByRole('alert');
    expect(alerte).toHaveTextContent('Code invalide ou expiré.');
    expect(champ).toHaveAttribute('aria-describedby', alerte.id);
    expect(within(blocDuLocataire()).getByRole('img', { name: 'Signature de Aminata Diop' })).toBeInTheDocument();

    // Refaire le tracé ne renvoie pas le code refusé : chaque essai faux compte pour le verrou.
    await user.click(within(blocDuLocataire()).getByRole('button', { name: 'Refaire' }));
    const fenetre = await screen.findByRole('dialog');
    const canevas = within(fenetre).getByTestId('signature-canvas');
    fireEvent.pointerDown(canevas, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(canevas, { clientX: 40, clientY: 40, pointerId: 1, buttons: 1 });
    await user.click(within(fenetre).getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(signer.mutateAsync).toHaveBeenCalledTimes(1);

    // Corriger le code relance l'essai, avec le MÊME tracé.
    await user.clear(champ);
    await user.type(champ, '222222');
    await waitFor(() => expect(signer.mutateAsync).toHaveBeenCalledTimes(2));
    expect(signer.mutateAsync).toHaveBeenLastCalledWith({ role: 'tenant', signature: TRACE, code: '222222' });
  });

  it('le code saisi avant le tracé part au « Valider » du tracé', async () => {
    const user = userEvent.setup();
    ouvrir();
    await user.click(within(blocDuLocataire()).getByRole('button', { name: 'Lui envoyer un code par SMS' }));
    await user.type(within(blocDuLocataire()).getByRole('textbox'), '123456');
    expect(signer.mutateAsync).not.toHaveBeenCalled();
    expect(blocDuLocataire()).toHaveTextContent('Faites d’abord tracer sa signature');

    await tracer(user, blocDuLocataire());
    await waitFor(() => expect(signer.mutateAsync).toHaveBeenCalledWith({ role: 'tenant', signature: TRACE, code: '123456' }));
  });

  it('le verrou (423) se dit sous le code, et ferme les cases', async () => {
    const user = userEvent.setup();
    signer.mutateAsync.mockRejectedValueOnce(new ApiError(423, { code: 'inventory_signature.code_locked', message: 'Trop de codes faux : la signature sur place est bloquée pendant 15 minutes.' }));
    ouvrir();
    await user.click(within(blocDuLocataire()).getByRole('button', { name: 'Lui envoyer un code par SMS' }));
    await tracer(user, blocDuLocataire());
    await user.type(within(blocDuLocataire()).getByRole('textbox'), '999999');

    expect(await within(blocDuLocataire()).findByRole('alert')).toHaveTextContent('bloquée pendant 15 minutes');
    expect(within(blocDuLocataire()).getByRole('textbox')).toBeDisabled();
  });

  it('pas de téléphone vérifié : l’erreur se dit sous l’envoi, et aucune case ne s’ouvre', async () => {
    const user = userEvent.setup();
    envoyer.mutateAsync.mockRejectedValueOnce(
      new ApiError(422, { code: 'inventory_signature.tenant_without_phone', message: 'Le locataire n’a pas de compte avec un numéro vérifié : il signe depuis son compte.' }),
    );
    ouvrir();
    await user.click(within(blocDuLocataire()).getByRole('button', { name: 'Lui envoyer un code par SMS' }));

    expect(await within(blocDuLocataire()).findByRole('alert')).toHaveTextContent('il signe depuis son compte');
    expect(within(blocDuLocataire()).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('un code déjà parti (429, page rechargée) ouvre quand même les cases', async () => {
    const user = userEvent.setup();
    envoyer.mutateAsync.mockRejectedValueOnce(
      new ApiError(429, { code: 'inventory_signature.resend_too_soon', message: 'Un code vient d’être envoyé : patientez une minute avant d’en demander un autre.' }),
    );
    ouvrir();
    await user.click(within(blocDuLocataire()).getByRole('button', { name: 'Lui envoyer un code par SMS' }));

    expect(within(blocDuLocataire()).getByRole('textbox')).toBeInTheDocument();
    expect(blocDuLocataire()).toHaveTextContent('Code reçu par Aminata par SMS');
    expect(within(blocDuLocataire()).getByRole('alert')).toHaveTextContent('patientez une minute');
  });

  it('« Renvoyer le code » attend le délai de l’API', async () => {
    const user = userEvent.setup();
    ouvrir();
    await user.click(within(blocDuLocataire()).getByRole('button', { name: 'Lui envoyer un code par SMS' }));
    expect(within(blocDuLocataire()).getByRole('button', { name: 'Renvoyer le code' })).toBeDisabled();
    expect(blocDuLocataire()).toHaveTextContent('(dans 1:00)');
  });

  it('un brouillon se fige au premier geste : `submit` AVANT l’envoi du code ; refusé, rien ne part', async () => {
    const user = userEvent.setup();
    const { unmount } = ouvrir(etatDesLieux({ status: 'draft' }));
    await user.click(within(blocDuLocataire()).getByRole('button', { name: 'Lui envoyer un code par SMS' }));
    expect(journal).toEqual(['POST submit', 'POST onsite-code']);
    unmount();

    journal.length = 0;
    envoyer.mutateAsync.mockClear();
    soumettre.mutateAsync.mockRejectedValueOnce(
      new ApiError(422, { code: 'inventory.unqualified_elements', message: 'Chaque élément doit avoir un état avant la soumission à signature.' }),
    );
    ouvrir(etatDesLieux({ status: 'draft' }));
    await user.click(within(blocDuLocataire()).getByRole('button', { name: 'Lui envoyer un code par SMS' }));
    expect(await within(blocDuLocataire()).findByRole('alert')).toHaveTextContent('Chaque élément doit avoir un état');
    expect(envoyer.mutateAsync).not.toHaveBeenCalled();
  });

  it('un état des lieux soumis ne se re-soumet pas', async () => {
    const user = userEvent.setup();
    ouvrir();
    await user.click(within(blocDuLocataire()).getByRole('button', { name: 'Lui envoyer un code par SMS' }));
    expect(soumettre.mutateAsync).not.toHaveBeenCalled();
  });
});

describe('TCK-2648 — l’agence signe pour le bailleur', () => {
  it('« Signer ici » puis « Valider » envoie `role=landlord` et le tracé, au titre du mandat', async () => {
    const user = userEvent.setup();
    ouvrir();
    expect(blocDeLAgence()).toHaveTextContent('Mandat de gestion de Mouhamed Sène');
    await tracer(user, blocDeLAgence());
    await waitFor(() => expect(signer.mutateAsync).toHaveBeenCalledWith({ role: 'landlord', signature: TRACE }));
  });

  it('AC5 — le tracé plein écran : « Effacer » et « Valider » à 44 px', async () => {
    const user = userEvent.setup();
    ouvrir();
    await user.click(within(blocDeLAgence()).getByRole('button', { name: /Signer ici/ }));
    const fenetre = await screen.findByRole('dialog');
    expect(fenetre.className).toMatch(/max-md:h-dvh/);
    for (const nom of ['Effacer', 'Valider']) expect(within(fenetre).getByRole('button', { name: nom }).className).toMatch(/\bh-11\b/);
  });
});

describe('TCK-2648 — le récapitulatif', () => {
  it('les comptes, et les réserves (Usé, Abîmé, Manquant) avec leur note et la photo de l’élément', () => {
    ouvrir();
    const chiffres = document.querySelector('[data-slot="chiffres-du-recap"]') as HTMLElement;
    // Chaque compte est la définition (`dd`) de son libellé (`dt`).
    const compte = (libelle: string) => within(chiffres).getByText(libelle).nextElementSibling?.textContent;
    expect(compte('pièces')).toBe('2');
    expect(compte('éléments')).toBe('5');
    expect(compte('photos')).toBe('2');

    expect(screen.getByRole('heading', { name: '3 réserves' })).toBeInTheDocument();
    const reserves = within(document.querySelector('[data-slot="reserves"]') as HTMLElement).getAllByRole('listitem');
    expect(reserves.map((r) => r.textContent)).toEqual([
      'Séjour — PortePoignée intérieure casséeAbîmé',
      'Cuisine — ÉvierJoint noirciUsé',
      'Cuisine — HotteManquant',
    ]);
    expect(within(reserves[0]).getByRole('img')).toHaveAttribute('src', 'https://x/1p');
    // La photo de la PIÈCE (sans élément) n'illustre pas une réserve.
    expect(within(reserves[1]).queryByRole('img')).not.toBeInTheDocument();
  });

  it('« Terminer » attend les deux signatures, dit ce qui manque, et ne promet aucun envoi', async () => {
    const user = userEvent.setup();
    const { unmount } = ouvrir();
    const terminer = screen.getByRole('button', { name: 'Terminer' });
    expect(terminer).toBeDisabled();
    expect(screen.getByText('Il manque la signature d’Aminata et la signature de l’agence')).toBeInTheDocument();
    expect(screen.queryByText(/envoyer le PDF/)).not.toBeInTheDocument();
    unmount();

    ouvrir(etatDesLieux({ status: 'signed', tenant_signed: true, owner_signed: true, signed_at: '2026-11-13T11:00:00Z', can_sign_as: [] }));
    await user.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(routeur.replace).toHaveBeenCalledWith('/app/inventories/19');
  });

  it('le code parti, il manque « le code d’Aminata »', async () => {
    const user = userEvent.setup();
    ouvrir(etatDesLieux({ owner_signed: true }));
    expect(screen.getByText('Il manque la signature d’Aminata')).toBeInTheDocument();
    await user.click(within(blocDuLocataire()).getByRole('button', { name: 'Lui envoyer un code par SMS' }));
    expect(screen.getByText('Il manque le code d’Aminata')).toBeInTheDocument();
  });

  it('l’élision : « d’Aminata », « d’Émile », mais « de Yacine » et « de Moussa »', () => {
    expect(['Aminata', 'Émile', 'Ousmane', 'Yacine', 'Moussa', 'Habib'].map(elide)).toEqual([true, true, true, false, false, false]);
  });

  it('« Tout relire » : le parcours sur un brouillon, les pièces de la fiche une fois figé', () => {
    const { unmount } = ouvrir(etatDesLieux({ status: 'draft' }));
    expect(screen.getByRole('link', { name: 'Tout relire' })).toHaveAttribute('href', '/app/inventories/19?piece=1');
    unmount();
    ouvrir();
    expect(screen.getByRole('link', { name: 'Tout relire' })).toHaveAttribute('href', '/app/inventories/19#pieces');
  });

  it('sans `tenant_onsite`, le locataire signe depuis son compte : aucun code ne s’offre', () => {
    ouvrir(etatDesLieux({ can_sign_as: ['landlord'] }));
    expect(blocDuLocataire()).toHaveTextContent('Signe depuis son compte.');
    expect(screen.queryByRole('button', { name: 'Lui envoyer un code par SMS' })).not.toBeInTheDocument();
  });

  it('l’état général se modifie sur un brouillon, et se lit une fois figé', async () => {
    const user = userEvent.setup();
    const { unmount } = ouvrir(etatDesLieux({ status: 'draft' }));
    await user.click(screen.getByRole('radio', { name: 'Correct' }));
    expect(patch.mutateAsync).toHaveBeenCalledWith({ general_condition: 'fair' });
    unmount();

    ouvrir();
    expect(screen.getByRole('radio', { name: 'Correct' })).toHaveAttribute('aria-disabled', 'true');
  });
});

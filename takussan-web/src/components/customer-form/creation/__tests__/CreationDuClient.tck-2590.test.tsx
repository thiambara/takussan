/**
 * TCK-2590 — la création d'un client en deux temps : le doublon paraît PENDANT la frappe (sonde
 * `GET /api/customers/duplicates`, avant tout envoi), « Créer quand même » à l'envoi (409), ce qu'il
 * cherche part avec la fiche, « Compléter plus tard » la crée sans sa recherche, et rien du formulaire
 * d'avant ne se perd (seize types sous « Plus », profession, langue, étape, pièce).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, refresh: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/customers',
  useSearchParams: () => new URLSearchParams(),
}));
const api = vi.hoisted(() => ({ lire: vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: api.lire,
}));
const action = vi.hoisted(() => ({ creer: vi.fn() }));
vi.mock('@/app/actions/dashboard-customers', () => ({
  createCustomerAction: (...args: unknown[]) => action.creer(...args),
  updateCustomerAction: vi.fn(),
}));

import { CreationDuClient } from '../CreationDuClient';

function ouvrir() {
  return render(withIntl(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <CreationDuClient open onClose={vi.fn()} />
  </QueryClientProvider>));
}

/** Le bureau (dès `xl`) : un seul panneau ; sinon, deux temps. */
function bureau(oui: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({
    matches: oui && q.includes('80rem'),
    media: q,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as MediaQueryList);
}

const sondes = () => api.lire.mock.calls.filter(([chemin]) => String(chemin).startsWith('/api/customers/duplicates'));

beforeEach(() => {
  nav.push.mockReset();
  action.creer.mockReset();
  // La fiche de Mariama (+221 70 648 20 56) répond à son numéro et à tout préfixe de sept chiffres
  // ou plus — ce que l'API sonde (TCK-2590) ; rien d'autre.
  api.lire.mockReset().mockImplementation(async (chemin: string) => {
    const chiffres = new URL(String(chemin), 'http://x').searchParams.get('phone')?.replace(/^\+221/, '') ?? '';
    return chiffres.length >= 7 && '706482056'.startsWith(chiffres) ? { data: [{ id: 41, name: 'Mariama Fall', stage: 'prospect' }] } : { data: [] };
  });
  bureau(false);
});
afterEach(() => vi.restoreAllMocks());

async function identite(user: ReturnType<typeof userEvent.setup>, telephone: string) {
  await user.type(screen.getByLabelText(/Prénom/), 'Astou');
  await user.type(screen.getByLabelText(/^Nom/), 'Mbengue');
  await user.type(screen.getByLabelText('Téléphone'), telephone);
}

describe('le doublon dit pendant la frappe', () => {
  it('« Déjà dans vos clients : Mariama Fall » paraît dès « 70 648 20 », avant tout envoi, et ouvre sa fiche (AC3)', async () => {
    const user = userEvent.setup();
    ouvrir();
    await identite(user, '70 648 20');
    const alerte = await screen.findByText('Déjà dans vos clients');
    const zone = alerte.closest('[role="status"]') as HTMLElement;
    expect(within(zone).getByRole('link', { name: 'Ouvrir la fiche de Mariama Fall' })).toHaveAttribute('href', '/app/customers/41');
    expect(within(zone).getByText('Prospect · même numéro')).toBeInTheDocument();
    expect(action.creer).not.toHaveBeenCalled();
    // Une sonde par saisie, temporisée — pas une par touche — et sur le préfixe tel quel.
    expect(sondes()).toHaveLength(1);
    expect(String(sondes()[0][0])).toContain('phone=%2B2217064820');
  });

  it('six chiffres ne sondent pas ; une autre saisie efface le doublon de la précédente', async () => {
    const user = userEvent.setup();
    ouvrir();
    await identite(user, '70 648 2');
    await new Promise((r) => setTimeout(r, 600));
    expect(sondes()).toHaveLength(0);
    await user.type(screen.getByLabelText('Téléphone'), '0 56');
    await screen.findByText('Déjà dans vos clients');
    await user.type(screen.getByLabelText('Téléphone'), '{Backspace}7');
    await waitFor(() => expect(screen.queryByText('Déjà dans vos clients')).toBeNull());
  });

  it('un numéro frappé d’un trait ne sonde qu’une fois, sur sa forme finale : la frappe est temporisée (route limitée à 20 par minute)', async () => {
    const user = userEvent.setup();
    ouvrir();
    // Sept, huit puis neuf chiffres : trois saisies sondables, une seule sonde.
    await identite(user, '70 648 20 56');
    await screen.findByText('Déjà dans vos clients');
    await new Promise((r) => setTimeout(r, 600));
    expect(sondes()).toHaveLength(1);
    expect(String(sondes()[0][0])).toContain('phone=%2B221706482056');
  });

  it('le doublon d’une saisie périmée s’efface AVANT la sonde de la nouvelle, pas à sa réponse', async () => {
    const user = userEvent.setup();
    ouvrir();
    await identite(user, '70 648 20 56');
    await screen.findByText('Déjà dans vos clients');
    const avant = sondes().length;
    await user.type(screen.getByLabelText('Téléphone'), '{Backspace}7');
    // Pendant la temporisation : la nouvelle saisie n'est pas encore partie, et l'ancien doublon
    // n'est déjà plus montré.
    expect(sondes()).toHaveLength(avant);
    expect(screen.queryByText('Déjà dans vos clients')).toBeNull();
  });

  it('« Créer quand même » à l’envoi : le 409 montre la fiche, et le renvoi porte allow_duplicate', async () => {
    bureau(true);
    action.creer
      .mockResolvedValueOnce({ ok: false, status: 409, message: 'doublon', duplicates: [{ id: 41, name: 'Mariama Fall', matched_on: 'phone' }] })
      .mockResolvedValueOnce({ ok: true, data: { id: 99 } });
    const user = userEvent.setup();
    ouvrir();
    // Un numéro que la sonde ne connaît pas : seul l'envoi découvre le doublon.
    await identite(user, '77 305 44 91');
    await user.click(screen.getByRole('button', { name: 'Créer la fiche' }));
    await user.click(await screen.findByRole('button', { name: 'Créer quand même' }));
    await waitFor(() => expect(action.creer).toHaveBeenCalledTimes(2));
    expect(action.creer.mock.calls[0][0]).not.toHaveProperty('allow_duplicate');
    expect(action.creer.mock.calls[1][0]).toMatchObject({ allow_duplicate: true });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/app/customers/99'));
  });
});

describe('les deux temps', () => {
  it('« Continuer » exige l’identité ; la recherche part avec la fiche', async () => {
    action.creer.mockResolvedValueOnce({ ok: true, data: { id: 12 } });
    const user = userEvent.setup();
    ouvrir();
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(screen.queryByText('Type de bien')).toBeNull();

    await identite(user, '77 305 44 91');
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await user.click(await screen.findByRole('radio', { name: 'Louer' }));
    await user.click(screen.getByRole('button', { name: 'Studio' }));
    const quartiers = screen.getByLabelText('Quartiers');
    await user.type(quartiers, 'Mermoz{Enter}Ouakam,');
    fireEvent.change(screen.getByLabelText('Budget par mois'), { target: { value: '3' } });
    expect(screen.getByText('≤ 250 000 F')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Créer la fiche d’Astou' }));

    await waitFor(() => expect(action.creer).toHaveBeenCalledTimes(1));
    expect(action.creer.mock.calls[0][0]).toMatchObject({
      first_name: 'Astou',
      last_name: 'Mbengue',
      seeking_contract_type: 'rent',
      seeking_property_types: ['studio'],
      seeking_neighborhoods: ['Mermoz', 'Ouakam'],
      budget_max: 250000,
    });
    expect(nav.push).toHaveBeenCalledWith('/app/customers/12');
  });

  it('« Compléter plus tard » crée la fiche sans sa recherche', async () => {
    action.creer.mockResolvedValueOnce({ ok: true, data: { id: 13 } });
    const user = userEvent.setup();
    ouvrir();
    await identite(user, '77 305 44 91');
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await user.click(await screen.findByRole('button', { name: 'Studio' }));
    await user.click(screen.getByRole('button', { name: 'Compléter plus tard' }));
    await waitFor(() => expect(action.creer).toHaveBeenCalledTimes(1));
    expect(action.creer.mock.calls[0][0]).not.toHaveProperty('seeking_property_types');
  });
});

describe('rien ne se perd du formulaire d’avant', () => {
  it('les seize types sous « Plus » ; profession, langue, étape, pièce et villes sous « Plus de champs »', async () => {
    bureau(true);
    const user = userEvent.setup();
    ouvrir();
    const types = screen.getByRole('group', { name: 'Type de bien' });
    expect(within(types).getAllByRole('button', { pressed: false })).toHaveLength(6);
    await user.click(within(types).getByRole('button', { name: 'Plus' }));
    expect(within(types).getAllByRole('button', { pressed: false })).toHaveLength(16);

    await user.click(screen.getByRole('button', { name: /Plus de champs/ }));
    for (const libelle of ['Profession', 'Chambres, au moins', 'Numéro', 'Budget minimum (FCFA)', 'Villes']) {
      expect(screen.getByLabelText(libelle)).toBeInTheDocument();
    }
    for (const libelle of ['Langue des messages', 'Pièce d’identité', 'Étape du pipeline']) {
      expect(screen.getAllByText(libelle).length).toBeGreaterThan(0);
    }
  });

  it('sous le pouce, le second temps renvoie ces champs à « Modifier » de la fiche, et le dit', async () => {
    bureau(false);
    const user = userEvent.setup();
    ouvrir();
    await identite(user, '77 305 44 91');
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await screen.findByRole('radio', { name: 'Louer' });
    expect(screen.queryByRole('button', { name: /Plus de champs/ })).toBeNull();
    expect(screen.getByText(/Profession, langue, pièce d’identité, chambres, étape, villes et budget minimum : dans « Modifier »/)).toBeInTheDocument();
  });
});

describe('fermer abandonne la saisie (vérification adverse de TCK-2590)', () => {
  function Liste() {
    const [ouvert, setOuvert] = useState(true);
    return (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <button type="button" onClick={() => setOuvert(true)}>Rouvrir</button>
        <CreationDuClient open={ouvert} onClose={() => setOuvert(false)} />
      </QueryClientProvider>
    );
  }
  const avertit = () => {
    const evenement = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(evenement);
    return evenement.defaultPrevented;
  };

  it('« Annuler » au bureau : rouverte, la création est vide, sans doublon, et le départ n’est plus retenu', async () => {
    bureau(true);
    const user = userEvent.setup();
    render(withIntl(<Liste />));
    await identite(user, '70 648 20');
    await screen.findByText('Déjà dans vos clients');
    expect(avertit()).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(avertit()).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Rouvrir' }));

    expect(await screen.findByLabelText(/Prénom/)).toHaveValue('');
    expect(screen.getByLabelText('Téléphone')).toHaveValue('');
    expect(screen.queryByText('Déjà dans vos clients')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Prénom/), 'Awa');
    expect(screen.getByLabelText(/Prénom/)).toHaveValue('Awa');
  });

  it('Échap au téléphone : même abandon', async () => {
    const user = userEvent.setup();
    render(withIntl(<Liste />));
    await user.type(screen.getByLabelText(/Prénom/), 'Astou');
    await user.keyboard('{Escape}');
    expect(avertit()).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Rouvrir' }));
    expect(await screen.findByLabelText(/Prénom/)).toHaveValue('');
  });
});

/**
 * TCK-2964 (ADR-0128 § 4) — poser un objet depuis le composeur :
 *
 * · « Partager un bien » appelle `POST /api/conversations/{id}/cards` avec le SEUL `{object: {type, id}}` ;
 * · « Proposer un créneau » crée d'abord la visite par SA route (`POST /api/property-visits`, la fiche du
 *   client lue dans `…/context`), puis pose sa carte ; si la carte échoue, la reprise ne recrée pas la
 *   visite ;
 * · sans fiche client, rien ne part ;
 * · les entrées n'existent que pour le personnel (`actif`), et le trombone se nomme alors autrement.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock('@/components/ui/date-time-picker', () => ({
  DateTimePicker: ({ id, value, onValueChange }: { id?: string; value?: string; onValueChange: (v: string) => void }) => (
    <input id={id} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));

// Le sélecteur de bien (combobox base-ui, éprouvé par ses propres tests) : un bouton qui choisit le bien 12.
vi.mock('../../GroupContextPicker', () => ({
  GroupPropertyPicker: ({ inputId, onChange }: { inputId: string; onChange: (o: unknown) => void }) => (
    <button type="button" id={inputId} onClick={() => onChange({ id: 12, label: 'Appartement Mermoz', detail: null })}>
      choisir le bien
    </button>
  ),
}));

const { PartagerUnBien, ProposerUnCreneau, usePoserDansLeFil } = await import('../PoserDansLeFil');
const { BoutonDePieceJointe } = await import('../../composeur/PieceJointeDuComposeur');

function monter(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

/** Les appels d'écriture (POST), dans l'ordre : chemin et corps. */
function ecritures(): Array<{ chemin: string; corps: unknown }> {
  return apiRequest.mock.calls
    .filter(([, options]) => (options as { method?: string } | undefined)?.method === 'POST')
    .map(([chemin, options]) => ({ chemin: chemin as string, corps: (options as { body?: unknown }).body }));
}

function contexte(customer: { id: number } | null) {
  apiRequest.mockImplementation(async (chemin: string, options?: { method?: string }) => {
    if (chemin === '/api/conversations/7/context' && !options?.method) {
      return { data: { property: null, lease: null, maintenance: null, customer: customer && { ...customer, full_name: 'Malick Seck', stage: null, phone: null, assigned_agent: null } } };
    }
    if (chemin === '/api/property-visits') return { data: { id: 99, status: 'confirmed', customer_id: customer?.id ?? null } };
    if (chemin === '/api/conversations/7/cards') return { data: { id: 500 } };
    throw new Error(`appel inattendu : ${chemin}`);
  });
}

const DANS_UNE_HEURE = () => {
  const d = new Date(Date.now() + 3_600_000 * 24);
  return d.toISOString().slice(0, 16);
};

beforeEach(() => {
  apiRequest.mockReset();
});

describe('Partager un bien', () => {
  it('pose la carte avec le seul {object}', async () => {
    contexte(null);
    const ferme = vi.fn();
    monter(<PartagerUnBien conversationId={7} open onOpenChange={ferme} />);

    const partager = screen.getByRole('button', { name: 'Partager' });
    expect(partager).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Bien' }));
    fireEvent.click(partager);

    await waitFor(() => expect(ferme).toHaveBeenCalledWith(false));
    expect(ecritures()).toEqual([{ chemin: '/api/conversations/7/cards', corps: { object: { type: 'property', id: 12 } } }]);
  });
});

describe('Proposer un créneau', () => {
  it('crée la visite par sa route, puis pose sa carte', async () => {
    contexte({ id: 5 });
    const ferme = vi.fn();
    monter(<ProposerUnCreneau conversationId={7} open onOpenChange={ferme} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Bien' }));
    const moment = DANS_UNE_HEURE();
    fireEvent.change(screen.getByLabelText('Moment de la visite'), { target: { value: moment } });
    const proposer = screen.getByRole('button', { name: 'Proposer ce créneau' });
    await waitFor(() => expect(proposer).toBeEnabled());
    fireEvent.click(proposer);

    await waitFor(() => expect(ferme).toHaveBeenCalledWith(false));
    expect(ecritures()).toEqual([
      { chemin: '/api/property-visits', corps: { property_id: 12, customer_id: 5, scheduled_at: new Date(moment).toISOString() } },
      { chemin: '/api/conversations/7/cards', corps: { object: { type: 'property_visit', id: 99 } } },
    ]);
  });

  it('une carte en échec se repose sans recréer la visite', async () => {
    contexte({ id: 5 });
    let cartes = 0;
    const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (chemin: string, options?: { method?: string }) => {
      if (chemin === '/api/conversations/7/cards' && cartes++ === 0) throw new ApiError(500, { message: 'boom' });
      return base(chemin, options);
    });
    const ferme = vi.fn();
    monter(<ProposerUnCreneau conversationId={7} open onOpenChange={ferme} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Bien' }));
    fireEvent.change(screen.getByLabelText('Moment de la visite'), { target: { value: DANS_UNE_HEURE() } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Proposer ce créneau' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Proposer ce créneau' }));

    const reposer = await screen.findByRole('button', { name: 'Poser la carte de la visite' });
    expect(screen.getByText('La visite est créée, mais sa carte n’a pas pu être posée.')).toBeInTheDocument();
    fireEvent.click(reposer);

    await waitFor(() => expect(ferme).toHaveBeenCalledWith(false));
    const chemins = ecritures().map((e) => e.chemin);
    expect(chemins.filter((c) => c === '/api/property-visits')).toHaveLength(1);
    expect(chemins.filter((c) => c === '/api/conversations/7/cards')).toHaveLength(2);
  });

  it('une visite qui n’est pas planifiée pour la fiche (bien hors agence) n’est pas posée', async () => {
    contexte({ id: 5 });
    const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (chemin: string, options?: { method?: string }) =>
      chemin === '/api/property-visits' ? { data: { id: 98, status: 'scheduled', customer_id: null } } : base(chemin, options),
    );
    monter(<ProposerUnCreneau conversationId={7} open onOpenChange={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Bien' }));
    fireEvent.change(screen.getByLabelText('Moment de la visite'), { target: { value: DANS_UNE_HEURE() } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Proposer ce créneau' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Proposer ce créneau' }));

    expect(await screen.findByText(/n’est pas géré par votre agence/)).toBeInTheDocument();
    expect(ecritures().map((e) => e.chemin)).toEqual(['/api/property-visits']);
  });

  it('sans fiche client, le dit et ne propose rien', async () => {
    contexte(null);
    monter(<ProposerUnCreneau conversationId={7} open onOpenChange={() => {}} />);

    expect(await screen.findByText(/n’a pas de fiche dans votre agence/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bien' }));
    fireEvent.change(screen.getByLabelText('Moment de la visite'), { target: { value: DANS_UNE_HEURE() } });
    expect(screen.getByRole('button', { name: 'Proposer ce créneau' })).toBeDisabled();
    expect(ecritures()).toEqual([]);
  });
});

function Composeur({ actif }: { readonly actif: boolean }) {
  const poser = usePoserDansLeFil({ conversationId: 7, actif });
  return (
    <>
      <BoutonDePieceJointe onChoisir={() => {}} appareilPhoto={false} entrees={poser.entrees} />
      {poser.feuilles}
    </>
  );
}

describe('les entrées du composeur', () => {
  it('le personnel voit « Joindre ou partager » ; sinon le trombone reste celui des pièces', () => {
    contexte(null);
    const { unmount } = monter(<Composeur actif />);
    expect(screen.getByRole('button', { name: 'Joindre ou partager' })).toBeInTheDocument();
    unmount();

    monter(<Composeur actif={false} />);
    expect(screen.getByRole('button', { name: 'Joindre une photo ou un document' })).toBeInTheDocument();
  });

  it('« Partager un bien » ouvre sa feuille', async () => {
    contexte(null);
    monter(<Composeur actif />);
    fireEvent.click(screen.getByRole('button', { name: 'Joindre ou partager' }));
    fireEvent.click(await screen.findByTestId('poser-un-bien'));
    expect(await screen.findByRole('button', { name: 'Partager' })).toBeInTheDocument();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { PrivacyRequestsConsole } from '../PrivacyRequestsConsole';
import type { PrivacyRequest } from '@/types/privacy-request';

/**
 * TCK-601 (G) — « Demandes de droits » : la vue se lit par échéance, une demande en retard se
 * voit immédiatement, une demande reçue par courriel se saisit, et la réponse se dépose avec sa
 * preuve.
 */

const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: toastAdd }),
}));

function demande(overrides: Partial<PrivacyRequest> = {}): PrivacyRequest {
  return {
    id: 1,
    user_id: null,
    requester_name: 'Aïssatou Ba',
    requester_contact: 'aissatou@example.test',
    type: 'access',
    channel: 'email',
    status: 'received',
    received_at: '2026-09-01T00:00:00Z',
    due_at: '2026-10-01T00:00:00Z',
    answered_at: null,
    response_summary: null,
    handled_by: null,
    data_export_id: null,
    account_deletion_request_id: null,
    is_overdue: false,
    proof: null,
    created_at: '2026-09-01T09:00:00Z',
    ...overrides,
  };
}

/** Rendues par l'API dans l'ordre de `sort=due_at` : la plus proche échéance d'abord. */
const LISTE = [
  demande({ id: 7, requester_name: 'Moussa Faye', type: 'erasure', due_at: '2026-09-20T00:00:00Z', is_overdue: true }),
  demande({ id: 3, requester_name: 'Aïssatou Ba', type: 'access', due_at: '2026-10-15T00:00:00Z' }),
  demande({
    id: 9, requester_name: 'Ndèye Sow', type: 'portability', status: 'answered',
    due_at: '2026-11-02T00:00:00Z', proof: { file_name: 'reponse.pdf', size: 52_000 },
  }),
];

function page(data: PrivacyRequest[], total = data.length) {
  return {
    data,
    meta: { total, current_page: 1, last_page: 1, per_page: 25 },
    links: { first: null, last: null, prev: null, next: null },
  };
}

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Les appels de LISTE (GET sur la collection), URL décodée. */
function listes(): URL[] {
  return fetchMock.mock.calls
    .filter(([, init]) => !init || !(init as RequestInit).method || (init as RequestInit).method === 'GET')
    .map(([u]) => new URL(String(u), 'http://localhost'))
    .filter((u) => u.pathname === '/api/super-admin/privacy-requests');
}

function appelsEcriture(): Array<[string, RequestInit]> {
  return fetchMock.mock.calls.filter(
    ([, init]) => init && ['POST', 'PATCH'].includes(String((init as RequestInit).method)),
  ) as Array<[string, RequestInit]>;
}

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(
    <QueryClientProvider client={client}><PrivacyRequestsConsole /></QueryClientProvider>,
  ));
}

beforeEach(() => {
  toastAdd.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (u: string, init?: RequestInit) => {
    const url = new URL(u, 'http://localhost');
    if (init?.method === 'POST' || init?.method === 'PATCH') {
      return json({ data: demande({ id: 42 }) }, init.method === 'POST' && !url.pathname.match(/\d+$/) ? 201 : 200);
    }
    if (url.searchParams.get('filter[overdue]') === '1') {
      return json(page([LISTE[0]], 1));
    }
    return json(page(LISTE));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<PrivacyRequestsConsole> (TCK-601 · G)', () => {
  it('lit le registre par échéance : sort=due_at, et les lignes dans cet ordre', async () => {
    monter();
    await screen.findByTestId('privacy-request-7');

    const principale = listes().find((u) => !u.searchParams.has('filter[overdue]'));
    expect(principale?.searchParams.get('sort')).toBe('due_at');

    const lignes = screen.getAllByRole('row').slice(1);
    expect(lignes.map((l) => l.getAttribute('data-testid'))).toEqual([
      'privacy-request-7', 'privacy-request-3', 'privacy-request-9',
    ]);
    // Les colonnes de la direction UX : échéance, type, demandeur, reçue le, statut, preuve.
    const entetes = within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(entetes.slice(0, 6)).toEqual([
      'Échéance', 'Type', 'Demandeur', 'Reçue le', 'Statut', 'Preuve de réponse',
    ]);
  });

  it('une demande en retard se voit immédiatement : dans sa ligne, et par le compte en tête', async () => {
    monter();
    const enRetard = await screen.findByTestId('privacy-request-7');
    expect(within(enRetard).getByText('En retard')).toBeInTheDocument();
    expect(within(screen.getByTestId('privacy-request-3')).queryByText('En retard')).not.toBeInTheDocument();

    const resume = await screen.findByTestId('privacy-overdue-summary');
    expect(resume).toHaveTextContent('1 demande a dépassé son échéance');
    // Le compte vient de l'API (`filter[overdue]=1`), pas de la page affichée.
    expect(listes().some((u) => u.searchParams.get('filter[overdue]') === '1')).toBe(true);
  });

  it('« En retard seulement » filtre côté serveur', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByTestId('privacy-request-7');
    const avant = listes().length;

    await user.click(screen.getByRole('button', { name: 'En retard seulement' }));
    await waitFor(() => expect(listes().length).toBeGreaterThan(avant));
    const derniere = listes().at(-1)!;
    expect(derniere.searchParams.get('filter[overdue]')).toBe('1');
    expect(derniere.searchParams.get('per_page')).toBe('25');
  });

  it('la preuve de réponse s’affiche par son nom', async () => {
    monter();
    const ligne = await screen.findByTestId('privacy-request-9');
    expect(ligne).toHaveTextContent('reponse.pdf');
  });

  it('saisit une demande reçue par courriel : POST JSON au registre', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByTestId('privacy-request-7');

    await user.click(screen.getByRole('button', { name: 'Enregistrer une demande' }));
    const dialogue = await screen.findByRole('dialog');
    await user.type(within(dialogue).getByLabelText('Nom du demandeur'), 'Cheikh Ndiaye');
    await user.type(within(dialogue).getByLabelText('Contact du demandeur'), 'cheikh@example.test');
    await user.click(within(dialogue).getByRole('button', { name: 'Enregistrer la demande' }));

    await waitFor(() => expect(appelsEcriture()).toHaveLength(1));
    const [url, init] = appelsEcriture()[0];
    expect(url).toBe('/api/super-admin/privacy-requests');
    expect(init.method).toBe('POST');
    const corps = JSON.parse(String(init.body));
    expect(corps).toMatchObject({
      type: 'access',
      channel: 'email',
      requester_name: 'Cheikh Ndiaye',
      requester_contact: 'cheikh@example.test',
    });
    expect(corps.received_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Demande enregistrée', type: 'success' }),
    ));
  });

  it('répond avec preuve : multipart, `_method=PATCH`, statut et fichier', async () => {
    const user = userEvent.setup();
    monter();
    const ligne = await screen.findByTestId('privacy-request-3');

    await user.click(within(ligne).getByRole('button', { name: 'Mettre à jour la demande de Aïssatou Ba' }));
    const dialogue = await screen.findByRole('dialog');

    await user.click(within(dialogue).getByRole('combobox', { name: 'Statut' }));
    await user.click(await screen.findByRole('option', { name: 'Répondue' }));
    await user.type(within(dialogue).getByLabelText('Résumé de la réponse'), 'Copie des données envoyée.');
    const fichier = new File(['%PDF-1.4'], 'reponse.pdf', { type: 'application/pdf' });
    await user.upload(within(dialogue).getByLabelText('Preuve de réponse'), fichier);
    await user.click(within(dialogue).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(appelsEcriture()).toHaveLength(1));
    const [url, init] = appelsEcriture()[0];
    expect(url).toBe('/api/super-admin/privacy-requests/3');
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    expect(form.get('_method')).toBe('PATCH');
    expect(form.get('status')).toBe('answered');
    expect(form.get('response_summary')).toBe('Copie des données envoyée.');
    expect((form.get('proof') as File).name).toBe('reponse.pdf');
  });

  it('sans fichier, la mise à jour part en PATCH JSON', async () => {
    const user = userEvent.setup();
    monter();
    const ligne = await screen.findByTestId('privacy-request-3');
    await user.click(within(ligne).getByRole('button', { name: 'Mettre à jour la demande de Aïssatou Ba' }));
    const dialogue = await screen.findByRole('dialog');
    await user.click(within(dialogue).getByRole('combobox', { name: 'Statut' }));
    await user.click(await screen.findByRole('option', { name: 'En cours' }));
    await user.click(within(dialogue).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(appelsEcriture()).toHaveLength(1));
    const [url, init] = appelsEcriture()[0];
    expect(url).toBe('/api/super-admin/privacy-requests/3');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ status: 'in_progress' });
  });
});

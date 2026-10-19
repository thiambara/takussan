import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import type { MessagingContact } from '@/lib/queries/conversations';
import { ParticipantPicker } from '../ParticipantPicker';

/**
 * TCK-973 (P51.06) — le sélecteur retirait les personnes déjà choisies de la page de 20, côté
 * client, mais « {shown} sur {total} » comptait la page entière : cinq choisis parmi les vingt
 * premiers donnaient quinze lignes sous « 20 sur 30 », et vingt choisis une liste « Personne ne
 * correspond » sous un total non nul. Les choisis partent désormais en `filter[exclude]`, que
 * l'API applique avant la pagination : le compteur et la liste vide lisent la réponse.
 *
 * L'API est simulée au niveau de `fetch`, et elle honore `filter[exclude]` comme le serveur.
 */

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton' }),
}));

const CONTACTS: MessagingContact[] = Array.from({ length: 30 }, (_, i) => ({
  id: 100 + i,
  name: `Contact ${String(i).padStart(2, '0')}`,
  avatar_url: null,
}));

let urls: URL[] = [];

function mockApi() {
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      urls.push(url);
      const exclus = new Set(
        (url.searchParams.get('filter[exclude]') ?? '').split(',').filter(Boolean).map(Number),
      );
      const restants = CONTACTS.filter((c) => !exclus.has(c.id));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: restants.slice(0, 20),
          meta: { total: restants.length, per_page: 20, current_page: 1, last_page: Math.ceil(restants.length / 20) || 1 },
        }),
      };
    }),
  );
}

function rendre(value: MessagingContact[], excludeIds: number[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ParticipantPicker value={value} onChange={() => {}} max={50} inputId="participants" excludeIds={excludeIds} />
      </QueryClientProvider>,
    ),
  );
}

describe('<ParticipantPicker> — les choisis dans la page', () => {
  beforeEach(mockApi);
  afterEach(() => vi.unstubAllGlobals());

  it('envoie les choisis en filter[exclude], et le compteur lit la réponse', async () => {
    const user = userEvent.setup();
    const choisis = CONTACTS.slice(0, 5);
    rendre(choisis, [999]);

    await user.click(screen.getByRole('combobox'));

    expect(await screen.findByText('20 sur 25 — précisez la recherche')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(20);
    expect(screen.queryByRole('option', { name: 'Contact 00' })).not.toBeInTheDocument();

    const appel = urls.find((u) => u.pathname === '/api/conversations/contacts');
    expect(appel?.searchParams.get('filter[exclude]')).toBe('100,101,102,103,104,999');
  });

  it('vingt choisis en tête de liste : les suivants sont proposés, pas « personne »', async () => {
    const user = userEvent.setup();
    rendre(CONTACTS.slice(0, 20));

    await user.click(screen.getByRole('combobox'));

    expect(await screen.findByRole('option', { name: 'Contact 20' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(10);
    expect(screen.queryByText('Personne ne correspond à cette recherche.')).not.toBeInTheDocument();
    expect(screen.queryByText(/précisez la recherche/)).not.toBeInTheDocument();
  });

  it('sans personne choisie, aucun filter[exclude] ne part', async () => {
    const user = userEvent.setup();
    rendre([]);

    await user.click(screen.getByRole('combobox'));

    expect(await screen.findByText('20 sur 30 — précisez la recherche')).toBeInTheDocument();
    const appel = urls.find((u) => u.pathname === '/api/conversations/contacts');
    expect(appel?.searchParams.has('filter[exclude]')).toBe(false);
  });
});

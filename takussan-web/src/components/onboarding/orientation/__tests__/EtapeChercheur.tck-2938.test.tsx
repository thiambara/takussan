import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', refreshUser: vi.fn() }),
}));
vi.mock('@/lib/queries/saved-searches', () => ({
  useSavedSearchesQuery: () => ({ data: { data: [] } }),
  useCreateSavedSearchMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const HEURE = 3_600_000;
const il = (ms: number) => new Date(Date.now() - ms).toISOString();
const bien = (id: number, title: string, published_at: string | null, created_at: string) => ({
  id, title, price: 250000, rent_period: 'monthly', area: 38, main_photo_url: null,
  location: { quarter: 'Mermoz', city: 'Dakar' }, published_at, created_at,
});
/** Trois biens : publié il y a 10 h, il y a 3 jours, et sans `published_at` mais créé il y a 1 h (la date de repli de la liste). */
const apiFetch = vi.fn(async (_chemin: string) => ({
  data: [
    bien(1, 'Studio publié il y a 10 h', il(10 * HEURE), il(30 * 24 * HEURE)),
    bien(2, 'Appartement publié il y a 3 jours', il(72 * HEURE), il(72 * HEURE)),
    bien(3, 'Studio sans date de publication', null, il(HEURE)),
  ],
  meta: { total: 3 },
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiFetch: (chemin: string) => apiFetch(chemin),
}));

import { CoqueDEntree } from '@/components/entree/CoqueDEntree';

import { EtapeChercheur } from '../EtapeChercheur';

const T = frMessages.onboarding.orientation.chercheur;
const C = frMessages.coqueDEntree;

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <CoqueDEntree libelles={{ marque: 'Takussan', retourAuSite: C.retourAuSite, fermer: C.fermer, quitter: C.quitter, avancement: C.avancement, sortie: C.sortie }}>
          <EtapeChercheur marque="Takussan" quartiersSuggeres={['Mermoz']} whatsapp={null} onRetour={vi.fn()} />
        </CoqueDEntree>
      </QueryClientProvider>,
    ),
  );
}

/** La ligne de l'aperçu (maquette `ApercuResultats`) qui porte ce titre. */
async function ligne(titre: string) {
  return (await screen.findByText(titre)).closest('li')!;
}

/**
 * TCK-2938 (AC1) — la pastille « Nouveau » de l'aperçu suit la règle de la liste des biens (TCK-2499,
 * `estNouveau` : publié depuis moins de 48 h, `published_at` ou à défaut `created_at`).
 */
describe('TCK-2938 — « Nouveau » sur les lignes de l’aperçu du chercheur', () => {
  it('AC1 — publié depuis 10 h : « Nouveau » ; depuis 3 jours : non', async () => {
    monter();
    expect(within(await ligne('Studio publié il y a 10 h')).getByText(T.nouveau)).toBeInTheDocument();
    expect(within(await ligne('Appartement publié il y a 3 jours')).queryByText(T.nouveau)).toBeNull();
  });

  it('la date de repli est celle de la liste des biens : sans `published_at`, `created_at`', async () => {
    monter();
    expect(within(await ligne('Studio sans date de publication')).getByText(T.nouveau)).toBeInTheDocument();
  });
});

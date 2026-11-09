/**
 * TCK-2515 · AC2 — sur un bien retiré, « M'alerter » ouvre l'alerte PRÉREMPLIE du quartier, du type
 * et du contrat du bien.
 *
 * Ce que ce fichier garde, c'est la CHARGE UTILE qui part à l'API — pas un libellé. Le dialogue est
 * celui de la liste (`SaveSearchDialog`, TCK-599/TCK-2475) ; deux voies, deux contrats :
 *
 *   · visiteur sans compte → `POST /api/public/search-alerts`, `criteria` du bien ;
 *   · connecté → recherche sauvegardée, case d'alerte COCHÉE (le geste demande l'alerte), mêmes
 *     `criteria`.
 *
 * Chaque critère est vérifié séparément par `toEqual` sur l'objet entier : un critère oublié (le
 * type, le plus plausible) ou un critère de trop (une ville sans le quartier) rougit.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import type { PropertyListItem } from '@/types/property';

import { bienRetire, criteresDAlerte, nomDeLAlerte, type EtatRetire } from '../bien-retire';
// Le dialogue est chargé par `next/dynamic` au premier clic : l'importer ici le met en cache de
// modules, pour que son apparition ne dépende pas du temps de transformation sous charge.
import '@/components/favorites/SaveSearchDialog';

/** Mock serveur qui INTERPOLE (celui de `@/test/intl` rend le gabarit brut `{quarter}`). */
vi.mock('next-intl/server', async () => {
  const fr = (await import('@/messages/fr.json')).default as Record<string, unknown>;
  const resous = (chemin: string): string => {
    const valeur = chemin
      .split('.')
      .reduce<unknown>((n, c) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[c] : undefined), fr);
    return typeof valeur === 'string' ? valeur : chemin;
  };
  return {
    getLocale: async () => 'fr',
    getTranslations: async (espace?: string) => (cle: string, params?: Record<string, string | number>) =>
      resous(espace ? `${espace}.${cle}` : cle).replace(/\{(\w+)\}/g, (_, nom: string) =>
        params && nom in params ? String(params[nom]) : `{${nom}}`,
      ),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/fr/properties/studio-loue',
  useSearchParams: () => new URLSearchParams(''),
}));

const auth = vi.hoisted(() => ({ user: null as { id: number } | null }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, token: auth.user ? 'jeton' : null, isLoading: false }),
}));

const mutateAsync = vi.fn();
vi.mock('@/lib/queries/saved-searches', () => ({
  useCreateSavedSearchMutation: () => ({ mutateAsync, isPending: false }),
}));

vi.mock('@/components/property/PropertyCard', () => ({
  PropertyCard: ({ property }: { property: { id: number; title: string } }) => (
    <article data-testid="similaire">{property.title}</article>
  ),
}));

let appels: { url: string; method: string; body: unknown }[] = [];

function etat(surcharge: Partial<EtatRetire> = {}, similaires = 1): EtatRetire {
  return {
    state: 'rented',
    contract_type: 'rent',
    type: 'apartment',
    location: { city: 'Dakar', quarter: 'Mermoz' },
    similar: Array.from({ length: similaires }, (_, i) => ({ id: i + 1, title: `Bien ${i + 1}` }) as PropertyListItem),
    ...surcharge,
  } as EtatRetire;
}

async function rendre(e: EtatRetire) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CompareProvider>{await bienRetire(e)}</CompareProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

describe('bien retiré — « M’alerter » préremplie (TCK-2515 · AC2)', () => {
  beforeEach(() => {
    auth.user = null;
    mutateAsync.mockReset();
    appels = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        appels.push({
          url: String(url),
          method: init?.method ?? 'GET',
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        });
        if (String(url).endsWith('/capabilities')) {
          return new Response(JSON.stringify({ data: { channels: ['email'] } }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: { status: 'pending_confirmation' } }), { status: 202 });
      }),
    );
  });

  it('visiteur sans compte : l’alerte part avec le quartier, la ville, le type et le contrat du bien', async () => {
    const user = userEvent.setup();
    await rendre(etat());

    await user.click(screen.getByRole('button', { name: 'M’alerter des nouveaux biens à Mermoz' }));
    const dialogue = await screen.findByRole('dialog');
    await user.type(within(dialogue).getByLabelText('Adresse e-mail'), 'awa@example.sn');
    await user.click(within(dialogue).getByRole('checkbox'));
    await user.click(within(dialogue).getByRole('button', { name: 'Me prévenir' }));

    const envoi = appels.find((a) => a.method === 'POST' && a.url.endsWith('/public/search-alerts'));
    expect(envoi).toBeDefined();
    expect((envoi!.body as { criteria: unknown }).criteria).toEqual({
      location: 'Mermoz',
      city: 'Dakar',
      contract_type: 'rent',
      type: ['apartment'],
    });
    // Revue — le nom de l'alerte porte le quartier que les critères suivent (`suggestName` du
    // dialogue l'omettait : « Location · Dakar · Appartement »).
    expect((envoi!.body as { name: unknown }).name).toBe('Location · Appartement · Mermoz, Dakar');
  });

  it('connecté : une recherche sauvegardée, alerte COCHÉE, mêmes critères', async () => {
    auth.user = { id: 1 };
    mutateAsync.mockResolvedValue({ data: { id: 9, alert_channels: ['email'] } });
    const user = userEvent.setup();
    await rendre(etat({ state: 'sold', contract_type: 'sale', type: 'house' }));

    await user.click(screen.getByRole('button', { name: 'M’alerter des nouveaux biens à Mermoz' }));
    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByRole('checkbox')).toBeChecked();
    await user.click(within(dialogue).getByRole('button', { name: 'Enregistrer' }));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        notification_frequency: 'daily',
        criteria: { location: 'Mermoz', city: 'Dakar', contract_type: 'sale', type: ['house'] },
        name: 'Vente · Maison · Mermoz, Dakar',
      }),
    );
  });

  it('sans quartier connu : l’alerte vise la ville, sans critère de quartier', async () => {
    const user = userEvent.setup();
    await rendre(etat({ location: { city: 'Thiès', quarter: null } }));

    await user.click(screen.getByRole('button', { name: 'M’alerter des nouveaux biens à Thiès' }));
    const dialogue = await screen.findByRole('dialog');
    await user.type(within(dialogue).getByLabelText('Adresse e-mail'), 'awa@example.sn');
    await user.click(within(dialogue).getByRole('checkbox'));
    await user.click(within(dialogue).getByRole('button', { name: 'Me prévenir' }));

    const envoi = appels.find((a) => a.method === 'POST' && a.url.endsWith('/public/search-alerts'));
    expect((envoi!.body as { criteria: unknown }).criteria).toEqual({
      city: 'Thiès',
      contract_type: 'rent',
      type: ['apartment'],
    });
  });
});

describe('nomDeLAlerte — le nom suit les critères', () => {
  const libelles = { contrat: (c: string) => (c === 'rent' ? 'Location' : 'Vente'), type: (c: string) => `T:${c}` };

  it('contrat · type · quartier, ville', () => {
    expect(nomDeLAlerte(etat(), libelles)).toBe('Location · T:apartment · Mermoz, Dakar');
  });

  it('sans ville, ni ville ni quartier dans le nom (comme dans les critères)', () => {
    expect(nomDeLAlerte(etat({ location: { city: null, quarter: 'Mermoz' } }), libelles)).toBe('Location · T:apartment');
  });

  it('un type hors de l’énumération n’est pas traduit à l’aveugle', () => {
    expect(nomDeLAlerte(etat({ type: 'inconnu' }), libelles)).toBe('Location · Mermoz, Dakar');
  });
});

describe('criteresDAlerte — le quartier ne part jamais sans sa ville', () => {
  it('un quartier sans ville est écarté (homonymes d’une ville à l’autre)', () => {
    expect(criteresDAlerte(etat({ location: { city: null, quarter: 'Mermoz' } }))).toEqual({
      contract_type: 'rent',
      type: ['apartment'],
    });
  });

  it('un contrat inconnu ou absent n’entre pas dans les critères', () => {
    expect(criteresDAlerte(etat({ contract_type: null, type: null }))).toEqual({ city: 'Dakar', location: 'Mermoz' });
  });
});

describe('bien retiré — mise en page (TCK-2515)', () => {
  it('trois biens proches au plus, même quand l’API en rend six', async () => {
    await rendre(etat({}, 6));
    expect(screen.getAllByTestId('similaire')).toHaveLength(3);
  });

  it('sans bien proche, les deux suites restent : elles sont alors la seule issue (revue)', async () => {
    await rendre(etat({}, 0));
    expect(screen.getByRole('link', { name: 'Voir les biens à Mermoz, Dakar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'M’alerter des nouveaux biens à Mermoz' })).toBeInTheDocument();
  });

  it('les deux suites précèdent les biens proches, près du pli (revue)', async () => {
    await rendre(etat({}, 3));
    const alerte = screen.getByRole('button', { name: 'M’alerter des nouveaux biens à Mermoz' });
    const voir = screen.getByRole('link', { name: 'Voir les biens à Mermoz, Dakar' });
    const premiere = screen.getAllByTestId('similaire')[0]!;
    for (const suite of [voir, alerte]) {
      expect(suite.compareDocumentPosition(premiere) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('un quartier sans ville : le bouton ne promet pas le quartier que les critères écartent (revue)', async () => {
    await rendre(etat({ location: { city: null, quarter: 'Mermoz' } }));
    expect(screen.getByRole('button', { name: 'M’alerter des nouveaux biens semblables' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mermoz/ })).toBeNull();
  });

  it('sans bien proche, la phrase ne promet pas de biens proches', async () => {
    const { container } = await rendre(etat({}, 0));
    expect(screen.queryAllByTestId('similaire')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/biens proches/);
    expect(container.textContent).toContain("L'annonce que vous cherchez n'est plus disponible.");
  });
});

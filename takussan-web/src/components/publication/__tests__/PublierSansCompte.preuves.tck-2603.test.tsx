/**
 * TCK-2603 — la carte de preuves au départ de `/publish` sans compte : entre le sous-titre et la question du bien
 * (maquette a-0), lue sur `GET /api/public/publish/demand`, et absente quand l'API ne rend pas de chiffre. Les doublures
 * sont celles de `PublierSansCompte.tck-2600.test.tsx` (l'assistant entier tourne) ; seule la réponse de l'API change.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { moteurEnMemoire, ouvrirBrouillonLocal, type MoteurDeStockage } from '@/lib/publication/brouillon-local';

const routeur = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur, usePathname: () => '/publish', useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/property-form/useReferentielGeo', () => import('@/test/doublure-referentiel-geo'));
vi.mock('@/components/map/LocationPickerMapLoader', () => ({ LocationPickerMapLoader: () => <div data-testid="carte" /> }));
vi.mock('@/components/providers/UserLocationProvider', () => ({ useUserLocation: () => ({ location: null, loading: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const reduction = vi.hoisted(() => ({
  reduirePhoto: vi.fn(async (f: File) => f),
  reduirePhotos: vi.fn(async (fs: readonly File[]) => fs.map((f) => new File(['r'], `reduite-${f.name}`, { type: f.type }))),
  reduirePhotosSousPlafond: vi.fn(async (fs: readonly File[]) => [...fs]),
}));
vi.mock('@/lib/reduire-photo', () => reduction);

// Le catalogue public des équipements : la seule lecture d'API du parcours, hors géographie.
vi.mock('@/lib/queries/referentiel-public', () => ({
  useEquipementsApprouves: () => ({ data: { data: [{ id: 7, name: 'WiFi', slug: 'wifi' }] } }),
}));

// Tout ce qui écrit, ou lit sous session : on vérifie que RIEN n'est appelé.
const serveur = vi.hoisted(() => ({
  useWizardDraft: vi.fn(),
  createPropertyAction: vi.fn(),
  setPropertyTagsAction: vi.fn(),
  uploadPropertyPhotosAction: vi.fn(),
  publishPropertyAction: vi.fn(),
  replacePropertyContactsAction: vi.fn(),
}));
vi.mock('@/hooks/useWizardDraft', () => ({ useWizardDraft: serveur.useWizardDraft }));
vi.mock('@/app/actions/dashboard-properties', () => ({
  createPropertyAction: serveur.createPropertyAction,
  setPropertyTagsAction: serveur.setPropertyTagsAction,
  uploadPropertyPhotosAction: serveur.uploadPropertyPhotosAction,
}));
vi.mock('@/app/actions/publish-property', () => ({ publishPropertyAction: serveur.publishPropertyAction }));
vi.mock('@/app/actions/property-contacts', () => ({ replacePropertyContactsAction: serveur.replacePropertyContactsAction }));

import { PublierSansCompte } from '../PublierSansCompte';

const requetes: string[] = [];
const fetchOriginal = globalThis.fetch;
let demande: { city: string; searches_7d: number | null } | 'panne' = { city: 'Dakar', searches_7d: 1240 };

beforeEach(() => {
  vi.clearAllMocks();
  requetes.length = 0;
  demande = { city: 'Dakar', searches_7d: 1240 };
  globalThis.fetch = vi.fn(async (entree: RequestInfo | URL) => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
    requetes.push(url);
    if (url.includes('/api/public/publish/demand')) {
      if (demande === 'panne') throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ data: demande }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{"data":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

function monter(moteur: MoteurDeStockage | null) {
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PublierSansCompte brouillonLocal={() => ouvrirBrouillonLocal({ moteur })} />
      </QueryClientProvider>,
    ),
  );
}

const carte = () => document.querySelector('[data-preuves-du-depart]');
const appelsDeLaDemande = () => requetes.filter((u) => u.includes('/api/public/publish/demand'));

describe('la carte de preuves du départ (TCK-2603)', () => {
  it('se pose entre le sous-titre et la question du bien, avec le chiffre de l’API', async () => {
    monter(moteurEnMemoire());
    const chiffre = await screen.findByText('1\u00a0240', { normalizer: (texte) => texte });
    const sousTitre = screen.getByText('En ligne aujourd’hui · 5 minutes · un code SMS suffit');
    const question = screen.getByRole('radio', { name: /^studio$/i });

    expect(chiffre.closest('p')?.textContent).toBe('1\u00a0240recherches à Dakar cette semaine');
    expect(sousTitre.compareDocumentPosition(carte()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(carte()!.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Sans ville au départ : l'API nomme la plus recherchée.
    expect(appelsDeLaDemande()[0]).toMatch(/\/api\/public\/publish\/demand$/);
  });

  it('sous le seuil, rien ne paraît et le départ reste celui de TCK-2600', async () => {
    demande = { city: 'Dakar', searches_7d: null };
    monter(moteurEnMemoire());
    await screen.findByRole('radio', { name: /^studio$/i });
    await waitFor(() => expect(appelsDeLaDemande()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(carte()).toBeNull();
    expect(screen.queryByText(/cette semaine/)).toBeNull();
  });

  it('AC3 — API injoignable : le départ s’affiche sans la case du chiffre, sans message d’erreur', async () => {
    demande = 'panne';
    monter(moteurEnMemoire());
    await screen.findByRole('heading', { level: 1, name: 'Publiez votre bien gratuitement' });
    await waitFor(() => expect(appelsDeLaDemande()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(carte()).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('radio', { name: /^studio$/i })).toBeInTheDocument();
  });

  it('un brouillon repris qui porte une ville la demande, quand on revient au départ', async () => {
    const moteur = moteurEnMemoire();
    const premier = monter(moteur);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /^studio$/i }));
    await user.click(screen.getByRole('radio', { name: /^louer$/i }));
    await user.click(screen.getByRole('button', { name: /^continuer$/i }));
    await user.type(screen.getByLabelText(/ville/i), 'Thiès');
    // L'écriture du brouillon est différée (400 ms) : on attend qu'elle ait porté la ville.
    await new Promise((r) => setTimeout(r, 600));
    premier.unmount();

    // Le brouillon rouvre à l'étape du lieu ; revenir au départ montre la carte de SA ville.
    requetes.length = 0;
    monter(moteur);
    await screen.findByRole('heading', { level: 1, name: 'Où se trouve-t-il ?' });
    await userEvent.setup().click(screen.getByRole('button', { name: /^précédent$/i }));
    await waitFor(() => expect(appelsDeLaDemande()).toContainEqual(expect.stringMatching(/\?city=Thi%C3%A8s$/)));
    expect(appelsDeLaDemande()).toHaveLength(1);
  });
});

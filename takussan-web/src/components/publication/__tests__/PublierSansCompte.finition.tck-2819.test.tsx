/**
 * TCK-2819 (lot 3) — la finition de `/publish` d'après la maquette `app-entree-publier` (écran a-5) :
 *
 * - TCK-2988 (décision du porteur, 2026-11-21) : plus de phrase des CGU sous « Publier l’annonce » — la feuille
 *   du numéro, qui suit, la porte ; celui qui a déjà un compte les a acceptées ;
 * - « Contacts sur place » dans le dessin de l'assistant (`presentation="assistant"`), suivi de la
 *   note « C’est tout pour l’annonce ».
 *
 * | test | régression attrapée |
 * |---|---|
 * | rien sous les gestes | la phrase des CGU revenue sous « Publier l’annonce » (doublon de la feuille du numéro) |
 * | contacts | le dessin de la fiche du bien dans l'assistant |
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

beforeEach(() => {
  vi.clearAllMocks();
  requetes.length = 0;
  globalThis.fetch = vi.fn(async (entree: RequestInfo | URL) => {
    requetes.push(typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url);
    return new Response('{"data":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

function monter(moteur: MoteurDeStockage | null, surPublier?: Parameters<typeof PublierSansCompte>[0]['surPublier']) {
  // TCK-2601 — l'espace où publier se juge sur les profils relus (React Query) : le fournisseur est requis.
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient()}>
        <PublierSansCompte surPublier={surPublier} brouillonLocal={() => ouvrirBrouillonLocal({ moteur })} />
      </QueryClientProvider>,
    ),
  );
}

const suivant = () => screen.getByRole('button', { name: /^continuer$/i });

/** Studio en location, à Dakar, 250 000 F l'an, 3 photos : jusqu'à l'étape du titre. */
async function remplir(user: ReturnType<typeof userEvent.setup>, { jusquAuTitre = true } = {}) {
  await user.click(await screen.findByRole('radio', { name: /^studio$/i }));
  await user.click(screen.getByRole('radio', { name: /^louer$/i }));
  await user.click(suivant()); //                              → le lieu
  await user.type(screen.getByLabelText(/ville/i), 'Dakar');
  await user.click(suivant()); //                              → les caractéristiques
  await user.click(suivant()); //                              → le prix
  await user.type(screen.getByLabelText(/^loyer|^prix/i), '250000');
  // TCK-2819 (lot 2) — la fréquence se choisit en pastilles (« Par Mois · Semaine · Jour · An »).
  await user.click(screen.getByRole('radio', { name: /^an$/i }));
  await user.click(suivant()); //                              → les photos
  await user.upload(
    screen.getByTestId('media-dropzone-input'),
    ['salon.jpg', 'cuisine.jpg', 'chambre.jpg'].map((n) => new File(['x'], n, { type: 'image/jpeg' })),
  );
  expect(await screen.findByText('3 photos sur 10')).toBeInTheDocument();
  if (jusquAuTitre) await user.click(suivant()); //            → le titre
}

describe('la finition de /publish (maquette a-5, TCK-2819 lot 3)', () => {
  it('TCK-2988 — rien sous « Publier l’annonce » : les conditions se lisent dans la feuille du numéro, qui suit', async () => {
    const user = userEvent.setup();
    monter(moteurEnMemoire());
    await remplir(user);
    const pied = document.querySelector('[data-wizard-footer]') as HTMLElement;
    expect(within(pied).getByRole('button', { name: /^publier l’annonce$/i })).toBeInTheDocument();
    expect(pied).not.toHaveTextContent(/vous acceptez/);
    expect(within(pied).queryByRole('link', { name: 'conditions générales' })).toBeNull();
  });

  it('« Contacts sur place » dans le dessin de l’assistant, puis « C’est tout pour l’annonce »', async () => {
    const user = userEvent.setup();
    monter(moteurEnMemoire());
    await remplir(user);
    const contacts = screen.getByTestId('contacts-sur-place');
    expect(contacts).toHaveAttribute('data-presentation', 'assistant');
    expect(screen.getByText('C’est tout pour l’annonce.')).toBeInTheDocument();
    expect(contacts.compareDocumentPosition(screen.getByText('C’est tout pour l’annonce.')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

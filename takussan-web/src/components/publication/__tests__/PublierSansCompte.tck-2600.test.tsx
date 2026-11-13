/**
 * TCK-2600 (ADR-0093) — `/publish` sans compte : l'assistant entier, son brouillon gardé dans ce
 * navigateur, et aucune écriture serveur.
 *
 * - le départ (titre, liens) et AUCUNE navigation au montage (AC1) ;
 * - le parcours anonyme n'appelle ni le brouillon serveur, ni une action d'écriture, ni
 *   `/api/me/*`, `/api/properties*`, `wizard-drafts` (AC3) ;
 * - un rechargement rouvre à la même étape, mêmes valeurs, mêmes photos (AC2 — le moteur en mémoire
 *   partagé entre deux montages joue le rechargement ; IndexedDB lui-même est éprouvé au navigateur) ;
 * - les photos entrent au brouillon DÉJÀ réduites (ADR-0093 § 2) ;
 * - les champs d'agence n'y paraissent pas ; les caractéristiques d'un studio en location au mois
 *   sont exactement celles de `/app/properties/new` (AC4) ;
 * - « Publier » remet l'annonce validée à la feuille de compte ;
 * - le repli en mémoire se dit, et « Effacer ce brouillon » vide tout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

import { PublierSansCompte, type AnnonceAPublier } from '../PublierSansCompte';

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
  await user.click(screen.getByRole('combobox', { name: /fréquence/i }));
  await user.click(await screen.findByRole('option', { name: /^année$/i }));
  await user.click(suivant()); //                              → les photos
  await user.upload(
    screen.getByTestId('media-dropzone-input'),
    ['salon.jpg', 'cuisine.jpg', 'chambre.jpg'].map((n) => new File(['x'], n, { type: 'image/jpeg' })),
  );
  expect(await screen.findByText('3 photos sur 10')).toBeInTheDocument();
  if (jusquAuTitre) await user.click(suivant()); //            → le titre
}

const INTERDITES = /\/api\/me\b|\/api\/me\/|\/api\/properties|wizard-drafts/;

describe('le départ, sans compte', () => {
  it('« Publiez votre bien gratuitement », ses deux liens, et aucune navigation au montage', async () => {
    monter(moteurEnMemoire());
    expect(await screen.findByRole('heading', { level: 1, name: 'Publiez votre bien gratuitement' })).toBeInTheDocument();
    expect(screen.getByText('En ligne aujourd’hui · 5 minutes · un code SMS suffit')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Créer un compte pro' })).toHaveAttribute('href', '/auth/login?redirect=%2Fonboarding%2Fagency-admin');
    expect(screen.getByRole('link', { name: 'Me connecter' })).toHaveAttribute('href', '/auth/login?redirect=%2Fpublish&intention=publication');
    expect(routeur.push).not.toHaveBeenCalled();
    expect(routeur.replace).not.toHaveBeenCalled();
  });

  it('« Pour publier » se termine par « Votre numéro · à la fin »', async () => {
    monter(moteurEnMemoire());
    const liste = (await screen.findAllByRole('navigation', { name: 'Étapes de la publication' }))[0]!;
    expect(within(liste).getByText('Votre numéro')).toBeInTheDocument();
    expect(within(liste).getByText(/à la fin/)).toBeInTheDocument();
  });
});

describe('aucune écriture serveur, aucune lecture sous session (AC3)', () => {
  it('tout le parcours, jusqu’à « Publier » : ni brouillon serveur, ni action, ni route interdite', async () => {
    const user = userEvent.setup();
    const surPublier = vi.fn();
    monter(moteurEnMemoire(), surPublier);
    await remplir(user);
    await user.type(screen.getByLabelText(/titre de l.annonce|^titre/i), ' — vue mer');
    await user.click(screen.getByRole('button', { name: /^publier l.annonce$/i }));
    await waitFor(() => expect(surPublier).toHaveBeenCalledTimes(1));
    // Rien n'a été créé, et l'assistant ne le prend pas pour un échec (« identifiant manquant »).
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/identifiant/i)).not.toBeInTheDocument();

    expect(serveur.useWizardDraft).not.toHaveBeenCalled();
    expect(serveur.createPropertyAction).not.toHaveBeenCalled();
    expect(serveur.setPropertyTagsAction).not.toHaveBeenCalled();
    expect(serveur.uploadPropertyPhotosAction).not.toHaveBeenCalled();
    expect(serveur.publishPropertyAction).not.toHaveBeenCalled();
    expect(serveur.replacePropertyContactsAction).not.toHaveBeenCalled();
    expect(requetes.filter((u) => INTERDITES.test(u))).toEqual([]);

    // L'annonce validée, ses photos (réduites) : ce que la feuille de compte recevra.
    const [annonce] = surPublier.mock.calls[0]! as [AnnonceAPublier];
    expect(annonce.valeurs).toMatchObject({ type: 'studio', contract_type: 'rent', city: 'Dakar', price: 250000, rent_period: 'yearly' });
    expect(annonce.photos.map((f) => f.name)).toEqual(['reduite-salon.jpg', 'reduite-cuisine.jpg', 'reduite-chambre.jpg']);
    expect(annonce.contacts).toEqual([]);
  });

  // La fin du parcours, pour la feuille de compte (TCK-2601) : le brouillon est écrit AVANT qu'elle
  // s'ouvre, et ne s'efface que sur sa demande — après la publication réussie (ADR-0093 § 5).
  it('la feuille de compte reçoit l’annonce et le brouillon écrit ; il ne s’efface que si elle le demande', async () => {
    const user = userEvent.setup();
    const moteur = moteurEnMemoire();
    let annonce: AnnonceAPublier | null = null;
    let auStockageALOuverture: unknown = null;
    monter(moteur, async (a) => {
      // Relevé à l'ouverture de la feuille, vérifié hors du rappel (une erreur levée ici serait avalée
      // par l'assistant).
      auStockageALOuverture = (await moteur.lire('valeurs'))?.valeurs;
      annonce = a;
    });
    await remplir(user);
    await user.type(screen.getByLabelText(/titre de l.annonce|^titre/i), ' — vue mer');
    await user.click(screen.getByRole('button', { name: /^publier l.annonce$/i }));
    await waitFor(() => expect(annonce).not.toBeNull());
    // Au moment où la feuille s'ouvre, le brouillon est déjà au stockage, titre compris.
    expect(auStockageALOuverture).toMatchObject({ city: 'Dakar', title: expect.stringContaining('vue mer') });

    // Une publication qui échoue ou qu'on abandonne : rien n'est effacé.
    expect((await moteur.lire('photos'))?.length).toBe(3);
    await act(async () => {
      await annonce!.effacerLeBrouillon();
    });
    expect(await moteur.lire('valeurs')).toBeUndefined();
    expect(await moteur.lire('photos')).toBeUndefined();
    // Et il le reste : ni l'écriture différée (400 ms), ni celle de la fermeture de la page ne remet
    // l'annonce publiée en brouillon.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    cleanup();
    await new Promise((r) => setTimeout(r, 50));
    expect(await moteur.lire('valeurs')).toBeUndefined();
    expect(await moteur.lire('photos')).toBeUndefined();
  });

  it('sans feuille de compte, « Publier » mène à la connexion, et le brouillon reste', async () => {
    const user = userEvent.setup();
    const moteur = moteurEnMemoire();
    monter(moteur);
    await remplir(user);
    await user.click(screen.getByRole('button', { name: /^publier l.annonce$/i }));
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/auth/login?redirect=%2Fpublish&intention=publication'));
    expect((await moteur.lire('valeurs'))?.valeurs).toMatchObject({ city: 'Dakar' });
  });
});

describe('le brouillon survit au rechargement (AC2)', () => {
  it('même étape, mêmes valeurs (fréquence « Année » comprise) et les 3 photos, réduites à l’ajout', async () => {
    const user = userEvent.setup();
    const moteur = moteurEnMemoire();
    monter(moteur);
    await remplir(user, { jusquAuTitre: false });
    expect(reduction.reduirePhotos).toHaveBeenCalledTimes(1);
    // L'écriture des valeurs est différée : la page se ferme, ce qui attend part.
    cleanup();
    await waitFor(async () => expect((await moteur.lire('valeurs'))?.etape).toBe(4));

    monter(moteur);
    expect(await screen.findByRole('heading', { level: 1, name: /photos/i })).toBeInTheDocument();
    expect(await screen.findByText('3 photos sur 10')).toBeInTheDocument();
    const photos = await moteur.lire('photos');
    expect(photos?.map((p) => p.nom)).toEqual(['reduite-salon.jpg', 'reduite-cuisine.jpg', 'reduite-chambre.jpg']);

    await user.click(screen.getByRole('button', { name: /^précédent$/i })); // → le prix
    expect((screen.getByLabelText(/^loyer|^prix/i) as HTMLInputElement).value).toBe('250 000');
    expect(screen.getByRole('combobox', { name: /fréquence/i })).toHaveTextContent('Année');
  });
});

describe('ce qui ne paraît pas sans compte', () => {
  it('ni frais d’agence au prix, ni bailleur au départ, ni coordonnées du compte à la finition', async () => {
    const user = userEvent.setup();
    monter(moteurEnMemoire());
    expect(screen.queryByText(/bailleur/i)).not.toBeInTheDocument();
    await remplir(user, { jusquAuTitre: false });
    await user.click(screen.getByRole('button', { name: /^précédent$/i })); // → le prix
    expect(screen.queryByLabelText(/frais d.agence/i)).not.toBeInTheDocument();
    await user.click(suivant()); //                                         → les photos
    await user.click(suivant()); //                                         → le titre
    expect(screen.getByText('C’est tout pour l’annonce.')).toBeInTheDocument();
    expect(screen.queryByText(/whatsapp de contact|vérifier mon numéro/i)).not.toBeInTheDocument();
  });

  it('sous les contacts sur place : ils ne sont pas gardés si l’on quitte la page (ADR-0093 : aucun numéro de tiers au brouillon)', async () => {
    const user = userEvent.setup();
    const moteur = moteurEnMemoire();
    monter(moteur);
    await remplir(user);
    const contacts = screen.getByTestId('contacts-sur-place');
    // Juste sous le cadre des contacts, avant la finition : c'est d'eux qu'il parle.
    expect(contacts.nextElementSibling).toHaveTextContent('Ces contacts ne sont pas gardés si vous quittez la page.');

    // Et l'écran dit vrai : un contact saisi, la page fermée, le brouillon n'en porte rien.
    // Le contact en DERNIER : c'est la dernière écriture, celle que la fermeture de la page rend, qui doit n'en rien porter.
    await user.type(screen.getByLabelText(/titre de l.annonce|^titre/i), ' — vue mer');
    await user.click(within(contacts).getByRole('button', { name: 'Ajouter un contact' }));
    await user.type(within(contacts).getByLabelText('Qui ?'), 'Gardien Modou');
    await user.type(within(contacts).getByLabelText('Numéro'), '776543210');
    cleanup();
    await waitFor(async () => expect((await moteur.lire('valeurs'))?.etape).toBe(5));
    const garde = JSON.stringify([await moteur.lire('valeurs'), await moteur.lire('photos')]);
    expect(garde).toContain('vue mer');
    expect(garde).not.toMatch(/Gardien|Modou|654\s?32\s?10|776543210/);
  });
});

describe('quand le navigateur ne garde rien', () => {
  it('sans stockage, l’écran dit que l’annonce reste le temps de l’onglet — et l’annonce aux lecteurs d’écran', async () => {
    monter(null);
    const message = 'Ce navigateur ne garde pas le brouillon : votre annonce reste ici tant que l’onglet est ouvert.';
    expect((await screen.findAllByText(message)).length).toBeGreaterThan(0);
    // Les deux mentions visibles dépendent de la largeur (ligne du téléphone, note de la barre) :
    // la région `status` porte le message à toute largeur.
    expect(screen.getAllByRole('status').some((r) => r.textContent === message)).toBe(true);
  });

  it('« Effacer ce brouillon » paraît dès la première réponse, sans attendre un rechargement', async () => {
    const user = userEvent.setup();
    monter(moteurEnMemoire());
    const louer = await screen.findByRole('radio', { name: /^louer$/i });
    expect(screen.queryByRole('button', { name: 'Effacer ce brouillon' })).not.toBeInTheDocument();
    await user.click(louer);
    expect(await screen.findByRole('button', { name: 'Effacer ce brouillon' })).toBeInTheDocument();
  });

  it('« Effacer ce brouillon » vide le brouillon et repart du départ', async () => {
    const user = userEvent.setup();
    const moteur = moteurEnMemoire();
    monter(moteur);
    await remplir(user, { jusquAuTitre: false });
    cleanup();
    monter(moteur);
    await user.click(await screen.findByRole('button', { name: 'Effacer ce brouillon' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Publiez votre bien gratuitement' })).toBeInTheDocument();
    expect(await moteur.lire('valeurs')).toBeUndefined();
    expect(await moteur.lire('photos')).toBeUndefined();
  });
});

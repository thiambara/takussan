import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-2601 (AC5) — le bureau : dès 1280 px, la feuille de compte devient un PANNEAU qui prend la
 * place de l'étape et du pied dans la colonne gauche de l'assistant ; l'aperçu reste à droite.
 * Harnais de `PropertyWizard.sans-compte.tck-2601.test.tsx` ; `matchMedia` répond à la requête du
 * panneau (`REQUETE_DU_PANNEAU`), et peut changer en cours de route.
 */
const media = vi.hoisted(() => ({ large: true, tablette: false, abonnes: new Set<() => void>() }));
const routeur = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur }));

vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: () => <div data-testid="carte" />,
}));

type Localisation = {
  city?: string;
  region?: string;
  country_code?: string;
  currency?: string;
} | null;

const geo = vi.hoisted(() => ({
  valeur: null as Localisation,
  loading: false,
}));
vi.mock('@/components/providers/UserLocationProvider', () => ({
  useUserLocation: () => ({ location: geo.valeur, loading: geo.loading }),
}));

const brouillon = vi.hoisted(() => ({
  etat: {
    isLoading: false,
    isSaving: false,
    error: null as Error | null,
    draft: null as { step: number; data: Record<string, unknown> | null } | null,
    save: vi.fn(),
    flush: vi.fn(),
    clear: vi.fn(),
  },
}));
vi.mock('@/hooks/useWizardDraft', () => ({ useWizardDraft: () => brouillon.etat }));

const reduction = vi.hoisted(() => ({
  reduirePhoto: vi.fn(async (f: File) => f),
  reduirePhotos: vi.fn(async (fs: readonly File[]) => [...fs]),
  reduirePhotosSousPlafond: vi.fn(async (fs: readonly File[]) => [...fs]),
}));
vi.mock('@/lib/reduire-photo', () => reduction);

vi.mock('@/app/actions/dashboard-properties', () => ({
  createPropertyAction: vi.fn(),
  setPropertyTagsAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
  uploadPropertyPhotosAction: vi.fn(),
}));

const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));

const pub = vi.hoisted(() => ({ publier: vi.fn(), contacts: vi.fn() }));
vi.mock('@/app/actions/publish-property', () => ({
  publishPropertyAction: (...a: unknown[]) => pub.publier(...a),
}));
vi.mock('@/app/actions/property-contacts', () => ({
  replacePropertyContactsAction: (...a: unknown[]) => pub.contacts(...a),
}));


/** Un fournisseur d'authentification minimal : `openSession` ouvre VRAIMENT la session (un rendu suit). */
const auth = vi.hoisted(() => ({ ouvrir: vi.fn(), setUser: vi.fn(), refreshUser: vi.fn(async () => undefined) }));
vi.mock('@/context/AuthContext', async () => {
  const React = await import('react');
  const Ctx = React.createContext<{ user: Record<string, unknown> | null; ouvrir: (u: Record<string, unknown>) => void }>({ user: null, ouvrir: () => {} });
  return {
    __Ctx: Ctx,
    useAuth: () => {
      const c = React.useContext(Ctx);
      return {
        user: c.user,
        setUser: (u: Record<string, unknown>) => {
          auth.setUser(u);
          c.ouvrir(u);
        },
        refreshUser: auth.refreshUser,
        openSession: async (_jeton: string, u: Record<string, unknown>) => {
          auth.ouvrir(u);
          c.ouvrir(u);
        },
      };
    },
  };
});

const tel = vi.hoisted(() => ({ demander: vi.fn(), verifier: vi.fn() }));
vi.mock('@/lib/connexion-telephone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connexion-telephone')>()),
  demanderCodeTelephone: (...a: unknown[]) => tel.demander(...a),
  verifierCodeTelephone: (...a: unknown[]) => tel.verifier(...a),
}));
const profil = vi.hoisted(() => ({ ecrire: vi.fn() }));
vi.mock('@/app/actions/contact-preferences', () => ({
  updateContactPreferencesAction: (...a: unknown[]) => profil.ecrire(...a),
}));

import * as ModuleAuth from '@/context/AuthContext';
import { createPropertyAction, setPropertyTagsAction, uploadPropertyPhotosAction } from '@/app/actions/dashboard-properties';
import { AssistantDePublication, type ModeAnonyme } from '../PropertyWizard';

const Ctx = (ModuleAuth as unknown as { __Ctx: React.Context<{ user: Record<string, unknown> | null; ouvrir: (u: Record<string, unknown>) => void }> }).__Ctx;
function Session({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  return <Ctx.Provider value={{ user, ouvrir: setUser }}>{children}</Ctx.Provider>;
}

const COMPLET = {
  title: 'Villa à Mbour', type: 'villa', contract_type: 'sale', price: 25000000,
  currency: 'XOF', city: 'Mbour', furnished: false, tag_ids: [],
};
const NEUF = { id: 185, first_name: '', last_name: null, phone: '+221770000999', phone_verified_at: '2026-11-13T00:00:00Z', phone_whatsapp: null };

const page = vi.hoisted(() => ({
  surPublier: vi.fn(),
  preparerLEspace: vi.fn(),
  entreeParTelephone: true,
  surVerrou: vi.fn(),
}));

function monter(etape = 5) {
  brouillon.etat.draft = { step: etape, data: COMPLET };
  const anonyme: ModeAnonyme = {
    photosInitiales: [],
    surPhotos: () => {},
    surPublier: page.surPublier,
    depart: { titre: 'Publiez votre bien', sousTitre: '', dessous: null },
    finition: null,
    pourPublierEnPlus: { libelle: 'Votre numéro', note: 'à la fin' },
    surEtape: () => {},
    entreeParTelephone: page.entreeParTelephone,
    preparerLEspace: page.preparerLEspace,
    surVerrou: page.surVerrou,
    noteDuPied: (id) => `note de l’étape ${id}`,
  };
  const user = userEvent.setup();
  render(withIntl(<Session><AssistantDePublication brouillon={brouillon.etat as never} anonyme={anonyme} fraisDAgence={false} /></Session>));
  return user;
}


beforeEach(() => {
  vi.clearAllMocks();
  brouillon.etat.isLoading = false;
  brouillon.etat.error = null;
  brouillon.etat.flush.mockResolvedValue({ ok: true, ecrit: true });
  brouillon.etat.clear.mockResolvedValue(undefined);
  page.entreeParTelephone = true;
  page.preparerLEspace.mockResolvedValue('pret');
  tel.demander.mockResolvedValue({ attente: 60, codeApercu: '123456' });
  tel.verifier.mockResolvedValue({ token: 't', user: NEUF, is_new_account: true });
  profil.ecrire.mockImplementation(async (p: Record<string, unknown>) => ({ ok: true, user: { ...NEUF, ...p } }));
  vi.mocked(createPropertyAction).mockResolvedValue({ ok: true, data: { id: 42 } } as never);
  vi.mocked(setPropertyTagsAction).mockResolvedValue({ ok: true } as never);
  vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({ ok: true } as never);
  pub.publier.mockResolvedValue({ ok: true, data: { id: 42, status: 'available' } });
  pub.contacts.mockResolvedValue({ ok: true });
});


import { REQUETE_DU_PANNEAU } from '@/components/publication/CadreDeLaFeuille';

beforeEach(() => {
  media.large = true;
  media.tablette = false;
  media.abonnes.clear();
  window.matchMedia = ((query: string) => ({
    get matches() {
      if (query === '(width >= 48rem)') return media.tablette || media.large;
      return query === REQUETE_DU_PANNEAU && media.large;
    },
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_: string, f: () => void) => media.abonnes.add(f),
    removeEventListener: (_: string, f: () => void) => media.abonnes.delete(f),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

function changerDeLargeur(large: boolean) {
  media.large = large;
  act(() => media.abonnes.forEach((f) => f()));
}

async function ouvrirLePanneau(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
  const publier = screen.getByRole('button', { name: 'Publier l’annonce' });
  await user.click(publier);
  const panneau = screen.getByRole('region', { name: 'Dernière étape : votre numéro' });
  return { panneau, publier };
}

describe('PropertyWizard sans compte — le cadre d’entrée (TCK-2600)', () => {
  it('l’assistant sans compte est dans le cadre d’entrée ; le pied porte la note de l’étape courante', () => {
    monter();
    expect(document.querySelector('[data-wizard-panneau]')).toHaveAttribute('data-cadre-d-entree', '');
    expect(document.querySelector('[data-wizard-footer]')).toHaveTextContent('note de l’étape finition');
  });

  it('le départ est l’étape d’accueil : titre de a-0, sans surtitre', () => {
    monter(0);
    expect(screen.getByRole('heading', { level: 1, name: 'Publiez votre bien' })).toHaveClass('lg:text-affiche-32');
    expect(screen.queryByText(/^Partie 1 sur/)).not.toBeInTheDocument();
    expect(document.querySelector('[data-wizard-footer]')).toHaveTextContent('note de l’étape bien');
  });
});

describe('PropertyWizard au bureau — le panneau de compte (TCK-2601, AC5)', () => {
  it('« Publier » ouvre le panneau À LA PLACE de l’étape et du pied, sans dialogue ; l’aperçu reste ; le focus va au titre', async () => {
    const user = monter();
    const { panneau } = await ouvrirLePanneau(user);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(panneau.closest('[data-wizard-panneau]')).not.toBeNull();
    expect(document.querySelector('[data-wizard-panneau]')).toHaveClass('xl:block');
    // L'étape et le pied se cachent dès xl (la largeur où le panneau est le régime), pas avant.
    expect(document.querySelector('[data-wizard-footer]')).toHaveClass('xl:hidden');
    // TCK-2600 — dans le cadre d'entrée, le panneau et l'étape partagent la colonne de la question.
    expect(document.querySelector('[data-wizard-scroll] [data-wizard-panneau] + div')).toHaveClass('xl:hidden');
    // L'aperçu reste à droite pendant tout le compte.
    expect(screen.getByRole('complementary', { name: 'Aperçu de l’annonce' })).toBeInTheDocument();

    const titre = within(panneau).getByRole('heading', { level: 1, name: 'Dernière étape : votre numéro' });
    expect(titre).toHaveFocus();
    expect(within(panneau).getByText('Votre annonce est prête')).toBeInTheDocument();
    // Le titre dit déjà « votre numéro » : pas de second titre ; le rappel est l'aperçu, à droite.
    expect(within(panneau).queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    // Deux assurances : « Gratuit, sans commission » n'est pas vrai pour tout espace (abonnement).
    expect(within(panneau).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Pas de mot de passe à inventer',
      'Annonce retirable à tout moment',
    ]);
  });

  it('AC1 au bureau — numéro, code, noms, « Publier mon annonce » dans le panneau : l’annonce part', async () => {
    const user = monter();
    const { panneau } = await ouvrirLePanneau(user);
    fireEvent.change(within(panneau).getByLabelText('Votre numéro'), { target: { value: '770000999' } });
    await user.click(within(panneau).getByRole('button', { name: 'Recevoir un code' }));
    await user.click(await within(panneau).findByRole('button', { name: /utiliser ce code/i }));
    await user.type(within(panneau).getByLabelText('Prénom'), 'Awa');
    await user.type(within(panneau).getByLabelText('Nom'), 'Diop');
    await user.click(within(panneau).getByRole('button', { name: 'Publier mon annonce' }));

    // TCK-2602 — l'espace particulier créé ou rendu actif : l'écran « en ligne », plus la fiche.
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42/en-ligne'));
    expect(profil.ecrire).toHaveBeenCalledWith({ first_name: 'Awa', last_name: 'Diop', phone_whatsapp: false });
    expect(pub.publier).toHaveBeenCalledWith(42, { acceptTerms: true });
  });

  it('la page est prévenue : verrouillée feuille ouverte (ses sorties attendent), déverrouillée refermée', async () => {
    const user = monter();
    await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
    expect(page.surVerrou).toHaveBeenLastCalledWith(false);
    const { panneau } = await ouvrirLePanneau(user);
    expect(page.surVerrou).toHaveBeenLastCalledWith(true);
    await user.click(within(panneau).getByRole('button', { name: 'Revenir à l’annonce' }));
    expect(page.surVerrou).toHaveBeenLastCalledWith(false);
  });

  it('pendant les écritures aussi, feuille refermée : la préparation de l’espace tient le verrou jusqu’à sa réponse', async () => {
    page.preparerLEspace.mockResolvedValueOnce({ erreur: 'Espace indisponible.' });
    const user = monter();
    const { panneau } = await ouvrirLePanneau(user);
    fireEvent.change(within(panneau).getByLabelText('Votre numéro'), { target: { value: '770000999' } });
    await user.click(within(panneau).getByRole('button', { name: 'Recevoir un code' }));
    await user.click(await within(panneau).findByRole('button', { name: /utiliser ce code/i }));
    await user.type(within(panneau).getByLabelText('Prénom'), 'Awa');
    await user.type(within(panneau).getByLabelText('Nom'), 'Diop');
    await user.click(within(panneau).getByRole('button', { name: 'Publier mon annonce' }));
    // Refus de l'espace : la feuille se referme, l'écran le dit, la page est rendue.
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Dernière étape : votre numéro' })).not.toBeInTheDocument());
    expect(page.surVerrou).toHaveBeenLastCalledWith(false);

    // La session est ouverte : « Publier » rejuge l'espace SANS feuille — le verrou tient pendant.
    let repondre: (r: 'pret') => void = () => {};
    page.preparerLEspace.mockImplementationOnce(() => new Promise((ok) => (repondre = ok)));
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    await waitFor(() => expect(page.preparerLEspace).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('region', { name: 'Dernière étape : votre numéro' })).not.toBeInTheDocument();
    expect(page.surVerrou).toHaveBeenLastCalledWith(true);
    await act(async () => repondre('pret'));
    // TCK-2602 — l'espace particulier créé ou rendu actif : l'écran « en ligne », plus la fiche.
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42/en-ligne'));
  });

  it('un assistant démonté feuille ouverte (brouillon effacé, page quittée) ne laisse pas la page verrouillée', async () => {
    const user = monter();
    await ouvrirLePanneau(user);
    expect(page.surVerrou).toHaveBeenLastCalledWith(true);
    cleanup();
    expect(page.surVerrou).toHaveBeenLastCalledWith(false);
  });

  it('TCK-2600 — dans le cadre d’entrée, le panneau prend la colonne de la question ; « Revenir » remonte en haut de la colonne', async () => {
    const user = monter();
    const { panneau } = await ouvrirLePanneau(user);
    const section = panneau.closest('[data-panneau-de-compte]')!;
    // La colonne est celle du nœud qui reçoit le panneau (560 px dans le cadre) : la section n'en porte pas.
    expect(section.className).toBe('');
    expect(section.parentElement).toHaveAttribute('data-cadre-d-entree', '');
    expect(section.parentElement).not.toHaveClass('px-4');
    // Maquette a-6 / a-7 : le texte de « Revenir » au haut de la colonne, sa cible de 44 px débordant au-dessus.
    expect(within(panneau).getByRole('button', { name: 'Revenir à l’annonce' })).toHaveClass('in-data-cadre-d-entree:-mt-3', 'in-data-cadre-d-entree:-mb-1.5', 'min-h-11');
  });

  it('« Revenir à l’annonce » rend l’étape et le pied, et le focus à « Publier »', async () => {
    const user = monter();
    const { panneau, publier } = await ouvrirLePanneau(user);
    await user.click(within(panneau).getByRole('button', { name: 'Revenir à l’annonce' }));

    expect(screen.queryByRole('region', { name: 'Dernière étape : votre numéro' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-wizard-footer]')).not.toHaveClass('xl:hidden');
    expect(document.querySelector('[data-wizard-panneau]')).not.toHaveClass('xl:block');
    expect(publier).toHaveFocus();
  });

  it('panneau ouvert, « Pour publier » ne mène à aucune étape (le voile ne la couvre plus) ; refermé, elle y mène', async () => {
    const user = monter();
    const { panneau } = await ouvrirLePanneau(user);
    const rouvrir = () => screen.getAllByRole('button', { name: /^Revenir à : / });
    expect(rouvrir().length).toBeGreaterThan(0);
    for (const b of rouvrir()) expect(b).toBeDisabled();

    await user.click(within(panneau).getByRole('button', { name: 'Revenir à l’annonce' }));
    for (const b of rouvrir()) expect(b).toBeEnabled();
  });

  it('panneau ouvert, « Pour publier » dit l’étape en cours : toutes franchies, « Votre numéro · en cours » (maquette a-6) ; refermé, « à la fin »', async () => {
    const user = monter();
    const liste = () => screen.getByRole('navigation', { name: 'Étapes de la publication' });
    const { panneau } = await ouvrirLePanneau(user);
    const courante = within(liste()).getAllByText((_, el) => el?.getAttribute('aria-current') === 'step');
    expect(courante).toHaveLength(1);
    expect(courante[0]).toHaveTextContent('Votre numéro · en cours');
    // Le titre (dernière étape de l'assistant) est franchi : il se rouvre (désactivé tant que le panneau est là).
    expect(within(liste()).getByRole('button', { name: 'Revenir à : Le titre' })).toBeDisabled();

    await user.click(within(panneau).getByRole('button', { name: 'Revenir à l’annonce' }));
    expect(within(liste()).getByText(/Votre numéro/)).toHaveTextContent('Votre numéro · à la fin');
  });

  it('Entrée dans le numéro (soumission implicite du formulaire de l’assistant) ne republie pas : la saisie reste', async () => {
    const user = monter();
    const { panneau } = await ouvrirLePanneau(user);
    const numero = within(panneau).getByLabelText('Votre numéro');
    fireEvent.change(numero, { target: { value: '770000999' } });
    fireEvent.submit(numero.closest('form')!);

    await act(async () => {});
    const encore = screen.getByRole('region', { name: 'Dernière étape : votre numéro' });
    expect(within(encore).getByLabelText('Votre numéro')).toBe(numero);
    expect(numero).toHaveValue('770000999');
    expect(page.surPublier).not.toHaveBeenCalled();
  });

  it('un seul point de montage : passer sous 1280 px en cours de compte garde le numéro et le code envoyé', async () => {
    const user = monter();
    const { panneau } = await ouvrirLePanneau(user);
    fireEvent.change(within(panneau).getByLabelText('Votre numéro'), { target: { value: '770000999' } });
    await user.click(within(panneau).getByRole('button', { name: 'Recevoir un code' }));
    await within(panneau).findByLabelText('Code reçu par SMS');
    // Au bureau aussi (maquette a-7, 1440 et 1280) : la mention des conditions SOUS « Publier mon annonce ».
    const mentionDuPanneau = within(panneau).getByTestId('mention-publication');
    expect(mentionDuPanneau).toHaveTextContent('En publiant, vous acceptez les conditions générales et la politique de confidentialité.');
    expect(
      within(panneau).getByRole('button', { name: 'Publier mon annonce' }).compareDocumentPosition(mentionDuPanneau) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    changerDeLargeur(false);
    const f = await screen.findByRole('dialog', { name: 'Dernière étape : votre numéro' });
    expect(within(f).getByLabelText('Code reçu par SMS')).toBeInTheDocument();
    // « 77 000 09 99 » : l'indicatif du Sénégal se tait, comme à la porte (maquette a-7).
    expect(within(f).getByText(/Code envoyé au/)).toHaveTextContent('Code envoyé au 77 000 09 99 · Modifier');
    // Sous « Publier mon annonce », la mention des conditions (maquette a-7).
    expect(within(f).getByTestId('mention-publication')).toHaveTextContent('En publiant, vous acceptez les conditions générales et la politique de confidentialité.');
    expect(tel.demander).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region', { name: 'Dernière étape : votre numéro' })).not.toBeInTheDocument();
  });

  it('sous 1280 px, rien ne change : la feuille, son rappel, son titre « Dernière étape : votre numéro », le libellé visible du numéro, aucune assurance', async () => {
    media.large = false;
    const user = monter();
    await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    const f = screen.getByRole('dialog', { name: 'Dernière étape : votre numéro' });
    // Maquette a-6 : le titre de la feuille dit « votre numéro » ; le champ garde son libellé visible.
    expect(within(f).queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    expect(within(f).getByText('Votre numéro', { selector: 'label' })).not.toHaveClass('sr-only');
    // Le rappel : « prix · prête à publier » sur une ligne (maquette a-6 ; une vente n’a pas de période).
    expect(within(f).getByTestId('rappel-de-l-annonce')).toHaveTextContent(/F CFA · prête à publier$/);
    expect(within(f).queryByText('Pas de mot de passe à inventer')).not.toBeInTheDocument();
    expect(document.querySelector('[data-wizard-panneau]')?.childElementCount).toBe(0);
  });
});

describe('PropertyWizard — « Revenir à l’annonce » au pied de la feuille (TCK-2601, fidélité a-6)', () => {
  it('au téléphone, le ✕ seul ; dès 768 px (panneau latéral), « Revenir à l’annonce » au pied', async () => {
    media.large = false;
    const user = monter();
    await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    const f = screen.getByRole('dialog', { name: 'Dernière étape : votre numéro' });
    expect(within(f).queryByRole('button', { name: 'Revenir à l’annonce' })).not.toBeInTheDocument();
    expect(within(f).getByRole('button', { name: 'Fermer' })).toBeInTheDocument();

    media.tablette = true;
    act(() => media.abonnes.forEach((x) => x()));
    expect(within(f).getByRole('button', { name: 'Revenir à l’annonce' })).toBeInTheDocument();
  });
});

describe('PropertyWizard au téléphone — la feuille au-dessus du clavier (TCK-2601, AC5)', () => {
  it('clavier ouvert (fenêtre visuelle réduite de 336 px) : la feuille remonte de 336 px et sa hauteur s’en réduit', async () => {
    media.large = false;
    const abonnes = new Set<() => void>();
    const vue = { height: 844, offsetTop: 0, addEventListener: (_: string, f: () => void) => abonnes.add(f), removeEventListener: (_: string, f: () => void) => abonnes.delete(f) };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vue });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    try {
      const user = monter();
      await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
      await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
      const f = screen.getByRole('dialog', { name: 'Dernière étape : votre numéro' });
      expect(f.style.bottom).toBe('');
      // 80 % de la hauteur au téléphone (maquette a-6), plafonnée par le clavier ci-dessous.
      expect(f).toHaveClass('max-md:h-[80dvh]');

      vue.height = 508;
      act(() => abonnes.forEach((x) => x()));
      expect(f.style.bottom).toBe('336px');
      expect(f.style.maxHeight).toBe('calc(90dvh - 336px)');
      // Le geste reste dans la feuille, donc au-dessus du clavier.
      expect(within(f).getByRole('button', { name: 'Recevoir un code' })).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(window, 'visualViewport');
    }
  });
});

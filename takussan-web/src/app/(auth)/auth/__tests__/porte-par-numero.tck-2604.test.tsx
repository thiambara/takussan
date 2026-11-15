/**
 * TCK-2604 — une seule porte par numéro, surmontée de ce que le visiteur était en train de faire.
 *
 * Éprouvé ici, au niveau de la page (serveur, puis son formulaire client) :
 * - l'intention d'une liste FERMÉE (`?intention=`) et le bien quitté (slug de `?redirect=`) : la
 *   carte du bien ; une action inconnue ignorée ; sans intention, aucune image de bien (AC1) ;
 * - le code envoyé au sixième chiffre, UNE fois ; un code faux garde les six cases (AC3) ;
 * - le même écran du code, que le numéro ait un compte ou non (AC5) ;
 * - `/auth/register` → `/auth/login`, l'intention gardée (AC4) ;
 * - un échec des fournisseurs retire le bouton Google, sans message ; un échec Google propose le numéro.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CoqueDEntree, type LibellesDeLaCoque } from '@/components/entree/CoqueDEntree';
import { ApiError } from '@/lib/api';
import type { BienQuitte } from '@/lib/queries/bien-quitte';
import { afficheA } from '@/test/affiche-a';
import { withIntl } from '@/test/intl';

const pushMock = vi.fn();
const redirectMock = vi.fn((cible: string) => {
  throw new Error(`NEXT_REDIRECT ${cible}`);
});
const openSessionMock = vi.fn();
const actif = vi.fn();
const demander = vi.fn();
const verifier = vi.fn();
const fournisseurs = vi.fn();
const bienQuitteMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('@/lib/auth', () => ({
  register: vi.fn(),
  login: vi.fn(),
  isTwoFactorChallenge: () => false,
  oauthProviders: () => fournisseurs(),
  oauthRedirect: vi.fn(),
}));
vi.mock('@/lib/connexion-telephone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connexion-telephone')>()),
  connexionParTelephoneActive: () => actif(),
  demanderCodeTelephone: (...a: unknown[]) => demander(...a),
  verifierCodeTelephone: (...a: unknown[]) => verifier(...a),
}));
vi.mock('@/lib/queries/bien-quitte', () => ({ bienQuitte: (...a: unknown[]) => bienQuitteMock(...a) }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'fr' }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ openSession: openSessionMock }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/auth/login',
  redirect: (cible: string) => redirectMock(cible),
}));

const { default: LoginPage } = await import('../login/page');
const { default: RegisterPage } = await import('../register/page');

const LIBELLES: LibellesDeLaCoque = {
  marque: 'Takussan',
  retourAuSite: 'Retour au site',
  fermer: 'Fermer',
  quitter: 'Quitter',
  avancement: 'Étape {pas} sur {total}',
  sortie: { titre: 'Quitter ?', texte: 'Texte', partir: 'Quitter', rester: 'Rester' },
};

const STUDIO: BienQuitte = {
  slug: 'studio-meuble-mermoz-a1b2c3',
  titre: 'Studio meublé lumineux à Mermoz',
  quartier: 'Mermoz',
  photo: 'http://127.0.0.1:8002/storage/studio.jpg',
  prix: 250000,
  devise: 'XOF',
  periode: 'monthly',
  agence: 'Dakar Immo',
};

beforeEach(() => {
  pushMock.mockReset();
  redirectMock.mockClear();
  openSessionMock.mockReset();
  openSessionMock.mockResolvedValue(undefined);
  actif.mockReset();
  actif.mockResolvedValue(true);
  demander.mockReset();
  verifier.mockReset();
  fournisseurs.mockReset();
  fournisseurs.mockResolvedValue([]);
  bienQuitteMock.mockReset();
  bienQuitteMock.mockResolvedValue(STUDIO);
  searchParams = new URLSearchParams();
});

/**
 * La page serveur, avec ses paramètres, sous la coque d'entrée du layout `(auth)` (c'est elle qui
 * rend ce que la page déclare) ; le formulaire client lit les mêmes paramètres par `useSearchParams`.
 */
async function ouvrir(params: Record<string, string>): Promise<ReturnType<typeof render>> {
  searchParams = new URLSearchParams(params);
  const page = (await LoginPage({ searchParams: Promise.resolve(params) })) as ReactElement;
  let rendu: ReturnType<typeof render> | null = null;
  await act(async () => {
    rendu = render(withIntl(<CoqueDEntree libelles={LIBELLES}>{page}</CoqueDEntree>));
  });
  return rendu as unknown as ReturnType<typeof render>;
}

async function jusquAuCode(user: ReturnType<typeof userEvent.setup>, numero = '771234567'): Promise<HTMLElement> {
  demander.mockResolvedValue({ attente: 60, codeApercu: null });
  await user.type(await screen.findByLabelText('Votre numéro'), numero);
  await user.click(screen.getByRole('button', { name: 'Recevoir un code' }));
  return screen.findByLabelText('Code reçu par SMS');
}

describe('AC1 — l’intention et le bien quitté', () => {
  it('« réservation » depuis une fiche : la photo, le titre et le prix de CE bien, et l’action', async () => {
    await ouvrir({ redirect: '/fr/properties/studio-meuble-mermoz-a1b2c3?action=reserver', intention: 'reservation' });

    expect(bienQuitteMock).toHaveBeenCalledWith('studio-meuble-mermoz-a1b2c3', 'fr');
    const enTete = document.querySelector('[data-en-tete-du-bien]') as HTMLElement;
    expect(enTete).not.toBeNull();
    expect(within(enTete).getByText('Votre réservation')).toBeInTheDocument();
    expect(within(enTete).getByText(STUDIO.titre)).toBeInTheDocument();
    expect(enTete).toHaveTextContent(/250\s000\sF CFA \/ mois/);
    expect(enTete.querySelector('img')?.getAttribute('src')).toContain(encodeURIComponent(STUDIO.photo ?? ''));
    // Au bureau, le même bien occupe le panneau de gauche, et le retour dit « Retour à l’annonce ».
    const panneau = document.querySelector('[data-panneau-d-entree]') as HTMLElement;
    expect(within(panneau).getByText(STUDIO.titre)).toBeInTheDocument();
    expect(panneau).toHaveTextContent(/250\s000\sF CFA \/ mois/);
    expect(screen.getAllByRole('link', { name: /Retour à l’annonce/ }).length).toBeGreaterThan(0);
  });

  it('au bureau, l’agence du bien : « Avec … » sur le numéro, « … part chez … » sur le code', async () => {
    const user = userEvent.setup();
    await ouvrir({ redirect: '/fr/properties/studio-meuble-mermoz-a1b2c3', intention: 'visite' });
    expect(document.querySelector('[data-panneau-d-entree]')).toHaveTextContent('Avec Dakar Immo');
    await jusquAuCode(user);
    const panneau = document.querySelector('[data-panneau-d-entree]') as HTMLElement;
    expect(panneau).toHaveTextContent('Vous reprenez là où vous en étiez');
    expect(panneau).toHaveTextContent('Votre demande de visite part chez Dakar Immo');
  });

  it('« candidature » (« Déposer mon dossier ») : le dossier, pas une visite, et où il part', async () => {
    const user = userEvent.setup();
    await ouvrir({ redirect: '/fr/properties/studio-meuble-mermoz-a1b2c3?action=reserver', intention: 'candidature' });
    const enTete = document.querySelector('[data-en-tete-du-bien]') as HTMLElement;
    expect(within(enTete).getByText('Votre candidature')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('visite');
    await jusquAuCode(user);
    const panneau = document.querySelector('[data-panneau-d-entree]') as HTMLElement;
    expect(panneau).toHaveTextContent('Pour déposer votre dossier, entrez votre numéro.');
    expect(panneau).toHaveTextContent('Votre dossier part chez Dakar Immo');
  });

  it('sans agence, ni « Avec » ni « part chez » : le retour à l’annonce', async () => {
    const user = userEvent.setup();
    bienQuitteMock.mockResolvedValue({ ...STUDIO, agence: null });
    await ouvrir({ redirect: '/fr/properties/studio-meuble-mermoz-a1b2c3', intention: 'visite' });
    expect(document.querySelector('[data-panneau-d-entree]')).not.toHaveTextContent('Avec');
    await jusquAuCode(user);
    const panneau = document.querySelector('[data-panneau-d-entree]') as HTMLElement;
    expect(panneau).toHaveTextContent('Retour à l’annonce, là où vous en étiez');
    expect(panneau).not.toHaveTextContent('part chez');
  });

  it('le tunnel de réservation (`/bookings?property=`) rend le même bien, ses dates dites', async () => {
    await ouvrir({
      redirect: '/fr/bookings?property=studio-meuble-mermoz-a1b2c3&debut=2099-01-10&fin=2099-01-14',
      intention: 'reservation',
    });
    expect(bienQuitteMock).toHaveBeenCalledWith('studio-meuble-mermoz-a1b2c3', 'fr');
    expect(document.querySelector('[data-en-tete-du-bien]')).toHaveTextContent(/Du .*10 janv\..* au .*14 janv\./);
  });

  it.each([
    ['une action inconnue', { redirect: '/fr/properties/studio-meuble-mermoz-a1b2c3', intention: '<b>piratage</b>' }],
    ['aucune intention', { redirect: '/fr/properties/studio-meuble-mermoz-a1b2c3' }],
  ])('%s est ignorée : aucune lecture du bien, aucune image, aucun texte de l’URL', async (_nom, params) => {
    await ouvrir(params);
    expect(bienQuitteMock).not.toHaveBeenCalled();
    expect(document.querySelector('img')).toBeNull();
    expect(document.body).not.toHaveTextContent('piratage');
    expect(screen.getByRole('heading', { name: 'Entrez votre numéro' })).toBeInTheDocument();
  });

  it('un redirect hors du site ne désigne aucun bien', async () => {
    await ouvrir({ redirect: '//evil.example/properties/x', intention: 'reservation' });
    expect(bienQuitteMock).not.toHaveBeenCalled();
    expect(document.querySelector('img')).toBeNull();
  });

  it('un bien introuvable : la forme directe', async () => {
    bienQuitteMock.mockResolvedValue(null);
    await ouvrir({ redirect: '/fr/properties/retire-a1b2c3', intention: 'visite' });
    expect(document.querySelector('[data-en-tete-du-bien]')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });
});

// Suite xl de TCK-2604, décision (b) : entre 1024 et 1280, le panneau d'intention est absent ; c'est la
// barre de 64 px qui garde l'intention — l'action ET le bien quitté —, sur chaque écran de la porte.
describe('à 1024, la barre du bureau dit l’action et le bien quitté', () => {
  const TITRE_DE_BUREAU = `Votre réservation · ${STUDIO.titre}`;

  function titreDeLaBarreA1024(): HTMLElement {
    const titre = screen.getByText(TITRE_DE_BUREAU);
    expect(afficheA(titre, 1024)).toBe(true);
    expect(titre.closest('header')!.className).toMatch(/(^|\s)h-16(\s|$)/);
    return titre;
  }

  it('la porte du numéro, puis l’écran du code', async () => {
    const user = userEvent.setup();
    await ouvrir({ redirect: '/fr/properties/studio-meuble-mermoz-a1b2c3?action=reserver', intention: 'reservation' });
    titreDeLaBarreA1024();
    await jusquAuCode(user);
    titreDeLaBarreA1024();
  });

  it('la voie e-mail', async () => {
    await ouvrir({ voie: 'email', redirect: '/fr/properties/studio-meuble-mermoz-a1b2c3', intention: 'reservation' });
    await screen.findByRole('tab', { name: 'J’ai un compte' });
    titreDeLaBarreA1024();
  });

  it('sans bien quitté, la barre ne dit que le titre de l’écran', async () => {
    bienQuitteMock.mockResolvedValue(null);
    await ouvrir({ redirect: '/fr/properties/retire-a1b2c3', intention: 'reservation' });
    expect(screen.queryByText(/ · /)).toBeNull();
  });
});

describe('AC3 — le code part au sixième chiffre, une fois', () => {
  it('exactement une vérification ; les chiffres en trop ne la relancent pas', async () => {
    const user = userEvent.setup();
    let resoudre: (v: unknown) => void = () => undefined;
    verifier.mockImplementation(() => new Promise((r) => (resoudre = r)));
    await ouvrir({});
    const code = await jusquAuCode(user);

    await user.type(code, '12345');
    expect(verifier).not.toHaveBeenCalled();
    await user.type(code, '6');
    await waitFor(() => expect(verifier).toHaveBeenCalledTimes(1));
    // Pendant la vérification, « Me connecter » ne relance rien.
    await user.click(screen.getByRole('button', { name: /Vérification/ }));
    expect(verifier).toHaveBeenCalledTimes(1);
    expect(verifier).toHaveBeenCalledWith({ phone: '+221771234567', code: '123456' }, 'fr');

    await act(async () => resoudre({ token: 'jeton', user: { id: 1 }, is_new_account: false }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/onboarding/intention'));
    expect(verifier).toHaveBeenCalledTimes(1);
  });

  it('le sixième chiffre et un envoi du formulaire dans le même instant ne font qu’une vérification', async () => {
    // Le code rempli par le SMS puis « OK » au clavier : l’envoi arrive avant que le bouton ne soit
    // rendu désactivé. C’est le verrou synchrone (`verificationEnCours`) qui tient, pas `disabled`.
    const user = userEvent.setup();
    verifier.mockImplementation(() => new Promise(() => undefined));
    await ouvrir({});
    const code = await jusquAuCode(user);
    act(() => {
      fireEvent.change(code, { target: { value: '123456' } });
      fireEvent.submit(code.closest('form') as HTMLFormElement);
    });
    await waitFor(() => expect(verifier).toHaveBeenCalled());
    expect(verifier).toHaveBeenCalledTimes(1);
  });

  it('un code en vol fige les cases : une correction pendant le vol ne s’inscrit pas, et le refus porte sur le code envoyé', async () => {
    // r2 de la contre-vérification de 861535de2 : « 123457 » s’affichait en rouge, « incorrect », sans
    // avoir jamais été envoyé. Les cases restent focalisables (lecture seule, pas `disabled`).
    const user = userEvent.setup();
    let rejeter: (e: unknown) => void = () => undefined;
    verifier.mockImplementationOnce(() => new Promise((_, rej) => (rejeter = rej)));
    await ouvrir({});
    const code = await jusquAuCode(user);
    await user.type(code, '123456');
    await waitFor(() => expect(verifier).toHaveBeenCalledTimes(1));

    expect(code).toHaveAttribute('readonly');
    expect(code).not.toBeDisabled();
    await user.type(code, '{Backspace}7');
    fireEvent.change(code, { target: { value: '123458' } });
    expect(code).toHaveValue('123456');

    await act(async () => rejeter(new ApiError(422, { code: 'phone_code_invalid' })));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vérifiez-le, ou demandez-en un nouveau');
    expect(code).toHaveValue('123456');
    expect(code).not.toHaveAttribute('readonly');
    expect(verifier.mock.calls.map((c) => (c[0] as { code: string }).code)).toEqual(['123456']);
  });

  it('un code collé d’un coup part aussi, une fois', async () => {
    const user = userEvent.setup();
    verifier.mockResolvedValue({ token: 'jeton', user: { id: 1 } });
    await ouvrir({});
    const code = await jusquAuCode(user);
    await user.click(code);
    await user.paste('654321');
    await waitFor(() => expect(verifier).toHaveBeenCalledTimes(1));
    expect(verifier).toHaveBeenCalledWith({ phone: '+221771234567', code: '654321' }, 'fr');
  });

  it('un code faux laisse les six cases, dit « Vérifiez-le, ou demandez-en un nouveau », et ne repart pas seul', async () => {
    const user = userEvent.setup();
    verifier.mockRejectedValue(new ApiError(422, { code: 'phone_code_invalid' }));
    await ouvrir({});
    const code = await jusquAuCode(user);
    await user.type(code, '123456');

    expect(await screen.findByRole('alert')).toHaveTextContent('Vérifiez-le, ou demandez-en un nouveau');
    expect(screen.getByLabelText('Code reçu par SMS')).toHaveValue('123456');
    expect(screen.getByLabelText('Code reçu par SMS')).toHaveAttribute('aria-invalid', 'true');
    const cases = document.querySelectorAll('[data-case-du-code]');
    expect(cases).toHaveLength(6);
    expect([...cases].map((c) => c.textContent).join('')).toBe('123456');
    expect(verifier).toHaveBeenCalledTimes(1);

    // Corriger un chiffre : le passage à six chiffres relance, une fois.
    await user.type(screen.getByLabelText('Code reçu par SMS'), '{Backspace}7');
    await waitFor(() => expect(verifier).toHaveBeenCalledTimes(2));
    expect(verifier).toHaveBeenLastCalledWith({ phone: '+221771234567', code: '123457' }, 'fr');
  });

  it('l’écran du code : le numéro rappelé, « Modifier » qui ramène au numéro, le renvoi à rebours', async () => {
    const user = userEvent.setup();
    await ouvrir({});
    await jusquAuCode(user);
    expect(screen.getByRole('heading', { name: 'Code envoyé au 77 123 45 67' })).toBeInTheDocument();
    expect(screen.getByText(/Valable 5 minutes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renvoyer le code dans 60 s' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Me connecter' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    expect(await screen.findByLabelText('Votre numéro')).toBeInTheDocument();
  });
});

describe('AC5 — pas d’énumération', () => {
  it('l’écran du code est le même, que le numéro ait un compte ou non', async () => {
    const user = userEvent.setup();
    const ecrans: string[] = [];
    for (const nouveau of [false, true]) {
      verifier.mockResolvedValue({ token: 'jeton', user: { id: 1 }, is_new_account: nouveau });
      const { unmount } = await ouvrir({});
      await jusquAuCode(user);
      ecrans.push((document.querySelector('[data-coque-d-entree]') as HTMLElement).outerHTML.replace(/:r[0-9a-z]+:|«r[0-9a-z]+»/g, ''));
      unmount();
    }
    expect(ecrans[0]).toBe(ecrans[1]);
    // Un seul libellé de bouton, aucun mot qui dirait « inscription » ou « compte existant ».
    expect(ecrans[0]).not.toMatch(/inscri|Créez|déjà un compte/i);
  });

  it('l’écran du numéro n’a qu’un titre, qu’un bouton, pour tout le monde', async () => {
    await ouvrir({});
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Entrez votre numéro');
    expect(screen.getByText('Nouveau ou déjà inscrit : un code par SMS suffit.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Recevoir un code' })).toHaveLength(1);
  });
});

describe('l’aide du numéro', () => {
  it('dit « +221 est déjà posé », et garde l’aide internationale dès qu’un « + » est tapé', async () => {
    const user = userEvent.setup();
    await ouvrir({});
    const champ = await screen.findByLabelText('Votre numéro');
    expect(screen.getByText('+221 est déjà posé. À l’étranger ? Commencez par +')).toBeInTheDocument();
    await user.type(champ, '+33612');
    expect(screen.getByText('Numéro international complet, indicatif compris.')).toBeInTheDocument();
    expect(screen.queryByText('+221 est déjà posé. À l’étranger ? Commencez par +')).toBeNull();
  });
});

describe('les messages d’erreur de la demande de code', () => {
  it.each([
    [new ApiError(429, {}), 'Trop de demandes en peu de temps'],
    [new ApiError(422, { code: 'phone_country_not_allowed' }), 'Ce numéro n’est pas valide'],
    [new ApiError(500, {}), 'Une erreur est survenue'],
  ])('refus %#', async (refus, attendu) => {
    const user = userEvent.setup();
    demander.mockRejectedValue(refus);
    await ouvrir({});
    await user.type(await screen.findByLabelText('Votre numéro'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Recevoir un code' }));
    expect(await screen.findByText(new RegExp(attendu))).toBeInTheDocument();
    expect(screen.getByLabelText('Votre numéro')).toBeInTheDocument();
  });

  it('trop d’essais du code (429) : le message qui dit d’attendre', async () => {
    const user = userEvent.setup();
    verifier.mockRejectedValue(new ApiError(429, {}));
    await ouvrir({});
    await user.type(await jusquAuCode(user), '123456');
    expect(await screen.findByRole('alert')).toHaveTextContent('Trop de demandes en peu de temps');
  });
});

describe('les autres voies', () => {
  it('un échec de chargement des fournisseurs retire Google, sans rien dire', async () => {
    fournisseurs.mockRejectedValue(new Error('réseau'));
    await ouvrir({});
    await waitFor(() => expect(fournisseurs).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.body).not.toHaveTextContent('Impossible de charger');
    expect(screen.getByRole('button', { name: /Avec un e-mail/ })).toBeInTheDocument();
  });

  it('Google configuré : « Avec Google » sur la ligne des voies', async () => {
    fournisseurs.mockResolvedValue([{ provider: 'google', configured: true }]);
    await ouvrir({});
    expect(await screen.findByRole('button', { name: /Avec Google/ })).toBeInTheDocument();
  });

  it('après un échec Google, le message propose le numéro, pas l’e-mail', async () => {
    await ouvrir({ error: 'oauth_failed' });
    const message = await screen.findByText(/Le fournisseur a refusé la connexion/);
    expect(message).toHaveTextContent('entrez votre numéro');
    expect(message).not.toHaveTextContent(/email/i);
  });
});

// TCK-2606 — et elle ouvre l'onglet « Créer un compte » de la voie e-mail (`voie=inscription`).
describe('AC4 — /auth/register redirige vers /auth/login', () => {
  it.each([
    [{ redirect: '/publish' }, '/auth/login?redirect=%2Fpublish&voie=inscription'],
    [{}, '/auth/login?voie=inscription'],
    [{ redirect: '//evil.example' }, '/auth/login?voie=inscription'],
    [
      { redirect: '/fr/properties/x', intention: 'reservation' },
      '/auth/login?redirect=%2Ffr%2Fproperties%2Fx&intention=reservation&voie=inscription',
    ],
    [{ redirect: '/publish', intention: 'inconnue' }, '/auth/login?redirect=%2Fpublish&voie=inscription'],
  ])('%j → %s', async (params, attendu) => {
    await expect(RegisterPage({ searchParams: Promise.resolve(params) })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith(attendu);
  });
});

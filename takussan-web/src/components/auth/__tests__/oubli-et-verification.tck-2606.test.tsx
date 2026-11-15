/**
 * TCK-2606 — « Mot de passe oublié », « Lien envoyé », « Vérifiez votre adresse » et le lien de
 * vérification ouvert dans un autre onglet.
 *
 * - AC4 : l'écran « Lien envoyé » est le MÊME (DOM) pour une adresse connue et inconnue ; l'adresse
 *   y est masquée ;
 * - le code SMS n'est proposé que si la voie téléphone est ouverte ;
 * - AC3 : `/auth/verify-email` redirige un compte vérifié (ou sans adresse) vers sa destination, et
 *   dit l'adresse d'un compte non vérifié EN CLAIR ;
 * - l'intention survit au lien de vérification ouvert dans un autre onglet (`localStorage`).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CoqueDEntree, type LibellesDeLaCoque } from '@/components/entree/CoqueDEntree';
import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';

const pushMock = vi.fn();
const redirectMock = vi.fn((cible: string) => {
  throw new Error(`NEXT_REDIRECT ${cible}`);
});
const forgotMock = vi.fn();
const actif = vi.fn();
const utilisateur = vi.fn();
const renvoiMock = vi.fn();
const majProfilMock = vi.fn();
const refreshUserMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('@/lib/auth', () => ({ forgotPassword: (...a: unknown[]) => forgotMock(...a) }));
vi.mock('@/components/auth/useConnexionParTelephone', () => ({ useConnexionParTelephone: () => actif() }));
vi.mock('@/lib/utilisateur-du-rendu', () => ({ utilisateurDuRendu: () => utilisateur() }));
vi.mock('@/lib/queries/bien-quitte', () => ({ bienQuitte: vi.fn(async () => null) }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'fr' }));
vi.mock('@/app/actions/auth', () => ({
  resendVerificationEmailAction: (...a: unknown[]) => renvoiMock(...a),
  updateProfileAction: (...a: unknown[]) => majProfilMock(...a),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ refreshUser: refreshUserMock }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/auth/forgot-password',
  redirect: (cible: string) => redirectMock(cible),
}));

const { MotDePasseOublie } = await import('../MotDePasseOublie');
const { default: VerifyEmailPage } = await import('@/app/(auth)/auth/verify-email/page');
const { ContinuerApresVerification } = await import('../ContinuerApresVerification');
const memoire = await import('../memoire-de-l-intention');

const LIBELLES: LibellesDeLaCoque = {
  marque: 'Takussan',
  retourAuSite: 'Retour au site',
  fermer: 'Fermer',
  quitter: 'Quitter',
  avancement: 'Étape {pas} sur {total}',
  sortie: { titre: 'Quitter ?', texte: 'Texte', partir: 'Quitter', rester: 'Rester' },
};

const RESERVATION = '/properties/studio-meuble-mermoz-a1b2c3?action=reserver';

function compte(champs: Partial<User>): User {
  return { id: 1, email: 'awa.diop@gmail.com', email_verified_at: null, ...champs } as User;
}

beforeEach(() => {
  pushMock.mockReset();
  redirectMock.mockClear();
  forgotMock.mockReset();
  actif.mockReset();
  actif.mockReturnValue(false);
  utilisateur.mockReset();
  renvoiMock.mockReset();
  majProfilMock.mockReset();
  refreshUserMock.mockReset();
  searchParams = new URLSearchParams();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

async function demanderLeLien(adresse: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('E-mail'), adresse);
  await user.click(screen.getByRole('button', { name: 'Envoyer le lien' }));
  await screen.findByRole('heading', { name: /Lien envoyé à/ });
}

describe('Mot de passe oublié → Lien envoyé', () => {
  it('AC4 — même écran, au caractère près, pour une adresse connue et une adresse inconnue', async () => {
    forgotMock.mockResolvedValueOnce({ message: 'ok' });
    const connue = render(withIntl(<MotDePasseOublie />));
    await demanderLeLien('awa.diop@gmail.com');
    const domConnue = connue.container.innerHTML;
    connue.unmount();

    // L'API qui échoue (adresse inconnue côté serveur, ou limite) ne change rien à l'écran.
    forgotMock.mockRejectedValueOnce(new Error('422'));
    const inconnue = render(withIntl(<MotDePasseOublie />));
    await demanderLeLien('awa.diop@gmail.com');
    expect(inconnue.container.innerHTML).toBe(domConnue);
  });

  it('l’adresse est masquée : la première lettre et le domaine, jamais l’adresse entière', async () => {
    forgotMock.mockResolvedValueOnce({ message: 'ok' });
    const { container } = render(withIntl(<MotDePasseOublie />));
    await demanderLeLien('awa.diop@gmail.com');
    expect(screen.getByRole('heading', { name: 'Lien envoyé à a•••@gmail.com' })).toBeInTheDocument();
    expect(container.textContent).not.toContain('awa.diop');
    expect(forgotMock).toHaveBeenCalledWith('awa.diop@gmail.com');
  });

  it('le message attendu dans la boîte : l’objet du vrai message de réinitialisation', async () => {
    forgotMock.mockResolvedValueOnce({ message: 'ok' });
    render(withIntl(<MotDePasseOublie />));
    await demanderLeLien('awa.diop@gmail.com');
    expect(screen.getByText('Réinitialisation de votre mot de passe')).toBeInTheDocument();
  });

  it('« Ouvrir Gmail » pour une adresse Gmail seulement', async () => {
    forgotMock.mockResolvedValue({ message: 'ok' });
    const gmail = render(withIntl(<MotDePasseOublie />));
    await demanderLeLien('awa.diop@gmail.com');
    expect(screen.getAllByRole('link', { name: 'Ouvrir Gmail' }).length).toBeGreaterThan(0);
    gmail.unmount();

    render(withIntl(<MotDePasseOublie />));
    await demanderLeLien('awa@orange.sn');
    expect(screen.queryByRole('link', { name: 'Ouvrir Gmail' })).toBeNull();
  });

  it('le renvoi attend son délai, puis renvoie le lien à la même adresse', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    forgotMock.mockResolvedValue({ message: 'ok' });
    render(withIntl(<MotDePasseOublie />));
    await demanderLeLien('awa.diop@gmail.com');
    const renvoi = screen.getByRole('button', { name: /Renvoyer le lien/ });
    expect(renvoi).toBeDisabled();
    expect(renvoi).toHaveTextContent('Possible dans 60 s');

    for (let i = 0; i < 60; i += 1) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
    expect(renvoi).toBeEnabled();
    expect(renvoi).toHaveTextContent('Possible maintenant');
    fireEvent.click(renvoi);
    await waitFor(() => expect(forgotMock).toHaveBeenCalledTimes(2));
    expect(forgotMock).toHaveBeenLastCalledWith('awa.diop@gmail.com');
  });

  it('« Corriger l’adresse » revient au formulaire, l’adresse gardée', async () => {
    forgotMock.mockResolvedValue({ message: 'ok' });
    render(withIntl(<MotDePasseOublie />));
    await demanderLeLien('awa.diop@gmail.com');
    fireEvent.click(screen.getByRole('button', { name: /Corriger l’adresse/ }));
    expect(screen.getByLabelText('E-mail')).toHaveValue('awa.diop@gmail.com');
  });

  it('le code SMS n’est proposé que si la voie téléphone est ouverte — et il garde l’intention', async () => {
    searchParams = new URLSearchParams({ redirect: RESERVATION, intention: 'reservation' });
    const ferme = render(withIntl(<MotDePasseOublie />));
    expect(screen.queryByRole('link', { name: 'Recevoir un code' })).toBeNull();
    ferme.unmount();

    actif.mockReturnValue(true);
    render(withIntl(<MotDePasseOublie />));
    expect(screen.getByRole('link', { name: 'Recevoir un code' })).toHaveAttribute(
      'href',
      `/auth/login?redirect=${encodeURIComponent(RESERVATION)}&intention=reservation`,
    );
  });

  it('« Retour à la connexion » rouvre la voie e-mail, l’intention gardée (la pastille de la coque)', async () => {
    searchParams = new URLSearchParams({ redirect: RESERVATION, intention: 'reservation' });
    render(
      withIntl(
        <CoqueDEntree libelles={LIBELLES}>
          <MotDePasseOublie />
        </CoqueDEntree>,
      ),
    );
    const attendu = `/auth/login?redirect=${encodeURIComponent(RESERVATION)}&intention=reservation&voie=email`;
    await waitFor(() => expect(screen.getByRole('link', { name: 'Retour à la connexion' })).toHaveAttribute('href', attendu));
    // Le plancher de 44 px des retours (TCK-560, W3).
    expect(screen.getByRole('link', { name: 'Retour à la connexion' })).toHaveClass('min-h-11');
    fireEvent.click(screen.getByRole('button', { name: 'Retour à la connexion' }));
    expect(pushMock).toHaveBeenCalledWith(attendu);
  });
});

describe('/auth/verify-email — la page serveur', () => {
  async function page(params: Record<string, string>): Promise<ReactElement> {
    return VerifyEmailPage({ searchParams: Promise.resolve(params) });
  }

  it('AC3 — un compte déjà vérifié part vers sa destination', async () => {
    utilisateur.mockResolvedValue(compte({ email_verified_at: '2026-11-01T10:00:00Z' }));
    await expect(page({ redirect: RESERVATION })).rejects.toThrow(
      `NEXT_REDIRECT /onboarding/intention?redirect=${encodeURIComponent(RESERVATION)}`,
    );
  });

  it('un compte sans adresse (né par téléphone) n’a rien à vérifier : même sortie', async () => {
    utilisateur.mockResolvedValue(compte({ email: null }));
    await expect(page({})).rejects.toThrow('NEXT_REDIRECT /onboarding/intention');
  });

  it('sans session : la connexion par e-mail, intention gardée', async () => {
    utilisateur.mockResolvedValue(null);
    await expect(page({ redirect: RESERVATION, intention: 'reservation' })).rejects.toThrow(
      `NEXT_REDIRECT /auth/login?redirect=${encodeURIComponent(RESERVATION)}&intention=reservation&voie=email`,
    );
  });

  it('AC3 — un compte non vérifié : son adresse en clair, et « Continuer » vers l’intention', async () => {
    utilisateur.mockResolvedValue(compte({}));
    searchParams = new URLSearchParams({ redirect: RESERVATION });
    render(withIntl(await page({ redirect: RESERVATION })));
    expect(screen.getByRole('heading', { name: 'Vérifiez votre adresse' })).toBeInTheDocument();
    expect(screen.getByText('awa.diop@gmail.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continuer' })).toHaveAttribute(
      'href',
      `/onboarding/intention?redirect=${encodeURIComponent(RESERVATION)}`,
    );
  });
});

describe('Vérifiez votre adresse — l’écran', () => {
  async function ecran() {
    utilisateur.mockResolvedValue(compte({}));
    render(withIntl(await VerifyEmailPage({ searchParams: Promise.resolve(Object.fromEntries(searchParams)) })));
  }

  it('une destination hors du site n’est pas relayée', async () => {
    searchParams = new URLSearchParams({ redirect: '//evil.example' });
    await ecran();
    expect(screen.getByRole('link', { name: 'Continuer' })).toHaveAttribute('href', '/onboarding/intention');
  });

  it('« Corriger l’adresse » envoie la nouvelle au profil, puis la dit', async () => {
    majProfilMock.mockResolvedValue({ ok: true, user: compte({ email: 'awa.diop@orange.sn' }) });
    await ecran();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Corriger l’adresse/ }));
    const champ = screen.getByLabelText('Votre adresse e-mail');
    await user.clear(champ);
    await user.type(champ, 'awa.diop@orange.sn');
    await user.click(screen.getByRole('button', { name: 'Envoyer le lien ici' }));
    await screen.findByText('Adresse corrigée : un nouveau lien est parti à awa.diop@orange.sn.');
    const envoye = majProfilMock.mock.calls[0][0] as FormData;
    expect(envoye.get('email')).toBe('awa.diop@orange.sn');
    expect(refreshUserMock).toHaveBeenCalled();
  });

  it('le geste interrompu est nommé au téléphone (« Continuer ma demande de visite »), le bureau garde « Continuer »', async () => {
    searchParams = new URLSearchParams({ redirect: RESERVATION, intention: 'visite' });
    await ecran();
    const lien = screen.getByRole('link', { name: /Continuer ma demande de visite/ });
    expect(lien).toHaveAttribute('href', `/onboarding/intention?redirect=${encodeURIComponent(RESERVATION)}`);
    expect(lien.querySelector('.lg\\:hidden')).toHaveTextContent('Continuer ma demande de visite');
    expect(lien.querySelector('.hidden.lg\\:inline')).toHaveTextContent(/^Continuer$/);
    expect(screen.getByText(/Vous reprenez votre demande de visite dès que vous continuez/)).toBeInTheDocument();
  });

  it('un geste que la maquette ne nomme pas (une alerte) : la reprise générique', async () => {
    searchParams = new URLSearchParams({ redirect: RESERVATION, intention: 'alerte' });
    await ecran();
    expect(screen.getByRole('link', { name: 'Continuer' })).toBeInTheDocument();
    expect(screen.getByText(/Vous reprenez là où vous en étiez/)).toBeInTheDocument();
  });

  it('l’intention est mémorisée pour le lien du message, dans le stockage PARTAGÉ entre onglets', async () => {
    searchParams = new URLSearchParams({ redirect: RESERVATION, intention: 'reservation' });
    await ecran();
    const brute = window.localStorage.getItem(memoire.CLE_INTENTION_VERIFICATION);
    expect(brute).not.toBeNull();
    expect(JSON.parse(brute as string)).toMatchObject({ redirect: RESERVATION, action: 'reservation' });
    expect(window.sessionStorage.getItem(memoire.CLE_INTENTION_VERIFICATION)).toBeNull();
  });
});

describe('le lien de vérification ouvert dans un autre onglet', () => {
  it('« Continuer » rend l’intention mémorisée, et l’oublie au clic', async () => {
    memoire.memoriserIntentionDeVerification({ redirect: RESERVATION, action: 'reservation' });
    render(
      <ContinuerApresVerification vers="/onboarding/intention" className="">
        Continuer
      </ContinuerApresVerification>,
    );
    const lien = screen.getByRole('link', { name: 'Continuer' });
    await waitFor(() =>
      expect(lien).toHaveAttribute('href', `/onboarding/intention?redirect=${encodeURIComponent(RESERVATION)}`),
    );
    fireEvent.click(lien);
    expect(window.localStorage.getItem(memoire.CLE_INTENTION_VERIFICATION)).toBeNull();
  });

  it('sans session, la connexion — avec le geste, pour la barre du bien', async () => {
    memoire.memoriserIntentionDeVerification({ redirect: RESERVATION, action: 'reservation' });
    render(
      <ContinuerApresVerification vers="/auth/login" className="">
        Se connecter
      </ContinuerApresVerification>,
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
        'href',
        `/auth/login?redirect=${encodeURIComponent(RESERVATION)}&intention=reservation`,
      ),
    );
  });

  it('rien de mémorisé : la porte seule, comme avant', () => {
    render(
      <ContinuerApresVerification vers="/onboarding/intention" className="">
        Continuer
      </ContinuerApresVerification>,
    );
    expect(screen.getByRole('link', { name: 'Continuer' })).toHaveAttribute('href', '/onboarding/intention');
  });

  it('la mémoire est refiltrée à la lecture, et périmée au bout d’un jour', () => {
    window.localStorage.setItem(
      memoire.CLE_INTENTION_VERIFICATION,
      JSON.stringify({ redirect: '//evil.example', action: 'reservation', le: Date.now() }),
    );
    expect(memoire.intentionDeVerificationMemorisee()).toBeNull();

    window.localStorage.setItem(
      memoire.CLE_INTENTION_VERIFICATION,
      JSON.stringify({ redirect: RESERVATION, action: 'pirate', le: Date.now() }),
    );
    expect(memoire.intentionDeVerificationMemorisee()).toEqual({ redirect: RESERVATION, action: null });

    const hier = Date.now() - 25 * 60 * 60 * 1000;
    memoire.memoriserIntentionDeVerification({ redirect: RESERVATION, action: 'reservation' }, hier);
    expect(memoire.intentionDeVerificationMemorisee()).toBeNull();
  });
});

describe('le pied du bouton, au téléphone', () => {
  // La maquette pose son pied à 12 px du bas sur le clavier, à 20 px sans clavier (« Lien envoyé »,
  // « Vérifiez votre adresse ») ; la cale qui garde sa place dans le flux suit.
  it('20 px sous le bouton sans clavier, 12 px posé sur le clavier — la cale suit', async () => {
    const { BoutonCollant } = await import('../BoutonCollant');
    const { container, rerender } = render(<BoutonCollant decalage={0}>x</BoutonCollant>);
    const barre = () => container.querySelector('[data-bouton-collant]') as HTMLElement;
    const cale = () => container.firstElementChild as HTMLElement;

    expect(barre()).toHaveClass('max-lg:pb-5');
    expect(barre()).not.toHaveClass('max-lg:pb-3');
    expect(cale()).toHaveClass('h-20');

    rerender(<BoutonCollant decalage={208}>x</BoutonCollant>);
    expect(barre()).toHaveClass('max-lg:pb-3');
    expect(barre()).not.toHaveClass('max-lg:pb-5');
    expect(cale()).toHaveClass('h-18');
  });
});

/**
 * TCK-2581 (AC2, mesure partielle) — le lien d'invitation « Inviter à candidater » mène à la fiche
 * publique du bien avec `?action=reserver`. Sans session, « Se connecter » pose ce chemin dans
 * `?redirect=` (relevé au navigateur). Ces tests épinglent le reste du trajet, sans envoyer de SMS :
 *
 * - la voie TÉLÉPHONE et la voie MOT DE PASSE rendent la MÊME porte de sortie, paramètre compris
 *   (`/onboarding/intention?redirect=<chemin du bien>%3Faction%3Dreserver`) : les deux appellent
 *   `router.push(sortie)` avec la même `sortie` (`login/page.tsx`), il n'y a pas deux chemins ;
 * - la porte rend ce chemin tel quel : `destinationInterne` garde la requête, et une fiche de bien
 *   est une destination explicite (pas de question d'orientation entre les deux).
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { destinationInterne, estUneDestinationExplicite } from '@/lib/redirection-interne';
import { withIntl } from '@/test/intl';

const pushMock = vi.fn();
const openSessionMock = vi.fn();
const loginMock = vi.fn();
const actif = vi.fn();
const demander = vi.fn();
const verifier = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('@/lib/auth', () => ({
  register: vi.fn(),
  login: (...a: unknown[]) => loginMock(...a),
  isTwoFactorChallenge: () => false,
}));
vi.mock('@/lib/connexion-telephone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connexion-telephone')>()),
  connexionParTelephoneActive: () => actif(),
  demanderCodeTelephone: (...a: unknown[]) => demander(...a),
  verifierCodeTelephone: (...a: unknown[]) => verifier(...a),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ openSession: openSessionMock }) }));
vi.mock('@/components/auth/OAuthButtons', () => ({ OAuthButtons: () => <div />, OAuthSeparator: () => <div /> }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParams,
}));

const { default: LoginPage } = await import('../login/page');

/** Le `redirect` que pose « Se connecter » dans la boîte de la fiche publique (relevé au navigateur). */
const BIEN = '/properties/local-commercial-a-yoff-47RzDU?action=reserver';
const PORTE = `/onboarding/intention?redirect=${encodeURIComponent(BIEN)}`;

beforeEach(() => {
  pushMock.mockReset();
  openSessionMock.mockReset();
  openSessionMock.mockResolvedValue(undefined);
  loginMock.mockReset();
  loginMock.mockResolvedValue({ token: 'jeton', user: { id: 1 } });
  actif.mockReset();
  demander.mockReset();
  verifier.mockReset();
  searchParams = new URLSearchParams({ redirect: BIEN });
});

async function monter() {
  await act(async () => {
    render(withIntl(<LoginPage />));
  });
}

describe('le retour vers la candidature après connexion (TCK-2581, AC2)', () => {
  it('par numéro : la porte de sortie porte la fiche du bien ET `?action=reserver`', async () => {
    const user = userEvent.setup();
    actif.mockResolvedValue(true);
    demander.mockResolvedValue({ attente: 60, codeApercu: null });
    verifier.mockResolvedValue({ token: 'jeton', expires_at: '2026-11-12T12:00:00Z', user: { id: 3 }, is_new_account: false });
    await monter();

    await user.type(await screen.findByLabelText('Numéro de téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Recevoir un code' }));
    await user.type(await screen.findByLabelText('Code reçu par SMS'), '123456');
    await user.click(screen.getByRole('button', { name: 'Vérifier le code' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(PORTE));
  });

  it('par mot de passe : la même porte, au caractère près', async () => {
    const user = userEvent.setup();
    actif.mockResolvedValue(false);
    await monter();

    await user.type(await screen.findByLabelText(/Adresse email/), 'client@example.com');
    await user.type(screen.getByLabelText(/Mot de passe/), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(PORTE));
  });

  it('la porte rend la fiche avec son action, sans question d’orientation entre les deux', () => {
    expect(destinationInterne(BIEN, '')).toBe(BIEN);
    expect(estUneDestinationExplicite(BIEN)).toBe(true);
  });
});

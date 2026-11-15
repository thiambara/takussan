import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import frMessages from '@/messages/fr.json';
import { ApiError } from '@/lib/api';
import type { ApercuDInvitation } from '@/lib/invitation-apercu';

/**
 * TCK-2948 (ADR-0126) — « Rien reçu ? Renvoyer le code dans 0:38, ou le recevoir par appel. » : le lien
 * d'appel n'existe que si `…/code` dit la voie active, partage le rebours du renvoi, envoie `channel: "voice"`
 * et relance le rebours ; un 422 (pas de pilote d'appel) le retire et laisse le SMS.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...reste }: React.ComponentProps<'a'> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ openSession: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), user: null }),
}));
vi.mock('@/i18n/hooks', () => ({ useCurrentLocale: () => 'fr' }));
vi.mock('@/lib/auth', () => ({ login: vi.fn(), isTwoFactorChallenge: () => false }));
vi.mock('@/components/bookings/useIdentiteParTelephone', () => ({ useDrapeauConnexionParTelephone: () => true }));

const demanderCode = vi.fn();
vi.mock('@/lib/invitation-code', () => ({
  demanderCodeDInvitation: (...a: unknown[]) => demanderCode(...a),
  verifierCodeDInvitation: vi.fn(),
}));
vi.mock('@/app/actions/invitations', () => ({ accepterInvitationAction: vi.fn() }));

import { EntreeDInvitation } from '../EntreeDInvitation';

const T = frMessages.invitationAccept;

const PAR_SMS: ApercuDInvitation = {
  role: 'owner',
  agence: { nom: 'Dakar Immo', logo: null, ville: 'Dakar', biensPublics: 214, verifiee: true, telephone: '+221338200000' },
  invitant: 'Aïssatou',
  destinataire: { canal: 'phone', masque: '77 ••• 45 67' },
  compteExistant: false,
  codeSeul: false,
  expireLe: '2026-11-17T10:00:00+00:00',
  inviteeLe: '2026-11-10T10:00:00+00:00',
  prerempli: { prenom: 'Moussa', nom: 'Ndiaye' },
  attente: { biens: 3, intervention: null },
};
const PAR_EMAIL: ApercuDInvitation = { ...PAR_SMS, destinataire: { canal: 'email', masque: 'm•••@gmail.com' } };

function monter(apercu: ApercuDInvitation = PAR_SMS) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="fr" messages={frMessages} timeZone="Africa/Dakar">
        <EntreeDInvitation jeton="jeton-abc" connecte={false} apercu={apercu} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const APPEL = 'le recevoir par appel';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<EntreeDInvitation> — le code par appel (TCK-2948)', () => {
  it('AC1 — voie active : inactif pendant le rebours, actif à sa fin, puis `channel: "voice"` et le rebours relancé', async () => {
    demanderCode
      .mockResolvedValueOnce({ attente: 1, codeApercu: null, voixDisponible: true })
      .mockResolvedValueOnce({ attente: 60, codeApercu: null, voixDisponible: true });
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: T.continuer }));
    const appel = await screen.findByRole('button', { name: APPEL });
    expect(screen.getByText(/Renvoyer le code dans 0:01/)).toBeInTheDocument();
    expect(appel).toBeDisabled();

    // Fin du rebours : le renvoi et l'appel s'ouvrent ensemble.
    await waitFor(() => expect(screen.getByRole('button', { name: APPEL })).toBeEnabled(), { timeout: 2500 });
    expect(screen.getByRole('button', { name: T.code.renvoyer })).toBeEnabled();
    expect(screen.getByText(/, ou/).closest('p')).toHaveTextContent('Rien reçu ? Renvoyer le code, ou le recevoir par appel.');

    await user.click(screen.getByRole('button', { name: APPEL }));
    expect(demanderCode).toHaveBeenLastCalledWith('jeton-abc', null, 'fr', 'voice');
    expect(await screen.findByText(/Renvoyer le code dans 1:00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: APPEL })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(T.code.appelEnCours);
  });

  it('AC1 — par e-mail, l’appel vise le numéro saisi', async () => {
    demanderCode.mockResolvedValue({ attente: 0, codeApercu: null, voixDisponible: true });
    const user = userEvent.setup();
    monter(PAR_EMAIL);

    await user.type(screen.getByLabelText(T.numero.libelle), '771234567');
    await user.click(screen.getByRole('button', { name: T.continuer }));
    await user.click(await screen.findByRole('button', { name: APPEL }));
    expect(demanderCode).toHaveBeenLastCalledWith('jeton-abc', '+221771234567', 'fr', 'voice');
  });

  it('AC2 — voie inactive : la phrase s’arrête au renvoi, aucun lien d’appel', async () => {
    demanderCode.mockResolvedValue({ attente: 38, codeApercu: null, voixDisponible: false });
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: T.continuer }));
    const renvoi = await screen.findByText('Renvoyer le code dans 0:38');
    expect(renvoi.closest('p')).toHaveTextContent(/^Rien reçu \? Renvoyer le code dans 0:3\d$/);
    expect(screen.queryByText(/par appel/)).not.toBeInTheDocument();
  });

  it('422 (aucun pilote d’appel) : le lien se retire, le SMS reste, l’erreur est dite', async () => {
    demanderCode
      .mockResolvedValueOnce({ attente: 0, codeApercu: null, voixDisponible: true })
      .mockRejectedValueOnce(new ApiError(422, { errors: { channel: ['invalide'] } }));
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: T.continuer }));
    await user.click(await screen.findByRole('button', { name: APPEL }));

    expect(await screen.findByRole('alert')).toHaveTextContent(T.errors.appelIndisponible);
    expect(screen.queryByRole('button', { name: APPEL })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: T.code.renvoyer })).toBeEnabled();
    expect(screen.getByLabelText(T.code.libelle)).toBeInTheDocument();
  });
});

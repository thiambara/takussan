import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';
import { destinationDInvitation } from '@/lib/invitation-destination';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));

const openSession = vi.fn();
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ openSession }) }));
vi.mock('@/i18n/hooks', () => ({ useCurrentLocale: () => 'fr' }));

const login = vi.fn();
vi.mock('@/lib/auth', () => ({
  login: (...a: unknown[]) => login(...a),
  isTwoFactorChallenge: () => false,
}));

const accepter = vi.fn();
vi.mock('@/app/actions/invitations', () => ({
  accepterInvitationAction: (...a: unknown[]) => accepter(...a),
}));

import { AccepterInvitation } from '../AccepterInvitation';

const T = frMessages.invitationAccept;

function monter(connecte: boolean) {
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <AccepterInvitation jeton="jeton-abc" connecte={connecte} />
    </NextIntlClientProvider>,
  );
}

/** TCK-626 — le lien d'invitation menait à une 404 ; l'acceptation n'avait aucun appelant. */
describe('<AccepterInvitation>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('connecté : un bouton, puis l’assistant du profil activé', async () => {
    accepter.mockResolvedValue({ ok: true, invitation: { role: 'agent', invitable_id: 12, email: 'a@x.sn', phone: null } });
    const user = userEvent.setup();
    monter(true);

    await user.click(screen.getByRole('button', { name: T.accept }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding/agent?agent=12'));
    expect(accepter).toHaveBeenCalledWith('jeton-abc', undefined);
  });

  it('déconnecté : le compte naît de l’invitation, la session s’ouvre, puis l’assistant', async () => {
    accepter.mockResolvedValue({ ok: true, invitation: { role: 'owner', invitable_id: 3, email: 'awa@x.sn', phone: null } });
    login.mockResolvedValue({ token: 'jeton', user: { id: 9 }, expires_at: null });
    const user = userEvent.setup();
    monter(false);

    await user.type(screen.getByLabelText(T.firstName), 'Awa');
    await user.type(screen.getByLabelText(T.password), 'secret123');
    await user.click(screen.getByRole('button', { name: T.create }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding/owner?owner=3'));
    expect(accepter).toHaveBeenCalledWith('jeton-abc', { first_name: 'Awa', last_name: '', password: 'secret123' });
    expect(login).toHaveBeenCalledWith({ email: 'awa@x.sn', password: 'secret123' }, 'fr');
    expect(openSession).toHaveBeenCalledWith('jeton', { id: 9 }, null);
  });

  it('un compte existe déjà : on le dit, et la connexion ramène ici', async () => {
    accepter.mockResolvedValue({ ok: false, seConnecter: true, email: 'awa@x.sn', message: 'Connectez-vous.' });
    const user = userEvent.setup();
    monter(false);

    await user.type(screen.getByLabelText(T.firstName), 'Awa');
    await user.type(screen.getByLabelText(T.password), 'secret123');
    await user.click(screen.getByRole('button', { name: T.create }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Connectez-vous.');
    expect(screen.getByRole('link', { name: T.signIn })).toHaveAttribute(
      'href',
      `/auth/login?redirect=${encodeURIComponent('/invitations/accept?token=jeton-abc')}`,
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('exige prénom et mot de passe avant d’appeler l’API', async () => {
    const user = userEvent.setup();
    monter(false);
    await user.click(screen.getByRole('button', { name: T.create }));
    expect(await screen.findByRole('alert')).toHaveTextContent(T.required);
    expect(accepter).not.toHaveBeenCalled();
  });
});

describe('destinationDInvitation', () => {
  it.each([
    ['owner', 3, '/onboarding/owner?owner=3'],
    ['agent_manager', 4, '/onboarding/agent?agent=4'],
    ['service_provider', 5, '/onboarding/service-provider?sp=5'],
    ['super_admin', null, '/onboarding/super-admin'],
    ['inconnu', 1, '/app'],
  ] as const)('%s → %s', (role, id, attendu) => {
    expect(destinationDInvitation(role, id)).toBe(attendu);
  });
});

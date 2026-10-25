import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import frMessages from '@/messages/fr.json';

/**
 * P220.07 (TCK-2281) — décision du porteur : un compte connecté SANS NOM voit à l'acceptation le
 * prénom et le nom de l'invitation préremplis, qu'il confirme ou corrige. Un compte nommé garde le
 * seul bouton.
 */
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ openSession: vi.fn(), refreshUser: vi.fn() }) }));
vi.mock('@/i18n/hooks', () => ({ useCurrentLocale: () => 'fr' }));
vi.mock('@/lib/auth', () => ({ login: vi.fn(), isTwoFactorChallenge: () => false }));

const accepter = vi.fn();
vi.mock('@/app/actions/invitations', () => ({
  accepterInvitationAction: (...a: unknown[]) => accepter(...a),
}));

import { AccepterInvitation } from '../AccepterInvitation';

const T = frMessages.invitationAccept;

function monter(prerempli: { prenom: string; nom: string } | null) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <AccepterInvitation jeton="jeton-abc" connecte prerempli={prerempli} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('<AccepterInvitation> connecté et sans nom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accepter.mockResolvedValue({ ok: true, invitation: { role: 'agent', invitable_id: 12, email: null, phone: '+221770000000' } });
  });

  it('préremplit le nom de l’invitation et l’envoie à l’acceptation', async () => {
    const user = userEvent.setup();
    monter({ prenom: 'Awa', nom: 'Sarr' });

    expect(screen.getByLabelText(T.firstName)).toHaveValue('Awa');
    expect(screen.getByLabelText(T.lastName)).toHaveValue('Sarr');
    expect(screen.getByText(T.confirmName)).toBeInTheDocument();
    expect(screen.queryByLabelText(T.password)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: T.accept }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding/agent?agent=12'));
    expect(accepter).toHaveBeenCalledWith('jeton-abc', { first_name: 'Awa', last_name: 'Sarr' });
  });

  it('envoie le nom corrigé, et accepte même prénom effacé', async () => {
    const user = userEvent.setup();
    monter({ prenom: 'Awa', nom: 'Sarr' });

    await user.clear(screen.getByLabelText(T.firstName));
    await user.clear(screen.getByLabelText(T.lastName));
    await user.type(screen.getByLabelText(T.lastName), 'Diop');
    await user.click(screen.getByRole('button', { name: T.accept }));

    await waitFor(() => expect(accepter).toHaveBeenCalledWith('jeton-abc', { first_name: '', last_name: 'Diop' }));
  });

  it('connecté et nommé : le seul bouton, sans champ', async () => {
    const user = userEvent.setup();
    monter(null);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: T.accept }));

    await waitFor(() => expect(accepter).toHaveBeenCalledWith('jeton-abc', undefined));
  });
});

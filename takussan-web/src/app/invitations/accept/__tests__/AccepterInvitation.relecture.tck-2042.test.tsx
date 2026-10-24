/**
 * TCK-2042 (P202.04) — accepter une invitation en étant connecté relit le compte avant de partir.
 *
 * Mesuré le 2026-10-24 : la branche connectée faisait `router.push(destination)` seul. Le profil
 * que l'invitation ajoute n'entrait ni dans `useAuth().user.roles` ni dans la liste des profils.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';

const ordre: string[] = [];
const push = vi.fn((url: string) => ordre.push(`push ${url}`));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));

const refreshUser = vi.fn(async () => {
  ordre.push('refreshUser');
});
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ openSession: vi.fn(), refreshUser }) }));
vi.mock('@/i18n/hooks', () => ({ useCurrentLocale: () => 'fr' }));
vi.mock('@/lib/auth', () => ({ login: vi.fn(), isTwoFactorChallenge: () => false }));

const accepter = vi.fn();
vi.mock('@/app/actions/invitations', () => ({
  accepterInvitationAction: (...a: unknown[]) => accepter(...a),
}));

import { AccepterInvitation } from '../AccepterInvitation';

describe('<AccepterInvitation> connecté — relecture du compte (TCK-2042, P202.04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ordre.length = 0;
  });

  it('relit l’utilisateur et invalide les profils avant de naviguer', async () => {
    accepter.mockResolvedValue({ ok: true, invitation: { role: 'agent', invitable_id: 12, email: 'a@x.sn', phone: null } });
    const client = new QueryClient();
    client.setQueryData(['me', 'profiles'], { data: [], meta: { active_profile_id: null } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="fr" messages={frMessages}>
          <AccepterInvitation jeton="jeton-abc" connecte />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: frMessages.invitationAccept.accept }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding/agent?agent=12'));
    expect(ordre).toEqual(['refreshUser', 'push /onboarding/agent?agent=12']);
    expect(client.getQueryState(['me', 'profiles'])?.isInvalidated).toBe(true);
  });
});

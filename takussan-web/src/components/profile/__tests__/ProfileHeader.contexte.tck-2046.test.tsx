/**
 * TCK-2046 (P202.06) — le nom et la photo changés dans l'en-tête du profil entrent au contexte.
 *
 * Mesuré le 2026-10-24 : l'enregistrement posait l'utilisateur rendu dans un état local, puis
 * `router.refresh()`, sans `setUser` : `useAuth().user`, que lit la `Navbar` publique, gardait
 * l'ancien nom et l'ancienne photo.
 */
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';

const updateProfileMock = vi.hoisted(() => vi.fn());
vi.mock('@/app/actions/auth', () => ({
  updateProfileAction: (fd: FormData) => updateProfileMock(fd),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/queries/favorites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/favorites')>()),
  fetchAllFavoritePropertyIds: vi.fn().mockResolvedValue([]),
}));

const { AuthProvider, useAuth } = await import('@/context/AuthContext');
const { ProfileHeader } = await import('../ProfileHeader');

const COMPTE: User = {
  id: 1,
  first_name: 'Astou',
  last_name: 'Dieng',
  full_name: 'Astou Dieng',
  email: 'astou@example.com',
  phone: '+221771234567',
  bio: null,
  avatar_url: null,
  email_verified_at: null,
  phone_verified_at: '2026-05-08T10:00:00.000000Z',
  two_factor_enabled: false,
  roles: ['owner'],
  status: 'active',
  created_at: '2026-05-08T10:00:00.000000Z',
};

const sonde: { user: User | null } = { user: null };
function Sonde() {
  const { user } = useAuth();
  useEffect(() => {
    sonde.user = user;
  });
  return null;
}

beforeEach(() => {
  updateProfileMock.mockReset();
  sonde.user = null;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
});

describe('<ProfileHeader> dans le contexte (TCK-2046, P202.06)', () => {
  it('pose le nom et la photo enregistrés dans useAuth().user', async () => {
    const browserUser = userEvent.setup();
    updateProfileMock.mockResolvedValue({
      ok: true,
      user: { ...COMPTE, first_name: 'Fatou', last_name: 'Sow', full_name: 'Fatou Sow', avatar_url: 'https://x.sn/a.webp' },
    });
    render(
      withIntl(
        <QueryClientProvider client={new QueryClient()}>
          <AuthProvider initialUser={COMPTE} initialToken="jeton">
            <ProfileHeader user={COMPTE} />
            <Sonde />
          </AuthProvider>
        </QueryClientProvider>,
      ),
    );

    await browserUser.click(screen.getByRole('button', { name: 'Modifier le profil' }));
    await browserUser.clear(screen.getByLabelText('Prénom'));
    await browserUser.type(screen.getByLabelText('Prénom'), 'Fatou');
    await browserUser.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(sonde.user?.first_name).toBe('Fatou'));
    expect(sonde.user?.full_name).toBe('Fatou Sow');
    expect(sonde.user?.avatar_url).toBe('https://x.sn/a.webp');
    // Ce que l'en-tête n'a pas touché reste celui du contexte.
    expect(sonde.user?.phone_verified_at).toBe(COMPTE.phone_verified_at);
  });
});

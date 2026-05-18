import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { ProfileHeader } from '../ProfileHeader';
import type { User } from '@/types/user';

const updateProfileMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('@/app/actions/auth', () => ({
  updateProfileAction: (fd: FormData) => updateProfileMock(fd),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const user: User = {
  id: 1,
  first_name: 'Astou',
  last_name: 'Dieng',
  full_name: 'Astou Dieng',
  email: 'astou@example.com',
  phone: null,
  bio: null,
  avatar_url: null,
  email_verified_at: null,
  phone_verified_at: null,
  two_factor_enabled: false,
  roles: ['owner'],
  status: 'active',
  created_at: '2026-05-08T10:00:00.000000Z',
};

describe('<ProfileHeader>', () => {
  beforeEach(() => {
    updateProfileMock.mockReset();
    refreshMock.mockReset();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:avatar-preview');
  });

  function renderHeader() {
    return render(
      <NextIntlClientProvider
        locale="fr"
        messages={{ common: { actions: { close: 'Fermer' } } }}
      >
        <ProfileHeader user={user} />
      </NextIntlClientProvider>,
    );
  }

  it('updates the displayed name immediately after save', async () => {
    const browserUser = userEvent.setup();
    updateProfileMock.mockResolvedValue({
      ok: true,
      user: {
        ...user,
        first_name: 'Fatou',
        last_name: 'Sow',
        full_name: 'Fatou Sow',
      },
    });

    renderHeader();

    await browserUser.click(screen.getByRole('button', { name: 'Modifier le profil' }));
    await browserUser.clear(screen.getByLabelText('Prénom'));
    await browserUser.type(screen.getByLabelText('Prénom'), 'Fatou');
    await browserUser.clear(screen.getByLabelText('Nom'));
    await browserUser.type(screen.getByLabelText('Nom'), 'Sow');
    await browserUser.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Fatou Sow' })).toBeInTheDocument());
    expect(refreshMock).toHaveBeenCalled();
  });

  it('previews a valid avatar and sends it with the profile update', async () => {
    const browserUser = userEvent.setup();
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    updateProfileMock.mockResolvedValue({
      ok: true,
      user: { ...user, avatar_url: 'http://localhost/avatar.png' },
    });

    renderHeader();

    await browserUser.click(screen.getByRole('button', { name: 'Modifier le profil' }));
    await browserUser.upload(screen.getByLabelText('Avatar'), file);
    expect(screen.getByText('avatar.png')).toBeInTheDocument();

    await browserUser.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalled());
    const formData = updateProfileMock.mock.calls[0][0] as FormData;
    expect(formData.get('avatar')).toBe(file);
  });

  it('rejects an invalid avatar file before submit', async () => {
    const browserUser = userEvent.setup();
    const file = new File(['not an image'], 'avatar.txt', { type: 'text/plain' });

    renderHeader();

    await browserUser.click(screen.getByRole('button', { name: 'Modifier le profil' }));
    fireEvent.change(screen.getByLabelText('Avatar'), {
      target: { files: [file] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Le fichier doit être une image valide.',
    );
    expect(updateProfileMock).not.toHaveBeenCalled();
  });
});

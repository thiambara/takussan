import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AppNotification } from '@/lib/notifications';
import type { MyProfilesResponse, Profile } from '@/types/profile';
import { withIntl } from '@/test/intl';

import { NotificationRow } from '../NotificationRow';

/**
 * TCK-1761 (P161.04) — un avis émis pour l'agence B, ouvert sous le profil de l'agence A, bascule
 * sur le profil de B avant d'ouvrir sa page : les pages de la section lisent l'agence du profil
 * actif, et montraient sinon les données de A sans signe d'erreur. Sans profil dans B, la ligne
 * n'est plus un lien.
 */

const push = vi.fn();
const mutateAsync = vi.fn();
let profils: MyProfilesResponse | undefined;

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: profils, isLoading: profils === undefined }),
  useSwitchActiveProfile: () => ({ mutateAsync, isPending: false }),
}));

function profil(id: string, type: Profile['type'], agencyId: number): Profile {
  return { id, type, numeric_id: 1, agency_id: agencyId, status: 'active', created_at: null };
}

function notification(agencyId: number): AppNotification {
  return {
    id: 9,
    type: 'system',
    code: 'governance.member_removed',
    params: {},
    target: { kind: 'audit', id: null, path: '/app/agency/audit', agency_id: agencyId },
    title: 'Alerte',
    body: null,
    is_read: false,
    read_at: null,
    created_at: '2026-10-06T08:00:00+00:00',
  };
}

function renderRow(n: AppNotification) {
  const onOpen = vi.fn();
  render(withIntl(<ul><NotificationRow notification={n} onOpen={onOpen} onToggleRead={vi.fn()} /></ul>));
  return { onOpen };
}

describe('NotificationRow — l’agence de la cible', () => {
  beforeEach(() => {
    push.mockReset();
    mutateAsync.mockReset().mockResolvedValue({ data: {} });
    profils = {
      data: [profil('agency_admin:1', 'agency_admin', 1), profil('agent:2', 'agent', 2), profil('agency_admin:2', 'agency_admin', 2)],
      meta: { active_profile_id: 'agency_admin:1', count: 3 },
    };
  });

  it('bascule sur le profil de l’agence de l’avis avant d’ouvrir sa page', async () => {
    const { onOpen } = renderRow(notification(2));

    await userEvent.click(screen.getByRole('link'));

    expect(onOpen).toHaveBeenCalled();
    // Le profil d'admin de B, préféré à celui d'agent : la page vise la section d'agence.
    expect(mutateAsync).toHaveBeenCalledWith('agency_admin:2');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/agency/audit'));
  });

  it('ne bascule pas quand l’avis est de l’agence active', async () => {
    renderRow(notification(1));

    const lien = screen.getByRole('link');
    expect(lien).toHaveAttribute('href', '/app/agency/audit');
    await userEvent.click(lien);

    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('n’est plus un lien quand le destinataire n’a plus de profil dans l’agence', () => {
    renderRow(notification(3));

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('n’ouvre pas la page quand la bascule échoue', async () => {
    mutateAsync.mockRejectedValue(new Error('403'));
    renderRow(notification(2));

    await userEvent.click(screen.getByRole('link'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });
});

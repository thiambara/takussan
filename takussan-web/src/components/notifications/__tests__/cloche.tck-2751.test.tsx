import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { NotificationBell } from '@/components/layout/NotificationBell';
import type { AppNotification, NotificationsResponse } from '@/lib/notifications';
import type { MyProfilesResponse, Profile } from '@/types/profile';
import { withIntl } from '@/test/intl';

/**
 * TCK-2751 (AC2, côté front) — la scène du compte 176 de la démo : agent de l'agence 1, propriétaire
 * dans l'agence 2, il lit dans son espace de propriétaire. L'API rend désormais `target.agency_id` sur
 * la notification d'une intervention de l'agence 1 : la cloche bascule sur son profil d'agent
 * (PATCH active-profile) avant d'ouvrir l'objet, par la ligne comme par son verbe. Sans la clé (lecteur
 * non membre, à qui l'API ne la rend pas), la ligne reste un lien simple, sans bascule. Une
 * notification de SECTION dont l'API retient l'agence arrive sans cible : la ligne est inerte.
 */

const getNotificationsMock = vi.fn<() => Promise<{ ok: true; data: NotificationsResponse }>>();
const markReadMock = vi.fn();
const push = vi.fn();
const mutateAsync = vi.fn();
let profils: MyProfilesResponse | undefined;

vi.mock('@/app/actions/notifications', () => ({
  getNotificationsAction: () => getNotificationsMock(),
  markNotificationReadAction: (id: number) => markReadMock(id),
  markNotificationUnreadAction: vi.fn(),
  markNotificationsReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/app',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: profils, isLoading: profils === undefined }),
  useSwitchActiveProfile: () => ({ mutateAsync, isPending: false }),
}));

const profil = (id: string, type: Profile['type'], agencyId: number, nom: string): Profile =>
  ({
    id,
    type,
    numeric_id: 1,
    agency_id: agencyId,
    status: 'active',
    created_at: null,
    agency: { id: agencyId, name: nom, slug: `a${agencyId}` },
  }) as Profile;

function intervention(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 111,
    type: 'maintenance',
    code: 'maintenance.completed',
    params: { title: 'Fuite sous l’évier' },
    target: { kind: 'maintenance', id: 111, path: '/app/maintenance/111', agency_id: 1 },
    title: 'Intervention terminée',
    body: null,
    is_read: false,
    read_at: null,
    created_at: new Date().toISOString(),
    famille: 'demande',
    a_traiter: true,
    ...overrides,
  };
}

function reponse(data: AppNotification[]): { ok: true; data: NotificationsResponse } {
  return {
    ok: true,
    data: {
      data,
      meta: {
        total: data.length,
        unread: data.length,
        current_page: 1,
        last_page: 1,
        counts: { a_traiter_non_lues: data.filter((d) => d.a_traiter).length, par_famille: { demande: data.length } },
      },
    },
  };
}

async function ouvrir() {
  const utilisateur = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <NotificationBell emplacement="colonne" />
      </QueryClientProvider>,
    ),
  );
  await utilisateur.click(screen.getByRole('button', { name: 'Notifications' }));
  const cloche = await screen.findByRole('dialog', { name: 'Centre de notifications' });
  return { utilisateur, cloche };
}

describe('TCK-2751 — la notification d’un objet d’une autre agence bascule d’espace', () => {
  beforeEach(() => {
    push.mockReset();
    markReadMock.mockReset();
    mutateAsync.mockReset().mockResolvedValue({ data: {} });
    profils = {
      data: [profil('owner:29', 'owner', 2, 'Thiès Properties'), profil('agent:20', 'agent', 1, 'Dakar Immo')],
      meta: { active_profile_id: 'owner:29', count: 2 },
    };
  });

  it('le verbe d’une intervention de l’agence 1 bascule sur le profil d’agent, puis ouvre l’intervention', async () => {
    const avis = intervention();
    getNotificationsMock.mockImplementation(async () => reponse([avis]));
    markReadMock.mockResolvedValue({ ok: true, data: { ...avis, read_at: new Date().toISOString() } });

    const { utilisateur, cloche } = await ouvrir();
    expect(await within(cloche).findByText('Dans Dakar Immo')).toBeInTheDocument();
    await utilisateur.click(within(cloche).getByRole('link', { name: 'Confirmer' }));

    expect(mutateAsync).toHaveBeenCalledWith('agent:20');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/maintenance/111'));
  });

  it('sans agency_id (lecteur non membre), la ligne reste un lien simple, sans bascule', async () => {
    const avis = intervention({ target: { kind: 'maintenance', id: 111, path: '/app/maintenance/111' } });
    getNotificationsMock.mockImplementation(async () => reponse([avis]));
    markReadMock.mockResolvedValue({ ok: true, data: avis });

    const { utilisateur, cloche } = await ouvrir();
    const verbe = await within(cloche).findByRole('link', { name: 'Confirmer' });
    expect(verbe).toHaveAttribute('href', '/app/maintenance/111');
    expect(within(cloche).queryByText(/^Dans /)).toBeNull();
    await utilisateur.click(verbe);

    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('une notification de section que l’API rend sans cible (membre parti) est inerte : ni lien, ni verbe', async () => {
    const avis = intervention({
      id: 7,
      code: 'review.to_moderate',
      params: { subject: 'Dakar Immo', rating: 4 },
      param_types: { subject: 'text', rating: 'number' },
      title: 'Avis à modérer',
      famille: 'avis',
      target: null,
    });
    getNotificationsMock.mockImplementation(async () => reponse([avis]));

    const { cloche } = await ouvrir();
    expect(await within(cloche).findByText(/Avis à modérer/)).toBeInTheDocument();
    expect(within(cloche).queryByRole('link', { name: 'Modérer' })).toBeNull();
    expect(within(cloche).queryByRole('link', { name: /Avis à modérer/ })).toBeNull();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

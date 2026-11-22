import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EnTeteMobile } from '../EnTeteMobile';
import { NotificationBell } from '../NotificationBell';
// TCK-286 — l'en-tête et `NotificationBell` passent par next-intl : sans provider, le rendu
// lève. Les assertions ci-dessous sont INCHANGÉES, le dictionnaire fr rend les mêmes libellés.
import { withIntl } from '@/test/intl';

const getNotificationsMock = vi.fn();
const markReadMock = vi.fn();
const markUnreadMock = vi.fn();
const markAllReadMock = vi.fn();

vi.mock('@/app/actions/notifications', () => ({
  getNotificationsAction: () => getNotificationsMock(),
  markNotificationReadAction: (id: number) => markReadMock(id),
  markNotificationUnreadAction: (id: number) => markUnreadMock(id),
  markAllNotificationsReadAction: () => markAllReadMock(),
}));

function response() {
  return {
    data: [
      {
        id: 1,
        type: 'system',
        title: 'Plus récente',
        body: 'Notification non lue',
        is_read: false,
        read_at: null,
        created_at: '2026-05-08T12:00:00.000000Z',
      },
      {
        id: 2,
        type: 'system',
        title: 'Plus ancienne',
        body: 'Notification lue',
        is_read: true,
        read_at: '2026-05-08T11:30:00.000000Z',
        created_at: '2026-05-08T11:00:00.000000Z',
      },
    ],
    meta: { total: 2, unread: 1, current_page: 1 },
  };
}

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('<NotificationBell>', () => {
  beforeEach(() => {
    getNotificationsMock.mockReset();
    markReadMock.mockReset();
    markUnreadMock.mockReset();
    markAllReadMock.mockReset();
  });

  it('TCK-2491 — visible dans l’en-tête mobile, avec la pastille des non-lues', async () => {
    getNotificationsMock.mockResolvedValue({ ok: true, data: response() });

    render(wrap(<EnTeteMobile />));

    expect(
      screen.getByRole('button', { name: 'Notifications' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
  });

  it('TCK-1035 (P68.08) — le panneau ouvert n’ajoute pas un second repère `banner`', async () => {
    const browserUser = userEvent.setup();
    getNotificationsMock.mockResolvedValue({ ok: true, data: response() });

    render(wrap(<EnTeteMobile />));
    await browserUser.click(screen.getByRole('button', { name: 'Notifications' }));

    const feed = await screen.findByRole('dialog', { name: 'Centre de notifications' });
    expect(within(feed).getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(within(feed).queryByRole('banner')).toBeNull();
    // Le seul `banner` qui reste est l'en-tête (TCK-2491 : l'en-tête mobile ; la barre haute est partie) (le panneau rend le reste `aria-hidden`).
    expect(screen.getAllByRole('banner', { hidden: true })).toHaveLength(1);
  });

  it('opens a date-sorted feed and marks one notification as read', async () => {
    const browserUser = userEvent.setup();
    getNotificationsMock.mockResolvedValue({ ok: true, data: response() });
    markReadMock.mockResolvedValue({
      ok: true,
      data: {
        ...response().data[0],
        is_read: true,
        read_at: '2026-05-08T12:05:00.000000Z',
      },
    });

    render(wrap(<NotificationBell />));
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());

    await browserUser.click(screen.getByRole('button', { name: 'Notifications' }));

    const feed = await screen.findByRole('dialog', {
      name: 'Centre de notifications',
    });
    const items = within(feed).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Plus récente');
    expect(items[1]).toHaveTextContent('Plus ancienne');

    await browserUser.click(
      within(items[0]).getByRole('button', { name: 'Marquer lu' }),
    );

    await waitFor(() => expect(markReadMock).toHaveBeenCalledWith(1));
    // TCK-2634 — le panneau du bureau résume « N non lues · N à traiter » ; à zéro, « Aucune non lue ».
    await waitFor(() => expect(screen.getByText('Aucune non lue')).toBeInTheDocument());
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('TCK-588 — un clic sur la ligne ouvre la cible, la marque lue et ferme la cloche', async () => {
    const browserUser = userEvent.setup();
    const rappel = {
      ...response().data[0],
      id: 9,
      code: 'lease_payment.overdue',
      params: { amount: { amount: '150000.00', currency: 'XOF' }, days: 1, due_date: '2026-10-05', property: 'Villa Almadies' },
      target: { kind: 'lease', id: 12, path: '/app/leases/12' },
    };
    getNotificationsMock.mockResolvedValue({ ok: true, data: { ...response(), data: [rappel] } });
    markReadMock.mockResolvedValue({ ok: true, data: { ...rappel, is_read: true, read_at: '2026-10-06T08:01:00.000000Z' } });

    render(wrap(<NotificationBell />));
    await browserUser.click(screen.getByRole('button', { name: 'Notifications' }));
    const feed = await screen.findByRole('dialog', { name: 'Centre de notifications' });

    const lien = within(feed).getByRole('link', { name: /Loyer en retard/ });
    expect(lien).toHaveAttribute('href', '/app/leases/12');
    // TCK-2634 — le pied de la maquette : « Tout l’historique » et « Préférences ».
    expect(within(feed).getByRole('link', { name: 'Tout l’historique' })).toHaveAttribute('href', '/app/notifications');
    expect(within(feed).getByRole('link', { name: 'Préférences de notification' })).toHaveAttribute('href', '/app/profile/notifications');

    await browserUser.click(lien);

    await waitFor(() => expect(markReadMock).toHaveBeenCalledWith(9));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

// TCK-2691:début
/**
 * TCK-2691 (ADR-0106, C5 et C9) — la cloche a deux jeux de cotes : dans l'en-tête du téléphone, 20 px au
 * trait 1,75 à l'encre douce ; dans la colonne, 18 px au trait des lignes (1,5) en `muted-foreground`.
 */
describe('TCK-2691 — les cotes de la cloche selon sa surface', () => {
  beforeEach(() => {
    getNotificationsMock.mockReset();
    getNotificationsMock.mockResolvedValue(response());
  });

  it('dans l’en-tête du téléphone : icônes de 20 px au trait 1,75, à l’encre douce, marges `pl-4 pr-1.5`', () => {
    const { container } = render(wrap(<EnTeteMobile onOuvrirPalette={() => {}} />));
    const entete = container.querySelector('[data-slot="en-tete-mobile"]')!;
    expect(entete.className.split(/\s+/)).toEqual(expect.arrayContaining(['pl-4', 'pr-1.5']));
    for (const bouton of [screen.getByRole('button', { name: 'Notifications' }), container.querySelector('[data-slot="ouvrir-palette"]')!]) {
      expect(bouton.className.split(/\s+/)).toContain('text-encre-douce');
      expect(bouton.className.split(/\s+/)).not.toContain('text-muted-foreground');
      const icone = bouton.querySelector('svg')!;
      expect(icone.getAttribute('class')!.split(/\s+/)).toContain('size-5');
      expect(icone.getAttribute('stroke-width')).toBe('1.75');
    }
  });

  it('dans la colonne (défaut) : 18 px au trait 1,5, `muted-foreground`', () => {
    render(wrap(<NotificationBell align="start" />));
    const bouton = screen.getByRole('button', { name: 'Notifications' });
    expect(bouton.className.split(/\s+/)).toContain('text-muted-foreground');
    const icone = bouton.querySelector('svg')!;
    expect(icone.getAttribute('class')!.split(/\s+/)).toContain('size-[18px]');
    expect(icone.getAttribute('stroke-width')).toBe('1.5');
  });
});
// TCK-2691:fin

// TCK-2712:début
/**
 * TCK-2712 (11a, ADR-0106) — la pastille des non-lues de la maquette (`Pastille`, `chrome-app.tsx`) :
 * `h-4 min-w-4 px-1`, 10 px 600, interligne 10 (`leading-none` dans une boîte de `h-4` centrée), anneau
 * `card`. Sa place suit la surface : la colonne la pose à `top-0 -right-0.5` du bouton de 28,8 px
 * (x 203,2 y 10,8 à 1440), l'en-tête à `top-0.5 right-0.5` du bouton de 40 px (x 362 y 9,5 à 390).
 */
describe('TCK-2712 — la pastille des non-lues', () => {
  beforeEach(() => {
    getNotificationsMock.mockReset();
    getNotificationsMock.mockResolvedValue({ ok: true, data: response() });
  });

  const DESSIN = ['inline-flex', 'h-4', 'min-w-4', 'items-center', 'justify-center', 'rounded-full', 'bg-primary', 'px-1', 'text-pastille', 'font-semibold', 'leading-none', 'tabular-nums', 'text-primary-foreground', 'ring-2', 'ring-card'];

  it('dans la colonne : le dessin de la maquette, à `top-0 -right-0.5`', async () => {
    render(wrap(<NotificationBell align="start" />));
    const pastille = await screen.findByText('1');
    const c = pastille.className.split(/\s+/);
    expect(c).toEqual(expect.arrayContaining([...DESSIN, 'top-0', '-right-0.5']));
    for (const ancien of ['font-bold', 'leading-4', 'ring-background', '-top-1', '-right-1']) expect(c).not.toContain(ancien);
  });

  it('dans l’en-tête du téléphone : le même dessin, à `top-0.5 right-0.5`', async () => {
    render(wrap(<EnTeteMobile onOuvrirPalette={() => {}} />));
    const pastille = await screen.findByText('1');
    const c = pastille.className.split(/\s+/);
    expect(c).toEqual(expect.arrayContaining([...DESSIN, 'top-0.5', 'right-0.5']));
    expect(c).not.toContain('-right-0.5');
  });
});
// TCK-2712:fin

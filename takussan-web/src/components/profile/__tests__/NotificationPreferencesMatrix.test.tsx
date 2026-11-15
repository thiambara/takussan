import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationPreferencesMatrix } from '../NotificationPreferencesMatrix';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { EVENEMENTS_DE_PREFERENCE } from '@/lib/notification-preferences';
import { withIntl } from '@/test/intl';

const getMock = vi.fn();
const updateMock = vi.fn();

vi.mock('@/app/actions/notification-preferences', () => ({
  getNotificationPreferencesAction: () => getMock(),
  updateNotificationPreferencesAction: (prefs: unknown) => updateMock(prefs),
}));

const CANAUX = ['inapp', 'email', 'push', 'sms', 'whatsapp'] as const;
/** Les événements qu'un SMS ou un WhatsApp peut porter (`PreferenceResolver::channelsFor`). */
const MOBILES = ['lease_payment_due', 'lease_payment_overdue', 'lease_payment_received', 'booking_status_changed', 'visit_reminder'];

type Surcharge = { event: string; channel: string; enabled?: boolean; locked?: boolean; reason?: string };

/**
 * La matrice telle que l'API la rend (`PreferenceResolver::matrixFor`) : « Appli » toujours active,
 * la notification mobile sans transport, SMS et WhatsApp sur les seuls événements mobiles, et
 * verrouillés tant que le téléphone n'est pas vérifié.
 */
function grille({ telephoneVerifie = true, surcharges = [] as Surcharge[] } = {}) {
  const preferences = EVENEMENTS_DE_PREFERENCE.flatMap((event) =>
    CANAUX.map((channel) => {
      const s = surcharges.find((o) => o.event === event && o.channel === channel);
      let cell: { event_type: string; channel: string; enabled: boolean; locked: boolean; reason?: string };
      if (channel === 'inapp') cell = { event_type: event, channel, enabled: true, locked: true, reason: 'inapp_always_on' };
      else if (channel === 'push' || ((channel === 'sms' || channel === 'whatsapp') && !MOBILES.includes(event)))
        cell = { event_type: event, channel, enabled: false, locked: true, reason: 'channel_unavailable' };
      else if ((channel === 'sms' || channel === 'whatsapp') && !telephoneVerifie)
        cell = { event_type: event, channel, enabled: false, locked: true, reason: 'phone_not_verified' };
      else cell = { event_type: event, channel, enabled: channel === 'email' || MOBILES.includes(event), locked: false };
      return s ? { ...cell, ...(s.enabled !== undefined ? { enabled: s.enabled } : {}), ...(s.locked !== undefined ? { locked: s.locked } : {}), ...(s.reason ? { reason: s.reason } : {}) } : cell;
    }),
  );
  return { preferences, events: [...EVENEMENTS_DE_PREFERENCE], channels: [...CANAUX], phone_verified: telephoneVerifie };
}

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(
    <QueryClientProvider client={client}>
      <ToastProvider>
        {ui}
        <Toaster />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const matchMediaDOrigine = window.matchMedia;
function auBureau(oui: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: oui,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

function rangee(libelle: string): HTMLElement {
  const li = screen.getByText(libelle).closest('li');
  expect(li, `rangée « ${libelle} »`).not.toBeNull();
  return li as HTMLElement;
}

beforeEach(() => {
  getMock.mockReset();
  updateMock.mockReset();
});
afterEach(() => {
  window.matchMedia = matchMediaDOrigine;
});

describe('<NotificationPreferencesMatrix> — téléphone : une rangée par événement (TCK-2636)', () => {
  beforeEach(() => auBureau(false));

  it('rend les 21 événements, groupés, Baux en tête, dont les six qui n’avaient pas d’interrupteur', async () => {
    getMock.mockResolvedValue({ ok: true, data: grille() });
    const { container } = render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => expect(screen.getByText('Loyer en retard')).toBeInTheDocument());

    expect(container.querySelectorAll('li[data-evenement]')).toHaveLength(EVENEMENTS_DE_PREFERENCE.length);
    // TCK-2783 — 21 avec le rappel d'expiration d'une pièce (`document_expiring`).
    expect(EVENEMENTS_DE_PREFERENCE).toHaveLength(21);
    for (const libelle of [
      'Renouvellement du bail',
      'Résiliation anticipée du bail',
      'Révision du loyer',
      'Relance de facture',
      'Rappel d’état des lieux d’entrée',
      'Rappel de tâche',
    ]) {
      expect(screen.getByText(libelle)).toBeInTheDocument();
    }
    // Le titre seul : un groupe replié ajoute son résumé au nom du bouton.
    const titres = screen.getAllByRole('heading', { level: 2 }).map((h) => h.querySelector('button > span > span')?.textContent);
    expect(titres).toEqual(['Baux', 'Messages', 'Réservations', 'Maintenance', 'Avis', 'Alertes', 'Biens']);
    // Aucune matrice au téléphone : pas de table, pas d'en-tête de colonne.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // Comme la maquette : les deux premiers groupes ouverts, les autres repliés sur leur résumé.
    const deplies = screen.getAllByRole('button', { expanded: true }).map((b) => b.textContent);
    expect(deplies).toEqual(['Baux', 'Messages']);
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(5);
  });

  it('AC3 — chaque événement est atteignable : ouvrir chaque groupe replié montre toutes ses rangées, avec leurs puces', async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({ ok: true, data: grille() });
    const { container } = render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Loyer en retard'));

    expect(screen.getByText('Rappel de tâche')).not.toBeVisible();
    for (const bouton of screen.getAllByRole('button', { expanded: false })) await user.click(bouton);

    const rangees = [...container.querySelectorAll('li[data-evenement]')];
    expect(rangees).toHaveLength(21);
    for (const li of rangees) {
      expect(li, li.getAttribute('data-evenement') ?? '').toBeVisible();
      expect(within(li as HTMLElement).getAllByRole('checkbox').length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Rappel de tâche')).toBeVisible();
  });

  it('chaque événement mobile a ses puces, dont « WhatsApp » ; les autres disent pourquoi elle manque', async () => {
    getMock.mockResolvedValue({ ok: true, data: grille() });
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Loyer en retard'));

    const retard = rangee('Loyer en retard');
    const puces = within(retard).getAllByRole('checkbox').map((p) => p.textContent);
    expect(puces).toEqual(['Appli', 'E-mail', 'SMS', 'WhatsApp']);

    // « Renouvellement du bail » ne part ni par SMS ni par WhatsApp : pas de puce morte…
    const renouvellement = rangee('Renouvellement du bail');
    expect(within(renouvellement).getAllByRole('checkbox').map((p) => p.textContent)).toEqual(['Appli', 'E-mail']);
    // … et le groupe le dit, comme il dit la notification mobile sans transport.
    const baux = screen.getByRole('heading', { name: 'Baux' }).closest('section') as HTMLElement;
    expect(within(baux).getByText('Notification mobile : pas encore disponible.')).toBeInTheDocument();
    expect(within(baux).getByText('SMS et WhatsApp : pas d’envoi pour les autres événements de ce groupe.')).toBeInTheDocument();
    const messages = screen.getByRole('heading', { name: 'Messages' }).closest('section') as HTMLElement;
    expect(within(messages).getByText('SMS et WhatsApp : pas d’envoi pour ces événements.')).toBeInTheDocument();
  });

  it('toucher « WhatsApp » sur « Loyer en retard » envoie la case inversée, et « Enregistré » est annoncé (AC2)', async () => {
    const user = userEvent.setup();
    const initial = grille();
    getMock.mockResolvedValue({ ok: true, data: initial });
    updateMock.mockResolvedValue({
      ok: true,
      data: grille({ surcharges: [{ event: 'lease_payment_overdue', channel: 'whatsapp', enabled: false }] }),
    });
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Loyer en retard'));

    const whatsapp = within(rangee('Loyer en retard')).getByRole('checkbox', { name: /Loyer en retard.*WhatsApp/ });
    expect(whatsapp).toHaveAttribute('aria-checked', 'true');
    await user.click(whatsapp);

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith([{ event_type: 'lease_payment_overdue', channel: 'whatsapp', enabled: false }]),
    );
    expect(await screen.findByText('Enregistré')).toBeInTheDocument();
    await waitFor(() => expect(whatsapp).toHaveAttribute('aria-checked', 'false'));
  });

  it('« Enregistré » s’annonce à CHAQUE changement, pas une seule fois', async () => {
    const user = userEvent.setup();
    const initial = grille();
    getMock.mockResolvedValue({ ok: true, data: initial });
    updateMock.mockResolvedValue({ ok: true, data: initial });
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Loyer en retard'));

    await user.click(within(rangee('Loyer en retard')).getByRole('checkbox', { name: /E-mail/ }));
    await waitFor(() => expect(screen.getAllByText('Enregistré')).toHaveLength(1));
    await user.click(within(rangee('Nouveau message')).getByRole('checkbox', { name: /E-mail/ }));
    await waitFor(() => expect(screen.getAllByText('Enregistré')).toHaveLength(2));
  });

  it('m1 — un refus du serveur remet la puce comme avant et dit pourquoi', async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({ ok: true, data: grille() });
    updateMock.mockResolvedValue({ ok: false, message: 'Le serveur a refusé.' });
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Loyer en retard'));

    const email = within(rangee('Loyer en retard')).getByRole('checkbox', { name: /Loyer en retard.*E-mail/ });
    expect(email).toHaveAttribute('aria-checked', 'true');
    await user.click(email);

    expect(await screen.findByRole('alert')).toHaveTextContent('Le serveur a refusé.');
    await waitFor(() => expect(email).toHaveAttribute('aria-checked', 'true'));
    expect(screen.queryByText('Enregistré')).not.toBeInTheDocument();
  });

  it('m2 — pendant un enregistrement, la puce qui part est occupée, les autres le disent, et un toucher n’est pas perdu sans signe', async () => {
    const user = userEvent.setup();
    const initial = grille();
    getMock.mockResolvedValue({ ok: true, data: initial });
    let repondre: (v: unknown) => void = () => {};
    updateMock.mockImplementation(() => new Promise((r) => (repondre = r)));
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Loyer en retard'));

    const a = within(rangee('Loyer en retard')).getByRole('checkbox', { name: /Loyer en retard.*E-mail/ });
    const b = within(rangee('Nouveau message')).getByRole('checkbox', { name: /Nouveau message.*E-mail/ });
    await user.click(a);
    await waitFor(() => expect(a).toHaveAttribute('aria-busy', 'true'));
    expect(a).not.toHaveAttribute('aria-disabled');
    expect(b).toHaveAttribute('aria-disabled', 'true');
    // Toujours au clavier : pas de `disabled`, le focus ne saute pas.
    expect(b).not.toBeDisabled();

    await user.click(b);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(b).toHaveAttribute('aria-checked', 'true');

    repondre({ ok: true, data: initial });
    await waitFor(() => expect(b).not.toHaveAttribute('aria-disabled'));
    expect(a).not.toHaveAttribute('aria-busy');
    // Une fois l'envoi fini, B se touche normalement.
    await user.click(b);
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(2));
  });

  it('une puce verrouillée n’envoie rien et montre sa raison en sous-ligne', async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({ ok: true, data: grille({ telephoneVerifie: false }) });
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Loyer en retard'));

    const retard = rangee('Loyer en retard');
    const whatsapp = within(retard).getByRole('checkbox', { name: /WhatsApp/ });
    expect(whatsapp).toBeDisabled();
    expect(whatsapp).toHaveAccessibleName('Loyer en retard — WhatsApp (Téléphone non vérifié.)');
    await user.click(whatsapp);
    expect(updateMock).not.toHaveBeenCalled();
    expect(within(retard).getByText('SMS et WhatsApp : vérifiez votre téléphone pour les activer.')).toBeInTheDocument();
    expect(screen.getByText(/téléphone n'est pas vérifié/i)).toBeInTheDocument();
  });

  it('un numéro déclaré sans WhatsApp verrouille la seule puce WhatsApp et le dit (TCK-1094)', async () => {
    getMock.mockResolvedValue({
      ok: true,
      data: grille({ surcharges: [{ event: 'lease_payment_overdue', channel: 'whatsapp', enabled: false, locked: true, reason: 'phone_without_whatsapp' }] }),
    });
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Loyer en retard'));

    const retard = rangee('Loyer en retard');
    expect(within(retard).getByRole('checkbox', { name: /WhatsApp/ })).toBeDisabled();
    expect(within(retard).getByRole('checkbox', { name: /SMS/ })).not.toBeDisabled();
    expect(within(retard).getByText('WhatsApp : votre numéro est déclaré sans WhatsApp.')).toBeInTheDocument();
  });

  it('« Appli », toujours active, est cochée, ne se décoche pas et ne porte pas de sous-ligne', async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({ ok: true, data: grille() });
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Nouveau message'));

    const ligne = rangee('Nouveau message');
    const appli = within(ligne).getByRole('checkbox', { name: /Appli/ });
    expect(appli).toHaveAttribute('aria-checked', 'true');
    expect(appli).toBeDisabled();
    await user.click(appli);
    expect(updateMock).not.toHaveBeenCalled();
    expect(within(ligne).queryByText(/:/)).not.toBeInTheDocument();
  });

  it('un groupe replié se résume et s’ouvre ; un groupe ouvert se replie', async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({ ok: true, data: grille() });
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Nouveau message'));

    // Réservations, replié au chargement : son résumé, ses rangées montées mais masquées.
    const reservations = screen.getByRole('button', { name: /Réservations/ });
    expect(reservations).toHaveAttribute('aria-expanded', 'false');
    expect(within(reservations).getByText('2 événements · WhatsApp, SMS, E-mail, Appli')).toBeInTheDocument();
    expect(screen.getByText('Statut d’une réservation')).not.toBeVisible();
    await user.click(reservations);
    expect(reservations).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Statut d’une réservation')).toBeVisible();

    const messages = screen.getByRole('button', { name: 'Messages' });
    await user.click(messages);
    expect(messages).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Nouveau message')).not.toBeVisible();
    expect(within(messages).getByText('1 événement · E-mail, Appli')).toBeInTheDocument();
  });

  it('un canal absent du dictionnaire garde sa valeur brute sur la puce', async () => {
    const g = grille();
    getMock.mockResolvedValue({
      ok: true,
      data: {
        ...g,
        channels: [...g.channels, 'canal_futur'],
        preferences: [...g.preferences, { event_type: 'message_received', channel: 'canal_futur', enabled: false, locked: false }],
      },
    });
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Nouveau message'));

    expect(within(rangee('Nouveau message')).getByRole('checkbox', { name: /canal_futur/ })).toHaveTextContent('canal_futur');
    expect(screen.queryByText(/channels\.canal_futur/)).not.toBeInTheDocument();
    erreur.mockRestore();
  });

  it('garde l’écran après une réponse d’enregistrement sans métadonnées', async () => {
    const user = userEvent.setup();
    const initial = grille();
    const apres = grille({ surcharges: [{ event: 'message_received', channel: 'email', enabled: false }] });
    getMock.mockResolvedValue({ ok: true, data: initial });
    updateMock.mockResolvedValue({ ok: true, data: { preferences: apres.preferences } });
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Nouveau message'));

    const email = within(rangee('Nouveau message')).getByRole('checkbox', { name: /E-mail/ });
    await user.click(email);
    expect(await screen.findByText('Enregistré')).toBeInTheDocument();
    expect(screen.getByText('Nouveau message')).toBeInTheDocument();
    expect(within(rangee('Nouveau message')).getByRole('checkbox', { name: /E-mail/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('affiche l’erreur du serveur', async () => {
    getMock.mockResolvedValue({ ok: false, message: 'Preference endpoint down.' });
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Preference endpoint down.'));
  });
});

describe('<NotificationPreferencesMatrix> — bureau : la matrice (TCK-2636)', () => {
  beforeEach(() => auBureau(true));

  it('en-têtes en français : Appli, E-mail, Notif. mobile, SMS, WhatsApp — ni « In-app » ni « Push » (AC4)', async () => {
    getMock.mockResolvedValue({ ok: true, data: grille() });
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Loyer en retard'));

    const table = screen.getByRole('table', { name: 'Baux' });
    const entetes = within(table).getAllByRole('columnheader').map((th) => th.textContent?.trim());
    expect(entetes).toEqual(['Événement', 'Appli', 'E-mail', 'Notif. mobile', 'SMS', 'WhatsApp']);
    expect(screen.queryByText('In-app')).not.toBeInTheDocument();
    expect(screen.queryByText('Push')).not.toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(7);
    expect(screen.getAllByRole('rowheader')).toHaveLength(21);
  });

  it('cocher une case envoie la mise à jour', async () => {
    const user = userEvent.setup();
    const initial = grille();
    getMock.mockResolvedValue({ ok: true, data: initial });
    updateMock.mockResolvedValue({ ok: true, data: initial });
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Loyer en retard'));

    const whatsapp = screen.getByRole('checkbox', { name: 'Loyer en retard — WhatsApp' });
    expect(whatsapp).toHaveAttribute('aria-checked', 'true');
    await user.click(whatsapp);
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith([{ event_type: 'lease_payment_overdue', channel: 'whatsapp', enabled: false }]),
    );
  });

  it('m2 — au bureau aussi, la case qui part est occupée et les autres attendent en le disant', async () => {
    const user = userEvent.setup();
    const initial = grille();
    getMock.mockResolvedValue({ ok: true, data: initial });
    let repondre: (v: unknown) => void = () => {};
    updateMock.mockImplementation(() => new Promise((r) => (repondre = r)));
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Loyer en retard'));

    const a = screen.getByRole('checkbox', { name: 'Loyer en retard — WhatsApp' });
    const b = screen.getByRole('checkbox', { name: 'Loyer en retard — E-mail' });
    await user.click(a);
    await waitFor(() => expect(a).toHaveAttribute('aria-busy', 'true'));
    expect(b).toHaveAttribute('aria-disabled', 'true');
    await user.click(b);
    expect(updateMock).toHaveBeenCalledTimes(1);

    repondre({ ok: true, data: initial });
    await waitFor(() => expect(b).not.toHaveAttribute('aria-disabled'));
  });

  it('une case verrouillée dit pourquoi et n’envoie rien ; « Appli » reste cochée', async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({ ok: true, data: grille({ telephoneVerifie: false }) });
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Loyer en retard'));

    const sms = screen.getByRole('checkbox', { name: /Loyer en retard — SMS/ });
    expect(sms).toHaveAttribute('aria-disabled', 'true');
    expect(sms.parentElement).toHaveAttribute('title', 'Téléphone non vérifié.');
    await user.click(sms);

    const push = screen.getByRole('checkbox', { name: /Avis reçu — Notif\. mobile/ });
    expect(push).toHaveAttribute('aria-disabled', 'true');
    expect(push.parentElement).toHaveAttribute('title', 'Aucun message de ce type ne part sur ce canal.');

    const appli = screen.getByRole('checkbox', { name: /Avis reçu — Appli/ });
    expect(appli).toHaveAttribute('aria-checked', 'true');
    await user.click(appli);
    expect(updateMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Notification mobile : pas encore disponible\./)).toBeInTheDocument();
  });

  it('un canal absent du dictionnaire garde sa valeur brute en en-tête', async () => {
    const g = grille();
    getMock.mockResolvedValue({
      ok: true,
      data: { ...g, channels: [...g.channels, 'canal_futur'], preferences: [...g.preferences, { event_type: 'message_received', channel: 'canal_futur', enabled: false, locked: false }] },
    });
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Nouveau message'));
    expect(screen.getAllByRole('columnheader', { name: 'canal_futur' }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/channels\.canal_futur/)).not.toBeInTheDocument();
    erreur.mockRestore();
  });
});

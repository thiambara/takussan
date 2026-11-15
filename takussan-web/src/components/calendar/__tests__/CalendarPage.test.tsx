import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';
import type { CalendarEvent, CalendarEventType } from '@/types/calendar';
import { CalendarPage, type CalendarPageProps } from '../CalendarPage';

/**
 * TCK-2597 — « Agenda » (maquette `app-agenda` a) : l'agent ouvre sa journée au téléphone et sa
 * semaine au bureau, sans les séjours ; l'admin ouvre le mois, les séjours en barres ; « Occupation
 * des biens » porte ce qui tient à un bien. Tout vit dans l'URL (TCK-1740).
 */

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);

type Resultat = { data?: { data: CalendarEvent[] }; isPending: boolean; isLoading: boolean; isError: boolean; refetch: () => void };
const etat = vi.hoisted(() => ({
  evenements: [] as CalendarEvent[],
  sejoursDuJour: [] as CalendarEvent[],
  pending: false,
  erreur: false,
  biensIndex: [] as { id: number; title: string }[],
  locatifs: [] as { id: number; title: string }[],
  concernes: [] as { id: number; title: string }[],
}));

const { useCalendarMock } = vi.hoisted(() => ({ useCalendarMock: vi.fn() }));
vi.mock('@/lib/queries/calendar', () => ({
  useCalendar: useCalendarMock,
  calendarQueryKeys: { range: (p: unknown) => ['calendar', 'range', p] as const },
}));

const { useBiensDeLAgendaMock } = vi.hoisted(() => ({ useBiensDeLAgendaMock: vi.fn() }));
vi.mock('@/lib/queries/agenda', () => ({
  useBiensDeLAgenda: useBiensDeLAgendaMock,
  useBienDeLAgenda: (id: number | null) => ({ data: id === null ? undefined : { data: [{ id, title: `Bien ${id}` }] }, isPending: false }),
  useBiensParIdentifiants: () => ({ data: { data: etat.concernes }, isPending: false }),
  useBiensLocatifs: () => ({ data: { pages: [{ data: etat.locatifs }] }, isPending: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() }),
}));

vi.mock('@/lib/queries/visits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/visits')>()),
  useVisitesDeLaVue: () => ({ data: undefined, isPending: true }),
}));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => true, useAgenceDuPersonnelActif: () => 1 }));
// Mardi 10 novembre 2026, 10 h à Dakar (UTC).
vi.mock('@/hooks/useMinuteCourante', () => ({ useMinuteCourante: () => new Date('2026-11-10T10:00:00Z') }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({
  PlanifierUneVisite: () => <button type="button">Planifier une visite</button>,
  PlanifierDialog: ({ jour, heure }: { jour?: string; heure?: string }) => <div data-testid="planifier" data-jour={jour} data-heure={heure ?? ''} />,
}));
vi.mock('@/components/crm/CalendarSubscription', () => ({
  CalendarSubscription: () => <div data-testid="abonnement-ical" />,
}));

/** La largeur de la fenêtre, en px : les seuils de l'agenda s'écrivent `(width >= Nrem)`. */
function largeur(px: number) {
  window.matchMedia = ((query: string) => {
    const m = /\(width >= ([\d.]+)rem\)/.exec(query);
    return {
      matches: m !== null && px >= Number(m[1]) * 16,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

function monte(props: CalendarPageProps = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><CalendarPage {...props} /></QueryClientProvider>));
}

type Appel = { start_date: string; end_date: string; types: CalendarEventType[]; mine?: boolean; property_id?: number; enabled?: boolean };
const appels = () => useCalendarMock.mock.calls.map((c) => c[0] as Appel);
/** La requête principale : celle qui n'est pas le compte des séjours du jour. */
const principale = () => appels().filter((a) => !(a.types.length === 1 && a.types[0] === 'booking' && a.start_date === a.end_date)).at(-1)!;

function visite(o: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 429,
    type: 'visit',
    title: 'Appartement F3 Plateau',
    start: '2026-11-10 10:57:00',
    end: '2026-11-10 11:27:00',
    status: 'scheduled',
    all_day: false,
    duration_minutes: 30,
    property_id: 57,
    visitor_name: 'Ndeye Wade',
    address_line: 'Rue 10',
    neighborhood: 'Dakar-Plateau',
    resource_url: '/app/visits/429',
    ...o,
  };
}

function sejour(o: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 900,
    type: 'booking',
    title: 'Villa Almadies',
    start: '2026-11-03 00:00:00',
    end: '2026-11-26 00:00:00',
    status: 'confirmed',
    all_day: true,
    property_id: 22,
    reference: 'RES-900',
    resource_url: '/app/bookings/900',
    ...o,
  };
}

beforeEach(() => {
  navigationDeTest.reinitialiser();
  largeur(390);
  etat.evenements = [];
  etat.sejoursDuJour = [];
  etat.pending = false;
  etat.erreur = false;
  etat.biensIndex = [];
  etat.locatifs = [];
  etat.concernes = [];
  useCalendarMock.mockReset();
  useCalendarMock.mockImplementation((p: Appel): Resultat => {
    const duJour = p.types.length === 1 && p.types[0] === 'booking' && p.start_date === p.end_date;
    return { data: { data: duJour ? etat.sejoursDuJour : etat.evenements }, isPending: etat.pending, isLoading: etat.pending, isError: etat.erreur, refetch: vi.fn() };
  });
  useBiensDeLAgendaMock.mockReset();
  useBiensDeLAgendaMock.mockImplementation(() => ({ data: { data: etat.biensIndex }, isFetching: false }));
});

describe('<CalendarPage> — l’agent (TCK-2597)', () => {
  it('ouvre sa journée au téléphone, sans URL de vue, avec ses visites et ses tâches seulement', () => {
    navigationDeTest.reinitialiser('date=2026-11-10');
    etat.evenements = [visite()];
    monte({ persona: 'agent', audience: 'staff', defaultMine: true });

    expect(screen.getByTestId('calendar-event-row-visit-429')).toHaveTextContent('Ndeye Wade');
    expect(principale()).toMatchObject({ types: ['visit', 'task'], mine: true, start_date: '2026-11-09', end_date: '2026-11-15' });
  });

  it('« Mon agenda » ne demande pas les séjours : seul leur compte du jour, sur un jour', () => {
    navigationDeTest.reinitialiser('date=2026-11-10');
    monte({ persona: 'agent', audience: 'staff', defaultMine: true });

    expect(principale().types).not.toContain('booking');
    const sejours = appels().filter((a) => a.types.includes('booking'));
    expect(sejours.length).toBeGreaterThan(0);
    for (const a of sejours) expect(a).toMatchObject({ types: ['booking'], start_date: '2026-11-10', end_date: '2026-11-10' });
  });

  it('respecte `?view=month` au téléphone', () => {
    navigationDeTest.reinitialiser('view=month&date=2026-11-10');
    monte({ persona: 'agent', audience: 'staff', defaultMine: true });

    expect(screen.getByTestId('calendar-day-2026-11-10')).toBeInTheDocument();
    expect(principale()).toMatchObject({ start_date: '2026-10-26' });
  });

  it('ouvre sa semaine au bureau ; le créneau vide du mercredi à 15 h ouvre la planification préremplie', async () => {
    largeur(1440);
    navigationDeTest.reinitialiser('date=2026-11-10');
    etat.evenements = [visite()];
    monte({ persona: 'agent', audience: 'staff', defaultMine: true });

    expect(screen.getByTestId('calendar-event-pill-visit-429')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByTestId('agenda-creneau-2026-11-11-15:00'));
    expect(screen.getByTestId('planifier')).toHaveAttribute('data-jour', '2026-11-11');
    expect(screen.getByTestId('planifier')).toHaveAttribute('data-heure', '15:00');
  });

  it('écrit la vue choisie dans l’URL, même quand c’est celle de l’ouverture', async () => {
    largeur(1440);
    monte({ persona: 'agent', audience: 'staff', defaultMine: true });

    await userEvent.setup().click(screen.getByTestId('calendar-view-week'));
    expect(navigationDeTest.requete()).toBe('view=week');
  });

  it('ouvre la fiche d’une visite, avec son lien', async () => {
    largeur(1440);
    navigationDeTest.reinitialiser('date=2026-11-10');
    etat.evenements = [visite()];
    monte({ persona: 'agent', audience: 'staff', defaultMine: true });

    await userEvent.setup().click(screen.getByTestId('calendar-event-pill-visit-429'));
    const fiche = await screen.findByTestId('calendar-event-detail');
    expect(fiche).toHaveTextContent('Ndeye Wade');
    expect(screen.getByTestId('calendar-event-open-resource')).toHaveAttribute('href', '/app/visits/429');
  });
});

describe('<CalendarPage> — l’admin et le bailleur (TCK-2597)', () => {
  it('ouvre le mois ; un séjour de 23 nuits est UNE barre par semaine traversée, jamais un morceau par jour', () => {
    largeur(1440);
    navigationDeTest.reinitialiser('date=2026-11-10');
    etat.evenements = [sejour(), visite()];
    monte({ persona: 'admin', audience: 'staff' });

    expect(principale().types).toEqual(['booking', 'visit', 'task', 'lease_event', 'maintenance']);
    // Nuits du 3 au 25 novembre : les semaines du 2, du 9, du 16 et du 23.
    expect(screen.getAllByTestId('calendar-sejour-900')).toHaveLength(4);
    expect(screen.queryByTestId('calendar-event-pill-booking-900')).not.toBeInTheDocument();
    expect(screen.getByTestId('calendar-event-pill-visit-429')).toBeInTheDocument();
  });

  it('le mois ouvre seul ; deux puces par jour puis « +N », et toucher un jour ouvre son panneau', async () => {
    largeur(1440);
    navigationDeTest.reinitialiser('date=2026-11-10');
    etat.evenements = [visite(), visite({ id: 430, start: '2026-11-10 14:30:00' }), visite({ id: 431, start: '2026-11-10 16:55:00' })];
    monte({ persona: 'admin', audience: 'staff' });

    expect(screen.queryByTestId('calendar-selected-day')).not.toBeInTheDocument();
    expect(screen.getByTestId('calendar-event-pill-visit-429')).toHaveTextContent('10:57 · Visite');
    expect(screen.queryByTestId('calendar-event-pill-visit-431')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByTestId('calendar-day-overflow-2026-11-10'));
    expect(within(screen.getByTestId('calendar-selected-day')).getByText('Mardi 10 novembre')).toBeInTheDocument();
  });

  it('au téléphone, l’occupation dit sa plage courte et ses quatorze jours', () => {
    navigationDeTest.reinitialiser('date=2026-11-10&mode=occupation');
    monte({ persona: 'admin', audience: 'staff' });

    expect(screen.getByTestId('calendar-focus-label')).toHaveTextContent('10–23 nov.');
    expect(screen.getByLabelText('Quatorze jours')).toHaveTextContent('14 j');
    expect(principale()).toMatchObject({ start_date: '2026-11-10', end_date: '2026-11-23' });
  });

  it('au téléphone, la semaine dit sa plage courte ; au bureau, la semaine entière', () => {
    navigationDeTest.reinitialiser('date=2026-11-10&view=week');
    const { unmount } = monte({ persona: 'agent', audience: 'staff' });
    expect(screen.getByTestId('calendar-focus-label')).toHaveTextContent('9–15 nov.');
    // Le menu dit « Sem. » : « Semaine » ne laissait que 47 px à la plage, coupée sur quatre lignes.
    expect(screen.getByTestId('agenda-menu-vue')).toHaveTextContent(/^Sem\.$/);
    unmount();

    largeur(1440);
    monte({ persona: 'agent', audience: 'staff' });
    expect(screen.getByText('9–15 novembre 2026')).toBeInTheDocument();
  });

  it('« Occupation » demande séjours, échéances et interventions sur le mois, un bien par ligne', async () => {
    largeur(1440);
    navigationDeTest.reinitialiser('date=2026-11-10');
    etat.evenements = [sejour()];
    etat.concernes = [{ id: 22, title: 'Villa Almadies' }];
    etat.locatifs = [{ id: 31, title: 'Studio Mermoz' }, { id: 22, title: 'Villa Almadies' }];
    monte({ persona: 'admin', audience: 'staff' });

    await userEvent.setup().click(screen.getByRole('radio', { name: 'Occupation des biens' }));
    expect(navigationDeTest.requete()).toBe('date=2026-11-10&mode=occupation');
    expect(principale()).toMatchObject({ types: ['booking', 'lease_event', 'maintenance'], start_date: '2026-11-01', end_date: '2026-11-30' });
    expect(screen.getByTestId('occupation-bien-22')).toHaveTextContent('Occupé jusqu’au');
    expect(screen.getByTestId('occupation-bien-31')).toHaveTextContent('Libre');
    expect(screen.getAllByTestId('occupation-sejour-900')).toHaveLength(1);
    // Au bureau, le résumé est la ligne de la tête de page.
    expect(screen.getByText('1 séjour en cours · 1 bien libre ce soir')).toBeInTheDocument();
  });

  it('le filtre « Bien » liste l’index des biens par leur titre, y compris un bien sans événement', async () => {
    largeur(1440);
    etat.biensIndex = [{ id: 31, title: 'Studio Mermoz' }, { id: 57, title: 'Appartement F3 Plateau' }];
    monte({ persona: 'admin', audience: 'staff' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^Bien/ }));
    const champ = await screen.findByRole('combobox');
    await user.click(champ);
    expect(await screen.findByRole('option', { name: 'Studio Mermoz' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Studio Mermoz' }));
    expect(navigationDeTest.requete()).toBe('property=31');
    await waitFor(() => expect(principale()).toMatchObject({ property_id: 31 }));
  });

  it('un type se bascule dans l’URL, et le dernier allumé ne s’éteint pas', async () => {
    largeur(1440);
    navigationDeTest.reinitialiser('types=visit');
    monte({ persona: 'admin', audience: 'staff' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^Types/ }));
    expect(await screen.findByTestId('calendar-type-toggle-visit')).toHaveAttribute('data-disabled');
    await user.click(screen.getByTestId('calendar-type-toggle-task'));
    expect(navigationDeTest.requete()).toBe('types=visit%2Ctask');
  });

  it('l’abonnement iCal s’ouvre en feuille depuis la tête de page', async () => {
    largeur(1440);
    monte({ persona: 'admin', audience: 'staff', abonnement: true });

    await userEvent.setup().click(screen.getByRole('button', { name: 'S’abonner (iCal)' }));
    expect(await screen.findByTestId('abonnement-ical')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Abonnement iCal' })).toBeInTheDocument();
  });

  it('sans droit au lien, ni bouton ni feuille d’abonnement', () => {
    largeur(1440);
    monte({ persona: 'bailleur', audience: 'landlord' });

    expect(screen.queryByRole('button', { name: 'S’abonner (iCal)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Planifier une visite' })).not.toBeInTheDocument();
  });
});

describe('<CalendarPage> — états', () => {
  it('attend l’écran avant de lire, puis montre un squelette pendant le chargement', () => {
    etat.pending = true;
    const { container } = monte({ persona: 'admin', audience: 'staff' });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('dit l’échec de lecture', () => {
    etat.erreur = true;
    monte({ persona: 'admin', audience: 'staff' });
    expect(screen.getByText('Impossible de charger l’agenda.')).toBeInTheDocument();
  });

  it('le prestataire : ses interventions seules, sans « Occupation » ni bascule de types', () => {
    largeur(1440);
    monte({ persona: 'prestataire', audience: 'provider' });

    expect(principale()).toMatchObject({ types: ['maintenance'], mine: false });
    expect(screen.queryByRole('radio', { name: 'Occupation des biens' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Types/ })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('calendar-legend')).getByText('Interventions')).toBeInTheDocument();
  });
});

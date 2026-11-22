import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';
import type { CalendarEvent, CalendarEventType } from '@/types/calendar';
import { CalendarPage, type CalendarPageProps } from '../CalendarPage';

/**
 * TCK-2888 — l'agenda (maquette `app-agenda` a, e0 e2 e3 e4) : « dans 45 min » dans la tête de la
 * prochaine carte du jour, « · 1ʳᵉ visite » sur la fiche, le client sur la barre d'un séjour et le
 * quartier sous le titre du bien, la durée de l'occupation au téléphone (14 j, 30 j).
 * Le banc est celui de `CalendarPage.test.tsx` (TCK-2597), l'instant présent en plus.
 */

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);

type Resultat = { data?: { data: CalendarEvent[] }; isPending: boolean; isLoading: boolean; isError: boolean; refetch: () => void };
const etat = vi.hoisted(() => ({
  evenements: [] as CalendarEvent[],
  sejoursDuJour: [] as CalendarEvent[],
  pending: false,
  erreur: false,
  biensIndex: [] as { id: number; title: string }[],
  locatifs: [] as { id: number; title: string; location?: { quarter: string | null } }[],
  concernes: [] as { id: number; title: string; location?: { quarter: string | null } }[],
  maintenant: new Date('2026-11-10T10:00:00Z'),
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
// Mardi 10 novembre 2026 à Dakar (UTC) ; l'heure change selon le test.
vi.mock('@/hooks/useMinuteCourante', () => ({ useMinuteCourante: () => etat.maintenant }));
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
  etat.maintenant = new Date('2026-11-10T10:00:00Z');
  useCalendarMock.mockReset();
  useCalendarMock.mockImplementation((p: Appel): Resultat => {
    const duJour = p.types.length === 1 && p.types[0] === 'booking' && p.start_date === p.end_date;
    return { data: { data: duJour ? etat.sejoursDuJour : etat.evenements }, isPending: etat.pending, isLoading: etat.pending, isError: etat.erreur, refetch: vi.fn() };
  });
  useBiensDeLAgendaMock.mockReset();
  useBiensDeLAgendaMock.mockImplementation(() => ({ data: { data: etat.biensIndex }, isFetching: false }));
});

describe('« dans N min » dans la tête de la prochaine carte du jour (AC1)', () => {
  it('à 390, une visite dans 45 min porte « dans 45 min » dans la tête de sa carte, et elle seule', () => {
    navigationDeTest.reinitialiser('date=2026-11-10');
    etat.maintenant = new Date('2026-11-10T10:12:00Z');
    etat.evenements = [visite(), visite({ id: 430, start: '2026-11-10 16:55:00', end: '2026-11-10 17:25:00' })];
    monte({ persona: 'agent', audience: 'staff', defaultMine: true });

    const carte = screen.getByTestId('calendar-event-row-visit-429');
    expect(carte.querySelector('[data-slot="rebours"]')).toHaveTextContent('dans 45 min');
    expect(screen.getByTestId('calendar-event-row-visit-430').querySelector('[data-slot="rebours"]')).toBeNull();
  });

  it('à trois heures de la visite, l’heure seule', () => {
    navigationDeTest.reinitialiser('date=2026-11-10');
    etat.maintenant = new Date('2026-11-10T07:57:00Z');
    etat.evenements = [visite()];
    monte({ persona: 'agent', audience: 'staff', defaultMine: true });

    expect(screen.getByTestId('calendar-event-row-visit-429')).not.toHaveTextContent(/dans \d/);
  });

  it('au bureau, « dans 45 min » est dans la tête de la carte du jour choisi', () => {
    largeur(1440);
    navigationDeTest.reinitialiser('date=2026-11-10');
    etat.maintenant = new Date('2026-11-10T10:12:00Z');
    etat.evenements = [visite()];
    monte({ persona: 'agent', audience: 'staff', defaultMine: true });

    const jour = screen.getByTestId('calendar-selected-day');
    expect(jour.querySelector('[data-slot="rebours"]')).toHaveTextContent('dans 45 min');
  });
});

describe('« · 1ʳᵉ visite » sur la fiche (AC2)', () => {
  it('la fiche d’une première visite dit « {visiteur} · 1ʳᵉ visite » ; une deuxième ne le dit pas', async () => {
    largeur(1440);
    navigationDeTest.reinitialiser('date=2026-11-10');
    etat.evenements = [visite({ visit_rank: 1 }), visite({ id: 430, start: '2026-11-10 16:55:00', end: '2026-11-10 17:25:00', visitor_name: 'Ousmane Ba', visit_rank: 2 })];
    monte({ persona: 'agent', audience: 'staff', defaultMine: true });
    const user = userEvent.setup();

    await user.click(screen.getByTestId('calendar-event-pill-visit-429'));
    expect(await screen.findByTestId('calendar-event-detail')).toHaveTextContent('Ndeye Wade · 1ʳᵉ visite');

    await user.click(screen.getByTestId('calendar-event-pill-visit-430'));
    await waitFor(() => expect(screen.getByTestId('calendar-event-detail')).toHaveTextContent('Ousmane Ba'));
    expect(screen.getByTestId('calendar-event-detail')).not.toHaveTextContent('1ʳᵉ visite');
  });
});

describe('le client sur la barre du séjour, le quartier sous le titre (AC3)', () => {
  it('à 1440, la barre du séjour d’Awa Diop porte « Awa Diop » ; la colonne des biens dit le quartier sous chaque titre', () => {
    largeur(1440);
    navigationDeTest.reinitialiser('date=2026-11-10&mode=occupation');
    etat.evenements = [
      sejour({ id: 901, title: 'Appartement vue mer', property_id: 22, start: '2026-11-12 00:00:00', end: '2026-11-15 00:00:00', customer_name: 'Awa Diop', neighborhood: 'Ngor' }),
      sejour({ id: 902, title: 'Studio meublé', property_id: 31, start: '2026-11-20 00:00:00', end: '2026-11-22 00:00:00', status: 'pending', customer_name: 'Bineta Ndoye' }),
    ];
    etat.concernes = [{ id: 22, title: 'Appartement vue mer', location: { quarter: 'Ngor' } }, { id: 31, title: 'Studio meublé', location: { quarter: 'Mermoz' } }];
    etat.locatifs = [{ id: 40, title: 'Maison familiale', location: { quarter: 'Ouakam' } }];
    monte({ persona: 'admin', audience: 'staff' });

    expect(screen.getByTestId('occupation-sejour-901')).toHaveTextContent(/^Awa Diop$/);
    expect(screen.getByTestId('occupation-sejour-902')).toHaveTextContent(/^Bineta Ndoye · en attente$/);
    expect(screen.getByTestId('occupation-bien-22')).toHaveTextContent('Appartement vue merNgor · Libre');
    expect(screen.getByTestId('occupation-bien-31')).toHaveTextContent('Mermoz ·');
    // Un bien sans événement dans la fenêtre a aussi son quartier.
    expect(screen.getByTestId('occupation-bien-40')).toHaveTextContent('Ouakam · Libre');
  });

  it('sans le nom du client (le bailleur), la barre dit ses nuits et sa référence', () => {
    largeur(1440);
    navigationDeTest.reinitialiser('date=2026-11-10&mode=occupation');
    etat.evenements = [sejour({ id: 901, property_id: 22, start: '2026-11-12 00:00:00', end: '2026-11-15 00:00:00', reference: 'RES-901' })];
    etat.concernes = [{ id: 22, title: 'Villa Almadies' }];
    monte({ persona: 'admin', audience: 'staff' });

    expect(screen.getByTestId('occupation-sejour-901')).toHaveTextContent('3 nuits · RES-901');
  });

  it('au mois, la barre dit « Séjour · {bien} · {client} »', () => {
    largeur(1440);
    navigationDeTest.reinitialiser('date=2026-11-10');
    etat.evenements = [sejour({ title: 'F2 Grand Yoff', customer_name: 'Rama Sy' })];
    monte({ persona: 'admin', audience: 'staff' });

    expect(screen.getAllByTestId('calendar-sejour-900')[0]).toHaveTextContent('Séjour · F2 Grand Yoff · Rama Sy');
  });

  it('au téléphone, le quartier suit le titre du bien', () => {
    navigationDeTest.reinitialiser('date=2026-11-10&mode=occupation');
    etat.locatifs = [{ id: 40, title: 'Maison familiale', location: { quarter: 'Ouakam' } }];
    monte({ persona: 'admin', audience: 'staff' });

    expect(screen.getByTestId('occupation-bien-40')).toHaveTextContent('Maison familiale · Ouakam');
  });
});

describe('la durée de l’occupation au téléphone (AC7)', () => {
  it('« 14 j » porte son chevron et ouvre le choix 14 j / 30 j ; 30 j lit trente jours', async () => {
    navigationDeTest.reinitialiser('date=2026-11-10&mode=occupation');
    monte({ persona: 'admin', audience: 'staff' });
    const user = userEvent.setup();

    const menu = screen.getByTestId('agenda-menu-duree');
    expect(menu).toHaveAccessibleName('Durée affichée : Quatorze jours');
    expect(menu).toHaveTextContent('14 j');
    expect(menu.querySelector('svg')).not.toBeNull();

    await user.click(menu);
    await user.click(await screen.findByTestId('agenda-duree-30'));
    expect(navigationDeTest.requete()).toBe('date=2026-11-10&mode=occupation&duree=30');
    await waitFor(() => expect(principale()).toMatchObject({ start_date: '2026-11-10', end_date: '2026-12-09' }));
    expect(screen.getByTestId('calendar-focus-label')).toHaveTextContent('10 nov. – 9 déc.');
    expect(screen.getByTestId('agenda-menu-duree')).toHaveTextContent('30 j');
  });
});

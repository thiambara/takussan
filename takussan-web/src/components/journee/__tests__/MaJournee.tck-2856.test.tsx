/**
 * TCK-2856 — « Ma journée » de l'agent : le compte à rebours de la prochaine visite au bureau, les deux
 * sous-lignes de « Mes chiffres », les suggestions nominatives de « Journée libre », deux colonnes dès `lg`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { chronologieDuJour } from '@/lib/journee/journee';
import type { SuggestionsDeLaJournee } from '@/lib/queries/journee';
import { withIntl } from '@/test/intl';
import type { PropertyVisit } from '@/types/visit';

import { Chronologie } from '../Chronologie';
import { JourneeLibre } from '../JourneeLibre';
import { MaJournee } from '../MaJournee';
import { MesChiffres } from '../MesChiffres';

const etat = vi.hoisted(() => ({
  appels: [] as string[],
  suggestions: null as unknown,
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, roles: ['agent'], agency_id: 3 }, token: 'jeton' }) }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => false }));
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({ DeclarerEnTete: () => null }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierDialog: () => null }));

// Une journée libre : aucune visite, aucune tâche, aucune demande ; 6 clients à relancer.
vi.mock('@/lib/api', async (original) => {
  const vrai = await original<typeof import('@/lib/api')>();
  return {
    ...vrai,
    apiRequest: vi.fn(async (chemin: string) => {
      etat.appels.push(chemin);
      const route = chemin.split('?')[0];
      const page = (data: unknown[], total = data.length) => ({ data, meta: { total, per_page: 30, current_page: 1, last_page: 1 } });
      if (route === '/api/dashboard/me') return { data: { role: 'agent', metrics: {}, sections: [], suggestions: etat.suggestions } };
      if (route === '/api/customers') return page([{ id: 1 }], 6);
      if (route === '/api/calendar') return { data: [] };
      return page([]);
    }),
  };
});

const ADRESSE = { line: '12, rue Carnot', neighborhood: 'Dakar-Plateau', city: 'Dakar', latitude: 14.6681, longitude: -17.4318 };
const visite = (id: number, scheduled_at: string, duration_minutes = 30) =>
  ({
    id,
    status: 'confirmed',
    type: 'in_person',
    duration_minutes,
    scheduled_at,
    property: { id, title: `Bien ${id}`, slug: 'b', cover_url: null, address: ADRESSE },
  }) as PropertyVisit;
const DIX_HEURES = visite(1, '2026-11-10T10:00:00Z');
const SEIZE_H_55 = visite(2, '2026-11-10T16:55:00Z', 45);
const gestes = { onCocher: () => {}, onReporter: () => {}, onContacter: () => {}, enCours: null };

/** La chronologie d'aujourd'hui, à l'horloge de la journée (relue chaque minute), comme `MaJournee`. */
function ChronologieALHeure() {
  const maintenant = useMinuteCourante();
  return <Chronologie moments={chronologieDuJour([DIX_HEURES, SEIZE_H_55], [])} maintenant={maintenant} gestes={gestes} onPlanifier={() => {}} />;
}

const rebours = () => [...document.querySelectorAll<HTMLElement>('[data-slot="compte-a-rebours"]')];

beforeEach(() => {
  Object.assign(etat, { appels: [], suggestions: null });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AC1 — « dans 45 min » au bureau', () => {
  it('à 09:15, la visite de 10:00 dit « dans 45 min » au bureau, sa durée au téléphone ; la suivante garde sa durée', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-11-10T09:15:00Z'));
    render(withIntl(<ChronologieALHeure />));
    const [compte, ...autres] = rebours();
    expect(autres).toHaveLength(0);
    expect(compte).toHaveTextContent('dans 45 min');
    // Au bureau seulement : le téléphone garde la durée (maquette `app-aujourdhui` e0).
    expect(compte!.className).toContain('max-md:hidden');
    const ligne = compte!.closest('li')!;
    expect(within(ligne).getByText('30 min').className).toContain('md:hidden');
    expect(ligne.textContent).toMatch(/^10:00/);

    // L'horloge avance d'une minute : le compte suit, sans recharger.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(rebours()[0]).toHaveTextContent('dans 44 min');
  });

  it('la visite de 10:00 passée, le compte bascule sur la suivante, en heures', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T10:30:00Z'));
    render(withIntl(<ChronologieALHeure />));
    const comptes = rebours();
    expect(comptes).toHaveLength(1);
    expect(comptes[0]).toHaveTextContent('dans 6 h 25');
    expect(comptes[0]!.closest('li')!.textContent).toMatch(/^16:55/);
  });

  it('une heure ronde se dit sans minutes ; un autre jour (`maintenant` nul), aucun compte', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T09:00:00Z'));
    const { unmount } = render(withIntl(<ChronologieALHeure />));
    expect(rebours()[0]).toHaveTextContent(/^dans 1 h$/);
    unmount();
    render(withIntl(<Chronologie moments={chronologieDuJour([DIX_HEURES], [])} maintenant={null} gestes={gestes} onPlanifier={() => {}} />));
    expect(rebours()).toHaveLength(0);
  });

  it('AC1 — à 30 s de l’heure, « dans 1 min », jamais « dans 0 min »', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T09:59:30Z'));
    render(withIntl(<ChronologieALHeure />));
    expect(rebours()[0]).toHaveTextContent(/^dans 1 min$/);
  });
});

describe('AC2 — les sous-lignes de « Mes chiffres »', () => {
  const chiffres = { properties_managed: 25, tasks_open: 10, tasks_overdue: 2, commissions_month: 0 };
  const cas = (libelle: RegExp) => screen.getByRole('link', { name: libelle });

  it('« 3 sans photo » sous « Biens gérés », « 310 000 F à venir » sous « Commissions »', () => {
    // Le décimal de l'API peut arriver en chaîne.
    render(withIntl(<MesChiffres chiffres={{ ...chiffres, properties_without_photo: 3, commissions_upcoming: '310000.00' }} aRelancer={null} mois="nov." />));
    expect(cas(/^Biens gérés/)).toHaveTextContent('3 sans photo');
    expect(cas(/^Biens gérés/)).toHaveAttribute('href', '/app/properties?only_mine=1');
    expect(cas(/^Commissions/).textContent?.replace(/\s/g, ' ')).toContain('310 000 F à venir');
  });

  it('à zéro (ou absentes), aucune sous-ligne', () => {
    const { unmount } = render(withIntl(<MesChiffres chiffres={{ ...chiffres, properties_without_photo: 0, commissions_upcoming: '0.00' }} aRelancer={null} mois="nov." />));
    expect(cas(/^Biens gérés/)).not.toHaveTextContent('sans photo');
    expect(cas(/^Commissions/)).not.toHaveTextContent('à venir');
    unmount();
    render(withIntl(<MesChiffres chiffres={chiffres} aRelancer={null} mois="nov." />));
    expect(cas(/^Biens gérés/)).not.toHaveTextContent('sans photo');
    expect(cas(/^Commissions/)).not.toHaveTextContent('à venir');
  });
});

const SUGGESTIONS: SuggestionsDeLaJournee = {
  follow_up: { customer: { id: 12, full_name: 'Ibrahima Sarr' }, waiting_days: 9 },
  matches: {
    customer: { id: 31, first_name: 'Mariama' },
    count: 3,
    sample: [
      { id: 1, title: 'Studio meublé', neighborhood: 'Mermoz' },
      { id: 2, title: 'Studio', neighborhood: 'Ouakam' },
      { id: 3, title: 'Studio neuf', neighborhood: 'Mermoz' },
    ],
  },
};

describe('AC3 — les suggestions nominatives de « Journée libre »', () => {
  it('servies : « Ibrahima Sarr attend depuis 9 jours », « 3 biens à proposer à Mariama » vers sa fiche', () => {
    render(withIntl(<JourneeLibre aRelancer={6} suggestions={SUGGESTIONS} onPlanifier={() => {}} />));
    const relance = screen.getByRole('link', { name: /6 prospects à relancer/ });
    expect(relance).toHaveTextContent('Ibrahima Sarr attend depuis 9 jours');
    expect(relance).toHaveAttribute('href', '/app/customers?vue=a-relancer');
    const proposer = screen.getByRole('link', { name: /3 biens à proposer à Mariama/ });
    expect(proposer).toHaveAttribute('href', '/app/customers/31?section=biens');
    expect(proposer).toHaveTextContent('Biens à Mermoz et à Ouakam');
    // Les suggestions fixes restent.
    expect(screen.getByRole('button', { name: /Planifier une visite/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ajouter un client/ })).toBeInTheDocument();
  });

  it('non servies : ni relance ni biens à proposer ; les suggestions fixes restent', () => {
    render(withIntl(<JourneeLibre aRelancer={6} suggestions={{ follow_up: null, matches: null }} onPlanifier={() => {}} />));
    expect(screen.queryByText(/à relancer/)).toBeNull();
    expect(screen.queryByText(/à proposer/)).toBeNull();
    expect(screen.getByRole('button', { name: /Planifier une visite/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ajouter un client/ })).toBeInTheDocument();
  });

  it('sans prénom, sans quartier, attente nulle : la ligne se dit encore', () => {
    render(
      withIntl(
        <JourneeLibre
          aRelancer={0}
          suggestions={{
            follow_up: { customer: { id: 12, full_name: 'Ibrahima Sarr' }, waiting_days: 0 },
            matches: { customer: { id: 31, first_name: null }, count: 1, sample: [{ id: 1, title: 'Studio meublé', neighborhood: null }] },
          }}
          onPlanifier={() => {}}
        />,
      ),
    );
    expect(screen.getByRole('link', { name: /Relancer Ibrahima Sarr/ })).toHaveTextContent('Ibrahima Sarr attend un signe de vous');
    expect(screen.getByRole('link', { name: /1 bien à proposer à un client/ })).toHaveTextContent('Studio meublé');
  });

  it('dans « Ma journée » : lues une journée libre, par `include=suggestions` (une chaîne)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T10:12:00Z'));
    etat.suggestions = SUGGESTIONS;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>{withIntl(<MaJournee chiffres={{}} />)}</QueryClientProvider>);
    const telephone = document.querySelector<HTMLElement>('[data-slot="journee-telephone"]')!;
    await waitFor(() => expect(within(telephone).getByRole('link', { name: /3 biens à proposer à Mariama/ })).toHaveAttribute('href', '/app/customers/31?section=biens'));
    expect(within(telephone).getByText('Ibrahima Sarr attend depuis 9 jours')).toBeInTheDocument();
    const lecture = etat.appels.find((c) => c.startsWith('/api/dashboard/me'))!;
    expect(new URLSearchParams(lecture.split('?')[1]).get('include')).toBe('suggestions');
  });
});

describe('AC4 — deux colonnes dès lg', () => {
  it('la grille du bureau passe en deux colonnes à 1024 (`lg:`), 400 px à droite dès `xl`', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T10:12:00Z'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>{withIntl(<MaJournee chiffres={{}} />)}</QueryClientProvider>);
    const bureau = document.querySelector<HTMLElement>('[data-slot="journee-bureau"]')!;
    const grille = bureau.querySelector('[data-slot="mes-chiffres"]')!.closest('.grid.items-start')!;
    expect(grille.className).toMatch(/(^| )lg:grid-cols-\[minmax\(0,1fr\)_/);
    expect(grille.className).toContain('xl:grid-cols-[minmax(0,1fr)_calc(var(--spacing)*100)]');
  });
});

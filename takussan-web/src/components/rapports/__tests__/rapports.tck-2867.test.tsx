/**
 * TCK-2867 — Rapports, vues d'ensemble : « Voir le tableau » (AC1), « 12 mois » (AC2), le tableau complet de l'équipe
 * et son total (AC3), « Agence ▾ » (AC4), « ⋯ › Exporter » et la série « Impayés » au téléphone (AC5), « Détail par
 * bail » (AC6), la légende « Attendu » (AC7).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const navigation = vi.hoisted(() => ({ chemin: '/app/reports', requete: '', pousses: [] as string[] }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.chemin,
  useSearchParams: () => new URLSearchParams(navigation.requete),
  useRouter: () => ({ push: (href: string) => navigation.pousses.push(href), refresh: () => {} }),
}));

const profils = vi.hoisted(() => ({ liste: [] as unknown[], actif: 'p1', bascules: [] as unknown[] }));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: { data: profils.liste, meta: { active_profile_id: profils.actif } } }),
  useSwitchActiveProfile: () => ({ isPending: false, mutate: (id: unknown) => profils.bascules.push(id) }),
}));
vi.mock('@/hooks/useActiviteDesEspaces', () => ({ useActiviteDesEspaces: () => [] }));

const invitations = vi.hoisted(() => ({ n: 0 }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: invitations.n }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 7 } }) }));
vi.mock('@/lib/queries/agency-reporting', () => ({ useTeamPerformance: vi.fn() }));
vi.mock('@/lib/queries/commissions', () => ({ useDetailParBail: vi.fn() }));

const { useTeamPerformance } = await import('@/lib/queries/agency-reporting');
const { useDetailParBail } = await import('@/lib/queries/commissions');
const { GraphiquesDuRapport } = await import('../ensemble/GraphiquesDuRapport');
const { EquipeDuMois } = await import('../ensemble/EquipeDuMois');
const { DetailParBail } = await import('../ensemble/DetailParBail');
const { ChoixDeLAgence } = await import('../ChoixDeLAgence');
const { ChoixDeLaPeriode } = await import('../ChoixDeLaPeriode');
const { DescriptionDesRapports, PlusDActionsDesRapports } = await import('../TeteDesRapports');
const { FournisseurDEnTete, useDeclarationDEnTete } = await import('@/components/layout/en-tete-de-la-coque');

const DOUZE = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
const ENCAISSE = DOUZE.map((_, i) => (i + 1) * 1_000_000);

beforeEach(() => {
  navigation.chemin = '/app/reports';
  navigation.requete = '';
  navigation.pousses = [];
  profils.liste = [];
  profils.bascules = [];
  invitations.n = 0;
});

const bloc = (titre: string) => screen.getByRole('heading', { name: titre }).closest('[data-slot="bloc-graphique"]') as HTMLElement;

describe('TCK-2867 — AC1 : « Voir le tableau »', () => {
  it('le graphique « Encaissé » rend un `table` de 12 colonnes de mois aux valeurs de la série ; « Voir le graphique » le referme', () => {
    render(withIntl(<GraphiquesDuRapport series={[{ id: 'encaisse', mois: DOUZE, valeurs: ENCAISSE }]} moisEnCours="2026-11" />));
    const b = bloc('Encaissé · 12 derniers mois');
    expect(within(b).queryByRole('table', { hidden: false })).toBeTruthy(); // le tableau du lecteur d'écran (sr-only)
    fireEvent.click(within(b).getByRole('button', { name: 'Voir le tableau' }));
    const tableau = b.querySelector('[data-slot="tableau-du-graphique"] table') as HTMLTableElement;
    const mois = within(tableau).getAllByRole('columnheader').slice(1);
    expect(mois).toHaveLength(12);
    expect(mois[0]?.textContent).toMatch(/déc/i);
    expect(mois[11]?.textContent).toMatch(/nov/i);
    const valeurs = within(within(tableau).getAllByRole('row')[1]!).getAllByRole('cell').map((td) => td.textContent?.replace(/\s/g, ' '));
    expect(valeurs).toHaveLength(12);
    expect(valeurs[0]).toBe('1 M F');
    expect(valeurs[11]).toBe('12 M F');
    // Le tracé laisse la place au tableau ; « Voir le graphique » le rend.
    expect(b.querySelector('[data-slot="graphique-du-mois"]')).toBeNull();
    fireEvent.click(within(b).getByRole('button', { name: 'Voir le graphique' }));
    expect(b.querySelector('[data-slot="tableau-du-graphique"]')).toBeNull();
    expect(b.querySelector('[data-slot="graphique-du-mois"]')).not.toBeNull();
  });
});

describe('TCK-2867 — AC5 : la série « Impayés » du téléphone', () => {
  it('le segment propose « Impayés » ; son bloc ne se rend qu’au téléphone, son total est le DERNIER point, une hausse est un danger', () => {
    const impayes = DOUZE.map((_, i) => 100_000 * (i + 1));
    render(
      withIntl(
        <GraphiquesDuRapport
          series={[
            { id: 'encaisse', mois: DOUZE, valeurs: ENCAISSE },
            { id: 'impayes', mois: DOUZE, valeurs: impayes, telephoneSeulement: true },
          ]}
          moisEnCours="2026-11"
        />,
      ),
    );
    const segment = screen.getByRole('group', { name: 'Graphique affiché' });
    expect(within(segment).getAllByRole('button').map((b) => b.textContent)).toEqual(['Encaissé', 'Impayés']);
    const b = bloc('Impayés · 12 derniers mois');
    expect(b.className).toMatch(/(^|\s)md:hidden(\s|$)/);
    expect(b.querySelector('.font-display')?.textContent?.replace(/\s/g, ' ')).toBe('1,2 M F');
    expect((b.querySelector('[data-ton]') as HTMLElement).dataset.ton).toBe('danger');
  });
});

describe('TCK-2867 — AC7 : « Attendu » sur l’encaissé du bailleur', () => {
  it('deux séries : les barres de l’encaissé et un repère d’attendu par mois, la légende « Encaissé · Attendu », la part de l’attendu', () => {
    const attendu = DOUZE.map(() => 2_000_000);
    render(withIntl(<GraphiquesDuRapport series={[{ id: 'cashflow', mois: DOUZE, valeurs: DOUZE.map(() => 1_000_000), attendu }]} moisEnCours="2026-11" />));
    const b = bloc('Encaissé et attendu · 12 derniers mois');
    expect(b.querySelectorAll('[data-mois]')).toHaveLength(12);
    expect(b.querySelectorAll('[data-slot="repere"]')).toHaveLength(12);
    expect(b.querySelector('[data-slot="legende-attendu"]')?.textContent).toBe('EncaisséAttendu');
    expect(b.querySelector('[data-ton]')?.textContent).toBe('50 % de l’attendu');
    // Le tableau porte les deux séries.
    fireEvent.click(within(b).getByRole('button', { name: 'Voir le tableau' }));
    expect(within(b).getAllByRole('rowheader').map((th) => th.textContent)).toEqual(['Encaissé', 'Attendu']);
  });

  it('un attendu nul ne divise rien : pas de part', () => {
    render(withIntl(<GraphiquesDuRapport series={[{ id: 'cashflow', mois: DOUZE, valeurs: ENCAISSE, attendu: DOUZE.map(() => 0) }]} moisEnCours="2026-11" />));
    expect(bloc('Encaissé et attendu · 12 derniers mois').querySelector('[data-ton]')).toBeNull();
  });
});

describe('TCK-2867 — AC2 : la puce « 12 mois »', () => {
  it('« 12 mois » mène à `?period=last_12_months` en gardant la portée ; la tête dit les douze mois', () => {
    navigation.requete = 'scope=agency';
    render(withIntl(<ChoixDeLaPeriode variante="puces" />));
    fireEvent.click(screen.getByRole('button', { name: '12 mois' }));
    expect(navigation.pousses).toEqual(['/app/reports?scope=agency&period=last_12_months']);
  });

  it('la description de la tête dit les douze mois sous `period=last_12_months`, sur la vue d’ensemble seulement', () => {
    navigation.requete = 'period=last_12_months';
    const tete = <DescriptionDesRapports nom="Dakar Immo" periode="du 1 au 30 novembre 2026" periodeMoisDernier="du 1 au 31 octobre 2026" periodeDouzeMois="du 1 décembre 2025 au 30 novembre 2026" />;
    const { container, rerender } = render(withIntl(tete));
    expect(container.textContent).toBe('Dakar Immo · du 1 décembre 2025 au 30 novembre 2026');
    navigation.chemin = '/app/reports/team';
    rerender(withIntl(tete));
    expect(container.textContent).toBe('Dakar Immo · du 1 au 30 novembre 2026');
  });
});

describe('TCK-2867 — AC3 : « Performance de l’équipe », colonnes et total', () => {
  const agent = (user_id: number, name: string, median_response_minutes: number | null) => ({
    user_id,
    name,
    leases_signed: 2,
    sales_signed: 0,
    visits_completed: 7,
    customers_added: 0,
    commissions_earned: 250_000,
    properties_managed: 23,
    tasks_overdue: 0,
    leads_handled: 9,
    median_response_minutes,
  });

  it('les colonnes « Demandes traitées » et « Délai de réponse », la dernière ligne « Équipe · 5 agents » lue des totaux de l’API', () => {
    vi.mocked(useTeamPerformance).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        data: {
          period: '2026-11',
          agents: [agent(1, 'Awa', 90), agent(2, 'Bara', null), agent(3, 'Coumba', 30), agent(4, 'Daba', 45), agent(5, 'Fatou', 1600)],
          totals: { agents: 5, leases_signed: 8, sales_signed: 0, visits_completed: 37, leads_handled: 44, customers_added: 0, commissions_earned: 1_290_000, properties_managed: 115, tasks_overdue: 0, median_response_minutes: 150 },
        },
      },
    } as never);
    render(withIntl(<EquipeDuMois agencyId={4} periode="2026-11" agencyIsStandard />));
    const tableau = screen.getByRole('table');
    const entetes = within(tableau).getAllByRole('columnheader').map((th) => th.textContent);
    expect(entetes).toContain('Demandes traitées');
    expect(entetes.at(-1)).toBe('Délai de réponse');
    const lignes = within(tableau).getAllByRole('row');
    const total = lignes.at(-1)!;
    expect(within(total).getByRole('rowheader').textContent).toBe('Équipe · 5 agents');
    expect(within(total).getAllByRole('cell').map((td) => td.textContent?.replace(/\s/g, ' '))).toEqual(['115', '44', '37', '8', '1 290 000 F', 'médiane 2 h 30']);
    // Un délai `null` : « — », et la raison en infobulle.
    const bara = lignes.find((tr) => tr.textContent?.includes('Bara'))!;
    const absent = bara.querySelector('[data-slot="delai-absent"]') as HTMLElement;
    expect(absent.textContent?.startsWith('—')).toBe(true);
    expect(absent.getAttribute('title')).toBe('Pas assez de conversations pour mesurer le délai de réponse.');
    // Au-delà d'un jour, le délai est en danger, comme l'onglet Équipe.
    const fatou = lignes.find((tr) => tr.textContent?.includes('Fatou'))!;
    expect(within(fatou).getAllByRole('cell').at(-1)?.querySelector('.text-destructive')).not.toBeNull();
  });
});

describe('TCK-2867 — AC4 : « Agence ▾ »', () => {
  const espace = (id: string, nom: string) => ({ id, type: 'agency_admin', agency_id: Number(id.slice(1)), agency: { id: Number(id.slice(1)), name: nom, kind: 'standard', city: 'Dakar' } });

  it('une agence seule : le nom, sans menu', () => {
    profils.liste = [espace('p1', 'Dakar Immo')];
    render(withIntl(<ChoixDeLAgence nom="Dakar Immo" variante="tete" />));
    expect(screen.getByText('Dakar Immo')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('deux agences : « Dakar Immo ▾ » ouvre le choix d’espace de la coque ; « Thiès Properties » bascule l’espace', async () => {
    profils.liste = [espace('p1', 'Dakar Immo'), espace('p2', 'Thiès Properties')];
    render(withIntl(<ChoixDeLAgence nom="Dakar Immo" variante="tete" />));
    const declencheur = screen.getByRole('button', { name: /Dakar Immo/ });
    expect(declencheur.textContent).toBe('Dakar Immo');
    fireEvent.click(declencheur);
    const thies = await screen.findByTestId('espace-du-menu-p2');
    fireEvent.click(thies);
    await waitFor(() => expect(profils.bascules).toEqual(['p2']));
  });
});

function EnTeteDuTelephone() {
  const { action } = useDeclarationDEnTete();
  return <div data-testid="en-tete">{action}</div>;
}

describe('TCK-2867 — AC5 : « ⋯ › Exporter » dans l’en-tête du téléphone', () => {
  it('l’en-tête porte « ⋯ », qui ouvre « Exporter » vers l’onglet Exports', async () => {
    render(
      withIntl(
        <FournisseurDEnTete>
          <EnTeteDuTelephone />
          <PlusDActionsDesRapports exporter="Exporter" />
        </FournisseurDEnTete>,
      ),
    );
    fireEvent.click(within(screen.getByTestId('en-tete')).getByRole('button', { name: 'Plus d’actions' }));
    const exporter = await screen.findByRole('menuitem', { name: 'Exporter' });
    expect(exporter.getAttribute('href')).toBe('/app/reports/exports');
  });

  it('rien sur Alertes (« + Nouvelle alerte » y tient la place), ni sans onglet Exports', () => {
    navigation.chemin = '/app/reports/alerts';
    const { rerender } = render(
      withIntl(
        <FournisseurDEnTete>
          <EnTeteDuTelephone />
          <PlusDActionsDesRapports exporter="Exporter" />
        </FournisseurDEnTete>,
      ),
    );
    expect(screen.getByTestId('en-tete').childElementCount).toBe(0);
    navigation.chemin = '/app/reports';
    rerender(
      withIntl(
        <FournisseurDEnTete>
          <EnTeteDuTelephone />
          <PlusDActionsDesRapports exporter={null} />
        </FournisseurDEnTete>,
      ),
    );
    expect(screen.getByTestId('en-tete').childElementCount).toBe(0);
  });
});

describe('TCK-2867 — AC6 : « Détail par bail »', () => {
  const ligne = (id: number, bien: string, client: string, signe: string, statut: 'due' | 'paid', paidAt: string | null = null) => ({
    id,
    lease_id: id,
    beneficiary_id: 7,
    amount: 190_000,
    currency: 'XOF',
    status: statut,
    earned_at: signe,
    paid_at: paidAt,
    cancelled_at: null,
    lease: { id, reference_number: `B-${id}`, type: 'rental', signed_at: signe, monthly_rent: 380_000, currency: 'XOF', property: { id, title: bien, quarter: null }, tenant: { id, name: client } },
  });

  beforeEach(() => {
    vi.mocked(useDetailParBail).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        data: [
          ligne(1, 'Deux-pièces rénové, Point E', 'Coumba Diouf', '2026-11-09T10:00:00Z', 'due'),
          ligne(2, 'Studio meublé, Almadies', 'Lamine Camara', '2026-11-04T10:00:00Z', 'paid', '2026-11-12T10:00:00Z'),
        ],
      },
    } as never);
  });

  it('les deux baux signés, avec leur commission et leur versement ; sous « Moi », les lignes de l’agent', () => {
    render(withIntl(<DetailParBail agence={false} lignes={5} lien={{ href: '/app/reports/commissions', libelle: 'Onglet Commissions' }} />));
    expect(vi.mocked(useDetailParBail)).toHaveBeenLastCalledWith({ beneficiaryId: 7, perPage: 5, enabled: true });
    // Téléphone : une liste.
    const liste = screen.getByRole('list');
    const items = within(liste).getAllByRole('listitem').map((li) => li.textContent?.replace(/\s/g, ' '));
    expect(items).toEqual([
      'Deux-pièces rénové, Point ECoumba Diouf · signé le 9 nov.190 000 FÀ venir',
      'Studio meublé, AlmadiesLamine Camara · signé le 4 nov.190 000 FVersée',
    ]);
    // Bureau : le tableau Bail · Client · Signé le · Loyer mensuel · Commission · Versement.
    const tableau = screen.getByRole('table');
    expect(within(tableau).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Bail', 'Client', 'Signé le', 'Loyer mensuel', 'Commission', 'Versement']);
    const rangee = within(tableau).getAllByRole('row')[2]!;
    expect(within(rangee).getAllByRole('cell').map((td) => td.textContent?.replace(/\s/g, ' '))).toEqual(['Lamine Camara', '4 nov.', '380 000 F', '190 000 F', 'Versée le 12 nov.']);
  });

  it('sous « Agence », aucun filtre par bénéficiaire : le grand livre que l’API sert', () => {
    render(withIntl(<DetailParBail agence lignes={20} lien={{ href: '/app/commissions', libelle: 'Tout le relevé' }} />));
    expect(vi.mocked(useDetailParBail)).toHaveBeenLastCalledWith({ beneficiaryId: undefined, perPage: 20, enabled: true });
    expect(screen.getByRole('link', { name: 'Tout le relevé' }).getAttribute('href')).toBe('/app/commissions');
  });
});

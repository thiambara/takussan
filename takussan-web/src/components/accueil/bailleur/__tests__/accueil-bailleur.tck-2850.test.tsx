/**
 * TCK-2850 — l'accueil du bailleur : « Démarrer » (ligne au téléphone, bandeau « Continuer » au bureau),
 * « Prochain reversement · 15 nov. », « relancé par l'agence le 8 nov. » sur un loyer en retard, et la
 * place de « Loyers du mois » au bureau (à droite quand rien n'attend, maquette e6). Le réseau est doublé
 * au niveau de `fetch` (`doublerLApi`, TCK-3010) : les hooks tournent pour de vrai, on lit les requêtes émises.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';

import { Contexte, type PreferencesDuMenu } from '@/components/layout/contexte-preferences-du-menu';
import { SocleDeLAccueil } from '@/components/accueil/SocleDeLAccueil';
import { lireLoyersDuMois } from '@/lib/accueil/loyers-du-mois';
import { NAVIGATION_VIDE } from '@/lib/navigation/preferences';
import { doublerLApi } from '@/test/api-simulee';
import { rendre } from '@/test/rendu';

import { AFaireBailleur } from '../AFaireBailleur';
import { DemarrerDuBailleur } from '../DemarrerDuBailleur';
import { EnCoursSurVosBiens } from '../EnCoursSurVosBiens';
import { PlaceDesLoyers } from '../PlaceDesLoyers';

const etat = vi.hoisted(() => ({
  etapes: [
    { code: 'premier_bien', faite: true },
    { code: 'piece:cni', faite: false },
  ] as { code: string; faite: boolean }[],
  reversements: [] as unknown[],
  enCours: 0,
  visites: 0,
  devis: 0,
  loyers: 0,
  relances: [] as { at: string; channel: string; by_name: string }[],
  bureau: true,
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/app', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
// Le bureau : les rangées des loyers en retard (et leur relance) ne se lisent qu'à partir de `md`.
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => etat.bureau }));

const LOYER = {
  id: 88,
  source: 'lease',
  payment_type: 'rent',
  status: 'late',
  days_late: 5,
  due_date: '2026-11-05',
  amount_due: 1_400_000,
  remaining_amount: 1_400_000,
  currency: 'XOF',
  lease_id: 31,
  property_id: 4,
  payer: { id: 8, name: 'Seydou Camara' },
  property: { id: 4, title: 'Villa blanche, Yoff' },
};

const page = (data: unknown[], total: number) => ({ data: total > 0 ? data : [], meta: { total, per_page: 20, current_page: 1, last_page: 1 } });

const api = doublerLApi()
  .sur('GET', '/api/me/espace/demarrage', () => ({ data: { etapes: etat.etapes } }))
  .sur('GET', '/api/payouts', () => page(etat.reversements, etat.reversements.length))
  .sur('GET', '/api/maintenance-requests', () =>
    page([{ id: 72, title: 'Fuite sous évier', status: 'scheduled', scheduled_at: null, property: { id: 4, title: 'F2, Grand Yoff' }, assignee: null }], etat.enCours),
  )
  // TCK-3010 — la doublure ne filtre pas : ces filter[…] ne se jugent ici que sur la requête envoyée.
  .servir('visites', [], { meta: () => ({ total: etat.visites, per_page: 20 }), filtres: ['status', 'scheduled_at_min'] })
  .sur('GET', '/api/payments/history', () => page([LOYER], etat.loyers))
  .sur('GET', '/api/owner-statements', () => ({ data: { properties: [{ property_id: 4, title: 'Villa blanche, Yoff', reminders: etat.relances }] } }))
  .parDefaut(page([], 0));

function monter(contenu: React.ReactNode, prefs?: PreferencesDuMenu) {
  return rendre(prefs ? <Contexte.Provider value={prefs}>{contenu}</Contexte.Provider> : contenu, {
    compte: { utilisateur: { id: 21, roles: ['owner'] }, jeton: 'jeton' },
  });
}

const lectures = (route: string) => api.appels(route).filter((a) => a.methode === 'GET').map((a) => a.requete);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T10:12:00Z'));
  Object.assign(etat, {
    etapes: [
      { code: 'premier_bien', faite: true },
      { code: 'piece:cni', faite: false },
    ],
    reversements: [],
    enCours: 0,
    visites: 0,
    devis: 0,
    loyers: 0,
    relances: [],
    bureau: true,
  });
});
afterEach(() => vi.useRealTimers());

describe('AC1 — « Démarrer » du bailleur', () => {
  it('au téléphone : « 1/2 · Envoyez votre pièce d’identité », qui mène à l’étape (TCK-2947 : une étape par pièce)', async () => {
    monter(<DemarrerDuBailleur />);
    const lien = await screen.findByRole('link', { name: 'Démarrer, 1 sur 2 : Envoyez votre pièce d’identité' });
    expect(lien.getAttribute('href')).toBe('/app/pieces');
    expect(within(lien).getByText('1/2')).toBeTruthy();
    expect(within(lien).getByText('Envoyez votre pièce d’identité')).toBeTruthy();
    expect(within(lien).queryByText('Continuer')).toBeNull();
  });

  it('au bureau : le bandeau « Démarrer · 1 étape sur 2 », la phrase et « Continuer »', async () => {
    monter(<DemarrerDuBailleur large />);
    const lien = await screen.findByRole('link', { name: /Démarrer, 1 sur 2/ });
    expect(within(lien).getByText('Démarrer · 1 étape sur 2')).toBeTruthy();
    // TCK-2947 — aucune promesse que le code ne tient : aucune pièce ne conditionne un reversement (décision 5a de TCK-2614).
    expect(within(lien).getByText('Envoyez votre pièce d’identité depuis « Vos pièces ».')).toBeTruthy();
    expect(lien.textContent).not.toMatch(/reversement/i);
    expect(within(lien).getByText('Continuer')).toBeTruthy();
  });

  it('TCK-2947 (AC3) — premier bien et pièce d’identité faits, le RIB reste : l’étape suivante est le RIB', async () => {
    etat.etapes = [
      { code: 'premier_bien', faite: true },
      { code: 'piece:cni', faite: true },
      { code: 'piece:rib', faite: false },
    ];
    monter(<DemarrerDuBailleur />);
    const lien = await screen.findByRole('link', { name: 'Démarrer, 2 sur 3 : Envoyez votre RIB' });
    expect(lien.getAttribute('href')).toBe('/app/pieces');
  });

  it('étapes toutes faites : ni ligne ni bandeau', async () => {
    etat.etapes = [
      { code: 'premier_bien', faite: true },
      { code: 'piece:cni', faite: true },
    ];
    monter(
      <>
        <DemarrerDuBailleur />
        <DemarrerDuBailleur large />
      </>,
    );
    await waitFor(() => expect(lectures('/api/me/espace/demarrage').length).toBeGreaterThan(0));
    await waitFor(() => expect(document.querySelector('[data-slot="demarrer-du-bailleur"]')).toBeNull());
    expect(screen.queryByText(/Continuer/)).toBeNull();
  });

  it('masqué dans le menu (`demarrer_masque` du bailleur) : masqué ici, sans lecture', async () => {
    const prefs = {
      actif: true,
      persona: 'bailleur',
      navigation: { ...NAVIGATION_VIDE, personas: { bailleur: { demarrer_masque: true } } },
      modeIcones: 'complet',
    } as unknown as PreferencesDuMenu;
    monter(<DemarrerDuBailleur large />, prefs);
    await api.auRepos();
    expect(document.querySelector('[data-slot="demarrer-du-bailleur"]')).toBeNull();
    expect(lectures('/api/me/espace/demarrage')).toHaveLength(0);
  });

  it('le socle pose la ligne au-dessus du salut au téléphone et le bandeau dans l’en-tête au bureau', () => {
    monter(
      <SocleDeLAccueil
        titre="Bonjour Mouhamed"
        ligne="Mardi 10 novembre"
        miseEnService={null}
        demarrage={{ telephone: <p>ligne-demarrer</p>, bureau: <p>bandeau-demarrer</p> }}
        bandeaux={null}
        ceMois={null}
      />,
    );
    const ligne = screen.getByText('ligne-demarrer');
    const [salutTelephone] = screen.getAllByText('Bonjour Mouhamed');
    expect(ligne.closest('.md\\:hidden')).not.toBeNull();
    expect(ligne.compareDocumentPosition(salutTelephone!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('bandeau-demarrer').closest('.max-md\\:hidden')).not.toBeNull();
  });
});

describe('AC2 — « Prochain reversement »', () => {
  it('« Prochain reversement · 15 nov. » et « 10 260 000 F · après commission », lu au bailleur, à venir', async () => {
    etat.reversements = [{ id: 5, status: 'scheduled', net_amount: 10_260_000, currency: 'XOF', scheduled_at: '2026-11-15T09:00:00Z' }];
    monter(<EnCoursSurVosBiens landlordId={21} />);
    const lien = await screen.findByRole('link', { name: 'Prochain reversement · 15 nov.' });
    expect(lien.getAttribute('href')).toBe('/app/reports/payouts');
    expect(screen.getByText('10 260 000 F · après commission')).toBeTruthy();
    const [q] = lectures('/api/payouts');
    expect(q!.get('filter[landlord_id]')).toBe('21');
    expect(q!.get('filter[payee_role]')).toBe('landlord');
    expect(q!.get('filter[upcoming]')).toBe('1');
    expect(q!.get('sort')).toBe('scheduled_at,-created_at');
  });

  it('un reversement encore sans date : « Prochain reversement », sans « · »', async () => {
    etat.reversements = [{ id: 5, status: 'pending_approval', net_amount: 300_000, currency: 'XOF', scheduled_at: null }];
    monter(<EnCoursSurVosBiens landlordId={21} />);
    expect(await screen.findByRole('link', { name: 'Prochain reversement' })).toBeTruthy();
  });

  it('aucun à venir : la rangée n’existe pas (et sans intervention, pas de bloc)', async () => {
    etat.enCours = 1;
    const { unmount } = monter(<EnCoursSurVosBiens landlordId={21} />);
    expect(await screen.findByText('Fuite sous évier · F2, Grand Yoff')).toBeTruthy();
    await waitFor(() => expect(lectures('/api/payouts').length).toBeGreaterThan(0));
    expect(document.querySelector('[data-slot="prochain-reversement"]')).toBeNull();
    expect(screen.queryByText(/Prochain reversement/)).toBeNull();
    unmount();
    etat.enCours = 0;
    monter(<EnCoursSurVosBiens landlordId={21} />);
    await waitFor(() => expect(lectures('/api/payouts').length).toBeGreaterThan(1));
    expect(document.querySelector('[data-slot="en-cours-sur-vos-biens"]')).toBeNull();
  });
});

describe('AC3 — la dernière relance d’un loyer en retard', () => {
  it('relancé le 8 novembre : « 1 400 000 F · relancé par l’agence le 8 nov. », lu dans le relevé du mois', async () => {
    etat.loyers = 1;
    etat.relances = [
      { at: '2026-11-08T10:00:00Z', channel: 'whatsapp', by_name: 'Sokhna Sène' },
      { at: '2026-11-06T10:00:00Z', channel: 'call', by_name: 'Sokhna Sène' },
    ];
    monter(<AFaireBailleur landlordId={21} />);
    expect(await screen.findByText('1 400 000 F · relancé par l’agence le 8 nov.')).toBeTruthy();
    expect(screen.queryByText(/échu le/)).toBeNull();
    const [q] = lectures('/api/owner-statements');
    expect(q!.get('period')).toBe('2026-11');
    // La file elle-même ne demande pas `reminders` (réservé à l'agence, ADR-0105).
    expect(lectures('/api/payments/history')[0]!.get('include')).not.toMatch(/reminders/);
  });

  it('non relancé : aucune mention de relance', async () => {
    etat.loyers = 1;
    monter(<AFaireBailleur landlordId={21} />);
    expect(await screen.findByText('1 400 000 F · échu le 5 nov.')).toBeTruthy();
    await waitFor(() => expect(lectures('/api/owner-statements').length).toBeGreaterThan(0));
    expect(screen.queryByText(/relancé/)).toBeNull();
  });
});

describe('TCK-2850 — au téléphone, aucune lecture de relevé', () => {
  it('les rangées des loyers en retard sont cachées : le relevé n’est pas lu', async () => {
    etat.loyers = 1;
    etat.bureau = false;
    monter(<AFaireBailleur landlordId={21} />);
    await waitFor(() => expect(lectures('/api/payments/history').length).toBeGreaterThan(0));
    await api.auRepos();
    expect(lectures('/api/owner-statements')).toHaveLength(0);
  });
});

describe('AC4 — la place de « Loyers du mois » au bureau', () => {
  const loyers = lireLoyersDuMois({ rent_month: { received_count: 8, expected_count: 14, received_amount: 11_400_000 } })!;
  const deuxPlaces = () => (
    <>
      <div data-testid="gauche">
        <PlaceDesLoyers place="blocs" loyers={loyers} jour="2026-11-10" landlordId={21} />
      </div>
      <div data-testid="droite">
        <PlaceDesLoyers place="colonne" loyers={loyers} jour="2026-11-10" landlordId={21} />
      </div>
    </>
  );

  it('rien à faire (e6) : à droite au bureau large, plus à gauche dès `xl`', async () => {
    monter(deuxPlaces());
    await waitFor(() => expect(within(screen.getByTestId('droite')).queryByText('Loyers de novembre')).not.toBeNull());
    const droite = screen.getByTestId('droite').querySelector('[data-slot="loyers-du-mois"]')!;
    expect(droite.className).toContain('max-xl:hidden');
    const gauche = screen.getByTestId('gauche').querySelector('[data-slot="loyers-du-mois"]')!;
    expect(gauche.className).toContain('xl:hidden');
  });

  it('quelque chose à faire (e2) : à gauche seulement, au-dessus de « À faire »', async () => {
    etat.visites = 1;
    monter(deuxPlaces());
    await waitFor(() => expect(lectures('/api/property-visits').length).toBeGreaterThan(0));
    await waitFor(() => expect(lectures('/api/payments/history').length).toBeGreaterThan(0));
    // Laisser les trois files répondre.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId('droite').querySelector('[data-slot="loyers-du-mois"]')).toBeNull();
    const gauche = screen.getByTestId('gauche').querySelector('[data-slot="loyers-du-mois"]')!;
    expect(gauche.className).not.toMatch(/(^|\s)xl:hidden/);
  });
});

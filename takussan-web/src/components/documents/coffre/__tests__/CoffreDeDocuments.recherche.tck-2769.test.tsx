/**
 * TCK-2769 — « Chercher un document » dans le coffre : la requête part au serveur
 * (`filter[search]` de `GET /api/me/document-vault`), gardée dans l'URL (`?q=`, `?page=`), et l'écran
 * rend ce que le serveur trouve, avec son total et ses pages — jamais un filtre du coffre chargé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';

import type { CoffreDeDocuments as Coffre, EntreeTrouvee, RechercheDansLeCoffre } from '@/lib/documents/coffre';

vi.mock('@/hooks/useTelechargementApi', () => ({
  useTelechargementApi: () => ({ telecharger: vi.fn(), enCours: false, echec: null }),
}));

const ecran = { bureau: false };
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => ecran.bureau }));

// L'URL de la page : `window.history.replaceState` l'écrit (Next la relie à `useSearchParams`).
const navigation = { params: '' };
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.params),
  usePathname: () => '/app/documents',
}));
const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation((_etat, _titre, url) => {
  navigation.params = String(url ?? '').split('?')[1] ?? '';
});
const ecrite = () => replaceState.mock.calls.at(-1)?.[2];

const COFFRE: Coffre = {
  folders: [
    { key: 'lease:22', kind: 'lease', target: { type: 'lease', id: 22 }, name: 'Garage à Ouest Foire', year: null, read_only: false, entries: [] },
    { key: 'pieces', kind: 'pieces', target: { type: 'user', id: 78 }, name: null, year: null, read_only: false, entries: [
      { kind: 'uploaded', category: 'insurance', title: 'Assurance habitation', date: '2026-02-01', download_path: '/api/documents/9', targets: [], document_id: 9, is_verified: true, expiry_date: null, versions_count: 0 },
    ] },
  ],
  counts: { expiring_soon: 0, unverified: 0 },
  attachable_targets: [{ type: 'user', id: 78, folder: 'pieces', name: null }],
};

const trouvee = (entree: Partial<EntreeTrouvee>): EntreeTrouvee => ({
  kind: 'generated',
  category: 'receipt_rent',
  title: 'LPY-1',
  date: '2026-03-05',
  download_path: '/api/leases/22/receipts/1/pdf',
  targets: [{ type: 'lease', id: 22 }],
  document_id: null,
  is_verified: null,
  expiry_date: null,
  versions_count: null,
  folder: { key: 'receipts:2026', kind: 'receipts', name: null, year: 2026, read_only: false },
  ...entree,
});

const recherche: { appels: [string, number][]; data: RechercheDansLeCoffre | undefined; isPending: boolean } = {
  appels: [],
  data: undefined,
  isPending: false,
};
vi.mock('@/lib/queries/coffre', () => ({
  // TCK-2812 — l'archive préparée : rien de demandé ici.
  useArchivesPreparees: () => ({ data: undefined }),
  useDemanderLArchive: () => ({ isPending: false, isError: false, mutate: () => undefined }),
  useCoffreDeDocuments: () => ({ isPending: false, isError: false, data: { data: COFFRE }, refetch: vi.fn() }),
  useRechercheDansLeCoffre: (q: string, page: number) => {
    recherche.appels.push([q, page]);
    return { isPending: recherche.isPending, isError: false, data: recherche.data, refetch: vi.fn() };
  },
}));

import { CoffreDeDocuments } from '../CoffreDeDocuments';

const rendre = () => render(withIntl(<CoffreDeDocuments />));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-11-13T10:00:00Z'));
  navigation.params = '';
  replaceState.mockClear();
  recherche.appels = [];
  recherche.isPending = false;
  recherche.data = {
    data: [
      trouvee({}),
      trouvee({ date: '2026-02-05', title: 'LPY-2', download_path: '/api/leases/22/receipts/2/pdf' }),
      // Un contrat, que « quittance » ne nomme pas : le front rend ce que le serveur trouve, sans refiltrer.
      trouvee({ category: 'lease_contract', title: 'LS-0DPA75TK', date: '2026-06-29', download_path: '/api/leases/22/contract/pdf', folder: { key: 'lease:22', kind: 'lease', name: 'Garage à Ouest Foire', year: null, read_only: false } }),
    ],
    meta: { total: 23, per_page: 20, current_page: 1, last_page: 2 },
  };
  ecran.bureau = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TCK-2769 — chercher dans le coffre par le serveur', () => {
  it('sans `?q=`, le coffre par dossier, et aucune recherche ne part', () => {
    rendre();
    expect(screen.getByRole('searchbox', { name: 'Chercher un document' })).toHaveValue('');
    expect(screen.getByRole('region', { name: 'Mes pièces' })).toBeInTheDocument();
    expect(recherche.appels).toEqual([]);
  });

  it('la frappe écrit `?q=` dans l’URL après une pause, et la validation tout de suite', () => {
    rendre();
    const champ = screen.getByRole('searchbox', { name: 'Chercher un document' });
    fireEvent.change(champ, { target: { value: 'quittance' } });
    expect(replaceState).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ecrite()).toBe('/app/documents?q=quittance');

    fireEvent.change(champ, { target: { value: 'assurance ' } });
    fireEvent.submit(champ.closest('form')!);
    expect(ecrite()).toBe('/app/documents?q=assurance');
  });

  it('le champ garde le focus et sa saisie quand l’URL rattrape la frappe, espace final compris', () => {
    const { rerender } = rendre();
    const champ = screen.getByRole('searchbox', { name: 'Chercher un document' });
    champ.focus();
    fireEvent.change(champ, { target: { value: 'quittance ' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ecrite()).toBe('/app/documents?q=quittance');
    rerender(withIntl(<CoffreDeDocuments />));

    const apres = screen.getByRole('searchbox', { name: 'Chercher un document' });
    expect(apres).toBe(champ);
    expect(document.activeElement).toBe(champ);
    expect(apres).toHaveValue('quittance ');

    // L'écho rendu APRÈS une frappe de plus ne la reprend pas.
    fireEvent.change(champ, { target: { value: 'quittance d' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.change(champ, { target: { value: 'quittance de' } });
    expect(champ).toHaveValue('quittance de');
  });

  it('une URL changée hors de la frappe (retour arrière) remet la saisie à sa valeur', () => {
    navigation.params = 'q=quittance';
    const { rerender } = rendre();
    navigation.params = 'q=contrat';
    rerender(withIntl(<CoffreDeDocuments />));
    expect(screen.getByRole('searchbox', { name: 'Chercher un document' })).toHaveValue('contrat');
  });

  it('AC1, AC4 — `?q=` rend ce que le serveur trouve, son total, et la page suivante passe par l’URL', () => {
    navigation.params = 'q=quittance';
    rendre();
    expect(recherche.appels.at(-1)).toEqual(['quittance', 1]);
    expect(screen.getByRole('searchbox', { name: 'Chercher un document' })).toHaveValue('quittance');

    // Les dossiers et leurs puces laissent la place aux entrées trouvées.
    expect(screen.queryByRole('region', { name: 'Mes pièces' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filtrer par dossier' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('23 documents trouvés');

    const lignes = screen.getAllByTestId('entree-du-coffre');
    expect(lignes).toHaveLength(3);
    expect(lignes[0]).toHaveTextContent('Quittance de mars');
    expect(lignes[0]).toHaveTextContent('Quittances 2026 ·');
    expect(lignes[1]).toHaveTextContent('Quittance de février');
    // Le serveur fait foi : rien n'est refiltré, même ce que « quittance » ne nomme pas.
    expect(lignes[2]).toHaveTextContent('Contrat de bail signé');
    expect(lignes[2]).toHaveTextContent('Mon bail ·');

    fireEvent.click(screen.getByRole('button', { name: /Suivant/ }));
    expect(ecrite()).toBe('/app/documents?q=quittance&page=2');
  });

  it('`?page=` part au serveur avec la requête', () => {
    navigation.params = 'q=quittance&page=2';
    rendre();
    expect(recherche.appels.at(-1)).toEqual(['quittance', 2]);
  });

  it('aucune correspondance : le dire, avec la requête, et effacer ramène au coffre', () => {
    navigation.params = 'q=zzz';
    recherche.data = { data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } };
    rendre();
    expect(screen.getByRole('status')).toHaveTextContent('Aucun document trouvé');
    expect(screen.getByText('Aucun document de votre coffre ne correspond à « zzz ».')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    expect(ecrite()).toBe('/app/documents');
  });

  it('au bureau, le champ est dans l’en-tête et l’aperçu suit l’entrée choisie', () => {
    ecran.bureau = true;
    navigation.params = 'q=quittance';
    rendre();
    const apercu = screen.getByRole('complementary', { name: 'Aperçu' });
    expect(within(apercu).getByText('Quittance de mars')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Contrat de bail signé/ }));
    expect(within(apercu).getByText('Contrat de bail signé')).toBeInTheDocument();
  });
});

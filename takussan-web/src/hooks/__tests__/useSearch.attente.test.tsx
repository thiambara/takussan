/**
 * TCK-580 — l'attente d'une recherche se voit du CLIC à l'arrivée des biens.
 *
 * Le routeur de Next est simulé par ce qu'il est vraiment : une transition qui SUSPEND jusqu'à la
 * réponse du serveur. Un `push` factice qui rendrait la main tout de suite terminerait la
 * transition dans le même battement, et aucun des états ci-dessous ne serait observable — le test
 * serait vert sur l'ancien code comme sur le nouveau.
 */
import { Suspense, use, useEffect, useContext, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

// `vi.hoisted` : la fabrique de `vi.mock` s'exécute AVANT le corps de ce fichier.
const { ContexteParams } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return { ContexteParams: createContext(new URLSearchParams()) };
});

type EtatDuRouteur = { readonly params: URLSearchParams; readonly attente: Promise<void> | null };
let naviguer: (etat: EtatDuRouteur) => void = () => {};
let terminerLaNavigation: () => void = () => {};

/**
 * `push` pose, DANS la transition de l'appelant, la nouvelle URL et une promesse qui suspend :
 * l'URL ne s'engage qu'à `terminerLaNavigation()` — l'aller-retour RSC de Next.
 */
const mockPush = vi.fn((url: string) => {
  const attente = new Promise<void>((resoudre) => { terminerLaNavigation = resoudre; });
  naviguer({ params: new URLSearchParams(url.split('?')[1] ?? ''), attente });
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockPush }),
  usePathname: () => '/properties',
  useSearchParams: () => useContext(ContexteParams),
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { useSearch } from '../useSearch';

const REPONSE = { data: [], facets: {}, meta: { total: 0, per_page: 30, current_page: 1, last_page: 1 } };

function Routeur({ initiale, children }: { initiale: string; children: ReactNode }) {
  const [etat, setEtat] = useState<EtatDuRouteur>(() => ({
    params: new URLSearchParams(initiale),
    attente: null,
  }));
  // Dans un effet : l'écrire pendant le rendu serait un effet de bord (`react-hooks/globals`).
  useEffect(() => {
    naviguer = setEtat;
  }, []);
  if (etat.attente) use(etat.attente);
  return <ContexteParams.Provider value={etat.params}>{children}</ContexteParams.Provider>;
}

/** `enCours` à CHAQUE rendu — un seul rendu à `false` au milieu de l'attente éteint la puce. */
let historique: boolean[] = [];

function monte(url = '') {
  historique = [];
  return renderHook(() => {
    const recherche = useSearch();
    historique.push(recherche.enCours);
    return recherche;
  }, {
    wrapper: ({ children }) => (
      <Suspense fallback={null}>
        <Routeur initiale={url}>{children}</Routeur>
      </Suspense>
    ),
  });
}

beforeEach(() => {
  mockPush.mockClear();
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue(REPONSE);
});

afterEach(() => {
  naviguer = () => {};
});

describe('TCK-580 — useSearch : du clic à l’arrivée des biens', () => {
  it('enCours ne retombe qu’à l’arrivée des biens, et la puce visée s’affiche dès le clic', async () => {
    const { result } = monte();
    await waitFor(() => expect(result.current.enCours).toBe(false));

    // 1. Le clic : la navigation court, rien n'a encore changé dans l'URL. (`act` ATTENDU : une
    //    transition qui suspend sous un `act` synchrone n'est jamais relancée à sa résolution.)
    const depuisLeClic = historique.length;
    await act(async () => result.current.search({ type: ['villa'] }));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(result.current.enCours).toBe(true);
    expect(result.current.filters.type).toEqual(['villa']);
    expect(result.current.filtresDesResultats.type).toBeUndefined();

    // 2. L'URL atterrit, les biens sont demandés — et pas encore arrivés.
    let livrer: (r: typeof REPONSE) => void = () => {};
    mockApiFetch.mockImplementationOnce(() => new Promise((r) => { livrer = r; }));
    await act(async () => terminerLaNavigation());
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(result.current.enCours).toBe(true);
    expect(result.current.filters.type).toEqual(['villa']);
    expect(result.current.filtresDesResultats.type).toBeUndefined();

    // 3. Les biens arrivent : l'attente retombe, et les résultats répondent à la puce.
    await act(async () => livrer(REPONSE));
    await waitFor(() => expect(result.current.enCours).toBe(false));
    expect(result.current.filtresDesResultats.type).toEqual(['villa']);

    // Aucun rendu intermédiaire n'a laissé retomber l'attente : entre l'URL engagée et le
    // `LOADING` de l'effet, il y a un rendu où l'état vaut encore `success`.
    const attente = historique.slice(depuisLeClic);
    expect(attente.indexOf(false)).toBe(attente.length - 1);
  });

  it('deux gestes rapprochés se CUMULENT : le second ne défait pas le premier', async () => {
    const { result } = monte();
    await waitFor(() => expect(result.current.enCours).toBe(false));

    await act(async () => result.current.search({ city: 'Dakar' }));
    // Le premier geste court encore : l'URL n'a pas bougé.
    await act(async () => result.current.search({ type: ['villa'] }));

    const derniere = new URLSearchParams(String(mockPush.mock.calls.at(-1)?.[0]).split('?')[1]);
    expect(derniere.get('city')).toBe('Dakar');
    expect(derniere.get('type')).toBe('villa');
  });
});

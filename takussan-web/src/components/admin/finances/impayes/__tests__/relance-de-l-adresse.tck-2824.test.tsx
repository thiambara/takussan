/**
 * TCK-2824 — `?relance=` retiré de l'adresse RESTE retiré au chargement direct de la page.
 *
 * Next 16 relaie un `history.replaceState` vers son routeur (adresse canonique, `useSearchParams`) par
 * un correctif d'`history` que l'`AppRouter` pose dans SON effet — qui passe après ceux de ses
 * enfants. Un retrait synchrone, au premier montage, précédait ce correctif : le routeur gardait
 * `relance=` comme adresse canonique, et son rendu suivant (`router.refresh()`, rafraîchissement du
 * serveur de dev) la réécrivait dans la barre (mesuré par CDP).
 *
 * Le double ci-dessous reproduit ces trois traits de Next, et eux seuls :
 *  1. le correctif est posé dans l'effet du PARENT (après les effets de la page) ;
 *  2. un appel patché sans `__NA` met à jour l'adresse canonique (`ACTION_RESTORE`) ;
 *  3. chaque rendu du routeur réécrit l'adresse canonique par `replaceState({ __NA })` (`HistoryUpdater`).
 */
import { act, render, waitFor } from '@testing-library/react';
import { StrictMode, startTransition, useEffect, useInsertionEffect, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeur = vi.hoisted(() => ({
  recherche: '' as string,
  rafraichir: null as null | (() => void),
  /** Les données reçues par le correctif (hors appels internes `__NA`). */
  recus: [] as unknown[],
}));

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(routeur.recherche) }));

const { useRelanceDemandeeParLAdresse } = await import('../relance-de-l-adresse');

const ADRESSE = '/app/agency/finances?tab=impayes&relance=602';
const remplacerReel = window.history.replaceState.bind(window.history);

type Etat = { readonly canonique: string; readonly rendu: number };
/** Ce que le double de `useSearchParams` lit, publié par le routeur à chaque rendu (avant ses enfants). */
function publier(canonique: string, setEtat: (f: (e: Etat) => Etat) => void) {
  routeur.recherche = canonique.split('?')[1] ?? '';
  routeur.rafraichir = () => setEtat((e) => ({ ...e, rendu: e.rendu + 1 }));
}

function RouteurCommeNext({ children }: { readonly children: ReactNode }) {
  const [etat, setEtat] = useState<Etat>(() => ({ canonique: `${window.location.pathname}${window.location.search}`, rendu: 0 }));
  publier(etat.canonique, setEtat);
  // 3. `HistoryUpdater` : l'adresse canonique est réécrite à chaque état du routeur.
  useInsertionEffect(() => {
    remplacerReel({ __NA: true }, '', etat.canonique);
  }, [etat]);
  // 1. Le correctif d'`history`, posé dans l'effet du routeur — après ceux de la page.
  useEffect(() => {
    const avant = window.history.replaceState;
    window.history.replaceState = function (donnees: unknown, inutilise: string, url?: string | URL | null) {
      if ((donnees as { __NA?: boolean } | null)?.__NA) return remplacerReel(donnees, inutilise, url);
      routeur.recus.push(donnees);
      // 2. `ACTION_RESTORE` : l'adresse canonique suit.
      if (url) {
        const u = new URL(String(url), window.location.href);
        startTransition(() => setEtat((e) => ({ ...e, canonique: `${u.pathname}${u.search}` })));
      }
      return remplacerReel({ ...(donnees as object | null), __NA: true }, inutilise, url);
    };
    return () => {
      window.history.replaceState = avant;
    };
  }, []);
  return <>{children}</>;
}

const vu = { demande: null as unknown };
function Page() {
  const { demande } = useRelanceDemandeeParLAdresse();
  useEffect(() => {
    vu.demande = demande;
  });
  return null;
}

beforeEach(() => {
  remplacerReel(null, '', ADRESSE);
  routeur.recus.length = 0;
  vu.demande = null;
});
afterEach(() => {
  remplacerReel(null, '', '/');
});

describe('TCK-2824 — chargement direct de `?relance=` : le paramètre ne revient pas', () => {
  it('le retrait atteint le routeur (correctif de Next) : un rendu suivant du routeur ne réécrit pas `relance=`', async () => {
    render(
      <StrictMode>
        <RouteurCommeNext>
          <Page />
        </RouteurCommeNext>
      </StrictMode>,
    );
    await waitFor(() => expect(vu.demande).toEqual({ jeton: 1, cible: { genre: 'echeance', id: 602 } }));
    await waitFor(() => expect(window.location.search).toBe('?tab=impayes'));
    // Le retrait est passé PAR le correctif, sans `__NA` (sinon Next l'aurait ignoré en silence).
    expect(routeur.recus).toHaveLength(1);
    expect((routeur.recus[0] as { __NA?: boolean } | null)?.__NA).toBeUndefined();

    // `router.refresh()` : le routeur rend de nouveau, et réécrit SON adresse canonique.
    await act(async () => routeur.rafraichir!());
    expect(window.location.search).toBe('?tab=impayes');
    expect(routeur.recherche).toBe('tab=impayes');
    // Et la demande n'est pas relue (une seule, jeton 1).
    expect(vu.demande).toEqual({ jeton: 1, cible: { genre: 'echeance', id: 602 } });
  });
});

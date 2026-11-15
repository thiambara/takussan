'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { requeteAvecFixes } from '@/lib/recherche-publique';
import { cleDeLEntreeCourante } from '@/hooks/useScrollRestoration';
import type { SearchResult } from '@/types/search';

/**
 * TCK-2499 — « Voir N biens de plus » : les pages suivantes de la recherche AFFICHÉE, ajoutées sous
 * la première, sans changer l'URL.
 *
 * ## Pourquoi l'URL ne bouge pas
 *
 * L'URL reste la source des FILTRES (contrainte du ticket). Le nombre de pages chargées n'en est pas
 * un : l'écrire (`?page=3`) ferait servir au rendu serveur la page 3 SEULE, et une recherche
 * partagée s'ouvrirait au milieu de ses résultats. Le bouton reste pourtant un LIEN vers la page
 * suivante (`href`), pour les robots et le clic modifié : la pagination numérotée ne laisse aucune
 * page orpheline (TCK-557).
 *
 * ## Le retour arrière ramène les biens déjà chargés — AC3
 *
 * Les pages ajoutées sont rangées en `sessionStorage` sous la clé de l'ENTRÉE d'historique, celle-là
 * même qui range la position (`useScrollRestoration`), avec la requête qu'elles prolongent. Au
 * remontage de la liste (retour depuis une fiche), elles reviennent AVANT que la position ne soit
 * restaurée : `pret` reste faux tant que la décision n'est pas prise. Sans cela, la position du 50ᵉ
 * bien serait écrêtée sur un document qui n'en porte que 40.
 *
 * Une nouvelle navigation vers la même recherche (lien, barre) arrive sur une entrée NEUVE, sans
 * clé : elle repart de la première page, comme toute nouvelle recherche.
 */

/** Exporté pour les tests. */
export const PREFIXE_DE_LA_SUITE = 'takussan:liste:suite:';
const PREFIXE = PREFIXE_DE_LA_SUITE;

/** Une seule référence pour « aucune page » : l'effet qui range ne repart pas à chaque rendu. */
const AUCUNE_PAGE: readonly SearchResult[] = [];

/** Au-delà, une entrée gardée est trop vieille pour être crue (prix, disponibilité). */
export const DUREE_DE_VIE_MS = 30 * 60_000;

interface SuiteRangee {
  readonly cle: string;
  readonly pages: readonly SearchResult[];
  readonly le: number;
}

/** Au plus autant de listes gardées dans l'onglet (la courante comprise) : ~40 Kio par page chargée. */
export const LISTES_GARDEES = 5;

/**
 * Range la suite de l'entrée, et fait le ménage À CHAQUE ÉCRITURE : les suites expirées partent, et
 * seules les {@link LISTES_GARDEES} plus récentes restent. L'expiration n'était vérifiée qu'à la
 * lecture : une trentaine de listes chargées dans un onglet atteignaient le quota, et les positions
 * de `useScrollRestoration`, rangées au même endroit, cessaient alors de s'écrire, en silence
 * (revue de TCK-2499). Une entrée sans page ajoutée n'a rien à reprendre : sa clé est retirée.
 */
function ranger(entree: string, suite: SuiteRangee): void {
  try {
    const stockage = window.sessionStorage;
    const cle = PREFIXE + entree;
    if (suite.pages.length === 0) {
      stockage.removeItem(cle);
      return;
    }
    const autres: { cle: string; le: number }[] = [];
    for (let i = stockage.length - 1; i >= 0; i--) {
      const k = stockage.key(i);
      if (!k || !k.startsWith(PREFIXE) || k === cle) continue;
      let le: unknown = null;
      try {
        le = (JSON.parse(stockage.getItem(k) ?? 'null') as { le?: unknown } | null)?.le;
      } catch {
        // Illisible : traité comme expiré.
      }
      if (typeof le !== 'number' || !Number.isFinite(le) || suite.le - le > DUREE_DE_VIE_MS) stockage.removeItem(k);
      else autres.push({ cle: k, le });
    }
    autres
      .sort((a, b) => b.le - a.le)
      .slice(LISTES_GARDEES - 1)
      .forEach((vieille) => stockage.removeItem(vieille.cle));
    stockage.setItem(cle, JSON.stringify(suite));
  } catch {
    // Quota ou stockage interdit : on perd la reprise, on ne casse rien.
  }
}

function relire(entree: string): SuiteRangee | null {
  try {
    const brut = window.sessionStorage.getItem(PREFIXE + entree);
    if (!brut) return null;
    const lu = JSON.parse(brut) as Partial<SuiteRangee> | null;
    if (typeof lu?.cle !== 'string' || !Array.isArray(lu.pages) || typeof lu.le !== 'number') return null;
    if (Date.now() - lu.le > DUREE_DE_VIE_MS) return null;
    return { cle: lu.cle, pages: lu.pages, le: lu.le };
  } catch {
    return null;
  }
}

export interface SuiteDeLaListe {
  /** Les pages ajoutées sous la première, dans l'ordre. */
  readonly pages: readonly SearchResult[];
  /** La page suivante à demander, ou `null` quand la dernière est chargée. */
  readonly pageSuivante: number | null;
  readonly chargement: boolean;
  readonly erreur: boolean;
  /**
   * Vrai une fois la reprise décidée (pages rendues ou rien à rendre). Le signal que la position
   * peut être restaurée : le document a sa hauteur.
   */
  readonly decidee: boolean;
  readonly voirPlus: () => void;
}

/**
 * @param premiere la réponse affichée (la page que l'URL décrit), `null` tant qu'il n'y en a pas.
 * @param cle la chaîne d'URL de la requête dont `premiere` est la réponse (`useSearch().cleDesResultats`).
 */
export function useSuiteDeLaListe(
  premiere: SearchResult | null,
  cle: string | null,
  /** TCK-2522 — le périmètre fixe d'une fiche (`agency`, `agent`…), cf. `requeteAvecFixes`. */
  parametresFixes?: Readonly<Record<string, string>>,
): SuiteDeLaListe {
  const [etat, setEtat] = useState<{ cle: string | null; pages: readonly SearchResult[] }>({ cle: null, pages: AUCUNE_PAGE });
  const [chargement, setChargement] = useState<{ cle: string | null; page: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [decidee, setDecidee] = useState(false);
  const entree = useRef<string | null>(null);

  // La reprise, AVANT la première peinture des résultats complétés : au montage si le serveur a
  // semé la première page (retour arrière ordinaire), sinon à l'arrivée de la première réponse.
  // Une seule fois : c'est le RETOUR sur l'entrée qui se reprend, pas chaque requête suivante.
  useLayoutEffect(() => {
    if (decidee || cle === null) return;
    entree.current = cleDeLEntreeCourante();
    const rangee = relire(entree.current);
    if (rangee && rangee.cle === cle && rangee.pages.length > 0) setEtat({ cle, pages: rangee.pages });
    setDecidee(true);
  }, [decidee, cle]);

  // Les pages ne valent que pour la requête qu'elles prolongent : un filtre changé les oublie.
  const pages = etat.cle !== null && etat.cle === cle ? etat.pages : AUCUNE_PAGE;

  useEffect(() => {
    if (!decidee || cle === null || entree.current === null) return;
    // La clé de l'entrée se relit : un filtre changé par `router.push` arrive sur une entrée neuve.
    entree.current = cleDeLEntreeCourante();
    ranger(entree.current, { cle, pages, le: Date.now() });
  }, [decidee, cle, pages]);

  const derniere = pages.length > 0 ? pages[pages.length - 1] : premiere;
  const pageSuivante =
    derniere && derniere.meta.current_page < derniere.meta.last_page ? derniere.meta.current_page + 1 : null;

  const voirPlus = () => {
    if (cle === null || pageSuivante === null || !premiere) return;
    if (chargement && chargement.cle === cle) return;
    const params = requeteAvecFixes(new URLSearchParams(cle), parametresFixes);
    params.set('page', String(pageSuivante));
    // TCK-1008 — la même graine que la première page : la rotation des emplacements ne change pas
    // en cours de lecture.
    if (premiere.seed_hour) params.set('seed_hour', premiere.seed_hour);
    setChargement({ cle, page: pageSuivante });
    setErreur(null);
    apiFetch<SearchResult>(`/public/properties/search?${params.toString()}`)
      .then((resultat) => {
        setEtat((avant) => {
          const deja = avant.cle === cle ? avant.pages : [];
          if (deja.some((p) => p.meta.current_page === resultat.meta.current_page)) return avant;
          return { cle, pages: [...deja, resultat] };
        });
      })
      .catch(() => setErreur(cle))
      .finally(() => setChargement((c) => (c && c.cle === cle && c.page === pageSuivante ? null : c)));
  };

  return {
    pages,
    pageSuivante,
    chargement: chargement !== null && chargement.cle === cle,
    erreur: erreur !== null && erreur === cle,
    decidee,
    voirPlus,
  };
}

'use client';

import { useEffect, useRef } from 'react';

/**
 * Restauration du défilement au retour arrière — TCK-335, étape 4.
 *
 * ## Le défaut, mesuré au navigateur
 *
 * `/properties?city=Dakar&bedrooms=3` → défiler à 1 200 px → cliquer une fiche →
 * Précédent : l'URL revient, les filtres reviennent, **le défilement est à 0 px**.
 * L'utilisateur qui parcourait la 12e annonce repart du haut.
 *
 * ## La cause, diagnostiquée — et ce n'est PAS « Next remet à zéro »
 *
 * En traversée d'historique, Next ne reprend pas la main sur le défilement :
 * `completeTraverseNavigation` reconduit `focusAndScrollRef` sans créer de `scrollRef`
 * actif, donc le `scrollTop = 0` de `layout-router` ne s'exécute jamais. C'est la
 * restauration **native du navigateur** qui opère — et elle opère trop tôt, sur un
 * document au tiers de sa hauteur cible : la branche de chargement de
 * `PropertiesDiscoveryPage` rend 10 squelettes là où la réponse porte 30 résultats
 * (`useSearch`, `per_page=30`). Un `scrollTo(0, 1200)` sur un document de 400 px
 * **est écrêté à 0**, silencieusement, et le navigateur ne réessaie pas.
 *
 * D'où la forme du correctif : ce hook ne restaure pas au montage, il restaure
 * **après le commit des résultats**, quand le document a enfin sa hauteur.
 *
 * ## L'identité d'une entrée d'historique
 *
 * La position se mémorise **par entrée d'historique**, jamais par URL seule : deux
 * recherches successives partagent la même URL de page, et restaurer la position de
 * l'une dans l'autre serait un second mensonge.
 *
 * ⚠ **Le routeur App de Next 16 n'écrit AUCUNE clé dans `history.state`** — vérifié
 * dans `node_modules/next/dist/client/components/app-router.js` : il n'y pose que
 * `__NA` et `__PRIVATE_NEXTJS_INTERNALS_TREE`. Le `history.state.key` du routeur
 * Pages n'existe plus ici. On le lit d'abord s'il est présent (au cas où), puis on
 * retombe sur une clé à nous, posée par `replaceState`. Elle survit aux navigations :
 * le même fichier compose son état d'historique avec `...window.history.state` tant
 * que `pushRef.preserveCustomHistoryState` vaut `true`, ce qui est sa seule valeur
 * assignée dans `create-initial-router-state.js`.
 *
 * La position mémorise **aussi son URL**, et n'est restaurée que si l'URL courante
 * lui correspond. C'est ce qui distingue un vrai retour arrière (même entrée, même
 * URL → on restaure) d'un changement de filtre (`router.replace`, même entrée,
 * URL différente → nouveaux résultats, on repart du haut, ce qui est correct).
 *
 * @param pret le signal « les résultats sont peints ». `false` tant que la page rend
 *             des squelettes ; `true` au commit qui porte les résultats.
 */

/** Préfixe de `sessionStorage`. Le stockage est volontairement lié à l'onglet. */
const PREFIXE = 'takussan:scroll:';

/** Clé posée dans `history.state` quand le routeur n'en fournit pas. */
const CLE_ETAT = '__takussanScrollKey';

/** Tolérance en pixels : sous ce seuil, on considère que la position est atteinte. */
const TOLERANCE = 2;

interface Position {
  readonly y: number;
  readonly url: string;
}

/**
 * Miroir en mémoire du stockage de session. Il porte le cas où `sessionStorage` est
 * indisponible (navigation privée verrouillée, iframe cloisonnée) : la restauration
 * continue alors de fonctionner à l'intérieur d'une même vie de document, qui est
 * exactement le cas d'usage visé.
 */
const memoire = new Map<string, Position>();

function urlCourante(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** Lit la clé de l'entrée courante SANS jamais en créer une. */
function lireCle(): string | null {
  const etat = window.history.state as Record<string, unknown> | null;
  if (!etat) return null;
  if (typeof etat.key === 'string' && etat.key !== '') return etat.key;
  const interne = etat[CLE_ETAT];
  return typeof interne === 'string' && interne !== '' ? interne : null;
}

/** Lit la clé de l'entrée courante, et en pose une si l'entrée n'en porte pas. */
function lireOuPoserCle(): string {
  const existante = lireCle();
  if (existante) return existante;

  const neuve = `sr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    window.history.replaceState(
      { ...(window.history.state as Record<string, unknown> | null), [CLE_ETAT]: neuve },
      '',
    );
  } catch {
    // Certains navigateurs plafonnent `replaceState`. La clé reste alors locale au
    // montage : on perd la restauration, on ne casse rien.
  }
  return neuve;
}

function memoriser(cle: string, position: Position): void {
  memoire.set(cle, position);
  try {
    window.sessionStorage.setItem(PREFIXE + cle, JSON.stringify(position));
  } catch {
    // Quota ou stockage interdit : le miroir mémoire suffit.
  }
}

function relire(cle: string): Position | null {
  const enMemoire = memoire.get(cle);
  if (enMemoire) return enMemoire;
  try {
    const brut = window.sessionStorage.getItem(PREFIXE + cle);
    if (!brut) return null;
    const analyse = JSON.parse(brut) as Partial<Position> | null;
    if (typeof analyse?.y !== 'number' || typeof analyse?.url !== 'string') return null;
    return { y: analyse.y, url: analyse.url };
  } catch {
    return null;
  }
}

export function useScrollRestoration(pret: boolean): void {
  const cleRef = useRef<string | null>(null);
  /** Jeton `clé|url` déjà traité — empêche de restaurer deux fois le même commit. */
  const dejaTraite = useRef<string | null>(null);
  /**
   * L'enregistrement n'ouvre qu'une fois la restauration DÉCIDÉE. Sans ce verrou, le
   * `scrollTo(0, 0)` que le navigateur (ou le routeur) applique avant notre restauration
   * produirait un événement `scroll` qui écraserait la position mémorisée par 0 — le hook
   * effacerait la donnée dont il a besoin, une frame avant de s'en servir.
   */
  const enregistrementOuvert = useRef(false);

  useEffect(() => {
    const cle = lireOuPoserCle();
    cleRef.current = cle;

    // On prend la main sur la restauration native : c'est elle qui écrête à 0 (cf. l'en-tête).
    // La valeur précédente est rendue au démontage — le réglage est global au document.
    const restaurationPrecedente = window.history.scrollRestoration;
    try {
      window.history.scrollRestoration = 'manual';
    } catch {
      // Non implémenté (jsdom, vieux navigateurs) : la restauration native reste en place,
      // notre restauration post-commit passe simplement après elle.
    }

    let planifie = false;
    const enregistrer = () => {
      planifie = false;
      if (!enregistrementOuvert.current) return;
      // La navigation suivante hérite de l'état d'historique de Next : si la clé courante
      // n'est plus la nôtre, l'entrée a changé et ce défilement ne nous appartient pas.
      if (lireCle() !== cle) return;
      memoriser(cle, { y: window.scrollY, url: urlCourante() });
    };
    const surDefilement = () => {
      if (planifie) return;
      planifie = true;
      window.requestAnimationFrame(enregistrer);
    };

    window.addEventListener('scroll', surDefilement, { passive: true });
    return () => {
      window.removeEventListener('scroll', surDefilement);
      try {
        window.history.scrollRestoration = restaurationPrecedente ?? 'auto';
      } catch {
        // idem
      }
    };
  }, []);

  useEffect(() => {
    if (!pret) return;
    const cle = cleRef.current;
    if (!cle) return;

    const url = urlCourante();
    const jeton = `${cle}|${url}`;
    if (dejaTraite.current === jeton) return;
    dejaTraite.current = jeton;

    const position = relire(cle);
    // Une fois la décision prise, le défilement de l'utilisateur redevient la source de vérité.
    enregistrementOuvert.current = true;

    if (!position || position.url !== url || position.y <= 0) return;

    // Le commit des résultats vient d'avoir lieu : le document a sa hauteur cible. On tente
    // tout de suite, puis UNE fois de plus à la frame suivante — la mise en page peut n'être
    // pas encore stabilisée. Deux tentatives, pas une boucle : une boucle qui poursuit une
    // hauteur qui ne viendra jamais se battrait contre l'utilisateur qui défile.
    const aller = () => window.scrollTo(0, position.y);
    aller();
    const image = window.requestAnimationFrame(() => {
      if (Math.abs(window.scrollY - position.y) > TOLERANCE) aller();
    });
    return () => window.cancelAnimationFrame(image);
  }, [pret]);
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Anti-rebond du dépôt — TCK-335, étape 3.
 *
 * ## Pourquoi ce fichier existe
 *
 * `useDebouncedValue` vivait en copie LOCALE et non exportée dans `useSuggest.ts`. C'était la
 * seule implémentation générique du dépôt, et elle n'était donc réutilisable par personne : le
 * panneau de filtres publics a vécu sans anti-rebond, et chaque caractère frappé y déclenchait
 * une requête `/search` PLUS un aller-retour RSC (mesuré le 2026-08-21 : « Dakar » = 10 requêtes,
 * « 150000 » dans le prix = 12 requêtes dont six qui rendent le catalogue entier, 176 Ko).
 *
 * ## Les deux formes, et pourquoi il en faut deux
 *
 * - {@link useDebouncedValue} temporise une VALEUR. C'est ce dont `useSuggest` a besoin : la
 *   requête est dérivée de la valeur, il n'y a rien à déclencher.
 * - {@link useDebouncedCallback} temporise un EFFET. C'est ce dont `FilterSidebar` a besoin :
 *   la valeur affichée doit rester immédiate (l'input est saisi par l'utilisateur), seul le
 *   commit vers l'URL est différé. Une valeur temporisée ne conviendrait pas — il faudrait un
 *   `useEffect` qui la surveille, donc un rendu de plus et un déclenchement au montage.
 *
 * ## `flush()` n'est pas un confort
 *
 * Sans lui, tout ce qui lit l'état COMMITÉ pendant qu'un brouillon est en attente lit la valeur
 * d'AVANT la frappe. Cas mesuré : `SaveSearchButton` vit hors du panneau de filtres et lit
 * `filters`, c'est-à-dire l'URL ; sans `flush()` au `blur`, il enregistre la recherche
 * précédente. Le patron est celui de `useWizardDraft` (`save`/`flush`/`clear`).
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export interface DebouncedCallback<TArgs extends unknown[]> {
  /** Arme (ou ré-arme) le déclenchement dans `delay` ms. Le dernier appel gagne. */
  call: (...args: TArgs) => void;
  /** Déclenche MAINTENANT ce qui était en attente. Sans attente, ne fait rien. */
  flush: () => void;
  /** Abandonne ce qui était en attente. Rien ne sera déclenché. */
  cancel: () => void;
}

/**
 * Temporise l'APPEL de `fn`, sans jamais figer la version appelée.
 *
 * ⚠️ **La fermeture n'est pas capturée à l'armement, elle est relue au déclenchement.** C'est la
 * seule raison d'être du `fnRef` ci-dessous, et elle est concrète : dans `FilterSidebar`, la
 * fonction commitée fusionne le brouillon avec `filters`, lui-même relu à chaque rendu. Un
 * `setTimeout(fn, delay)` naïf capturerait le `fn` de l'instant de la frappe — donc les
 * `filters` d'AVANT — et un `contract_type` posé entre-temps par un clic sur une puce serait
 * silencieusement effacé au déclenchement.
 *
 * @param fn la fonction à temporiser. Peut changer à chaque rendu, c'est attendu.
 * @param delay le délai en millisecondes.
 */
export function useDebouncedCallback<TArgs extends unknown[] = []>(
  fn: (...args: TArgs) => void,
  delay: number,
): DebouncedCallback<TArgs> {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const argsRef = useRef<TArgs | null>(null);

  // Volontairement SANS tableau de dépendances : la version la plus fraîche de `fn` doit être
  // celle du dernier rendu commité, à chaque rendu. Mettre le ref à jour PENDANT le rendu
  // serait un effet de bord de rendu (interdit en mode concurrent) ; l'effet, lui, a toujours
  // été rejoué avant qu'un `setTimeout` de plusieurs centaines de millisecondes n'échoie.
  useEffect(() => {
    fnRef.current = fn;
  });

  // Un composant démonté ne doit pas déclencher une navigation.
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const declenche = useCallback(() => {
    timerRef.current = null;
    const args = argsRef.current;
    argsRef.current = null;
    if (args !== null) fnRef.current(...args);
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    argsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    declenche();
  }, [declenche]);

  const call = useCallback(
    (...args: TArgs) => {
      argsRef.current = args;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(declenche, delay);
    },
    [declenche, delay],
  );

  return { call, flush, cancel };
}

'use client';

import { useEffect, type RefObject } from 'react';

import { urlApiPublique } from '@/lib/api';

/**
 * TCK-2569 (amendement d'ADR-0061 du 2026-11-16, option (a) du porteur) — le NAVIGATEUR déclare les
 * emplacements sponsorisés qu'il a réellement affichés ; l'API ne compte plus rien au service.
 *
 * Pourquoi ici : le front ne montre pas tout ce que l'API sert. Sur la première page, l'emplacement
 * de tête n'est pas inséré sous des places réservées, et la suite continue retire un emplacement dont
 * le bien est déjà plus haut (`suiteDesPages`, TCK-2500). Une impression se déclare donc depuis la
 * CELLULE rendue, jamais depuis la réponse : ce qui n'est pas monté ne peut rien déclarer.
 *
 * - **Affiché, pas monté** : la moitié de la carte dans l'écran (`IntersectionObserver`, seuil 0,5)
 *   — une carte hors champ d'un carrousel ou sous la ligne de flottaison ne compte pas.
 * - **Une fois par bien et par page** : l'ensemble `declares` vit le temps du document ; l'API
 *   déduplique en plus par visiteur et par bien sur 30 min (TCK-708).
 * - **Groupé, sans bloquer** : un lot part {@link DELAI_DU_LOT_MS} après la première carte vue, ou
 *   quand la page se cache ; `keepalive`, sans identifiants, réponse ignorée (204 toujours).
 * - **Corps de formulaire** (`slugs[]=…`) : une requête « simple », sans pré-vérification CORS. Rien
 *   d'autre que les slugs des biens que l'API vient de servir comme emplacements — aucun contact.
 */
export const DELAI_DU_LOT_MS = 1000;
export const SEUIL_AFFICHE = 0.5;

const declares = new Set<string>();
let enAttente: string[] = [];
let minuterie: ReturnType<typeof setTimeout> | null = null;
let ecouteDeLaSortie = false;

function envoyer(): void {
  if (minuterie !== null) {
    clearTimeout(minuterie);
    minuterie = null;
  }
  if (enAttente.length === 0) return;
  const corps = new URLSearchParams();
  for (const slug of enAttente) corps.append('slugs[]', slug);
  enAttente = [];
  try {
    fetch(urlApiPublique('/public/properties/sponsored-impressions'), {
      method: 'POST',
      body: corps,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {
      // Un compteur n'a rien à dire au visiteur : une impression perdue n'est pas une panne.
    });
  } catch {
    // idem : `fetch` absent ou qui lève à l'appel.
  }
}

function surLaSortie(): void {
  if (typeof document === 'undefined' || document.visibilityState === 'hidden') envoyer();
}

/** Ajoute un emplacement affiché au lot ; sans effet s'il a déjà été déclaré dans ce document. */
export function declarerEmplacementAffiche(slug: string): void {
  if (!slug || declares.has(slug)) return;
  declares.add(slug);
  enAttente.push(slug);
  if (!ecouteDeLaSortie && typeof window !== 'undefined') {
    ecouteDeLaSortie = true;
    window.addEventListener('pagehide', envoyer);
    document.addEventListener('visibilitychange', surLaSortie);
  }
  if (minuterie === null) minuterie = setTimeout(envoyer, DELAI_DU_LOT_MS);
}

/** Pour les tests : oublie les déclarations et le lot en cours. */
export function reinitialiserLesDeclarations(): void {
  declares.clear();
  enAttente = [];
  if (minuterie !== null) clearTimeout(minuterie);
  minuterie = null;
}

/**
 * Observe chaque élément de `paires` et déclare son slug la première fois qu'il est affiché. Rend la
 * fonction qui débranche l'observateur.
 */
export function observerLesEmplacements(paires: ReadonlyArray<readonly [Element, string]>): () => void {
  if (paires.length === 0 || typeof IntersectionObserver === 'undefined') return () => {};
  const slugs = new Map<Element, string>(paires);
  const observateur = new IntersectionObserver(
    (entrees) => {
      for (const entree of entrees) {
        if (!entree.isIntersecting || entree.intersectionRatio < SEUIL_AFFICHE) continue;
        const slug = slugs.get(entree.target);
        if (slug === undefined) continue;
        declarerEmplacementAffiche(slug);
        observateur.unobserve(entree.target);
      }
    },
    { threshold: SEUIL_AFFICHE },
  );
  for (const [element] of paires) observateur.observe(element);
  return () => observateur.disconnect();
}

/** Une cellule d'emplacement : `slug` à `null` quand la cellule n'est pas un emplacement payé. */
export function useEmplacementAffiche(ref: RefObject<Element | null>, slug: string | null): void {
  useEffect(() => {
    const element = ref.current;
    if (slug === null || element === null) return;
    return observerLesEmplacements([[element, slug]]);
  }, [ref, slug]);
}

/**
 * Une rangée dont CHAQUE carte est un emplacement (la rangée vedette de l'accueil) : les enfants
 * directs du conteneur, dans l'ordre de `slugs`. `slugs` à `null` : la rangée n'est pas un emplacement.
 */
export function useEmplacementsDeLaRangee(ref: RefObject<Element | null>, slugs: readonly string[] | null): void {
  const cle = slugs === null ? null : slugs.join('\n');
  useEffect(() => {
    const conteneur = ref.current;
    if (cle === null || conteneur === null) return;
    const liste = cle === '' ? [] : cle.split('\n');
    const paires = liste.flatMap((slug, i): Array<readonly [Element, string]> => {
      const enfant = conteneur.children.item(i);
      return enfant === null ? [] : [[enfant, slug] as const];
    });
    return observerLesEmplacements(paires);
  }, [ref, cle]);
}

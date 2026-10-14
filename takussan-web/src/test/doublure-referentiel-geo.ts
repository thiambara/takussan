import { vi } from 'vitest';
import type { ReferentielGeo } from '@/components/property-form/useReferentielGeo';

/**
 * TCK-633 — la doublure du référentiel géographique pour les tests du parcours qui ne le
 * mettent PAS à l'épreuve : listes vides, aucun appel réseau, aucun `QueryClientProvider` requis.
 * Les villes et quartiers tapés y restent du texte libre, ce qui est le comportement d'avant le
 * lot — ces tests-là continuent donc d'affirmer ce qu'ils affirmaient.
 *
 * Usage : `vi.mock('@/components/property-form/useReferentielGeo', () => import('@/test/doublure-referentiel-geo'));`
 * Le référentiel lui-même est éprouvé par `ChampsLieu.test.tsx`, avec des listes remplies.
 */
const VIDE: ReferentielGeo = {
  regions: [],
  villes: [],
  quartiers: [],
  chargement: { villes: false, quartiers: false },
};

export function useReferentielGeo(): ReferentielGeo {
  return VIDE;
}

export function useResolutionDeLien() {
  return { mutate: vi.fn(), isPending: false };
}

'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/**
 * TCK-1732 (P168.03) — la vue d'une liste (onglet, filtres, page) portée par la requête de l'URL,
 * sur le patron d'`AdminFinancesTabs` et de `BookingsList` : lue par `useSearchParams` et bornée aux
 * valeurs connues, écrite par `router.replace`, la valeur par défaut absente de l'URL. Tenue en
 * `useState`, la vue se perdait au rechargement, au lien copié et au retour d'une fiche.
 */

type Lecture = Pick<URLSearchParams, 'get' | 'toString'>;

/** Une valeur de la requête, si elle est l'une de `valeurs` ; `null` sinon. */
export function valeurBornee<T extends string>(params: Lecture, cle: string, valeurs: readonly T[]): T | null {
  const v = params.get(cle);
  return v !== null && (valeurs as readonly string[]).includes(v) ? (v as T) : null;
}

/** `?page=` : un entier ≥ 1, ou 1. */
export function pageDeLUrl(params: Lecture, cle = 'page'): number {
  const v = params.get(cle);
  if (v === null || !/^[1-9]\d*$/.test(v)) return 1;
  return Number(v);
}

/** La requête après `changements` ; `null`, `''` ou une page 1 retirent la clé. */
export function requeteAvec(params: Lecture, changements: Record<string, string | number | null>): string {
  const suite = new URLSearchParams(params.toString());
  for (const [cle, valeur] of Object.entries(changements)) {
    if (valeur === null || valeur === '' || (cle === 'page' && valeur === 1)) suite.delete(cle);
    else suite.set(cle, String(valeur));
  }
  const qs = suite.toString();
  return qs ? `?${qs}` : '?';
}

/** La requête de la page et la fonction qui la remplace, sans entrée d'historique ni défilement. */
export function useVueDansLUrl() {
  const router = useRouter();
  const params = useSearchParams();
  const remplacer = (changements: Record<string, string | number | null>) => {
    router.replace(requeteAvec(params, changements), { scroll: false });
  };
  return { params, remplacer };
}

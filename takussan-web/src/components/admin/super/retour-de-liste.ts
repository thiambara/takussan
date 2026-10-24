/**
 * TCK-1742 / TCK-1744 (P168.04) — le lien de retour d'un détail de la console rend la requête de la
 * liste quittée. La liste la passe au détail dans `?liste=` ; le détail ne la recopie qu'après
 * l'avoir réduite à ses clés connues et à leurs valeurs bornées, pour qu'un `?liste=` écrit à la
 * main ne mène qu'à une vue de la liste, jamais ailleurs.
 */

export type BornesDeListe = Readonly<Record<string, readonly string[]>>;

/** Les filtres de `/super-admin/agencies` que porte l'URL. */
export const FILTRES_LISTE_AGENCES: BornesDeListe = {
  status: ['active', 'inactive', 'suspended'],
  is_verified: ['1', '0'],
};

/** Les filtres de `/super-admin/agency-upgrade-requests` que porte l'URL. */
export const FILTRES_LISTE_DEMANDES_DE_PASSAGE: BornesDeListe = {
  status: ['pending', 'approved', 'rejected', 'revoked'],
};

/** La requête réduite aux clés et valeurs de `bornes`, sans `?` (vide s'il n'en reste rien). */
export function requeteBornee(brut: string | null | undefined, bornes: BornesDeListe): string {
  const source = new URLSearchParams(brut ?? '');
  const sortie = new URLSearchParams();
  for (const [cle, valeurs] of Object.entries(bornes)) {
    const v = source.get(cle);
    if (v !== null && valeurs.includes(v)) sortie.set(cle, v);
  }
  return sortie.toString();
}

/** Le lien d'une ligne vers son détail, qui porte la requête de la liste. */
export function versLeDetail(href: string, requeteListe: string): string {
  return requeteListe ? `${href}?liste=${encodeURIComponent(requeteListe)}` : href;
}

/** Le lien de retour du détail : la liste, avec la requête qu'il a reçue, bornée. */
export function retourALaListe(liste: string, brut: string | null, bornes: BornesDeListe): string {
  const qs = requeteBornee(brut, bornes);
  return qs ? `${liste}?${qs}` : liste;
}

/**
 * Où mène une ligne du journal d'audit — TCK-376.
 *
 * ## Le défaut corrigé
 *
 * La colonne « Objet » affichait `Property #12` en texte mort. Le journal disait donc qu'il
 * s'était passé quelque chose sur un objet, et laissait le modérateur le retrouver à la main.
 *
 * ## Pourquoi une table et pas une convention
 *
 * On pourrait dériver `App\Models\Property` → `/app/properties/{id}` par pluralisation. Ce serait
 * un lien mort pour la moitié des types : **vingt modèles portent le trait `Auditable`** côté API
 * (relevé le 2026-08-27 : `grep -rl 'use .*Auditable' app/Models/`), et le dépôt front ne publie
 * un écran par identifiant que pour quatre d'entre eux. `Invoice` et `User` sont dans le
 * sélecteur de filtre du journal lui-même et n'ont **aucune** page `[id]` — une convention les
 * enverrait sur un 404.
 *
 * D'où la règle de la direction UX du ticket : *le lien ne promet que ce qu'il peut tenir*. Ce
 * qui n'est pas dans cette table reste du texte, et l'ajout d'un écran se fait ici, en une ligne.
 *
 * ⚠ Une entrée ajoutée ici sans que la route existe rend un lien mort que rien ne signale.
 * `audit-subject-links.test.ts` vérifie que chaque destination correspond à un
 * `src/app/**\/[id]/page.tsx` réellement présent — c'est la garde, pas la relecture.
 */

/** Les segments de route, indexés par le nom court du modèle (la fin du FQCN). */
const DESTINATIONS: Readonly<Record<string, string>> = {
  Property: '/app/properties',
  Booking: '/app/bookings',
  Lease: '/app/leases',
  Customer: '/app/customers',
};

/**
 * Le nom court d'un FQCN PHP : `App\Models\Property` → `Property`.
 *
 * Exporté parce que la colonne l'affiche aussi quand il n'y a pas de destination — le libellé et
 * le lien doivent nommer le même objet, et deux extractions séparées finiraient par diverger.
 */
export function shortSubjectType(fqcn: string | null | undefined): string | null {
  if (!fqcn) return null;
  return fqcn.split('\\').pop() || null;
}

/**
 * L'adresse de l'objet d'une ligne d'audit, ou `null` quand le dépôt n'a pas d'écran pour lui.
 *
 * `null` n'est pas un échec : c'est la réponse juste pour `Invoice`, `User`, `Payout` et les
 * quatorze autres types audités sans page dédiée.
 */
export function auditSubjectHref(
  subjectType: string | null | undefined,
  subjectId: number | null | undefined,
): string | null {
  // `0` n'est pas un identifiant : `!subjectId` est ici le bon test, pas `== null`.
  if (!subjectId) return null;
  const court = shortSubjectType(subjectType);
  if (!court) return null;
  const base = DESTINATIONS[court];
  return base ? `${base}/${subjectId}` : null;
}

/** Les noms courts qui ont une destination. Sert aux tests, et à personne d'autre. */
export const AUDIT_SUBJECTS_AVEC_ECRAN = Object.freeze(Object.keys(DESTINATIONS));

/** Les segments visés. Sert à la garde qui vérifie que la route existe vraiment. */
export const AUDIT_SUBJECT_ROUTES = Object.freeze(Object.values(DESTINATIONS));

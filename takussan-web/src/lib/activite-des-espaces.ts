import type { Profile } from '@/types/profile';

/**
 * TCK-2848 — ce que `GET /api/me/profiles?include=activity` (TCK-2847, ADR-0116 § 5) rend sur chaque
 * profil : les compteurs de l'« Aujourd'hui » de CET espace, calculés sous ce profil par les règles des
 * listes. Un compteur absent vaut 0 — l'API ne rend que ceux du type de profil (agent et admin :
 * demandes et visites ; bailleur : biens et loyers ; prestataire : interventions).
 */
export interface ActiviteDUnEspace {
  readonly unhandled_leads?: number;
  readonly visits_today?: number;
  readonly properties?: number;
  readonly rent_overdue?: number;
  readonly interventions_today?: number;
}

/** L'ordre de la ligne (« 4 demandes · 2 visites aujourd'hui ») et la clé i18n de chaque compteur. */
export const COMPTEURS_D_ACTIVITE = [
  ['unhandled_leads', 'demandes'],
  ['visits_today', 'visitesAujourdhui'],
  ['properties', 'biens'],
  ['rent_overdue', 'loyersEnRetard'],
  ['interventions_today', 'interventionsAujourdhui'],
] as const satisfies readonly (readonly [keyof ActiviteDUnEspace, string])[];

export type CleDActivite = (typeof COMPTEURS_D_ACTIVITE)[number][1];

/** Le profil tel que l'inclusion le rend : la ligne de `me/profiles`, plus `activity`. */
export type ProfilAvecActivite = Profile & { readonly activity?: ActiviteDUnEspace | readonly [] };

/**
 * L'activité d'un espace PROPOSÉ. Une agence `individual` ne propose qu'un espace pour ses deux profils
 * (`espacesAProposer`, TCK-497) : son activité est celle des DEUX (l'admin y porte demandes et visites,
 * le bailleur ses biens et loyers) — sans quoi la fusion de présentation effaçait la moitié des
 * compteurs. Toute autre agence : l'activité de ce profil seul.
 */
export function activiteDeLEspace(
  espace: Profile,
  profils: readonly ProfilAvecActivite[] | undefined,
): ActiviteDUnEspace | null {
  if (!profils) return null;
  const memeEspace =
    espace.agency?.kind === 'individual' && espace.agency_id !== null
      ? profils.filter((p) => p.agency_id === espace.agency_id)
      : profils.filter((p) => p.id === espace.id);
  if (memeEspace.length === 0) return null;
  const somme: Record<string, number> = {};
  for (const p of memeEspace) {
    // `(object) []` côté PHP : un profil sans compteur arrive en tableau vide ou en objet vide.
    const activite = p.activity && !Array.isArray(p.activity) ? (p.activity as ActiviteDUnEspace) : {};
    for (const [cle] of COMPTEURS_D_ACTIVITE) {
      const n = activite[cle];
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) somme[cle] = (somme[cle] ?? 0) + n;
    }
  }
  return somme;
}

/** Les compteurs NON NULS, dans l'ordre de la ligne : aucun → la ligne n'existe pas (jamais « 0 demande »). */
export function segmentsDActivite(activite: ActiviteDUnEspace | null): { readonly cle: CleDActivite; readonly nombre: number }[] {
  if (!activite) return [];
  return COMPTEURS_D_ACTIVITE.flatMap(([champ, cle]) => {
    const nombre = activite[champ] ?? 0;
    return nombre > 0 ? [{ cle, nombre }] : [];
  });
}

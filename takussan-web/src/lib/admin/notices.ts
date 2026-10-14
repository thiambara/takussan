/**
 * Les motifs de redirection que le tableau de bord d'agence sait EXPLIQUER à l'arrivée.
 *
 * TCK-647 — l'écran d'arrivée était `/admin`, supprimé (ADR-0064 §3) : c'est désormais
 * `/app/overview/agency`, le tableau de bord unique, qui lit `?notice=`. Le seul émetteur
 * (`/admin/settings/tags`) part avec TCK-649 ; ce module pourra partir avec lui.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE, ET POURQUOI IL PORTE LES DEUX CÔTÉS
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `/admin/settings/tags` redirigeait vers `/admin?notice=tags-platform-managed` et **rien ne
 * lisait `notice`**. Mesuré le 2026-08-27, avant TCK-370 :
 *
 *     $ grep -rn "tags-platform-managed" src/
 *     src/app/(dashboard)/admin/settings/tags/page.tsx:6:  redirect('/admin?notice=tags-platform-managed');
 *
 * Une occurrence : celle qui l'écrit. L'utilisateur cliquait sur « Tags », atterrissait sur le
 * tableau de bord, et n'apprenait rien — ni qu'il avait été redirigé, ni pourquoi.
 *
 * Le fil est donc rétabli ICI plutôt que par une chaîne recopiée des deux côtés : la valeur du
 * paramètre est une CONSTANTE que l'émetteur et le lecteur importent tous les deux. *Deux
 * chaînes égales à l'écriture ne le restent pas ; un symbole partagé, si.*
 */

/** Valeur de `?notice=` posée par la redirection de `/admin/settings/tags`. */
export const AVIS_TAGS_GERES_PAR_PLATEFORME = 'tags-platform-managed';

/**
 * Table `valeur du paramètre` → `sous-espace de `dashboard.agencyNotices``. Ajouter un motif, c'est ajouter
 * une ligne ici plus deux clés dans les trois dictionnaires — rien d'autre.
 */
export const AVIS_ADMIN = {
  [AVIS_TAGS_GERES_PAR_PLATEFORME]: 'tagsPlatformManaged',
} as const;

export type CleAvisAdmin = keyof typeof AVIS_ADMIN;

export function estAvisAdminConnu(valeur: unknown): valeur is CleAvisAdmin {
  return typeof valeur === 'string' && Object.hasOwn(AVIS_ADMIN, valeur);
}

/** L'URL d'arrivée d'une redirection qui a une raison — la raison comprise. */
export function urlAdminAvecAvis(avis: CleAvisAdmin): string {
  return `/app/overview/agency?notice=${encodeURIComponent(avis)}`;
}

/**
 * TCK-2656 (lot 3) — le partage d'un document par lien, sans rendu : durées, plafond de
 * téléchargements, mot de passe, URL distribuée et message WhatsApp.
 *
 * La règle des valeurs est celle de `StoreDocumentShareLinkRequest` : `expires_at` après
 * maintenant, `max_downloads` entier ≥ 1 ou absent, `password` d'au moins 4 caractères ou absent.
 * Le formulaire refuse avant l'envoi ce que l'API refuserait en 422.
 */
import { jourADakar } from '@/lib/visites/par-le-temps';

export type DureeDePartage = '1h' | '24h' | '7d' | '30d';

const HEURE_MS = 60 * 60 * 1000;

/** La donnée porte la CLÉ (`documents.share.ttl.<valeur>`) ; le rendu la résout. */
export const DUREES_DE_PARTAGE: readonly { readonly valeur: DureeDePartage; readonly ms: number }[] = [
  { valeur: '1h', ms: HEURE_MS },
  { valeur: '24h', ms: 24 * HEURE_MS },
  { valeur: '7d', ms: 7 * 24 * HEURE_MS },
  { valeur: '30d', ms: 30 * 24 * HEURE_MS },
];

/** La maquette coche « 7 jours » et propose 3 téléchargements. */
export const DUREE_PAR_DEFAUT: DureeDePartage = '7d';
export const PLAFOND_PAR_DEFAUT = 3;
/** `null` : « sans limite ». Le compteur ne descend pas sous 1 (`min:1` de l'API) autrement. */
export type PlafondDeTelechargements = number | null;
export const PLAFOND_MAXIMUM = 1000;
export const MOT_DE_PASSE_MINIMUM = 4;

export function expirationDuLien(duree: DureeDePartage, maintenant: Date = new Date()): string {
  const ms = DUREES_DE_PARTAGE.find((d) => d.valeur === duree)?.ms ?? 7 * 24 * HEURE_MS;
  return new Date(maintenant.getTime() + ms).toISOString();
}

/** Le compteur : « − » depuis 1 donne « sans limite », « + » depuis « sans limite » donne 1. */
export function plafondSuivant(plafond: PlafondDeTelechargements, sens: 1 | -1): PlafondDeTelechargements {
  if (plafond === null) return sens === 1 ? 1 : null;
  const suivant = plafond + sens;
  if (suivant < 1) return null;
  return Math.min(suivant, PLAFOND_MAXIMUM);
}

export type ErreurDePartage = 'motDePasseVide' | 'motDePasseCourt' | null;

/** L'interrupteur « Protéger par un mot de passe » allumé exige un mot de passe valable. */
export function erreurDePartage(protege: boolean, motDePasse: string): ErreurDePartage {
  if (!protege) return null;
  if (motDePasse.length === 0) return 'motDePasseVide';
  if (motDePasse.length < MOT_DE_PASSE_MINIMUM) return 'motDePasseCourt';
  return null;
}

export interface DemandeDePartage {
  readonly expires_at: string;
  readonly max_downloads?: number;
  readonly password?: string;
}

/** La charge utile envoyée : un mot de passe n'en fait partie que si l'interrupteur est allumé. */
export function demandeDePartage(
  choix: { readonly duree: DureeDePartage; readonly plafond: PlafondDeTelechargements; readonly protege: boolean; readonly motDePasse: string },
  maintenant: Date = new Date(),
): DemandeDePartage {
  return {
    expires_at: expirationDuLien(choix.duree, maintenant),
    ...(choix.plafond === null ? {} : { max_downloads: choix.plafond }),
    ...(choix.protege ? { password: choix.motDePasse } : {}),
  };
}

/**
 * TCK-587 §8 — l'URL de la PAGE de réception (`[locale]/(public)/share/[token]`), sans langue :
 * le proxy pose celle du destinataire. Elle visait `${origin}/api/share/{token}`, une URL du front
 * où rien ne répondait, et le destinataire d'un lien protégé n'avait aucun formulaire.
 */
export function buildShareUrl(token: string): string {
  const chemin = `/share/${encodeURIComponent(token)}`;
  if (typeof window === 'undefined') return chemin;
  return `${window.location.origin}${chemin}`;
}

/**
 * « Envoyer par WhatsApp » : le message porte le lien, JAMAIS le mot de passe (« À donner de vive
 * voix, pas dans le même message que le lien »).
 */
export function lienWhatsApp(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export type RegleDExpiration =
  | { readonly cle: 'sansExpiration' }
  | { readonly cle: 'aujourdhui'; readonly instant: string }
  | { readonly cle: 'dans'; readonly jours: number }
  | { readonly cle: 'le'; readonly instant: string };

const JOURS_EN_CLAIR = 7;

/** Jours de calendrier, à Dakar, entre deux instants. */
function joursDeDakar(de: Date, a: Date): number {
  const jour = (d: Date) => {
    const s = jourADakar(d);
    return Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  };
  return Math.round((jour(a) - jour(de)) / 86_400_000);
}

/**
 * La ligne d'un lien actif : « Expire aujourd’hui à 18:00 », « Expire dans 2 jours » (une semaine au
 * plus), « Expire le 17 nov. » au-delà — les jours comptés au calendrier de Dakar.
 */
export function regleDExpiration(expiresAt: string | null, maintenant: Date = new Date()): RegleDExpiration {
  if (!expiresAt) return { cle: 'sansExpiration' };
  const jours = joursDeDakar(maintenant, new Date(expiresAt));
  if (jours <= 0) return { cle: 'aujourdhui', instant: expiresAt };
  if (jours <= JOURS_EN_CLAIR) return { cle: 'dans', jours };
  return { cle: 'le', instant: expiresAt };
}

/** « Valable jusqu’au … » porte l'heure quand le lien vit moins de deux jours (1 h, 24 h). */
export function expireBientotAvecLHeure(expiresAt: string | null, maintenant: Date = new Date()): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - maintenant.getTime() < 2 * 24 * HEURE_MS;
}

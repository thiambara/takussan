import { decouperLocale, estCheminLocalisable } from '@/i18n/routing';
import { destinationInterne } from '@/lib/redirection-interne';
import { estSlugDeBien } from '@/lib/slug-de-bien';

/**
 * Revenir là d'où l'on vient après la connexion — retour testeur du 2026-09-23 (TCK-568, M2).
 *
 * `/auth/login` sait déjà renvoyer vers `?redirect=` (les dialogues de visite et de réservation
 * d'une fiche l'emploient). Mais le lien « Connexion » de la navbar n'en portait aucun : se
 * connecter depuis une recherche menait TOUJOURS à `/app`, la recherche perdue. Ces deux fonctions
 * sont le contrat des deux bouts — qui fabrique le lien, et qui relit la destination.
 *
 * `destinationPublique` est lue par `RetourAuth` ; `hrefConnexion` par les deux liens « Connexion »
 * de `components/home/Navbar.tsx` (bureau et menu mobile).
 */

/** Le chemin sans sa requête ni son ancre : c'est lui que juge `estCheminLocalisable`. */
function cheminSeul(url: string): string {
  return url.split(/[?#]/)[0] ?? url;
}

/**
 * Une destination de `?redirect=` qui est une page du SITE PUBLIC, ou `null`.
 *
 * ⚠ Deux filtres, dans cet ordre. `destinationInterne` d'abord : un `redirect=` non filtré est une
 * redirection ouverte (`//evil.tld`). Puis la surface : `/app/…` est une destination de connexion
 * légitime, mais pas un endroit où « revenir » sans être connecté — le proxy y renverrait sur
 * `/auth/login`, c'est-à-dire ici.
 */
export function destinationPublique(brute: string | null | undefined): string | null {
  const interne = destinationInterne(brute, '');
  if (interne === '') return null;
  return estCheminLocalisable(cheminSeul(interne)) ? interne : null;
}

/**
 * Le lien « Connexion » posé sur une page du site : il emporte la page courante en `?redirect=`.
 *
 * `cheminCourant` est le chemin ET la requête (`/fr/properties?type=office`) — une recherche sans
 * ses filtres n'est plus la recherche qu'on quittait.
 *
 * Deux exceptions, où le lien reste nu et la connexion mène à `/app` comme avant :
 * · l'accueil — on s'y connecte pour aller à son espace, pas pour revoir l'accueil ;
 * · tout ce qui n'est pas le site public (`/auth/…`, la console) — rien à quoi revenir.
 */
export function hrefConnexion(cheminCourant: string): string {
  const chemin = cheminSeul(cheminCourant);
  if (!estCheminLocalisable(chemin) || decouperLocale(chemin).chemin === '/') return '/auth/login';
  return `/auth/login?redirect=${encodeURIComponent(cheminCourant)}`;
}

/**
 * TCK-2604 — CE QUE le visiteur était en train de faire quand on lui a demandé un compte : une liste
 * FERMÉE, posée par l'appelant en `?intention=`. L'écran de connexion la dit (« Votre réservation »)
 * au-dessus du bien quitté. Une valeur inconnue est ignorée ; aucun texte de l'URL n'est affiché.
 *
 * ⚠ `intention`, pas `action` : la fiche porte déjà `?action=reserver` DANS `redirect` (TCK-589).
 */
export const ACTIONS_D_ENTREE = ['reservation', 'visite', 'candidature', 'alerte', 'favori', 'publication', 'invitation'] as const;

export type ActionDEntree = (typeof ACTIONS_D_ENTREE)[number];

export function lireActionDEntree(brute: string | null | undefined): ActionDEntree | null {
  return ACTIONS_D_ENTREE.find((action) => action === brute) ?? null;
}

/**
 * Le lien de connexion d'un geste interrompu : la page à rouvrir (assainie à l'arrivée par
 * `destinationInterne`) et l'action, quand l'appelant en a une.
 */
export function hrefConnexionPour(retour: string, action?: ActionDEntree | null): string {
  return `/auth/login?redirect=${encodeURIComponent(retour)}${action ? `&intention=${action}` : ''}`;
}

/** `/[locale]/properties/<slug>` ou `/[locale]/bookings?property=<slug>` (le tunnel de réservation). */
const FICHE = /^\/properties\/([^/]+)\/?$/;

/**
 * Le slug du bien que `redirect` rouvrira, ou `null` : la fiche, ou le tunnel de réservation. La
 * valeur passe d'abord par `destinationInterne` ; le slug n'est rendu que s'il en a la FORME
 * (`FORME_DE_SLUG`) — c'est lui qui part ensuite dans le chemin d'un appel à l'API.
 */
export function slugDuBienQuitte(redirect: string | null | undefined): string | null {
  const interne = destinationInterne(redirect, '');
  if (interne === '') return null;
  const url = new URL(interne, 'http://interne.invalid');
  const { chemin } = decouperLocale(url.pathname);
  const fiche = FICHE.exec(chemin);
  let slug: string | null = null;
  if (fiche) {
    try {
      slug = decodeURIComponent(fiche[1] ?? '');
    } catch {
      return null;
    }
  } else if (chemin === '/bookings') {
    slug = url.searchParams.get('property');
  }
  return estSlugDeBien(slug) ? slug : null;
}

/** La date de début que porte `redirect` (`debut=AAAA-MM-JJ`), pour la dire à côté du prix. */
export function debutDuGesteQuitte(redirect: string | null | undefined): { debut: string; fin: string | null } | null {
  const interne = destinationInterne(redirect, '');
  if (interne === '') return null;
  const params = new URL(interne, 'http://interne.invalid').searchParams;
  const debut = params.get('debut');
  if (!debut || !estJourReel(debut)) return null;
  const fin = params.get('fin');
  return { debut, fin: fin && estJourReel(fin) && fin > debut ? fin : null };
}

/** Les années qu'une date du geste quitté peut porter : au-delà, un lien fabriqué, pas une réservation. */
const ANNEE_MIN = 2000;
const ANNEE_MAX = 2100;

/**
 * `AAAA-MM-JJ` ET un jour du calendrier (r3 de la contre-vérification de 861535de2) : la forme seule
 * laissait passer `2026-13-45` et `2026-99-99`, rendus « Invalid Date » à côté du prix. L'aller-retour
 * par `Date.UTC` refuse un mois ou un jour hors calendrier (le 30 février comme le 13ᵉ mois).
 */
export function estJourReel(valeur: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (!m) return false;
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (annee < ANNEE_MIN || annee > ANNEE_MAX) return false;
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  return date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour;
}

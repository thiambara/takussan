import { decouperLocale, estCheminLocalisable } from '@/i18n/routing';
import { destinationInterne } from '@/lib/redirection-interne';

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

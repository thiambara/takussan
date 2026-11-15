import { EDITEUR } from '@/content/legal/editeur';

/**
 * TCK-2505 / TCK-2514 — « Aide » et « Besoin d'aide ? » des pages par lien. Le site n'a aucune page
 * d'aide ni de numéro d'assistance (relevé du 2026-11-09 : ni route `/help`, ni `/contact`) ; le seul
 * canal déclaré est le courriel de contact de l'éditeur, celui des mentions légales.
 */
export const MAILTO_AIDE = `mailto:${EDITEUR.courriels.contact}`;

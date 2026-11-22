/**
 * Hauteurs des deux lanceurs de messagerie, et la place qu'une page doit leur laisser en bas.
 *
 * ⚠ Module SANS directive `'use client'`, et c'est voulu : une page serveur l'importe. Importée
 * depuis `ChatWidget.tsx` (client), la constante deviendrait une référence client — le piège
 * Next 16 décrit dans `takussan-web/CLAUDE.md` (§ « Modules de queries par domaine »).
 */

/** Lanceur de bureau (≥ md) : `h-14`. */
export const CHAT_LAUNCHER_DESKTOP_HEIGHT_PX = 56;

/** Bouton flottant mobile (< md) : `h-12`. */
export const CHAT_FAB_MOBILE_HEIGHT_PX = 48;

/**
 * TCK-644 — le rembourrage bas qu'une page de `/app` pose pour que son DERNIER élément puisse
 * défiler au-dessus du lanceur, au lieu de finir dessous.
 *
 * Le compte, en px, contre la coque de `/app` (`AppShell`, contenu en `py-6 md:py-8`) :
 *
 * | | lanceur (bas → haut) | coque + réserve | marge |
 * |---|---|---|---|
 * | < md | aucun sur `/app` (TCK-2481) | 24 + 0 | — |
 * | ≥ md | 24 + 56 = 80 | 32 + 64 = 96 | 16 |
 *
 * TCK-2481 (revue, M2) — sous `md`, le bouton flottant ne se rend plus sur `/app` : la barre
 * d'onglets porte « Messagerie », et c'est la coque qui réserve SA hauteur (le `<main>` rétrécit).
 * La réserve ne vaut donc que dès `md`, là où le lanceur de bureau est rendu ; `pb-14` laissait
 * 56 px vides sous « Mes biens ». ⚠ Une page HORS de `/app`, où le bouton flottant reste, ne peut
 * pas reprendre cette constante telle quelle.
 *
 * Éprouvé par `__tests__/reserve.test.ts`. Les classes sont écrites en toutes lettres pour que
 * Tailwind les émette (aucune classe calculée).
 *
 * Relevé du porteur, 2026-10-14 : sur « Mes biens » à 390 px, le bouton « Messagerie » recouvrait
 * la moitié de la dernière carte ; la coque ne réservait que ses 24 px de `py-6`.
 */
export const RESERVE_SOUS_LANCEUR = 'md:pb-16';

/**
 * L'identifiant du `<main>` que vise le lien d'évitement du site public et de l'espace
 * applicatif (TCK-905, P31.04). Chaque page qui monte la `Navbar` le pose sur son `<main>`, avec
 * `tabIndex={-1}` : `Navbar.lien-evitement.test.tsx` casse sur une page qui l'oublie.
 *
 * ⚠ Il vit hors de `LienEvitement.tsx` parce que ce module est `'use client'` : importée de là,
 * la constante serait une référence client dans les pages serveur, et non la chaîne.
 */
export const CONTENU_PRINCIPAL_ID = 'contenu-principal';

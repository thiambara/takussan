import type { Locale } from '@/i18n/config';

/**
 * TCK-562 (M9) — la langue dans laquelle une annonce a été RÉDIGÉE, faute de mieux : supposée.
 *
 * Le titre et la description d'un bien sont des textes de l'annonceur, pas de l'interface : ils ne
 * passent pas par next-intl et ne sont pas traduits (décision du porteur du 2026-09-23 : signaler
 * la langue, pas de traduction automatique — `docs/features.md` § 2.8 la garde en P3).
 *
 * ⚠ **Rien ne porte cette langue aujourd'hui, et c'est pourquoi elle est SUPPOSÉE.** `Property` n'a
 * ni colonne de langue ni traductions (`models-spec.md`), et la ressource publique n'en expose
 * aucune. Ce qui fonde `fr` — mesuré le 2026-09-23, pas déduit :
 *
 *  - la plateforme est francophone par défaut (`DEFAULT_LOCALE`, repli de toutes les locales) ;
 *  - sur `preview.api.takussan.com`, un bien sur trois des 243 publics (81 fiches), relevé par
 *    `GET /api/public/properties/{slug}` : **81 descriptions sur 81 sont en français** ;
 *  - les données de démonstration le sont toutes (`SenegalFakerProvider`).
 *
 * Le jour où l'API saura la langue d'une annonce — la saisir à l'écriture, depuis la locale de
 * l'auteur, est la suite naturelle —, c'est ICI qu'elle se branche, et nulle part ailleurs : la
 * mention et l'attribut `lang` en dépendent tous deux. Une supposition fausse ferait dire à la
 * mention qu'une description anglaise est « rédigée en français » : c'est le risque accepté.
 */
export const LANGUE_DE_SAISIE_DES_ANNONCES: Locale = 'fr';

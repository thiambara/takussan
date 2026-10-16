---
id: TCK-722
title: "Trois documents qui affirment l'inverse de la mesure, et un paragraphe i18n antérieur à ADR-0026"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models: []
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-6--texte-affiché-par-lapi-et-i18n-frenwo
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-9--pages-publiques--seo-et-partage
tags: [docs, i18n, front, pistes]
---

## Objectif utilisateur

Un agent ou un développeur qui ouvre `CLAUDE.md`, `takussan-web/CLAUDE.md` ou la page de recherche
lit l'état réel de l'i18n — ou la commande qui le donne — et non un compte démenti depuis des
semaines.

## Contexte

Réf : **P06.13** du fichier de pistes, `retenu · à valider` (V9 : deux des trois corrections sont
dans des `CLAUDE.md`, chemin fermé aux agents planifiés) ; le porteur l'a fait traiter en session,
hors agents, le 2026-10-16. Réf : **P09.08**, pour son seul reste documentaire : le paragraphe i18n
de `takussan-web/CLAUDE.md` décrivait encore un routage « sans segment `[locale]` dans l'URL »,
contredit par [ADR-0026](../../adr/0026-la-langue-est-un-segment-d-url-sur-la-surface-publique.md)
et par l'arborescence `takussan-web/src/app/[locale]/`.

## Contraintes strictes

- **Remplacer les chiffres par la commande qui les donne**, jamais par un chiffre plus récent : un
  compte recopié est faux dès le commit suivant (CLAUDE.md, « Le compte exact se prend à la source »).
- Le code que justifiait le commentaire de `PropertiesDiscoveryPage.tsx` ne change pas : seule
  l'affirmation fausse est corrigée.
- Le paragraphe i18n est corrigé, le reste de la section ne se réécrit pas.

## Delta à produire

- [x] `CLAUDE.md`, principe n° 5 : « Tenu à 82 fichiers sur 875 » remplacé par
      `cd takussan-web && node scripts/check-i18n.mjs --report`, avec la portée de son vert (il ne
      lit que `takussan-web/src` : ni les libellés français émis par l'API, P06.12, ni la justesse
      du wolof, D-24).
- [x] `takussan-web/CLAUDE.md`, garde i18n : « `wo` traîne 88 clés manquantes, sous cliquet
      décroissant » remplacé par le plafond réel (0 dans les deux langues, `PLAFONDS_PARITE`) et
      la commande du compte courant.
- [x] `takussan-web/CLAUDE.md`, premier paragraphe de « i18n » : le routage par segment `[locale]`
      d'ADR-0026 — `fr` préfixé comme les autres, surfaces non localisées par
      `SEGMENTS_NON_LOCALISES`, les deux préséances du §5, la redirection 307 de `src/proxy.ts`.
      Les références de lignes mortes de `request.ts` (`:44-99`, `:95-101` sur un fichier de 93
      lignes) deviennent des noms de fonctions.
- [x] `PropertiesDiscoveryPage.tsx`, commentaire du 422 : `lang/fr/validation.php` porte `boolean`
      depuis TCK-536 ; la raison qui tient encore est que la prose du serveur nomme le champ par
      sa clé technique.

## Critères d'acceptation

- [x] AC1 — `grep -n "82 fichiers sur 875" CLAUDE.md` ne rend rien, et le principe n° 5 cite
      `node scripts/check-i18n.mjs --report`.
- [x] AC2 — `grep -n "88 clés" takussan-web/CLAUDE.md` ne rend rien.
- [x] AC3 — `grep -n "sans segment" takussan-web/CLAUDE.md` ne rend rien, et la section i18n cite
      ADR-0026.
- [x] AC4 — `grep -n "ne porte pas la clé" takussan-web/src/components/property/PropertiesDiscoveryPage.tsx`
      ne rend rien ; le bloc de code `cleFautive` est inchangé.
- [x] AC5 — `node scripts/check-doc-links.mjs` vert (le lien vers ADR-0026 se résout).

## Hors périmètre

- `docs/ardoise.md`, D-24 : le paragraphe « Ce qui reste (TCK-292) » dit encore « 409 fichiers,
  3 542 occurrences […] plus 88 clés wolof manquantes », démenti par l'encadré daté au-dessus de lui
  et par la mesure. Signalé, non édité.
- P06.12 (libellés du catalogue super-admin écrits en français par l'API) : V7, différé par le
  porteur.
- La partie code de P09.08 : hors de ce ticket.

## Notes d'implémentation

Mesuré le 2026-10-16, sur l'arbre de `feat/pistes-hors-agents` :

- `cd takussan-web && node scripts/check-i18n.mjs --report` → « fr : 8015 clés feuilles » ;
  « en : 8015 clés · 0 manquante(s) / plafond 0 » ; « wo : 8015 clés · 0 manquante(s) / plafond 0 » ;
  « 99 EXCUSÉE(S) […] 55 exception(s) » ; « 0 TOLÉRÉE(S) — dette au cliquet, sur 0 fichier(s) ».
  Le « 82 fichiers sur 875 » et les « 88 clés » sont donc faux tous les deux ; l'ardoise (D-24)
  note déjà que le premier « mêlait les fichiers de test » dès le 2026-08-15, et que `wo` est à
  0 clé manquante depuis le 2026-08-20.
- `grep -n "'boolean'" takussan-api/lang/*/validation.php` → `fr/validation.php:38` et
  `wo/validation.php:38`. `git log -S"'boolean' =>"` sur ces fichiers → `4ca7a8a19` (TCK-536,
  2026-09-17) ; à `456212357` (TCK-335, 2026-08-21), qui a écrit le commentaire, la clé était bien
  absente : l'affirmation était juste le jour où elle a été écrite.
- `Validator::make(['furnished' => 'x'], ['furnished' => 'boolean'])` sous `fr` puis `wo`
  (tinker) → « Le champ furnished doit être vrai ou faux. » et « Barabu furnished bi war na doon
  dëgg walla dëgguwul. » : traduit, mais `furnished` n'est pas dans `attributes` de
  `lang/fr/validation.php` (0 occurrence après la ligne 199). La règle « jamais la prose du
  serveur » reste donc justifiée, par une autre raison.
- `ls takussan-web/src/app/[locale]/` → `(public)` ; `src/i18n/request.ts` fait 93 lignes,
  `resolveLocale` lit le segment d'abord ; `src/proxy.ts:162` pose `Vary: Cookie, Accept-Language`.

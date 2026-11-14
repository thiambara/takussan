---
id: TCK-2833
title: "Le titre proposé d'une annonce se compose dans la langue de l'interface, sans « de », « à » ni « chambre » en dur"
status: todo
phase: P2
family: front
estimate: S
wave: null
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#28-internationalisation--préférences"
  models: []
  tickets:
    - docs/backlog/tickets/done/TCK-631-publication-plein-ecran-et-apercu.md
tags: [front, i18n, publication, titre, suivi-lot-3]
---

## Objectif utilisateur

Qui publie un bien avec l'interface en anglais se voit proposer un titre entièrement en anglais
(« Apartment … in Bel Air ») et non un mélange (« Apartment de 60 m² à Bel Air »).

## Contexte (relevé au HEAD 196e7908f, 2026-11-14)

Relevé sur `/publish` en `en` : le titre proposé à l'étape de finition vaut « Apartment de 60 m² à Bel … ».

Le titre se compose **dans le front**, pas dans l'API : `suggestTitle()`
(`takussan-web/src/components/property-form/wizard/suggest-title.ts`, TCK-464), appelé par
`StepFinition.tsx` et `ApercuAnnonce.tsx`. Seul le type passe par le dictionnaire (`tType`). Trois
segments sont en français dans le code : `de ${area} m²`, `${n} chambre(s)` et `à ${lieu}`. Le
commentaire du module l'assume comme une entorse au principe n° 5 (le front possède le texte), au
motif que la publication « n'est aujourd'hui servie qu'en français ». Le relevé en `en` montre que ce
motif ne tient plus.

Le patron existe déjà : `src/lib/titre-de-la-liste.ts` compose ses titres par gabarits du dictionnaire,
pour que chaque langue décide de l'ordre et de la préposition.

## Contrat de données

Aucun endpoint. Le titre reste une valeur par défaut que l'utilisateur corrige. Les entrées de
`suggestTitle` ne changent pas (type, contrat, surface, chambres, quartier, ville).

## Contraintes strictes (métier)

- Le titre français ne change pas, au caractère près, pour toutes les combinaisons déjà couvertes par
  `suggest-title.test.ts`.
- Chaque langue décide de l'ordre des segments, de la préposition et de l'accord singulier/pluriel
  des chambres (gabarit ICU, pas de concaténation de mots traduits).
- Wolof en pause : les clés neuves portent en `wo` le texte français tel quel.
- Un titre déjà saisi ou modifié par l'utilisateur n'est jamais réécrit (comportement actuel inchangé).

## Delta à produire

- [x] `suggestTitle` compose tout le titre par le dictionnaire (fr, en, wo), plus seulement le type.
- [x] Les deux appelants (`StepFinition`, `ApercuAnnonce`) passent ce qu'il faut au module.
- [x] Le commentaire « entorse assumée » disparaît avec l'entorse.
- [x] Tests : `suggest-title.test.ts` étendu à `en`.

## Critères d'acceptation

- [x] AC1 — En `en`, pour un appartement de 60 m² sans chambres à Bel Air, le titre proposé contient
      le libellé anglais du type, « 60 m² » et « Bel Air », et ne contient ni « de », ni « à », ni
      « chambre » comme mot. Test qui échoue au HEAD (ablation : remettre le segment en dur le rend
      rouge).
      *Preuve : `suggest-title.test.ts` « AC1 » → « 60 m² apartment in Bel Air », rouge au HEAD
      (« Apartment de 60 m² à Bel Air ») ; ablations « à » en dur (3 rouges) et « de » en dur
      (2 rouges), fichier restauré, md5 vérifié.*
- [x] AC2 — En `en`, avec 1 puis 3 chambres, le titre porte le nombre de chambres au singulier puis
      au pluriel **anglais**, et le lieu. Test.
      *Preuve : « 1-bedroom villa in Ngor » / « 3-bedroom villa in Ngor ».*
- [x] AC3 — En `fr`, aucune chaîne attendue de `suggest-title.test.ts` ne change ; les appels
      existants gagnent le traducteur bâti sur le vrai `fr.json` (réécrit avec team-lead le
      2026-11-14 : « ajouts seulement » aurait exigé de garder le français en dur).
      *Preuve : les 6 tests d'origine verts, leurs `.toBe(…)` intacts ; ablation — la clé
      `suggestedTitle.place` retirée de `fr.json` fait rougir 9 tests sur 13 (fichier restauré,
      md5 vérifié). Ajouts : mêmes titres par le vrai dictionnaire, 1500 m² et 60.5 m² inchangés.*
- [x] AC4 — Au navigateur, `/publish` en `en` (390 et 1280) : le titre proposé à l'étape de
      finition et celui de l'aperçu sont entièrement en anglais. Relevé consigné.
      *Relevé du 2026-11-14, Chrome sans tête piloté par CDP, `NEXT_LOCALE=en`, sans compte (le
      brouillon reste dans le navigateur : rien d'écrit en base) — vente, appartement, Dakar /
      Bel Air, 60 m², sans chambres. À 1280 comme à 390 : champ titre de la finition =
      « 60 m² apartment in Bel Air », carte de l'aperçu = « 60 m² apartment in Bel Air », aucun
      mot « de », « à », « chambre ».*
- [x] AC5 — `node scripts/check-i18n.mjs` (dans `takussan-web`) reste vert : clés présentes dans
      les trois dictionnaires.
      *Preuve : aucun écart hors des maquettes locales non suivies (`playground/maquettes`, 105
      écarts qui ne sont pas versionnés) ; `check-i18n-namespaces` vert, garde des pluriels
      (`src/i18n/__tests__/pluriels.test.ts`) verte.*

## Hors périmètre

- Les autres textes de l'API encore en français (P06.12).
- La justesse du wolof (dette D-24, wolof en pause).
- Le titre des listes publiques (`titre-de-la-liste.ts`), déjà traduit.

## Notes d'implémentation

- Gabarits sous `property.wizard.suggestedTitle` (`surface`, `bedrooms`, `place`) : les deux
  appelants tiennent déjà `useTranslations('property.wizard')`, et `property` est servi sur
  `/publish` — `namespaces.json` inchangé.
- La surface passe en chaîne (`{area}`) : le titre français reste « 1500 m² », pas « 1 500 m² ».
  En français, les chambres passent par `#` (la garde des pluriels refuse `{count} chambre`) :
  formaté selon la langue, sans effet sous 1000. En anglais, `{count}-bedroom` est invariable.
- Anglais (demandé par team-lead le 2026-11-14) : « 60 m² apartment in Bel Air », « 3-bedroom
  villa in Ngor », « 500 m² plot ». Le nom au milieu de la phrase n'est pas le libellé de
  `property.types` (« Apartment ») : il vient de `suggestedTitle.noun.*` (minuscule en anglais ;
  `land` → « plot », `shop` → « retail unit », `other` → « property »). Le français et le wolof
  n'emploient que `{type}`, lié à `property.types` ; leur `noun` n'existe que pour la parité des
  clés. Un test vérifie que chaque type a son nom dans les trois langues (ablation : `farm` retiré
  de `en.json` → rouge). Le wolof porte le français.
- `StepFinition` : le traducteur entre dans les dépendances de l'effet ; la garde « titre vide
  seulement » est inchangée.

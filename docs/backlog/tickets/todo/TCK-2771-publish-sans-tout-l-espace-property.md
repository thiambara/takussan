---
id: TCK-2771
title: "/publish ne reçoit plus tout l'espace `property` : l'assistant n'en lit qu'un tiers"
status: todo
phase: P1
family: front
estimate: M
wave: 86
created: 2026-11-13
updated: 2026-11-13
depends_on: [TCK-2600]
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models: []
tags: [front, publish, i18n, performance, audit-ux]
---

## Objectif utilisateur

Le visiteur sans compte qui ouvre `/publish`, souvent au téléphone et sur un réseau mobile, ne
télécharge que les libellés de l'assistant de publication, pas ceux du tableau de bord, de la fiche
de bien, des avis ou des réservations.

## Contexte mesuré (2026-11-13, arbre de TCK-2600)

**Décision.** Porteur, 2026-11-13, liste du soir n° 31 : ticket de suivi (découper l'espace de traductions `property`).

- Depuis TCK-2600, `/publish` monte l'assistant entier (`AssistantDePublication`). La frontière
  `publish` de `src/i18n/namespaces.json` sert alors 7 espaces : `auth media nav owners profile
  property publishRedirect`, soit **20,1 % du dictionnaire** (41 941 o gzip). Le cliquet était à
  13 % ; TCK-2600 le relève à 21 % et le dit dans son message de commit (décision de la session
  principale du 2026-11-13).
- `property` pèse à lui seul **16 377 o gzip** (32 sous-clés). L'assistant et ses voisins
  (`components/property-form`, `publication`, `contact`, `media`) lisent `property.wizard`,
  `property.form`, `property.contacts`, `property.types`, `property.cards`, `property.moderation` et
  les énumérations de `PROPERTY_ENUM_NAMESPACES`.
- Ils ne lisent pas `property.dashboard` (6 048 o), `detail` (1 868), `visitDialog` (1 202),
  `reservation` (868), `reviews` (624), `report`, `retired`, `availabilityCheck`, `reviewReport`,
  `portfolio`, etc. À re-mesurer par le dérivateur, pas par ce relevé à la main.
- La garde (`scripts/check-i18n-namespaces.mjs`) raisonne par espace de premier niveau. Un
  sous-espace atteint fait servir l'espace entier.

## Delta à produire

- Choisir et écrire la voie, en ADR si elle touche au dérivateur. Deux voies :
  - (a) Scinder `property` en espaces de premier niveau (par exemple `propertyWizard`,
    `propertyForm`, ou les énumérations à part) dans les trois langues. Les appelants changent, la
    garde reste telle quelle.
  - (b) Rendre le dérivateur et `messagesPour` capables de servir un sous-arbre (`property.wizard`).
    La garde change, les appelants non.
- Ramener le cliquet de `publish` au plus près de la mesure après le découpage (`--update`, dit dans
  le message de commit).

## Critères d'acceptation

- [ ] AC1 — `node scripts/check-i18n-namespaces.mjs --report` : la frontière `publish` ne sert plus
  `property.dashboard`, `property.detail` ni `property.reviews`, et sa part du dictionnaire baisse
  d'au moins 5 points par rapport aux 20,1 % du 2026-11-13.
- [ ] AC2 — Aucun libellé de l'assistant ne s'affiche en chemin de clé brut : `/publish` (sans
  compte) et `/app/properties/new` (connecté) parcourus jusqu'à « Publier l'annonce » au navigateur,
  en `fr` et en `en`. Le relevé du DOM ne trouve aucune chaîne `property.` ni aucun nouveau nom
  d'espace.
- [ ] AC3 — `npm run check:i18n` (parité) et `npm run check:i18n-namespaces` sont verts, et les
  tests de l'assistant passent sans changement de leurs attentes de libellés.

## Hors périmètre

- Le contenu des libellés et le wolof (en pause).
- Les autres frontières, même si la voie (b) leur profiterait.

---
id: TCK-1035
title: "Coques connectées : état du menu, repère en double et noms de boutons contextualisés"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#23-notifications"
    - "docs/features.md#29-administration--configuration"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-68--passage-axe-au-navigateur-des-écrans-connectés-app-console-super-admin"
tags: [web, a11y, aria, i18n, pistes]
---

## Contexte

Réf : **P68.08** du fichier de pistes, `validé (délégué)` (critère V7 accordé). Relevés par axe
dans les coques `/app` et `/super-admin` : le bouton « Ouvrir le menu » de la barre mobile n'a pas
d'`aria-expanded` ; le `<header>` du centre de notifications, rendu en portail, fait un second
repère `banner` ; 20 boutons « Plus d'actions » sur `/app/properties` et 20 « Impersonifier » sur
`/super-admin/users` portent le même nom, sans la ligne visée.

## Décision du porteur (déléguée)

> `aria-expanded={sidebarOpen}` sur le bouton « Ouvrir le menu » d'`AppTopbar` ; `<div>` au lieu de `<header>` dans le popover de `NotificationBell` ; noms accessibles contextualisés « Plus d'actions — {titre} » sur `/app/properties` (clé interpolée neuve en fr/en, en wo le texte français tel quel) et « Impersonifier {name} » sur `/super-admin/users` par la clé existante `impersonateTitle`, le texte visible inchangé ; reste : la place du lien d'évitement dans les coques, les noms des `aside` de `/app/messages` et des sections de webhook avec l'ordre des titres d'`/app/agency/integrations`, la taille des liens `tel:`/`mailto:` de `/app/customers` et le défilement du kanban, au porteur

## Reste à faire

> la place du lien d'évitement dans les coques, les noms des `aside` de `/app/messages` et des sections de webhook avec l'ordre des titres d'`/app/agency/integrations`, la taille des liens `tel:`/`mailto:` de `/app/customers` et le défilement du kanban, au porteur

## Objectif

Ces quatre défauts disparaissent sans texte visible neuf.

## Delta à produire

- [ ] `AppTopbar` reçoit `menuOpen` (passé par `AppShell` depuis `sidebarOpen`) et le rend en
      `aria-expanded` sur le bouton du menu.
- [ ] `NotificationBell` : `<div>` au lieu de `<header>` en tête du panneau.
- [ ] `PropertyRowActions` : `aria-label` par la clé neuve `property.dashboard.actions.moreFor`
      (« Plus d'actions — {title} », « More actions — {title} », en `wo` le texte français tel
      quel). L'en-tête de fiche (`PropertyHeaderActions`), seul de sa page, garde « Plus d'actions ».
- [ ] `/super-admin/users` : `aria-label` du bouton par `superAdmin.pages.users.impersonateTitle`,
      avec le nom affiché du compte (`getUserDisplayName`, déjà employé par la boîte de
      confirmation).
- [ ] Tests : `AppShell.menu-et-credits.test.tsx`, `NotificationBell.test.tsx`,
      `PropertyRowActions.nom-contextuel.test.tsx`, `super-admin/users/__tests__/page.test.tsx` ;
      les tests qui cherchaient « Plus d'actions » par nom exact acceptent les deux noms.

## Critères d'acceptation

- [ ] AC1 — `aria-expanded` du bouton « Ouvrir le menu » vaut `false` tiroir fermé, `true` ouvert.
- [ ] AC2 — Le panneau de notifications ouvert ne contient aucun repère `banner`.
- [ ] AC3 — Chaque bouton de menu d'une ligne de `/app/properties` se nomme « Plus d'actions —
      <titre du bien> » (fr) / « More actions — <titre> » (en).
- [ ] AC4 — Chaque bouton d'impersonation se nomme « Impersonifier <nom> », son texte visible
      restant « Impersonifier ».
- [ ] AC5 — `check:i18n` vert : la clé neuve existe dans les trois langues.

## Hypothèses (mode sans humain)

- La décision vise la ligne de liste (`PropertyRowActions`), monté par `PropertyList` en ligne et
  en carte ; l'en-tête de fiche n'a qu'un bouton par page et n'est pas cité.
- Le nom de l'impersonation reprend celui que la boîte de confirmation affiche déjà
  (`getUserDisplayName` : nom complet, sinon courriel, sinon téléphone).

## Hors périmètre

- Le reste ci-dessus, au porteur.

## Notes d'implémentation

_(à remplir par implementing-specs)_

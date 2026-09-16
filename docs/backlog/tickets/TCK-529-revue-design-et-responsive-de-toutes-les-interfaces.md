---
id: TCK-529
title: "Revue design et responsive de toutes les interfaces web — 126 écrans passés au crible par huit groupes, défauts corrigés"
status: done
phase: P1
family: front
estimate: L
wave: 65
created: 2026-09-16
updated: 2026-09-16
depends_on: [TCK-505]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#15-transactions--paiements
    - docs/features.md#16-crm--relation-client
    - docs/features.md#17-communication--messagerie
    - docs/features.md#21-authentification--comptes
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#29-administration--configuration
tags: [front, design, responsive, a11y, revue]
---

## Objectif utilisateur

Que chaque écran du front — site public, authentification, onboarding, `/app`, `/admin`,
`/super-admin` — tienne la charte « Ancrage Local Contemporain », se lise et se manipule de 360 à
1366 px, sans défaut de finition visible.

## Contexte

Campagne du 2026-09-16, huit groupes en parallèle sur un arbre partagé, chacun appliquant les
grilles **impeccable** (audit, polish, adapt — mode Operate pour les consoles, Persuade/Read pour le
public) et **make-interfaces-feel-better** (19 principes), avec relevé CDP à 360, 390, 768, 1024 et
1366 px avant et après correction. Rapports par groupe : `docs/qa/revue-design-2026-09-16/`
(`a-socle`, `b-public`, `c-auth-onboarding`, `d-app-catalogue`, `e-app-relations`,
`f-app-engagements`, `g-admin`, `h-super-admin`).

## Contrat de données

Deux correctifs d'API, trouvés par la revue parce qu'ils rendaient des écrans faux :

- `HasQueryBuilder::getPerPage()` — `per_page` de la requête honoré (borné à 100) par tout
  `->paginate()` nu. Vingt-deux contrôleurs l'ignoraient : kanban plafonné à 15 cartes par
  colonne, sélecteurs de densité sans effet.
- `Customer::$requestSortable` + `updated_at` — le kanban du pipeline demandait
  `sort=-updated_at` et recevait 400 : colonnes vides.

## Ce qui a été corrigé (au-delà de l'affinage)

- `/app/customers` tombait en frontière d'erreur (`'use client'` manquant) ; messagerie
  inutilisable au bureau ; `window.prompt` dans les visites ; panneau de notifications hors écran
  sur mobile ; surbrillance de menu invisible ; détail de document, carnet de prestataires et
  préférences de notifications en erreur ; pagination de maintenance qui cachait des lignes.
- `/app/<url inconnue>` éjectait vers le 404 public : attrape-tout
  `(dashboard)/app/[...introuvable]` (le `notFound()` vit dans le layout, cf. TCK-442).
- `animation-fill-mode: both` → `backwards` sur les entrées (`fadeInUp`, `cardEnter`,
  `sectionEnter`) : la transformation finale conservée faisait de l'élément animé le bloc
  conteneur de ses descendants `position: fixed` (barres collantes décrochées).
- Primitives : planchers tactiles sous `sm` (bouton, select, input), plus de `transition-all`,
  hauteur par défaut du select surchargeable par l'appelant.
- Tunnel de réservation, bandeau d'annonces, assistants d'onboarding, `NotificationBell` sortis
  de la palette brute ; gardes resserrées en conséquence (`check-super-admin-tokens` /app 25 → 18,
  onboarding 24 → 0 ; `check-locale-figee` 48 → 28 ; `check-public-chrome-tokens` couvre
  désormais `components/bookings` et la famille `stone`).

- Lint : les 33 avertissements existants sont soldés — convention `_` déclarée dans
  `eslint.config.mjs` (14), imports morts, `useCallback` manuels retirés (React Compiler,
  ADR-0015), `watch()` → `useWatch` (le compilateur renonçait à deux composants), trois `<img>`
  justifiés sur place.
- Relecture adverse (trois vérificateurs) : focus du tiroir de filtres, planchers tactiles qui
  rabotaient un `min-h-*` d'appelant (passés en `@layer components`), survol du bouton plein
  illisible sous `.dark`, grilles de `FilterBar`, seuil d'alerte décimal refusé à l'Entrée,
  « Dévérifier » retiré à tort — corrigés, chacun avec son test quand il était testable.

## Critères d'acceptation

- [x] AC1 — Chaque page du périmètre relevée aux cinq largeurs avant et après, sans débordement du
      document (`max(scrollWidth − innerWidth, innerWidth − W)` = 0), hors `/playground` (POC).
- [x] AC2 — Toutes les gardes du dépôt, `check:i18n`, `lint` (0 problème), `tsc`, et les deux
      suites entières vertes sur l'arbre fusionné.
- [x] AC3 — Les tests neufs des correctifs d'API rougissent sans leur correctif (ablation).

## Suites ouvertes

- [TCK-528](TCK-528-creation-facture-et-reversement-sans-capacite.md) — création de facture et de
  reversement sans capacité jugée.
- [TCK-530](TCK-530-total-de-reservation-ignore-la-periode-de-loyer.md) — total de réservation
  `prix × nuits` quelle que soit la période du loyer.
- [TCK-531](TCK-531-consentements-vers-des-pages-legales-absentes.md) — consentements vers des
  pages légales en 404.
- [TCK-532](TCK-532-etiquettes-du-graphique-en-barres-illisibles.md) — étiquettes de `BarChart`
  sous 9 px.

## Notes d'implémentation

Branche `feat/revue-design-toutes-interfaces`. Détail page par page, collisions et écartés dans
les huit rapports de `docs/qa/revue-design-2026-09-16/`.

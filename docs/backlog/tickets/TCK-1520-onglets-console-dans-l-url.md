---
id: TCK-1520
title: "Les onglets du reporting et du détail d'agence de la console sont tenus dans `?tab=`"
status: done
phase: P2
family: applicatif
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-168--onglets-filtres-et-pagination-des-listes-tenus-en-état-local-plutôt-que-dans-lurl"
tags: [front, console, super-admin, pistes]
---

## Contexte

Réf : **P168.05** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

## Décision du porteur (déléguée)

validé (délégué) — `ReportingShell` écrit le changement d'onglet dans `?tab=` par `router.replace`, borné à ses quatre valeurs ; le détail d'agence de la console lit et écrit `?tab=` borné à `kyc`, `subscription`, `team`, `properties`, `transactions`, défaut `kyc` absent de l'URL ; le lien « agence » du profil utilisateur mène à `?tab=team` ; tests : chaque écran monté sur `?tab=` rend l'onglet, et le changement appelle `replace` ; reste : `?tab=` du portefeuille d'un profil public, qui suit l'issue de P168.02

## Reste à faire

`?tab=` du portefeuille d'un profil public, qui suit l'issue de P168.02

## Delta à produire

- [x] `ReportingShell` : le changement d'onglet (borné aux quatre valeurs) s'écrit dans `?tab=`
  par `router.replace`, `growth` (défaut) hors de l'URL, les autres paramètres gardés. La lecture
  reste celle de TCK-595 (`initialTab` de la page serveur).
- [x] `AgencyDetailPage` : l'onglet se lit de `?tab=` (`AGENCY_DETAIL_TABS`, valeur inconnue → `kyc`)
  et s'écrit par `router.replace`, `kyc` hors de l'URL.
- [x] `UserProfilesSection` : le lien « agence » mène à `/super-admin/agencies/{id}?tab=team`.
- [x] Tests : `ReportingShell.test.tsx` (cas `replace`), `agency-detail.onglet-url.test.tsx`.

## Critères d'acceptation

- [x] AC1 — reporting : clic sur « cohortes » → `replace('?tab=cohorts&…')` ; retour à la
  croissance → `?tab=` retiré.
- [x] AC2 — détail d'agence monté sur `?tab=team` → onglet Équipe sélectionné et rendu ; valeur
  inconnue → KYC.
- [x] AC3 — changement d'onglet du détail → `replace('?tab=subscription')`, KYC → `replace('?')`.
- [x] AC4 — le lien du profil utilisateur porte `?tab=team`.

## Hors périmètre

- Le portefeuille d'un profil public (reste ci-dessus, P168.02).

## Notes d'implémentation

- Choix : sur le détail d'agence, l'URL est la seule source de l'onglet (patron
  `AdminFinancesTabs`) ; sur le reporting, l'état local est gardé (la page serveur lit déjà
  `?tab=`) et l'URL est écrite à chaque changement — voie la plus étroite.
- Ablation : lecture de `?tab=` neutralisée, `replace` retiré, lien sans `?tab=team` → 4 rouges ;
  correctif remis → 22/22 verts sur les classes touchées.

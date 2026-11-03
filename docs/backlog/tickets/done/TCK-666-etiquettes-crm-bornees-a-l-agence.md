---
id: TCK-666
title: "Étiquettes : une étiquette CRM ne se lit que depuis l'agence du personnel qui l'emploie"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#16-crm--relation-client
  models:
    - docs/models-spec.md#10-tag
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-3--isolation-entre-agences-et-autorisation
tags: [back, tags, crm, isolation, pistes]
---

## Objectif utilisateur

Une agence ne lit pas les étiquettes qu'une autre agence pose sur ses clients (« Mauvais payeur »,
« VIP »…), et un compte qui n'est pas du personnel d'une agence n'en lit aucune.

## Décision du porteur

validé — type crm exclu hors de l'agence du personnel, en index et en show

## Contrat de données

Réf : **P03.03** du fichier de pistes. Aucun endpoint neuf, aucune migration.

- `GET /api/tags` et `GET /api/tags/{tag}` (`auth:sanctum` seul).
- Le périmètre vit dans un scope du modèle, `Tag::sansCrmHorsDeSonAgence(?User)`, que la liste et
  la fiche emploient tous deux.

## Contraintes strictes (métier)

- Une étiquette de type `crm` est lisible par un appelant si et seulement si un client de l'agence
  dont il est **personnel** (`User::staffAgencyId()`, TCK-587) la porte. Un bailleur n'est pas du
  personnel, même si `agency_id` est le sien.
- La console (super-admin) lit toutes les étiquettes, comme avant.
- Les autres types (`amenity`, `feature`) ne changent pas ; la visibilité par statut de TCK-633 reste
  appliquée en plus.
- La fiche d'une étiquette hors périmètre rend **404**, comme une proposition d'un autre (TCK-633).

## Delta à produire

- [x] `Tag::scopeSansCrmHorsDeSonAgence()`.
- [x] `TagController::index()` : le scope remplace le bloc qui ne bornait qu'avec `filter[type]=crm`
      et `agency_id` non nul.
- [x] `TagController::show()` : même scope, même 404.
- [x] `tests/Feature/Tags/TagCrmAgencyScopeTest.php` : deux agences, quatre appelants.

## Critères d'acceptation

- [x] AC1 — un agent de A lit l'étiquette CRM d'un client de A, en liste (avec ou sans
      `filter[type]=crm`) et en fiche ; celle d'un client de B est absente de la liste et rend 404.
- [x] AC2 — un compte sans agence ne lit aucune étiquette CRM, et lit toujours un équipement.
- [x] AC3 — un bailleur de A ne lit pas l'étiquette CRM d'un client de A.
- [x] AC4 — la console lit les étiquettes CRM des deux agences.

## Hors périmètre

- Le recomptage de `TagController` (`usage_count`, `properties_count`) et le tri des suggestions CRM :
  piste P02.05.
- `usage_count` se calcule toujours sur `agency_id` (bailleur compris) ; il ne compte plus que des
  étiquettes que l'appelant a le droit de lire.
- L'angle mort de `scripts/check-agency-scope-clause.mjs` sur les variables intermédiaires, cité par
  la piste : le site qui le montrait est retiré, la garde n'est pas modifiée.

## Notes d'implémentation

- Hypothèses (mode sans humain) :
  - « l'agence du personnel » se lit par `staffAgencyId()` (agence du profil actif, agent ou admin
    actif, délégation comprise), et non par toutes les agences où l'appelant est personnel : c'est
    le prédicat qu'emploient les autres périmètres (`Customer`, `MaintenanceRequest`).
  - Une étiquette CRM qu'aucun client ne porte plus n'est lisible que par la console.
- Ablation, chaque morceau retiré seul puis remis :
  - contrôleur d'origine → 3 rouges sur 4 (l'étiquette de B listée par l'agent, par le compte sans
    agence et par le bailleur) ;
  - garde de `show()` seule retirée → les mêmes 3 rouges, sur la fiche ;
  - `staffAgencyId()` remplacé par `agency_id` dans le scope → AC3 rouge (le bailleur relit
    l'étiquette de son agence) ;
  - correctif remis → 4 verts, 19 assertions.

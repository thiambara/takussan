---
id: TCK-2362
title: "Le rappel de reversement, la modification d'une intervention et celle de l'agence écrivent leur colonne JSON sur la ligne relue sous verrou"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-245--colonnes-json-recomposées-depuis-le-modèle-chargé-puis-réécrites-en-entier"
tags: [back, paiements, maintenance, agence, concurrence, pistes]
---

## Objectif utilisateur

Ce qu'un autre geste écrit dans une colonne JSON pendant une écriture n'est pas effacé par elle :
la trace du décaissement d'un reversement payé, l'escalade d'une intervention urgente, le réglage
d'agence d'un autre administrateur. Et un reversement soldé n'est pas rappelé comme échu.

## Contexte

Trois pistes de l'angle 245, toutes `retenu · autonome` (A1), de même cause : la colonne est
recomposée depuis le modèle chargé (en lot ou lié à la route), puis réécrite en entier, sans
relecture sous verrou.

- Réf : **P245.01** — `payouts:remind-due` réécrivait `metadata` depuis le modèle chargé en lot.
  Avant (mesuré par le mesureur, db3e25230, et rejoué ici par le test de garde) : reversement
  passé à `completed` avec sa trace du décaissement après la lecture du lot → `metadata =
  {due_reminded_at, approved_net_amount}`, et un rappel envoyé. Précédent : P229.04 (TCK-2227).
- Réf : **P245.03** — `MaintenanceRequestController::update` recomposait `metadata` sur la copie
  liée à la route. Avant : `escalated_at` écrit après la liaison, `PATCH {actual_cost: 1000}` du
  bailleur → `escalated_at` effacé. Contrat écrit par TCK-2225.
- Réf : **P245.04** — `AgencyController::update` fusionnait `settings` sur l'agence liée à la
  route. Avant : réglage `watermark_enabled` écrit après la liaison, `PATCH {settings:
  {late_fee_online_collection: true}}` → `watermark_enabled` effacé. Contrat écrit par TCK-593
  (`AgencySettingsMergeTest`). Seule la moitié `settings` tient : la seconde (passage en agence
  standard face au slug) est caduque d'après la mesure du mesureur, les deux écritures ne pouvant
  pas se croiser.

## Hypothèses (mode sans humain)

- P245.01 : la réclamation relit la ligne sous `lockForUpdate` avec la sélection entière de la
  commande (statut, échéance, émetteur, marqueur absent), et non la seule mise à jour
  conditionnelle par `jsonb_set` : même effet, et le marqueur reste écrit par `saveQuietly()` comme
  avant. Un reversement reprogrammé dans le futur pendant le passage n'est plus rappelé.
- P245.03 : la garde de l'état terminal reste jugée sur la copie liée à la route, comme avant ;
  seules les écritures passent à la ligne relue (`assign()` rejuge déjà l'état terminal sur la ligne
  qu'on lui donne, désormais la ligne relue).
- P245.04 : la marque du slug (`metadata.slug_changed_at`) s'écrit elle aussi sur la ligne relue,
  puisqu'elle passe par le même `fill()->save()`. Le changement de seuil de reversement garde sa
  propre transaction, jugée avant.

## Delta à produire

- [x] `RemindDuePayouts` : sélection rejugée sous verrou, marqueur fusionné sur la ligne relue,
  aucun envoi si la ligne n'est plus à rappeler.
- [x] `MaintenanceRequestController::update` : `lockFresh()` au début de la transaction, toutes les
  écritures sur la ligne relue.
- [x] `AgencyController::update` : fusion de `settings` et écriture dans une transaction, sur la
  ligne relue sous verrou.
- [x] Tests : `tests/Feature/Console/RappelDeReversementFaceAuGesteConcurrentTest.php`,
  `tests/Feature/Maintenance/ModificationFaceAEscaladeConcurrenteTest.php`, une méthode de plus
  dans `tests/Feature/Api/Agency/AgencySettingsMergeTest.php`.

## Critères d'acceptation

- [x] AC1 (P245.01) — Reversement payé après la lecture de la commande → trace du décaissement
  intacte, aucun rappel.
- [x] AC2 (P245.01) — Reversement reprogrammé dans le futur après la lecture → aucun rappel, aucun
  marqueur.
- [x] AC3 (P245.01) — `metadata` écrite entre-temps sur un reversement encore échu → rappel envoyé,
  clé écrite entre-temps conservée, marqueur posé.
- [x] AC4 (P245.03) — Escalade posée après la liaison de la route, coût réel saisi par le bailleur
  → `escalated_at` conservé, accord du bailleur tracé.
- [x] AC5 (P245.03) — Même escalade, réassignation → devis de l'ancien archivé, `escalated_at`
  conservé.
- [x] AC6 (P245.03) — Passage en urgence → `urgent_since` posé sur la `metadata` relue, la clé
  écrite entre-temps conservée.
- [x] AC7 (P245.04) — Réglage d'un autre administrateur écrit après la liaison de la route → il
  survit au `PATCH` de `settings`.

## Notes d'implémentation

- **Ablation** (chaque fichier de code remis à sa version d'avant, puis le correctif remis) :
  P245.01 → 3 rouges sur 3, puis 3 verts ; P245.03 → 3 rouges sur 3, puis 3 verts ; P245.04 → le
  test neuf rouge (`watermark_enabled` nul), les 5 autres de la classe verts, puis 6 verts.
- `jsonb` ne garde pas l'ordre des clés : la comparaison de la trace du décaissement se fait par
  `assertEquals`, pas `assertSame`.
- L'écouteur `retrieved` ne joue qu'une fois : à la liaison de la route (ou à la lecture du lot) ;
  la relecture sous verrou du correctif ne le rejoue pas.

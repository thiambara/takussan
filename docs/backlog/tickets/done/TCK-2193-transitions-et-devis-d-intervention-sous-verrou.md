---
id: TCK-2193
title: "Les transitions et le devis d'une intervention se jugent sur la ligne relue sous verrou"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-211--gestes-décriture-qui-jugent-le-statut-sur-le-modèle-lié-hors-verrou"
tags: [back, maintenance, devis, concurrence, pistes]
---

## Objectif utilisateur

Le demandeur qui conteste la fin des travaux n'est plus écrasé par la clôture automatique qui
passe au même moment, et deux personnes qui tranchent un devis ensemble ne laissent plus un devis
approuvé portant le motif d'un rejet.

## Contexte

Réfs : **P211.03** et **P211.04** du fichier de pistes, `validé`.

Décision du porteur (P211.03) : validation du porteur (2026-10-24) : le patron d'`accept` (relecture `lockForUpdate` en transaction, table jugée sur la ligne fraîche, événement après le commit) dans `transition`, `contestResolution` et `complete` ; `maintenance:auto-close` saute une ligne refusée, la compte et la journalise ; même ticket que P211.04

Décision du porteur (P211.04) : validation du porteur (2026-10-24) : relecture sous verrou en transaction pour les quatre gestes du devis ; `needsOwner` et `assertNotExpired` rejugés sur la ligne fraîche (ADR-0037) ; événement après le commit ; même ticket que P211.03

Avant (lu, puis mesuré par `MaintenanceTransitionsSousVerrouTest`, 10 rouges) : `transition`,
`complete`, `contestResolution` et les quatre gestes de `MaintenanceQuoteWorkflow` jugent
`$mr->status` du modèle reçu puis écrivent par `save()`, sans relecture ni verrou. Seul `accept`
relit la ligne sous verrou (TCK-1822).

## Hypothèses (mode sans humain)

- **ADR-0037 sous le verrou.** `decideQuote` (seul le bailleur sort d'`awaiting_owner`) se juge
  dans le contrôleur, sur le modèle lié. Si la ligne est passée en `awaiting_owner` depuis (un autre
  membre a approuvé au-delà du plafond), la table seule laisserait l'équipe approuver ou rejeter un
  devis que seul le bailleur tranche. L'approbation et le rejet refusent donc ce cas en 422
  `maintenance.status_transition_invalid` (`assertStillDecidable`), sans rejouer la policy.
- `transition` vers l'état déjà tenu par la ligne reste idempotente : rien n'est écrit ni émis.
- La commande saute un refus `ApiError` (422 de la table, ou tout autre refus nommé), le compte
  dans sa sortie (`Skipped N …`) et le journalise (`Log::warning`, id et code) ; elle ne lève plus.
- Le journal d'activité des gestes du devis s'écrit après le commit, sur le modèle rechargé.

## Delta à produire

- [x] `MaintenanceRequestService::lockFresh()` ; `transition`, `complete`, `contestResolution`
  jugent la table (et, pour `complete`, le coût et l'accord du bailleur) sur la ligne fraîche,
  écrivent sur elle, puis rechargent le modèle reçu et émettent.
- [x] `MaintenanceQuoteWorkflow::underLock()` pour `requestQuote`, `submitQuote`, `approveQuote`,
  `rejectQuote` ; `assertNotExpired` et `needsOwner` sur la ligne fraîche.
- [x] `maintenance:auto-close` saute, compte et journalise une ligne refusée.
- [x] Test : `tests/Feature/Maintenance/MaintenanceTransitionsSousVerrouTest.php`.

## Critères d'acceptation

- [x] AC1 — Contestation puis clôture automatique sur une copie périmée → 422, `in_progress`, un
  seul événement ; la commande saute la ligne, la compte, la journalise et clôt les autres.
- [x] AC2 — Fin des travaux sur une copie périmée d'une demande annulée, contestation d'une demande
  close → 422, ligne intacte, un seul événement.
- [x] AC3 — Rejet puis approbation (et l'inverse), double demande et double soumission de devis
  sur une copie périmée → 422, un seul événement par geste accepté.
- [x] AC4 — L'équipe qui tranche un devis passé entre-temps en `awaiting_owner` → 422 ; la validité
  du devis se juge sur la ligne fraîche (`maintenance.quote_expired`).

## Hors périmètre

- L'annulation par `PUT …/status` d'une demande `in_progress` restée en mémoire passe désormais par
  la même relecture (`transition`) ; aucun test dédié ne joue le cas du coût inscrit entre-temps.
- La policy (`decideQuote`, `transitionTo`) reste jugée sur le modèle lié, dans le contrôleur.

## Notes d'implémentation

- **Ablation** : les trois fichiers remis à `HEAD` → 10 rouges sur 10 ; correctif remis → 10 verts.
- **Piège** : la commande lit ses lignes par `each()` ; pour rejouer la contestation pendant son
  passage, le test modifie la ligne en base depuis l'événement `retrieved` du modèle.

---
id: TCK-2227
title: "Le rappel d'effacement de compte réclame la demande avant de partir"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-229--tâches-planifiées-qui-transitent-une-ligne-chargée-en-lot-face-au-geste-joué-pendant-leur-passage"
tags: [back, compte, rgpd, concurrence, pistes]
---

## Objectif utilisateur

Un utilisateur qui annule sa demande d'effacement pendant le passage d'`account:execute-deletions`
ne reçoit pas le rappel d'un effacement qui n'aura plus lieu.

## Contexte

Réf : **P229.04** du fichier de pistes, `retenu · autonome` (A1 : une demande annulée n'existe plus,
et `dueForReminder` ne vise que des demandes existantes non rappelées ; ni ce qui est effacé ni ce
qui est conservé ne change).

Avant (mesuré, `cancelDeletion()` réel joué dans l'écouteur `retrieved` après la lecture du lot) :
ligne supprimée, `deletion_requested_at` nul, et le rappel part quand même (`reminders=1`).

## Hypothèses (mode sans humain)

- La réclamation est la mise à jour conditionnelle que propose la mesure
  (`whereKey()->whereNull('executed_at')->whereNull('reminder_sent_at')`, plus
  `scheduled_for > now`, la borne de `dueForReminder`) ; elle pose `reminder_sent_at` avant l'envoi.
- Un envoi qui lève remet `reminder_sent_at` à nul et relève : la commande se comporte comme avant
  dans ce cas (rien n'est compté posé, le passage suivant renvoie).

## Delta à produire

- [x] `ExecuteScheduledAccountDeletions` : réclamation avant l'envoi, envoi seulement si une ligne est
  prise, remise à nul si l'envoi lève.
- [x] Test : `tests/Feature/Auth/RappelDeSuppressionApresAnnulationTest.php`.

## Critères d'acceptation

- [x] AC1 — Annulation après la lecture de la commande → aucun rappel, `reminders=0`.
- [x] AC2 — Rappel posé par un autre passage après la lecture → aucun second rappel.
- [x] AC3 — Sans geste concurrent, le rappel part et `reminder_sent_at` est posé.

## Notes d'implémentation

- **Ablation** : commande remise à `origin/pre-dev` → 2 rouges sur 3 (AC3 est le témoin) ;
  correctif remis → 3 verts. `AccountDeletionScheduledTest`, `RappelDeSuppressionEnEchecTest`,
  `AccountDeletionRequestTest`, `AvisSansEmailTest` et `AvisDeSuppressionAnnuleeAvantLeWorkerTest`
  restent verts.

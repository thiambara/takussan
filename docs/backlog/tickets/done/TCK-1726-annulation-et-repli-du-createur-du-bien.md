---
id: TCK-1726
title: "L'agent qui a saisi le bien annule « en agent », et la tâche de remboursement ne retombe plus sur un créateur suspendu ou parti"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1718]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-160--propertiesuser_id-lu-comme-le-bailleur-dans-une-décision-métier"
tags: [api, reservations, taches, pistes]
---

## Contexte

Réf : **P160.06** du fichier de pistes (🟢, `validé`), deux de ses trois points :

- `BookingService::cancel` écrivait `cancellation_by = owner` quand l'annulation venait de
  `properties.user_id` : l'agent qui a saisi le bien annulait « en propriétaire ».
- `BookingRefundTaskService::assigneeFor` assignait en dernier repli `property->owner` tel quel,
  sans `createurDestinataire` que TCK-1316 a posé ailleurs : dans une agence sans admin actif, la
  tâche allait à l'agent créateur suspendu ou parti.

**Décision du porteur** : validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

## Objectif utilisateur

L'annulation dit qui l'a faite, et la tâche de remboursement va à quelqu'un qui suit encore le bien.

## Delta à produire

- [x] `BookingService::cancel` : `owner` pour le seul bailleur du bien (`BailleurDuBien::est`,
  TCK-1718) ; l'agent créateur tombe sur `agent`.
- [x] `BookingRefundTaskService::assigneeFor` : dernier repli `PrimaryPropertyContact::createurDestinataire`.
- [x] `tests/Feature/Api/CreateurDuBienAnnulationEtRepliTest.php`.

## Critères d'acceptation

- [x] AC1 — l'agent créateur annule : `cancellation_by = agent` ; le bailleur : `owner`.
- [x] AC2 — sans auteur du personnel, collaborateur ni admin, un agent créateur suspendu n'est pas
  assigné (`null`) ; le bailleur du bien l'est.

## Hors périmètre

- **Reste** (troisième point de la `Piste`) : décider si le plafond de travaux d'un bailleur
  `inactive` s'applique encore, et l'écrire dans l'ADR-0037. C'est un choix (V1) que la `Piste`
  laisse ouvert, et l'écrire passe par `docs/adr/`, chemin fermé à l'implémenteur.

## Notes d'implémentation

- Ablation : les deux services rendus à `origin/pre-dev` → les deux tests du créateur rouges (`owner`
  au lieu d'`agent` ; l'agent suspendu assigné), les témoins verts ; correctifs remis → 4 verts.
- Classes rejouées, vertes : `BookingTest`, `BookingRefundTaskTest` (dont `test_assignment_order`,
  repli de l'hôte sans agence), `BookingCancellationNotificationTest`, `BookingResourceContractTest`.

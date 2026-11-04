---
id: TCK-813
title: "Messagerie : le contact d'une annonce ne va que dans une directe où les deux parties sont actives"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-38--messagerie--notifications-et-isolation-des-conversations"
tags: [back, messaging, pistes]
---

## Contexte

Réf : **P38.02** du fichier de pistes, `validé` (V3 accordé).

`PropertyConversationResolver::query()` cherchait une conversation sur le bien dont l'expéditeur
et le destinataire sont participants, sans filtrer ni le type ni `left_at`. Un groupe ouvert sur
le bien captait donc le message de contact privé, même quand le visiteur l'avait quitté : la
réponse rendait l'identifiant du groupe, et le visiteur recevait 403 sur le fil vers lequel
`redirect_to` l'envoyait.

## Décision du porteur

validé — `query()` du résolveur restreint aux conversations `direct` où le visiteur et le destinataire sont participants actifs (`left_at` nul) ; un groupe ou une directe quittée ne capte plus le contact, un fil neuf s'ouvre ; test : un groupe sur le bien ne capte pas le contact ; quand P38.05 sera fait, le destinataire cesse d'être un critère de recherche (ADR-0068 § 3)

## Objectif utilisateur

Un message écrit depuis le formulaire de contact d'une annonce n'est lu que par son destinataire.

## Contraintes strictes

- La clause reste unique (`query()`), partagée par `findExisting()` (lecture) et
  `firstOrCreate()` (écriture) : les deux chemins doivent toujours désigner le même fil.
- Le destinataire reste un critère de recherche tant que P38.05 n'est pas fait.

## Delta à produire

- [x] `query()` : `type = direct`, et `left_at` nul sur les deux participations.
- [x] Tests dans `PropertyContactMessageTest`.

## Critères d'acceptation

- [x] AC1 — Un groupe sur le bien, qui réunit le destinataire et le visiteur, ne capte pas le
      contact : un fil `direct` neuf s'ouvre, et le message n'est pas écrit dans le groupe.
- [x] AC2 — Une directe sur le bien que le visiteur a quittée ne capte pas le contact : un fil
      neuf s'ouvre, que le visiteur peut lire.
- [x] AC3 — Une directe active est toujours reprise (test existant
      `test_reuses_existing_conversation`).

## Hors périmètre

- Le sort de la directe quittée elle-même (elle reste telle quelle).
- Retirer le destinataire des critères de recherche : P38.05 (ADR-0068 § 3).

## Notes d'implémentation

- **Ablation**, clause par clause : sans le filtre `type`, AC1 rougit seul ; sans les filtres
  `left_at`, AC2 rougit seul ; remis, les 8 tests de la classe sont verts.

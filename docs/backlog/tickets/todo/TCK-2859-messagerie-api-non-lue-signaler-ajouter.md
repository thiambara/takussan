---
id: TCK-2859
title: "Messagerie, côté API : marquer un fil comme non lu, signaler une conversation, ajouter un participant à un fil à deux"
status: todo
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2860]
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#18-conversation-"
    - "docs/models-spec.md#19-conversationparticipant-"
tags: [back, messagerie, signalement, audit-ux, app]
---

## Objectif utilisateur

L'agent garde un fil à traiter en le remettant non lu, signale une conversation abusive, et fait entrer un collègue ou le bailleur dans un échange à deux.

## Contrat de données

Relevé le 2026-11-15 (`routes/api/conversations.php`) :

- `PUT conversations/{c}/read`, `mute`, `archive`, `unarchive` existent ; **aucun « non lu »**.
- **Aucun signalement** de conversation (le signalement n'existe que pour les avis, `ReviewReportService`).
- `POST conversations/{c}/participants` existe, sous `ConversationPolicy::addParticipant` (`isActiveAdmin` du fil) ; un fil `direct` n'a pas d'admin de groupe et ne se quitte pas (TCK-861) : ajouter quelqu'un à un fil à deux n'a pas de règle.
- La fiche TCK-2632 a rangé ces trois gestes en « donnée » (« API absente »), sans ticket de suite.

## Contraintes strictes (métier)

- **Écrire l'ADR d'abord** (premier item du delta) : le signalement d'une conversation est un modèle neuf (qui le lit, qui le traite, ce qu'il gèle), et ajouter une personne à un fil direct change la nature d'un échange privé. Décision proposée à y écrire :
  - **ajouter à un fil direct crée un nouveau groupe** (les deux participants + la personne ajoutée), rattaché au même bien, **sans l'historique** du fil direct ; le fil direct reste ;
  - **un signalement** est une ligne (auteur, motif codé, commentaire libre ≤ 500, date) lue par le super-admin (et l'admin de l'agence du fil si le porteur le décide dans l'ADR) ; il ne gèle rien par lui-même ; un même auteur ne signale pas deux fois le même fil.
- **Non lu** : `PUT conversations/{c}/unread` remet le `last_read_at` du participant avant le dernier message d'un autre ; le compte `unread_count` du fil vaut au moins 1 ; idempotent ; participant seulement.
- **Ajouter** : seulement un utilisateur que l'appelant peut joindre (`GET conversations/{c}/contacts`, même règle) ; jamais un client d'une autre agence.
- Codes d'erreur neufs dans les fichiers de langue de l'API (`LangGroupParity`).

## Delta à produire

- [ ] ADR (numéro suivant libre) : signalement d'une conversation et ajout à un fil direct.
- [ ] `PUT /api/conversations/{conversation}/unread`.
- [ ] Migration + modèle du signalement ; `POST /api/conversations/{conversation}/reports` (FormRequest, Policy) ; lecture pour le super-admin.
- [ ] Ajout à un fil direct → création du groupe selon l'ADR (réponse : le nouveau fil).
- [ ] Tests `ConversationUnreadTest`, `ConversationReportTest` (un seul signalement par auteur, non-participant 403), `DirectConversationAddParticipantTest` (groupe créé sans historique, direct inchangé, contact non joignable 422).

## Critères d'acceptation

- [ ] AC1 — Fil lu (0 non lu) : `PUT …/unread` → `unread_count = 1` dans `GET /api/conversations` ; `meta.counts.unread` augmente de 1.
- [ ] AC2 — Un participant signale le fil avec un motif : 201 ; le même auteur re-signale : 409 ou 422 avec code ; un non-participant : 403.
- [ ] AC3 — Fil direct agent ↔ Malick, l'agent ajoute sa collègue Awa : la réponse est un fil `group` à trois, sans aucun message ; le fil direct garde ses messages et ses deux participants.
- [ ] AC4 — Ajouter un client d'une autre agence : 422 (ou 403), aucun fil créé.

## Hors périmètre

- Le traitement des signalements dans la console d'administration (écran) : à ouvrir si l'ADR le demande.
- Les écrans de la messagerie : TCK-2860.

## Notes d'implémentation

_(à remplir par implementing-specs)_

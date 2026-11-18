---
id: TCK-2967
title: "La boîte de pilotage côté données : la file de chaque fil dérivée à la lecture, « Traité », « Rappelez-le-moi », le fil confié et la pastille des gestes"
status: todo
phase: P2
family: back
estimate: L
wave: 95
created: 2026-11-18
updated: 2026-11-18
depends_on: [TCK-2965]
blocks: [TCK-2968]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#18-conversation-
    - docs/models-spec.md#19-conversationparticipant-
    - docs/models-spec.md#20-message-
tags: [back, messagerie, le-fil, boite, adr-0128, adr-0068]
---

## Objectif utilisateur

- **Tout lecteur de la messagerie** (agent, bailleur, locataire, prestataire) : en ouvrant ses
  messages, il voit d'abord les fils où l'on attend **sa** réponse ou **son** geste, depuis combien
  de temps, et il range un fil réglé (« Traité ») ou à reprendre plus tard (« Rappelez-le-moi »).
- **Le responsable d'agence** : une salle ou un groupe se confie à une personne de l'équipe. Les
  autres membres du personnel le voient « confié à » et ne l'ont plus dans « À vous ».

## Contrat de données

- ADR-0128 § 7 : la file **se dérive**, aucune colonne de file ; trois colonnes seulement ; la pastille
  compte les gestes attendus (décision 4a). L'attribution vaut pour les salles et les groupes,
  jamais pour le fil d'un prospect (ADR-0068). « Traité » et `handled_at` : décision 2a.
- **Colonnes** :
  - `conversation_participants.snoozed_until` (timestamp nullable) ;
  - `conversation_participants.handled_at` (timestamp nullable) ;
  - `conversations.assigned_to_id` (FK `users`, nullable, `nullOnDelete`).
- **La file d'un fil pour un lecteur** est une valeur de `vous`, `attente`, `rappel` ou `ajour`,
  calculée **en SQL**, une fois pour la page et une fois pour les comptes, jamais une requête par
  fil. Les définitions :
  - **côté du lecteur** : le personnel actif de l'agence du fil (`EquipeDuFil`, TCK-2965) forme un seul
    côté, l'équipe. Tout autre lecteur forme son propre côté. Un collègue qui a répondu au client a
    donc répondu pour l'équipe ;
  - **message compté** : un message lisible par le lecteur, `visibility = all` (une note d'équipe
    n'entre jamais dans la file), non supprimé, de type `text`, `voice`, `attachment` ou `card`. Les
    `event` et `system` n'y entrent pas : un geste attendu passe par la règle de l'événement
    ci-dessous ;
  - **`rappel`** : `snoozed_until` du lecteur est dans le futur. Cela prime sur tout le reste ;
  - **`vous`** : hors `rappel`, l'une de ces deux conditions est vraie, **postérieure à `handled_at`** :
    - le dernier message compté vient de l'autre côté ;
    - un `event` attend encore le lecteur (`NonLus::gesteToujoursAttendu`).

    Exception : pour un membre du personnel autre que `assigned_to_id`, un fil confié n'est jamais
    `vous` ;
  - **`attente`** : hors `rappel` et `vous`, l'une de ces trois conditions est vraie, postérieure à
    `handled_at` :
    - le dernier message compté vient du côté du lecteur ;
    - un `event` attend encore un autre participant que le lecteur ;
    - le fil est confié à un autre membre du personnel ;
  - **`ajour`** : tout le reste, dont un fil `vous` marqué « Traité » sans message compté ni
    événement attendu après `handled_at`.
- **`GET /api/conversations`** :
  - `filter[file]=vous|attente|rappel|ajour` ;
  - par fil : `file`, `attend_depuis` (pour `vous` : l'instant du premier message de l'autre côté
    resté sans réponse, ou de l'événement attendu le plus ancien, par `instantOnWire`), `en_attente_de`
    (pour `attente` : identifiants des participants attendus, d'où le front compose « Bineta Sarr doit
    signer » ; l'agent confié pour un fil confié), `snoozed_until`, `handled_at`, `assigned_to`
    (`{id, name}`, sans contact) ;
  - `meta.counts` gagne `vous`, `attente` et `rappel`, sur la même base que les comptes existants
    (toute la liste hors archives, sans les filtres de la requête) ;
  - `meta.gestes` vaut le nombre de fils `vous` (le lot 3 y ajoutera les engagements en retard),
    hors fils en sourdine, comme `unread_total`.
- **Ordre « Rappels »** : à l'échéance, un fil sorti de rappel revient **en tête**. Le tri par dernier
  échange (`LastExchangeSort`) lit `GREATEST(last_message_at, snoozed_until)` pour un rappel échu.
- **Gestes** (participant actif seulement, 403 sinon ; jamais sous impersonation, lecture seule) :
  - `PUT /api/conversations/{conversation}/snooze` `{until}`, futur et à 30 jours au plus, ou
    `DELETE` pour lever ;
  - `PUT /api/conversations/{conversation}/handled` (pose `handled_at = now()`), et `DELETE` pour
    l'annuler, qu'appelle le « Annuler » d'un toast ;
  - `PUT /api/conversations/{conversation}/assignee` `{user_id|null}` : le fil est une salle ou un
    groupe (422 sinon, avec un code), et l'auteur comme la personne confiée sont personnel actif de
    l'agence du fil **et** participants actifs (422 sinon).
- **Temps réel** : chaque geste émet `BoiteUpdated` vers le seul lecteur (`snooze`, `handled`) ou vers
  le personnel participant (`assignee`). Aucun signal sur le canal du sujet. L'échéance d'un rappel
  n'émet rien : la relecture de sécurité (60 s, ADR-0129 § 4) la rattrape.

## Contraintes strictes (métier)

- **Aucune colonne ne stocke la file**, et aucune tâche planifiée ne la recalcule.
- **`handled_at` et `snoozed_until` sont propres au lecteur** : le « Traité » d'un agent ne change rien
  pour son collègue ni pour le client.
- **Les notes d'équipe ne changent la file de personne** (ni le client, qui ne les lit pas, ni le
  personnel). Cette exclusion se teste.
- **Coût** : nombre de requêtes de `GET /api/conversations` identique pour 1 et 30 fils, filtre
  `file` compris. Plan d'exécution relevé sur la base de développement (`EXPLAIN ANALYZE`) et
  joint au ticket.
- **Le fil d'un prospect** (ADR-0068) ne se confie pas : il suit le contact principal du bien.
- **Délai dépassé** : l'API rend `attend_depuis`, jamais un booléen « en retard ». Le seuil d'affichage
  appartient au front (TCK-2968).

## Delta à produire

- [ ] Migration `add_pilotage_columns_to_conversations` : les trois colonnes, avec un index sur
  `assigned_to_id`. `down()` les retire.
- [ ] `App\Services\Messaging\FileDuFil` (nom libre) : les sous-requêtes SQL de la dérivation, partagées
  par la page, les comptes et le filtre.
- [ ] `ConversationController::index` et `ListConversationsRequest` : `filter[file]`, champs par fil,
  `meta.counts`, `meta.gestes`. `ConversationResource` rend ces champs.
- [ ] `LastExchangeSort` : le rappel échu revient en tête.
- [ ] Routes et contrôleur des trois gestes (`ConversationPilotageController` ou équivalent), leurs
  requêtes, leurs codes d'erreur sous `LangGroupParity`, et `ProtectedActionsCoverageTest` /
  `PlatformAnyRouteExempt` selon la règle des routes neuves.
- [ ] `docs/models-spec.md` : rien, `/sync-specs` le reporte après fusion.
- [ ] Tests :
  - `FileDuFilTest`, un jeu de données par règle :
    - client qui écrit en dernier ;
    - collègue qui répond ;
    - événement attendu ;
    - événement attendu chez l'autre ;
    - traité puis nouveau message ;
    - traité sans nouveau message ;
    - rappel futur, puis échu ;
    - fil confié, vu par la personne confiée et par un collègue ;
    - note d'équipe en dernier ;
  - `GestesDeLaBoiteTest` : droits, bornes, fil de prospect refusé à l'attribution, impersonation
    refusée ;
  - nombre de requêtes 1 contre 30.

## Critères d'acceptation

- [ ] **AC1** — Chaque règle de la dérivation a son test, et chacune rougit par ablation de sa clause :
  - retirer `handled_at` laisse un fil traité en `vous` ;
  - retirer le côté « équipe » met en `vous` un fil auquel un collègue a répondu ;
  - retirer l'exception du fil confié le met en `vous` chez le collègue.
- [ ] **AC2** — Une note d'équipe écrite en dernier ne change la file d'aucun lecteur.
- [ ] **AC3** — `meta.gestes` est égal au nombre de fils `vous` hors sourdine, et reste le même quel que
  soit `filter[…]`.
- [ ] **AC4** — Un rappel échu remonte en tête de la liste triée par dernier échange.
- [ ] **AC5** — Le nombre de requêtes de la liste ne croît pas de 1 à 30 fils.
- [ ] **AC6** — Confier le fil d'un prospect, ou confier à une personne qui n'est pas personnel actif
  et participante, est refusé en 422. Un geste sous impersonation est refusé.
- [ ] Pint propre ; tests des fichiers touchés verts.

## Hors périmètre

- La file « Engagements en retard », la puce « Retard » et leur part de la pastille : lot 3, avec son
  ADR.
- L'écran de la boîte : TCK-2968.
- Une mention qui mettrait le fil en `vous` : une mention notifie (TCK-2966), elle n'entre pas dans la
  file.
- Un délai de réponse réglable par agence.

## Notes d'implémentation

_(à remplir par implementing-specs)_

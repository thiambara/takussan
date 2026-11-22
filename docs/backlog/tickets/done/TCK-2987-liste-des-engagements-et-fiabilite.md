---
id: TCK-2987
title: "La liste des engagements du lecteur (GET /api/commitments) et la fiabilité lue par le seul personnel"
status: done
phase: P2
family: back
estimate: M
wave: 96
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2969, TCK-2970]
blocks: [TCK-2973]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#18-conversation-
    - docs/models-spec.md#19-conversationparticipant-
tags: [back, messagerie, le-fil, engagements, fiabilite, adr-0130]
---

## Objectif utilisateur

- **Tout lecteur** retrouve, hors des fils, les engagements qu'on lui doit et les siens (l'onglet
  « Engagements » de la messagerie).
- **Le personnel de l'agence**, et lui seul, lit d'une personne combien de ses engagements ont été tenus
  et combien ont été en retard, sur 90 jours.

## Contrat de données

Le contrat est [ADR-0130](../../../adr/0130-l-engagement-est-un-objet-du-fil.md), §§ 1 et 6. « En
retard » a une seule définition : `status = open` et `due_at < maintenant` (ADR § 1).

- **`GET /api/commitments`** : les engagements de L dans les fils qu'il lit (`ConversationAccess`),
  paginés, sous la forme de la ressource de TCK-2969 (`CommitmentResource::forViewer`).
  - `filter[role]` :
    - `owed`, ceux qu'on lui doit : le porteur n'est pas de son côté, et L en est le bénéficiaire ou du
      personnel de l'agence du fil. Le côté est la règle de TCK-2967 (`FileDuFil::personnelDe`), et
      non une nouvelle écriture ;
    - `mine` : L en est le porteur.
  - `filter[etat]=late|open|proposed|kept|cancelled`, jugé en SQL. Une valeur hors liste ne rend rien
    (règle des valeurs en liste, ADR-0075).
  - Par ligne, en plus : `conversation` `{id, title}`, le titre du fil tel que L le lit déjà dans la
    liste des fils.
  - `meta.counts` : `owed`, `mine`, `late`, sans les filtres de la requête.
  - Ordre : en retard d'abord, puis par échéance croissante.
- **Fiabilité** : `GET /api/conversations/{conversation}/context` gagne `data.commitments_records`. C'est
  une table indexée par identifiant de compte (`{"<user_id>": {kept, late}}`), pour **chaque
  participant actif autre que l'appelant**.
  - Ce n'est pas une clé des lignes de `participants[]` : un participant sans relation lisible n'y a
    pas de ligne (règle de TCK-2748, d'où `team_note_reader_ids` à part, TCK-2967).
  - Ce qui est compté, selon l'ADR § 6 : les engagements dont le porteur est ce participant, dans
    l'agence du fil, dont l'échéance tombe dans les 90 derniers jours, hors `proposed` et `cancelled`.
    - `kept` : les engagements `kept` sans `overdue_at` ;
    - `late` : ceux qui ont un `overdue_at`, ou qui sont `open` et échus.
  - `commitments_records` n'est rendu **que si** l'appelant est personnel actif de l'agence du fil,
    sous son profil actif. Pour tout autre appelant, **la clé est absente** : ni `null`, ni zéro.
    - Cela vaut pour le participant lui-même.
    - Sous impersonation, on lit ce que lit la cible.
    - Le super-admin hors impersonation n'est pas du personnel : la clé est absente aussi.
  - Une requête pour tous les participants, jamais une par ligne.

## Contraintes strictes (métier)

- **Jamais un score** : deux entiers. Ni ratio, ni note, ni liste des engagements de la personne.
- **La fiabilité ne sort pas de l'agence** : seuls comptent les engagements dont `agency_id` est celle
  du fil. Ceux qu'elle a pris dans une autre agence ne s'y voient pas.
- **Coût** : `GET /api/commitments` et `context` ont un nombre de requêtes constant, quel que soit le
  nombre de lignes ou de participants.
- `include`, `sort` et `filter` passent par une liste blanche **avant** toute résolution : un nom venu
  de l'URL n'est jamais appelé sur un modèle.

## Delta à produire

- [ ] `CommitmentController::mine` (ou un contrôleur de liste), sa route `GET /api/commitments`, sa
  FormRequest et ses filtres en liste blanche ; `PlatformAnyRouteExempt` pour la route neuve.
- [ ] `ConversationController::context` : `commitments_records`, sous la garde du personnel.
- [ ] `DateInventoryByValueTest` : les clés neuves, s'il en faut.
- [ ] Tests :
  - `ListeDesEngagementsTest` :
    - `owed` et `mine` ;
    - chaque `etat` ;
    - les comptes, qui ne bougent pas sous les filtres ;
    - aucun engagement d'un fil que le lecteur ne lit pas ;
    - un collègue n'a pas dans `owed` l'engagement d'un collègue ;
    - requêtes constantes de 1 à 30 lignes ;
  - `FiabiliteTest` :
    - les comptes, la fenêtre de 90 jours, l'exclusion de `proposed` et `cancelled`, l'agence ;
    - un engagement reporté après son retard compte en retard (`overdue_at`) ;
    - la clé absente pour le participant lui-même, un client, un agent d'une autre agence, et
      l'impersonation d'un locataire ;
    - des requêtes constantes avec 5 participants de plus.

## Critères d'acceptation

- [ ] **AC1** — `commitments_records` est **absent** pour tout appelant hors personnel actif de l'agence
  du fil, le participant lui-même compris. *Ablation : retirer la garde → rouge, une assertion par
  lecteur.*
- [ ] **AC2** — La fiabilité ne compte que l'agence du fil et la fenêtre de 90 jours. *Ablations :
  retirer le filtre d'agence, puis la fenêtre → rouge.*
- [ ] **AC3** — `GET /api/commitments` ne rend aucun engagement d'un fil que le lecteur ne lit pas.
  *Ablation : retirer le filtre `ConversationAccess` → rouge.*
- [ ] **AC4** — `owed` exclut les engagements du côté du lecteur. *Ablation : retirer le côté met
  l'engagement d'un collègue dans `owed` → rouge.*
- [ ] **AC5** — Le nombre de requêtes de `GET /api/commitments` ne croît pas de 1 à 30 lignes, ni celui
  de `context` avec 5 participants de plus.
- [ ] Pint propre ; tests des fichiers touchés verts.

## Hors périmètre

- La file « Retard » et sa part de la pastille : TCK-2971.
- L'onglet « Engagements » et le bloc de fiabilité à l'écran : TCK-2973.
- Un seuil minimal avant d'afficher la fiabilité, et une remise à zéro (ADR-0130, « ce que ça ne
  règle pas »).
- La fiabilité ailleurs que dans la colonne de contexte du fil (fiche du prestataire, page d'équipe).
- Une page d'agence « Engagements » qui listerait ceux de toute l'équipe hors de ses fils.

## Notes d'implémentation

Livré le 2026-11-19 sur `feat/le-fil-lots-3-5` (arbre partagé).

- **Fiabilité** : `App\Services\Messaging\FiabiliteDesEngagements::pour()`, une requête groupée par
  `holder_id` pour tous les participants actifs autres que l'appelant. Garde : `personnelActifDe` sur
  l'agence du fil (`EquipeDuFil::agence`, la même que la note d'équipe). Posée dans
  `ConversationThreadContext::for()` (`commitmentsRecords`, `null` = clé absente), rendue par
  `ConversationContextResource` en objet indexé par compte (`(object)`, jamais une liste JSON). Fenêtre :
  `due_at` entre maintenant − 90 j et maintenant ; un engagement tenu en avance, dont l'échéance est à
  venir, n'est pas encore compté (lecture littérale de l'ADR § 6).
- **Liste** : un contrôleur à part, `CommitmentListController` (le `CommitmentController` est tenu par
  TCK-2970), route `GET /api/commitments` (lecture : rien à ranger dans `PlatformAnyRouteExempt`).
  Fils lus par `ConversationAccess::participatingQuery`. `owed` : hors des agences où L est personnel actif
  (`agencesOuPersonnelActif`), L bénéficiaire ; dans son agence, tout porteur hors de
  `FileDuFil::personnelDe`. Valeurs de `filter[role]` et `filter[etat]` jugées par `match` en liste
  blanche, hors liste → `1 = 0`.
- **Écart** : les lignes de la liste sont rendues SANS `abilities`. Les juger demande une garde d'écriture
  par ligne (`ConversationAccess::allowsWriting`), contraire à AC5 ; les gestes se font dans le fil, où la
  carte les rend. `conversation.title` = `conversations.subject` (ce que rend la liste des fils, le front
  compose le nom d'une directe).
- **Ablations** (rouge puis restauration md5) : garde du personnel (AC1, 2 tests) ; filtre d'agence et
  fenêtre de 90 j (AC2) ; filtre `participatingQuery` (AC3) ; exclusion du côté du lecteur (AC4).

---
id: TCK-2959
title: "Un événement ne compte comme non lu que pour qui doit agir : action_for et le compte des non-lus"
status: todo
phase: P1
family: back
estimate: S
wave: 94
created: 2026-11-17
updated: 2026-11-17
depends_on: [TCK-2958]
blocks: [TCK-2961, TCK-2962]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#20-message-
    - docs/models-spec.md#19-conversationparticipant-
tags: [back, messagerie, le-fil, non-lus, adr-0128]
---

## Objectif utilisateur

- **Tout participant d'un fil** : un événement ne lui signale un non-lu que s'il attend un geste de
  lui ; tous les autres événements se lisent sans rien compter.

## Contrat de données

- ADR-0128 § 5. `action_for` : la liste des comptes dont l'objet attend un geste, **calculée à
  l'émission**, portée par le `metadata` de l'événement (forme fermée de TCK-2958 étendue d'une seule
  clé : `{object, code, data, action_for}`).
- `MessageResource` **ne rend pas** la liste brute : il rend au lecteur un booléen
  (`action_attendue`, ou nom équivalent) qui dit si lui figure dans `action_for`. La liste des autres
  comptes qui doivent agir n'a pas à sortir — **ni par le fil, ni par la liste** :
  `ConversationResource.last_message.metadata` (rendu pour un `event` depuis TCK-2958) la retire aussi.
- Le compte des non-lus est celui de `GET /api/conversations` : `unread_count` par fil,
  `meta.unread_total`, `meta.counts.unread`, `filter[unread]`, et `PUT
  /api/conversations/{conversation}/unread` (`markAsUnread`).

## Contraintes strictes (métier)

- **Une seule définition de « quels messages comptent pour ce lecteur ».** Aujourd'hui elle est
  écrite deux fois (`$nonLus` dans `ConversationController::index`, et sa copie dans `markAsUnread`,
  l. ~534 ; le curseur de lecture, lui, reste propre à chacun) : elle passe dans **un seul** endroit
  que les deux appellent (`App\Services\Messaging\NonLus`, par exemple). La règle
  actuelle ne change pas pour les autres types (message d'un autre, hors `system`, hors message
  supprimé).
- Un `event` compte comme non lu **si et seulement si** le lecteur figure dans `action_for`, et qu'il
  est postérieur à son `last_read_at`. En SQL : contenance `jsonb` (`metadata->'action_for' @>
  to_jsonb(<id>)`), la colonne étant déjà `jsonb`.
- `action_for` ne contient que des **participants actifs** du fil au moment de l'émission ; les
  comptes absents du fil sont retirés par `EvenementsDuFil`, pas par l'appelant.
- Un `event` sans `action_for` (ou vide) ne compte jamais. C'est le cas de tous les avis d'intervention
  convertis par TCK-2958 tant que TCK-2961 ne leur en donne pas.

## Delta à produire

- [ ] `EvenementsDuFil::ecrire` : paramètre `actionFor` (liste de comptes), filtré sur les
  participants actifs, écrit dans `metadata.action_for` ; le test d'architecture de TCK-2958 admet
  cette quatrième clé et elle seule.
- [ ] `App\Services\Messaging\NonLus` : la définition unique, appelée par `index` (liste, total,
  compteurs des puces, filtre) et par `markAsUnread`.
- [ ] `MessageResource` : le booléen du lecteur ; `action_for` retiré du `metadata` rendu ;
  `ConversationResource.last_message.metadata` : `action_for` retiré.
- [ ] Tests `NonLusDesEvenementsTest` :
  - un `event` dont le lecteur est dans `action_for` compte dans `unread_count`, `unread_total`,
    `counts.unread` et `filter[unread]` ;
  - le même `event` ne compte pas pour un autre participant ;
  - `markAsUnread` rend le fil non lu pour qui est dans `action_for`, et ne bouge rien pour un autre ;
  - un `event` sans `action_for` ne compte pour personne ;
  - `action_for` d'un non-participant est filtré à l'écriture ;
  - ni `GET …/messages` ni `GET /api/conversations` (`last_message.metadata`) ne rendent la liste
    `action_for`.

## Critères d'acceptation

- [ ] **AC1** — Pour un même `event`, le participant visé voit le fil non lu, l'autre non.
  *Ablation : retirer la condition sur `action_for` (compter tout `event`) rend rouge le cas « l'autre
  participant » ; exclure tout `event` (règle de TCK-2958) rend rouge le cas « participant visé ».*
- [ ] **AC2** — `index` et `markAsUnread` appellent la même définition. *Ablation : changer la règle
  dans `NonLus` change les deux résultats ; un test qui la ferait diverger n'existe plus parce que la
  copie n'existe plus (le relevé `grep -n "MessageType::System->value" ConversationController.php`
  ne rend plus de condition de non-lu).*
- [ ] **AC3** — Le lecteur ne reçoit jamais la liste des comptes de `action_for`, ni dans le fil ni
  dans la liste des conversations, seulement son propre booléen. *Ablation : rendre `metadata` tel
  quel dans `ConversationResource` rend rouge le cas de la liste.*
- [ ] **AC4** — Les règles d'aujourd'hui sur `text`, `image`, `document`, `audio`, `card`, `system`
  sont inchangées (les tests existants des non-lus restent verts sans modification).
- [ ] Pint propre ; tests des classes touchées verts.

## Hors périmètre

- La pastille des gestes attendus et la boîte de pilotage (« À vous », `handled_at`) : lot 2.
- Le calcul de `action_for` pour chaque événement des objets : TCK-2961 (ce ticket fournit le
  mécanisme, les appelants le remplissent).

## Notes d'implémentation

### Re-mesure (2026-11-18, arbre `feat/le-fil`, après TCK-2958 `470fe726e`)

- `tests/Feature/Messaging/NonLusDesEvenementsTest.php` **existait déjà** (TCK-2958, trois tests « un
  `event` ne compte pour personne », « une `card` compte », « `markAsUnread` ignore l'événement ») :
  étendu, ses trois tests laissés tels quels — ce sont les cas « sans `action_for` » (AC4).
- La forme fermée du `metadata` n'est pas tenue par le test d'architecture mais par
  `EvenementsDuFilTest::test_la_forme_du_metadata_est_fermee_pour_tout_le_catalogue` (il lui faut un
  modèle) : c'est lui qui admet `action_for`, quatrième clé et seule ajoutée. Le docblock de
  `CodesDuFilArchitectureTest` qui l'annonçait est mis au passé.
- La copie de `markAsUnread` était l. 540 (`whereNotIn('type', …)`, colonnes non qualifiées).
- **Un troisième chemin rendait le `metadata` brut** : l'archive des données personnelles
  (`DataExportBuilder::payloads()['messages.json']`, `->toArray()` de chaque message d'un fil du
  titulaire). Inventaire fait par `grep -rn metadata` sur `app/Http`, `app/Services`, `app/Jobs`,
  `app/Notifications`, `app/Listeners`, `app/Observers`, `app/Support/TempsReel` : seuls
  `MessageResource`, `ConversationResource.last_message` et cet export sérialisent le `metadata` d'un
  message (la recherche passe par `MessageResource`, et `shouldBeSearchable` refuse déjà `event`). Les
  trois passent par le même `EvenementsDuFil::metadataRendu()`. Second relevé, sans glob ni `head` :
  `grep -rnE "Message::(where|with|find|search|withTrashed|whereIn|query)|->messages\b[^(]|['\"]messages['\"]|\.messages\b|MessageResource" app`
  — en plus de ces trois : `NotifyNewMessageJob` (jamais mis en file pour un `event`), les signaux
  temps réel (sans donnée, ADR-0129), `MessageSearchService` (via `MessageResource`, et `event` hors
  index), `messages:unindex-coded` (ne sérialise rien) ; le reste est le pont WhatsApp de Radar et
  les fenêtres de maintenance, sans rapport. Aucun quatrième chemin.

### Choix

- `action_for` est **toujours écrit** pour un événement, `[]` sans geste attendu ; les lignes converties
  par TCK-2958 n'ont pas la clé, et la règle SQL les traite comme une liste vide (testé).
- Filtrage à l'écriture : `EvenementsDuFil::ecrire(..., iterable $actionFor = [])` accepte des `User`
  ou des identifiants, garde les participants dont `left_at` est nul (une requête), rend une liste
  d'**entiers** uniques triés. `@>` distingue `5` de `"5"` : l'ablation « identifiants en chaînes »
  rend rouge le compte lui-même, pas seulement le test de forme.
- SQL : `messages.metadata->'action_for' @> to_jsonb(?::bigint)`, dans un `where` groupé de
  `NonLus::comptentPour()` (colonnes qualifiées `messages.`, aucun `or` ne sort de la corrélation de
  `withCount` / `whereHas`).
- Booléen : `action_attendue`, rendu par `MessageResource` pour un `event` seulement (`when`), calculé
  pour `$request->user()`. Inscrit dans `DateInventoryByValueTest::CLES_JAMAIS_ATTEINTES` (le parcours
  des routes n'écrit pas d'événement), avec sa raison. `ConversationResource.last_message` ne le rend
  pas (hors du ticket) : il y retire seulement `action_for`.
- AC2 : `grep -n "MessageType::System->value" app/Http/Controllers/Api/ConversationController.php` ne
  rend plus rien.

### Ablations (une à la fois, `--filter`, restauration par `cp` prouvée par md5)

| AC | Mutation | Résultat |
|---|---|---|
| AC1, AC2 | `NonLus` : condition `action_for` retirée (tout `event` compte) | `compte_pour_qui_doit_agir_et_pour_lui_seul` (liste) **et** `marquer_non_lu_suit_action_for` rouges |
| AC1, AC2 | `NonLus` : tout `event` exclu (règle de TCK-2958) | les deux mêmes rouges |
| AC3 | `MessageResource` rend `metadata` brut | `la_liste_action_for_ne_sort_jamais` rouge |
| AC3 | `ConversationResource.last_message` rend `metadata` brut | même test rouge |
| AC3 | export : `metadata` brut | même test rouge |
| filtre | `wherePivotNull('left_at')` retiré | `action_for_est_filtre_sur_les_participants_actifs` rouge |
| filtre | aucun filtre (`return $ids`) | même test rouge |
| forme | identifiants écrits en chaînes | `compte_pour_qui_doit_agir…` et `…participants_actifs` rouges |
| groupement | `NonLus` sans son `where` englobant (`or` au premier niveau) | `un_evenement_lu_ne_compte_plus_et_ne_deborde_pas_sur_un_autre_fil` rouge, par `markAsUnread` du second fil (`whereHas` et `withCount` groupent d'eux-mêmes le `or` d'un rappel, `Message::query()->tap()` non : le compte de la liste restait vert) |

### Mesures

- Classes touchées : `NonLusDesEvenementsTest` (10, dont le curseur de lecture d'un `event` et le
  non-débordement sur un autre fil), `EvenementsDuFilTest`, `CodesDuFilArchitectureTest`
  — 25 verts. Non-régression des non-lus et de l'export (AC4), sans modification :
  `ConversationListFiltersTest`, `ConversationListPagesTest`, `ConversationUnreadCountTest`,
  `ConversationUnreadTest`, `ConversationParticipantsHygieneTest`, `ParticipantRoleResponseShapeTest`,
  `MaintenanceThreadAccessTest`, `Admin/DataExportTest`, `ArchiveDuTitulaireTest`,
  `RelectureDesObjetsTest` — 71 verts.
- Gardes : `RessourceUniqueResolueTest`, `ExistsSurTableASuppressionDouceTest`, `AgencyIdIsIndexedTest`,
  `ImpersonationReadSweepTest`, `ValeursEnListeParcoursDesRoutesTest`, `DateInventoryByValueTest`,
  `EcritureDeMessageUniqueTest` verts. Pint propre. Gardes racine : seules les sept des maquettes du
  playground rougissent, et ne citent que `playground/maquettes`.

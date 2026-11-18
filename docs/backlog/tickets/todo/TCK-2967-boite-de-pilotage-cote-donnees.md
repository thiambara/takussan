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

### Re-mesure de la prémisse (2026-11-18)

- **`LastExchangeSort` ne trie pas les fils** : il trie les PERSONNES de `GET /api/conversations/contacts`
  (TCK-2745). L'ordre de la liste des fils est l'`orderByRaw('conversations.last_message_at DESC NULLS LAST')`
  de `ConversationController::index`. C'est là que le rappel échu remonte (`FileDuFil::ordonner()`,
  `GREATEST(last_message_at, snoozed_until échu)`) ; `LastExchangeSort` n'est pas touché.
- **Types comptés** : le dépôt n'a ni `voice` ni `attachment`. Un message compté est de tout type sauf
  `system` et `event` : `text`, `image`, `document`, `audio`, `card`.
- **Impersonation** : aucun code. `EnforceImpersonationReadOnly` refuse déjà toute méthode non sûre en 403
  `impersonation.read_only`, avant le contrôleur ; le test le vérifie sur les cinq routes.
- **Super-admin** : `ConversationAccess::allows` l'accepte sans ligne de participation ; un geste n'aurait
  rien écrit (`updateExistingPivot` sans ligne) et rendu 200. Garde dédiée `ConversationPolicy::piloter`
  (participant actif ET `allows`), appelée par `GesteDeLaBoiteRequest::authorize()`.
- **`en_attente_de` et `action_for`** : TCK-2959 ne laisse sortir `action_for` par aucune route. Le ticket
  demande les participants attendus d'un fil `attente` : ils sortent, bornés aux participants ACTIFS autres
  que le lecteur dont un événement attend encore le geste (plus, si le lecteur a écrit en dernier, l'autre
  côté). C'est une projection d'`action_for` ; à trancher par la session si elle doit se restreindre.

### Lectures retenues

- **« Confié à un autre » n'a pas d'instant** : il ne se compare pas à `handled_at`. Lecture retenue : un fil
  confié qui SERAIT `vous` pour l'équipe est `attente` (de la personne confiée) pour le collègue ; confié sans
  rien d'attendu, il est `ajour`, comme tout fil où personne n'attend personne.
- **Une attribution ne vaut que tant que la personne confiée est personnel de l'agence ET participante
  active** : confié à un agent parti ou suspendu, le fil redevient `vous` pour l'équipe (deux tests).
- **`handled_at` et `created_at` sont à la seconde** : « postérieur » est strict (`>`). Un message de la même
  seconde que « Traité » est réputé traité (test).
- **Côté de l'auteur d'un message** : règle du TIERS (`PersonnelDeLAgence::estPersonnel`), réécrite en UNE
  requête par `FileDuFil::personnelDe()` (mêmes portées `active()` et `enVigueur()`) et confrontée à
  `estPersonnel` sur neuf comptes (test). Le côté du LECTEUR : son profil actif
  (`agencesOuPersonnelActif`), comme `EquipeDuFil::litLesNotes`.
- **Événement attendu** : `NonLus` gagne une variante par colonne (`gesteToujoursAttenduDeLaColonne`) pour
  « un événement attend un AUTRE participant » ; une seule écriture de la règle du dépassement.

### Plan d'exécution (`EXPLAIN (ANALYZE, BUFFERS)`, base de développement, 2026-11-18)

- **Lecture seule de la base** : elle n'a ni la colonne `visibility` (TCK-2965) ni les trois colonnes de ce
  ticket (migrations non jouées). Les trois tables touchées (`messages`, `conversation_participants`,
  `conversations`) sont COPIÉES dans le schéma temporaire de la session (qui masque `public`), avec les
  colonnes neuves (`visibility = 'all'`, les trois autres nulles) et tous leurs index, plus ceux de
  `296500` et `296700` ; `ANALYZE`, `EXPLAIN`, puis `ROLLBACK`. Rien n'est écrit dans `public`.
- **Lecteur** : l'agent qui participe au plus de fils (58 fils actifs, 217 messages ; base de 776 fils, 1771
  messages). Volume de développement : le plan dit la FORME, pas le coût à l'échelle.
- **Comptes** (`meta.counts` + `gestes`, une requête) : `Planning 1,5 ms · Execution 1,1 ms`. **Page** (20
  fils, détails compris) : `Planning 3,7 ms · Execution 1,9 ms`.
- **Re-mesuré après la règle des clôtures** (2026-11-18, même méthode, même lecteur) : comptes
  `Planning 3,2 ms · Execution 1,1 ms`, page `Planning 10,3 ms · Execution 3,5 ms`. La clause des couples
  `(code, code) IN (…)` apparaît dans le filtre du `NOT EXISTS` des événements postérieurs, toujours une
  requête par page ; le planning grandit avec la liste des couples (22 aujourd’hui), l'exécution reste de
  l'ordre de la milliseconde au volume de développement.
- Le dernier message compté passe par `Index Scan Backward using messages_conversation_id_visibility_id_idx`
  (`Index Cond: conversation_id = lp.conversation_id AND visibility = 'all'`), `Limit 1`, une fois par fil ;
  la participation du lecteur par l'index `(user_id, conversation_id)` ; les événements attendus par le même
  index de `messages`, filtrés sur `type` et `action_for`.
- **Mesuré et corrigé** : sans barrière, PostgreSQL aplatissait la sous-requête des faits (`f`) dans son
  jugement (`g`) et recopiait l'expression de l'agence du fil (`EquipeDuFil::agenceSql`) à chaque emploi —
  trois évaluations par fil (SubPlans 1-5, 7-11, 14-18). `OFFSET 0` sur `f` : une seule (`InitPlan`), et les
  comptes passent de 2,9 ms à 1,1 ms sur la même copie.

```
Aggregate (actual time=1.115..1.123 rows=1 loops=1)
  ->  Nested Loop Left Join (actual rows=58 loops=1)
        ->  Merge Semi Join (rows=58)  — les fils du lecteur (cloisonnement inchangé)
        ->  Subquery Scan on f (actual time=0.009..0.009 rows=1 loops=58)
              ->  Nested Loop Left Join (rows=1 loops=58)
                    ->  Index Scan using conversation_participants_user_id_conversation_id_idx on conversation_participants lp
                          Index Cond: ((user_id = 58) AND (conversation_id = conversations.id))
                    ->  Limit (rows=0 loops=58)
                          ->  Index Scan Backward using messages_conversation_id_visibility_id_idx on messages m
                                Index Cond: ((conversation_id = lp.conversation_id) AND ((visibility)::text = 'all'::text))
                                Filter: ((deleted_at IS NULL) AND ((type)::text <> ALL ('{system,event}'::text[])))
```

### Ablations (2026-11-18, une à une, `--filter` sur le seul test visé, restauration par `cp`, md5 vérifié)

| Ablation (`FileDuFil` sauf mention) | Rouges |
|---|---|
| « Traité » retiré du dernier message | `traite_puis_nouveau_message`, `traite_sans_nouveau_message` |
| « Traité » retiré des événements du lecteur | `traite_puis_nouvel_evenement` |
| côté « équipe » retiré (le lecteur seul) | `le_collegue_qui_repond…`, `un_agent_d_ailleurs…` |
| exception du fil confié retirée | `fil_confie_vu_par_la_personne_confiee…` |
| note d'équipe comptée (`visibility` retiré) | `note_d_equipe_en_dernier_apres_le_client`, `une_note_seule…` |
| `system` et `event` comptés comme messages | les 4 tests d'événements |
| message supprimé compté | `un_message_supprime…` |
| rappel retiré | `rappel_futur_puis_echu` |
| « un événement attend un autre » retiré | `un_evenement_attendu`, `…chez_l_autre`, `traite_puis_nouvel_evenement` |
| attribution valable sans être personnel | `fil_confie_a_un_agent_suspendu` |
| attribution valable sans participer | `fil_confie_a_un_ancien_participant` |
| ordre sans le rappel échu | `un_rappel_echu_remonte_en_tete` (AC4) |
| `gestes` sans la sourdine | `gestes_compte_les_fils_vous…` (AC3) |
| `ConversationPolicy::piloter` sans la participation | `seul_un_participant_actif…` (super-admin) |
| type de fil non vérifié | `le_fil_d_un_prospect…` |
| auteur non vérifié | `seul_le_personnel_confie` |
| cible : personnel / participation non vérifiés | `confier_a_qui_n_est_pas_personnel…` (deux ablations) |
| signal sur le canal du sujet | `rappel_et_traite_signalent_au_seul_lecteur` |
| signal à tous les participants | `confier_signale_au_personnel_participant` |
| « Traité » retiré des événements qui attendent un autre (`evenementAttendu`) | `traite_retire_l_attente_d_un_evenement_anterieur` (ajouté : sans lui, la clause restait verte) |
| `NonLus` (b) retirée (clôtures du catalogue) | `le_locataire_qui_a_paye…`, `CloturesDesGestesTest::le_devis_approuve_clot…` |
| `NonLus` (b) élargie à tout code (`'true'`) | `un_evenement_posterieur_qui_ne_clot_pas_ne_libere_pas` |
| `NonLus` (a) élargie à tout lecteur (la règle de la décision 1, abandonnée) | `CloturesDesGestesTest::le_prestataire_reste_attendu…` (cas de TCK-2961), `EvenementsDesObjetsTest::le_dernier_se_juge_par_lecteur_et_par_objet` |
| `NonLus` (a) retirée | `EvenementsDesObjetsTest::seul_le_dernier_evenement_d_un_objet_attend_le_lecteur`, `…le_dernier_se_juge_par_lecteur…` |
| `lease_payment.paid` sans `eteint` (`CodesDuFil`) | `le_locataire_qui_a_paye…` |
| `eteint` vers un code d'un autre objet | `CloturesDuFilArchitectureTest::chaque_cle_eteint_designe…` |
| code attendu sans clôture ni raison | `CloturesDuFilArchitectureTest::chaque_code_qui_attend…`, `…sans_cloture_ne_garde…` |
| garde de `EvenementsDuFil::ecrire` retirée | `un_code_qui_n_attend_rien_ne_porte_pas_de_geste` |
| garde de `FilDeLObjet::parler` retirée | `parler_refuse_un_geste_sur_un_code_qui_n_attend_rien` |

Le test `note_d_equipe_en_dernier_apres_l_equipe` reste vert sous l'ablation de la note : une note vient
toujours de l'équipe, elle ne change donc pas le côté du dernier message quand l'équipe a écrit avant. Le
cas qui la distingue est `une_note_seule_ne_change_aucune_file`, ajouté pour cela. Le refus sous
impersonation n'a pas d'ablation propre : il n'y a pas de code de ce ticket (le middleware global).

### Drapeaux de la note d'équipe dans `GET /api/conversations/{id}/context` (demande de la session, pour TCK-2968)

- `data.can_write_team_note` : la règle du refus 422 de TCK-2965 (`ConversationWriter::refuserLaNote`) —
  le fil a une agence ET l'appelant y est personnel actif sous son profil actif. Le super-admin lit les
  notes mais n'en écrit pas : faux.
- `data.participants[].reads_team_notes` sur chaque ligne de `RelationsAuFil` : la règle du tiers des
  mentions (TCK-2966) — participant actif ET personnel de l'agence du fil, sur l'un de ses profils —
  en lot (`FileDuFil::personnelDe`, une requête). **Faux partout pour un appelant qui ne lit pas lui-même
  les notes** (client, agent d'une autre agence, impersonation d'un locataire) : un client n'apprend rien
  des notes. Un participant sans relation lisible n'a pas de ligne (règle de TCK-2748, inchangée).
- `data.team_note_reader_ids` (liste triée) : TOUT participant actif qui lit les notes, ligne de relation ou
  non — même jugement, même liste du personnel. Pas de ligne neutre dans `participants[]` : les tests de
  TCK-2748 tiennent qu'un participant sans relation lisible n'a pas de ligne. Test
  `test_un_participant_sans_relation_porte_aussi_le_drapeau` (personnel par délégation seule, sans ligne) ;
  ablations : liste de tous les participants, liste tirée des seules lignes — rouges.
- `EquipeDuFil::litLesNotes` accepte l'agence déjà calculée (paramètre facultatif, comme
  `tiersLitLesNotes`).
- `DrapeauxDeLaNoteTest` (agent de l'agence, locataire, agent d'une autre agence, impersonation du
  locataire, requêtes constantes avec 5 participants de plus). Ablations : drapeau de lecture toujours
  vrai, sans la garde du lecteur, écriture sans la règle du personnel, jugement par participant, personnel
  de toute agence — chacune rouge.

### Ordre de « À vous » (demande de la session)

Sous `filter[file]=vous`, `GET /api/conversations` suit `attend_depuis` CROISSANT (celui qui attend depuis
le plus longtemps en tête, maquette `fil-boite` D), puis l'ordre « dernier échange » ; les autres filtres ne
changent pas (`FileDuFil::ordonner($q, $file)`). Test `ListeDeLaBoiteTest::test_a_vous_suit_l_attente_la_plus_ancienne`
(un fil relancé : dernier échange le plus récent, attente la plus ancienne) ; rouge sans la branche, et
rouge quand le contrôleur ne passe pas le filtre.

### Ce qui change ailleurs

- `ConversationListFiltersTest` : `meta.counts` gagne `vous`, `attente`, `rappel` (trois égalités strictes
  mises à jour).
- `DateInventoryByValueTest` : les cinq clés de la boîte (`whenHas('boite_file')`) inscrites dans
  `CLES_JAMAIS_ATTEINTES`, avec leur raison.
- `PlatformAnyRouteExempt` : `snooze`, `unsnooze`, `handle`, `unhandle` en `SOI` (la ligne du lecteur),
  `assign` en `NON_GARDE` (même régime que la gestion des membres).
- `CodesDuFil` : deux clés facultatives par code, `attend` (le code peut porter un `action_for` non vide)
  et `eteint` (les codes du même objet qu'il clôt), plus `SANS_CLOTURE` (code attendu sans clôture → sa
  raison). `EvenementsDuFil::ecrire` et `FilDeLObjet::parler` (avant `afterCommit`, dont l'échec n'est que
  rapporté) refusent un geste attendu sur un code qui ne déclare pas `attend` — c'est ce qui rend la
  déclaration vraie pour le test d'architecture ; au-delà de la demande, signalé.
- `NonLusDesEvenementsTest` : son aide écrivait `maintenance.transition` avec un `action_for` ; elle écrit
  désormais `maintenance.quote_submitted` (un code `attend`, mêmes clés de `data`), et le test qui relit le
  code suit.
- Requêtes de la liste : constantes, `assignedTo` compris (une requête dès qu'un fil de la page est confié,
  aucune sinon — le test compare donc deux pages qui en ont un).

### Vérifications de fin (2026-11-18)

- **Ordre de travail** : les tests ont été écrits après le code et sont passés verts du premier coup ; leur
  rouge est prouvé par les ablations ci-dessus, pas par un premier passage rouge.
- **`down()` mesuré** : un test jetable (supprimé ensuite) a joué `down()` puis `up()` de `296700` sous
  `RefreshDatabase` — les trois colonnes disparaissent puis reviennent, vert.
- **Égalité à la seconde** : « postérieur » strict ; un message arrivé dans la même seconde APRÈS « Traité »
  reste `ajour` jusqu'au suivant.
- **Agent parti** : l'auteur d'un message est jugé personnel À LA LECTURE ; quand un agent quitte l'agence,
  les fils où il a répondu en dernier repassent `vous` pour l'équipe, avec un `attend_depuis` ancien.
- Gardes `FormRequestEtendBaseFormRequestTest` et `QueryNeverFeedsAWriteTest` : vertes.

### Décisions de la session (2026-11-18), appliquées dans ce ticket

1. **Une règle de clôture déclarée au catalogue** (remplace la première lecture de la session, « le
   dernier événement d'un objet dit qui est attendu », abandonnée parce qu'elle retirait au prestataire le
   créneau à poser dès qu'un devis était soumis). `NonLus::gesteToujoursAttendu` : un `event` attendu par le
   lecteur cesse de l'être quand un `event` POSTÉRIEUR du même objet, dans le fil, (a) l'attend lui aussi
   (la règle de TCK-2961, inchangée) ou (b) porte un code qui clôt le sien (`eteint` dans `CodesDuFil`). La
   liste « code → codes éteints » devient une clause de couples en littéraux, une requête par page.
   - **Clôtures déclarées** : `lease_payment.paid` et `receipt_issued` → `due_soon`, `overdue`, `reminded` ;
     `maintenance.slot_set` → `slot_requested` ; `quote_awaiting_owner` → `quote_submitted` ;
     `quote_approved` et `quote_rejected` → `quote_submitted`, `quote_awaiting_owner` ; `completed`,
     `confirmed`, `auto_closed` → `slot_requested`, `quote_submitted`, `quote_awaiting_owner` ;
     `visit.confirmed` → `visit.rescheduled`. **Décision du porteur** : `unassigned` et `declined` →
     `slot_requested`, `quote_submitted`, `quote_awaiting_owner` (un prestataire retiré ou qui refuse n'a
     plus de créneau à poser, son devis n'attend plus personne ; la réaffectation écrit ses propres
     événements). Test `CloturesDesGestesTest::test_le_prestataire_qui_part_clot_le_creneau_et_le_devis`
     (retiré par `PATCH`, refus par `POST …/decline`), chaque `eteint` rouge sous ablation.
   - **Codes neufs, émis par les chemins existants** (deuxième demande de la session : combler les trous) :
     - `inventory.signed_by_party` (`data` : `type`, `party` = le CODE du rôle) — écrit par
       `InventorySignatureService::sign` à chaque signature qui ne complète pas ; son `action_for` porte
       les parties qui doivent encore signer (`doitEncoreSigner`, le prédicat d'`awaiting_signature`, écrit
       une fois). Il clôt `awaiting_signature` pour tous, et attend à son tour les autres : le signataire
       sort, les autres restent attendus ;
     - `inventory.signed` — à la signature qui complète ; clôt `awaiting_signature` et `signed_by_party` ;
     - `maintenance.cancelled` — `SyncMaintenanceConversation` l'écrit au lieu de `maintenance.transition`
       pour toute transition vers `cancelled` (toutes les annulations passent par lui ; `data.status` reste
       `cancelled`, le front le dit déjà) ; clôt `slot_requested`, `quote_submitted`, `quote_awaiting_owner` ;
     - `visit.cancelled` — `VisitSchedulingService::cancelOrFail` ; clôt `visit.rescheduled`.
   - **`SANS_CLOTURE` est vide** : l'état des lieux dit désormais ses signatures. Le test garde les entrées à
     venir.
   - **Réservation** : rien à déclarer — le catalogue n'a que `booking.confirmed`, et aucun code de
     réservation n'attend un geste.
   - **Reste ouvert, signalé** : une demande de report refusée n'existe pas (accepté = `slot_set`, remplacé = nouvelle
     demande, règle (a)). Chez les parties encore attendues, `attend_depuis` repart de la dernière
     signature (`signed_by_party`), non de la soumission.
   - **Textes** (front, `messaging.evenementsDuFil`, par `cle-i18n.mjs`, `wo` = français) :
     `inventory.signed_by_party` (ICU `select` sur `partie`), `inventory.signed`, `visit.cancelled` ;
     `useTexteMessageSysteme` gagne ces trois codes et passe `partie` (`data.party`). Test
     `useTexteMessageSysteme.tck-2967.test.tsx`, chaque entrée rouge sous ablation.
   - **Tests des codes neufs** : `CloturesDesObjetsTest` (deux signatures : le signataire sort, le bailleur
     reste, puis plus personne ; visite reportée puis annulée) et
     `CloturesDesGestesTest::test_l_intervention_annulee_clot_tout_ce_qu_elle_attendait` (par la route
     `PUT …/status`). Ablations : sans chaque `eteint`, sans chaque émission, avec un `action_for` de tous
     les participants — chacune rouge, md5 restauré.
   - **Tests** : `FileDuFilTest::test_le_locataire_qui_a_paye_n_est_plus_attendu` (ni `vous`, ni `gestes`, ni
     non-lu, ni `action_attendue`) ; `CloturesDesGestesTest` (le cas de TCK-2961 qui RESTE attendu, le devis
     approuvé qui clôt, les deux gardes d'écriture) ; `FileDuFilTest::test_un_evenement_posterieur_qui_ne_clot_pas_ne_libere_pas` ;
     `CloturesDuFilArchitectureTest` (unitaire : chaque code `attend` a une clôture ou sa raison ; chaque
     `eteint` désigne un code `attend` existant du même objet, jamais lui-même, depuis un événement ; les
     entrées de `SANS_CLOTURE` sont vraiment sans clôture ; chaque code s'écrit en littéral). Chaque clause
     a son ablation (tableau ci-dessus).
   - `EvenementsDesObjetsTest::test_le_dernier_se_juge_par_lecteur_et_par_objet` revient à son texte de
     TCK-2961 (2 non-lus), inchangé par rapport à `dev`.
2. **`en_attente_de`** : accepté tel quel — des identifiants de participants actifs, ni noms ni contacts.
3. **Fil confié sans rien d'attendu** : `ajour` pour le collègue, accepté.
4. **`handled_at` strict à la seconde** : accepté.
5. **Agent parti** (ses réponses repassent de l'autre côté) : accepté.

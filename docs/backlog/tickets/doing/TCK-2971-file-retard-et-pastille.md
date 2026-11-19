---
id: TCK-2971
title: "La file « Retard » de la boîte et sa part de la pastille des gestes"
status: doing
phase: P2
family: back
estimate: L
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
tags: [back, messagerie, le-fil, engagements, boite, adr-0130, adr-0128]
---

## Objectif utilisateur

- **Celui à qui l'on doit** (le bénéficiaire, et le personnel qui suit le fil) : une promesse non tenue
  range le fil dans « Retard ». La pastille de l'onglet Messages la compte comme un geste attendu.

## Contrat de données

Le contrat est [ADR-0130](../../../adr/0130-l-engagement-est-un-objet-du-fil.md), § 5. Les
définitions de TCK-2967 (côté, message compté, `handled_at`, `snoozed_until`) ne changent pas.

- **`FileDuFil` gagne `retard`.** Un fil est `retard` pour le lecteur L, hors `rappel`, quand il porte
  un engagement `open` avec `due_at < maintenant` :
  - dont le porteur **n'est pas du côté de L** (la règle des côtés de TCK-2967, écrite une fois) ;
  - et que L suit : L en est le bénéficiaire, **ou** L est du personnel de l'agence du fil.

  La préséance devient `rappel` > `retard` > `vous` > `attente` > `ajour`. `handled_at` ne s'applique
  pas à `retard`.
- **`GET /api/conversations`** :
  - `filter[file]=retard` ;
  - `meta.counts.retard` ;
  - `meta.gestes` = les fils `vous` ou `retard` hors sourdine. Chaque fil compte une fois ;
  - sous `filter[file]=retard`, ordre par `retard_depuis` croissant (la plus ancienne échéance
    dépassée), puis par dernier échange ;
  - par fil :
    - `retard_depuis` : un instant ;
    - `engagement` : le plus pressant des engagements `open` du fil, ou `null`. On prend d'abord un
      engagement en retard, puis l'échéance la plus proche. Il porte `{id, title, holder_id,
      due_at, etat}`, où `etat` vaut `late` ou `open`. Le front nomme le porteur d'après les
      participants, sans identifiant à l'écran.

  Le tout dans la **même** sous-requête latérale : le nombre de requêtes de la liste reste le même pour
  1 et 30 fils.

## Contraintes strictes (métier)

- **Coût** : pour la liste des fils, une requête constante, et un `EXPLAIN ANALYZE` relevé sur la base
  de développement, joint au ticket (méthode de TCK-2967 : copie des tables dans le schéma temporaire
  si les migrations ne sont pas jouées).
- **Les notes d'équipe ne changent pas plus `retard` que les autres files** (TCK-2967).
- Le porteur en retard est `vous` par l'événement de TCK-2970, **jamais** `retard` pour son propre
  engagement.

## Delta à produire

- [ ] `FileDuFil` : l'expression nommée « un engagement en retard que je suis », la file `retard` dans le
  `CASE`, `retard_depuis`, `engagement` (détails), comptes, filtre, ordre.
- [ ] `ConversationController::index`, `ListConversationsRequest` (`retard` admis) et
  `ConversationResource` (champs neufs).
- [ ] `DateInventoryByValueTest` : les clés neuves.
- [ ] Tests :
  - `FileRetardTest`, un jeu par règle :
    - un bénéficiaire client voit `retard` ;
    - le personnel voit `retard` pour un engagement du client ;
    - un collègue voit `retard` pour l'engagement d'un client, mais pas pour celui d'un collègue ;
    - un autre client du fil, non bénéficiaire, ne voit rien ;
    - le porteur voit `vous` ;
    - `retard` prime sur `vous`, et `rappel` prime sur `retard` ;
    - « Traité » ne sort pas de `retard` ;
    - un engagement tenu sort de `retard` ;
  - `GestesEtRetardTest` : `meta.gestes` = `vous` + `retard` hors sourdine. Il ne change sous aucun
    filtre. Un fil à la fois `vous` et en retard ne compte qu'une fois.

## Critères d'acceptation

- [ ] **AC1** — Chaque règle de `retard` a son test, rouge par ablation de sa clause :
  - retirer le côté met le collègue en `retard` sur l'engagement d'un collègue ;
  - retirer « que L suit » met en `retard` un client non bénéficiaire ;
  - inverser la préséance avec `vous` fait rougir le test de préséance ;
  - laisser `handled_at` s'appliquer fait rougir « Traité ne sort pas de retard ».
- [ ] **AC2** — `meta.gestes` compte chaque fil une fois. *Ablation : `vous` + `retard` comptés sur deux
  expressions qui se recouvrent → rouge.*
- [ ] **AC3** — Le nombre de requêtes de `GET /api/conversations` ne croît pas de 1 à 30 fils, filtre
  `retard` compris. Le plan d'exécution est joint.
- [ ] Pint propre ; tests des fichiers touchés verts, `FileDuFilTest` et `ListeDeLaBoiteTest` compris.

## Hors périmètre

- La liste `GET /api/commitments` et la fiabilité : TCK-2987.
- L'écran de la puce : TCK-2973.

## Notes d'implémentation

Livré le 2026-11-19 sur `feat/le-fil-lots-3-5` (arbre partagé), sur TCK-2969 et TCK-2970.

**Prémisse re-mesurée** — conforme. `FileDuFil` n'avait été touché par aucun autre agent ; `ConversationController`
et `ConversationResource` l'étaient (copilote, pont) : relus juste avant l'écriture, blocs marqués `TCK-2971`.

**Ce qui est livré.**
- `FileDuFil::RETARD`, dans `FILES` (donc admis par `ListConversationsRequest` sans y toucher). `retard_depuis` est
  une sous-requête du niveau `g` de la latérale (`retardQueJeSuis()`) : `MIN(due_at)` des engagements `open` échus
  du fil, porteur hors du côté du lecteur (`NOT deMonCote('ce.holder_id', 'f')`, la règle des côtés écrite une
  fois), suivis par le lecteur (`beneficiary_id = lecteur OR f.equipe`). Aucune lecture de `handled_at`. Le `CASE`
  devient `rappel` > `retard` > `vous` > `attente` > `ajour`.
- `engagement` (détails seulement, `engagementLePlusPressant()`) : `json_build_object` du `open` à l'échéance la
  plus ancienne (le retard d'abord, mécaniquement), `etat` `late|open` ; la ressource rend `due_at` par `iso()`.
- Comptes : `retard`, et `gestes` = `file in ('vous','retard')` hors sourdine — une seule colonne `file` par fil,
  donc chaque fil une fois. `meta.counts.retard`. Ordre sous `filter[file]=retard` : `retard_depuis` croissant,
  puis « dernier échange ».
- `FileDuFilTest::test_le_filtre_de_file` assertait `filter[file]=retard` en 422 (garde d'attente de TCK-2967) :
  il asserte désormais 200, et une valeur inconnue en 422. `DateInventoryByValueTest` : `retard_depuis` et
  `engagement` inscrits dans `CLES_JAMAIS_ATTEINTES` (ordre alphabétique exigé).

**Mesures.** `FileRetardTest` (10) et `GestesEtRetardTest` (2) verts ; `FileDuFilTest` (25), `ListeDeLaBoiteTest`
(4), `DateInventoryByValueTest` (25) verts. Requêtes de la liste : 47 à 1 fil comme à 30, filtre `retard` compris
(le test chauffe d'abord les mémos du processus — un premier appel lit les capacités du rôle — et donne un message
au fil seul, sans quoi le chargement du dernier message manquait au petit jeu : deux écarts qui ne disaient rien de
la boîte).

**Ablations** (toutes rouges, restauration md5) : côté retiré (le collègue passe `retard`) ; « que L suit »
retiré (le client non bénéficiaire passe `retard`) ; préséance `vous` avant `retard` ; `handled_at` appliqué au
retard ; `gestes` sur deux expressions qui se recouvrent (`vous` + `retard_depuis` non nul : le fil en rappel et
en retard compte).

### Plan d'exécution (`EXPLAIN (ANALYZE, BUFFERS)`, base de développement, 2026-11-19) — AC3

- **Méthode de TCK-2967** : la base de développement n'a pas joué `296901`/`297001` (`commitments` absente). Dans une
  transaction : `commitments` créée en table TEMPORAIRE (colonnes lues par la boîte, et l'index
  `(conversation_id, status, due_at)` de la migration), un engagement `open` par fil du lecteur, porté par un AUTRE
  participant, la moitié échue, plus un `kept` par fil (100 lignes) ; `ANALYZE`, `EXPLAIN`, puis `ROLLBACK`. Rien
  n'est écrit dans `public`. Requête réelle : `FileDuFil::selectionner` + `filtrer(retard)` + `ordonner(retard)`,
  `LIMIT 20` ; et `joindre` + `selectionnerLesComptes`. Script passé par `tinker --execute`, hors dépôt.
- **Lecteur** : l'agent qui participe au plus de fils (58 fils actifs ; base de 776 fils). 18 fils en `retard`.
- **Mesuré et corrigé** : sans barrière, PostgreSQL aplatissait `g` dans le niveau de la file et recalculait
  `retard_depuis` à chaque emploi — **trois SubPlans par fil** (1, 7, 9 : le `CASE`, le tri, le filtre). `OFFSET 0` sur
  `g` (comme sur `f`) : **un seul**, `loops=58`. Page : exécution 10,9 ms → 6,9 ms, même résultat (18 fils). Les
  tests de la boîte restent verts (`FileRetardTest` 10, `GestesEtRetardTest` 2, `FileDuFilTest` 25).
- **Lecture** : à ce volume, `Seq Scan on commitments` (100 lignes : le planificateur préfère le parcours à l'index) ;
  le filtre `conversation_id = conversations.id AND status = 'open' AND due_at < …` est celui de l'index
  `commitments_conversation_status_due_idx`, qu'il prendra à l'échelle. Machine chargée (charge 35) : les temps
  disent l'ordre de grandeur ; la FORME est ce qui compte (une sous-requête par fil, aucune par engagement).
- **Requêtes de la liste** : constantes de 1 à 30 fils, filtre `retard` compris (`GestesEtRetardTest`, 47 et 47).

**AC3 : vert.**

Plan de la page `filter[file]=retard` (lignes longues coupées à 220 caractères : les filtres de la règle des
clôtures, hors ticket) :

```
Limit  (cost=19450.57..19450.62 rows=20 width=358) (actual time=5.310..5.323 rows=18 loops=1)
  Buffers: shared hit=1253, local hit=76
  ->  Sort  (cost=19450.57..19450.72 rows=58 width=358) (actual time=5.308..5.319 rows=18 loops=1)
        Sort Key: g.retard_depuis, (GREATEST(conversations.last_message_at, CASE WHEN (g.snoozed_until <= '2026-11-19 02:46:50'::timestamp without time zone) THEN g.snoozed_until ELSE NULL::timestamp without time zone EN …
        Sort Method: quicksort  Memory: 30kB
        Buffers: shared hit=1253, local hit=76
        ->  Nested Loop  (cost=65.51..19449.03 rows=58 width=358) (actual time=1.372..5.184 rows=18 loops=1)
              Buffers: shared hit=1253, local hit=76
              ->  Merge Semi Join  (cost=0.70..132.18 rows=58 width=222) (actual time=0.222..0.748 rows=58 loops=1)
                    Merge Cond: (conversations.id = conversation_participants.conversation_id)
                    Buffers: shared hit=34
                    ->  Index Scan using conversations_pkey on conversations  (cost=0.28..49.72 rows=776 width=222) (actual time=0.061..0.357 rows=735 loops=1)
                          Filter: (deleted_at IS NULL)
                          Buffers: shared hit=21
                    ->  Nested Loop  (cost=0.42..79.79 rows=58 width=8) (actual time=0.128..0.286 rows=58 loops=1)
                          Buffers: shared hit=13
                          ->  Index Scan using conversation_participants_user_id_conversation_id_index on conversation_participants  (cost=0.28..70.90 rows=58 width=16) (actual time=0.071..0.109 rows=58 loops=1)
                                Index Cond: (user_id = '58'::bigint)
                                Filter: (left_at IS NULL)
                                Buffers: shared hit=11
                          ->  Materialize  (cost=0.14..8.17 rows=1 width=8) (actual time=0.001..0.001 rows=1 loops=58)
                                Buffers: shared hit=2
                                ->  Index Scan using users_pkey on users  (cost=0.14..8.16 rows=1 width=8) (actual time=0.038..0.038 rows=1 loops=1)
                                      Index Cond: (id = '58'::bigint)
                                      Filter: (deleted_at IS NULL)
                                      Buffers: shared hit=2
              ->  Subquery Scan on g  (cost=64.81..333.03 rows=1 width=128) (actual time=0.075..0.076 rows=0 loops=58)
                    Filter: (CASE WHEN (g.snoozed_until > '2026-11-19 02:46:50'::timestamp without time zone) THEN 'rappel'::text WHEN (g.retard_depuis IS NOT NULL) THEN 'retard'::text WHEN ((g.msg_autre OR (g.evt_moi_de …
                    Rows Removed by Filter: 1
                    Buffers: shared hit=1219, local hit=76
                    ->  Subquery Scan on f  (cost=64.81..224.43 rows=1 width=71) (actual time=0.064..0.064 rows=1 loops=58)
                          Buffers: shared hit=1118, local hit=58
                          ->  Nested Loop Left Join  (cost=64.81..203.73 rows=1 width=52) (actual time=0.029..0.030 rows=1 loops=58)
                                Buffers: shared hit=859
                                InitPlan 8
                                  ->  Nested Loop Left Join  (cost=0.42..23.04 rows=1 width=8) (never executed)
                                        ->  Nested Loop Left Join  (cost=0.28..14.83 rows=1 width=16) (never executed)
                                              ->  Seq Scan on maintenance_requests smr  (cost=0.00..6.51 rows=1 width=16) (never executed)
                                                    Filter: (id = conversations.subject_id)
                                              ->  Index Scan using properties_pkey on properties smp  (cost=0.28..8.29 rows=1 width=16) (never executed)
                                                    Index Cond: (id = smr.property_id)
                                        ->  Index Scan using leases_pkey on leases sml  (cost=0.15..8.17 rows=1 width=16) (never executed)
                                              Index Cond: (id = smr.lease_id)
                                InitPlan 9
                                  ->  Index Scan using leases_pkey on leases sl  (cost=0.15..8.17 rows=1 width=8) (actual time=0.006..0.006 rows=1 loops=23)
                                        Index Cond: (id = conversations.subject_id)
                                        Buffers: shared hit=46
                                InitPlan 10
                                  ->  Index Scan using bookings_pkey on bookings sb  (cost=0.27..8.29 rows=1 width=8) (actual time=0.011..0.011 rows=1 loops=21)
                                        Index Cond: (id = conversations.subject_id)
                                        Buffers: shared hit=63
                                InitPlan 11
                                  ->  Index Scan using properties_pkey on properties fp  (cost=0.28..8.29 rows=1 width=8) (actual time=0.009..0.009 rows=0 loops=14)
                                        Index Cond: (id = conversations.property_id)
                                        Buffers: shared hit=18
                                InitPlan 12
                                  ->  Index Scan using leases_pkey on leases fl  (cost=0.15..8.17 rows=1 width=8) (actual time=0.003..0.003 rows=0 loops=8)
                                        Index Cond: (id = conversations.lease_id)
                                InitPlan 13
                                  ->  Index Scan using conversation_participants_user_id_conversation_id_index on conversation_participants ap  (cost=0.28..8.30 rows=1 width=0) (never executed)
                                        Index Cond: ((user_id = conversations.assigned_to_id) AND (conversation_id = conversations.id))
                                        Filter: (left_at IS NULL)
                                ->  Index Scan using conversation_participants_user_id_conversation_id_index on conversation_participants lp  (cost=0.28..8.30 rows=1 width=24) (actual time=0.003..0.003 rows=1 loops=58)
                                      Index Cond: ((user_id = '58'::bigint) AND (conversation_id = conversations.id))
                                      Buffers: shared hit=174
                                ->  Limit  (cost=0.28..8.30 rows=1 width=24) (actual time=0.005..0.005 rows=0 loops=58)
                                      Buffers: shared hit=130
                                      ->  Index Scan Backward using messages_conversation_visibility_idx on messages m  (cost=0.28..8.30 rows=1 width=24) (actual time=0.005..0.005 rows=0 loops=58)
                                            Index Cond: ((conversation_id = lp.conversation_id) AND ((visibility)::text = 'all'::text))
                                            Filter: ((deleted_at IS NULL) AND ((type)::text <> ALL ('{system,event}'::text[])))
                                            Buffers: shared hit=130
                                SubPlan 14
                                  ->  Aggregate  (cost=47.63..47.64 rows=1 width=8) (actual time=0.004..0.004 rows=1 loops=58)
                                        Buffers: shared hit=135
                                        ->  Nested Loop Anti Join  (cost=0.56..47.63 rows=1 width=8) (actual time=0.003..0.003 rows=0 loops=58)
                                              Buffers: shared hit=135
                                              ->  Index Scan using messages_conversation_visibility_idx on messages messages_1  (cost=0.28..27.97 rows=1 width=56) (actual time=0.003..0.003 rows=0 loops=58)
                                                    Index Cond: (conversation_id = lp.conversation_id)
                                                    Filter: ((deleted_at IS NULL) AND ((lp.handled_at IS NULL) OR (created_at > lp.handled_at)) AND ((type)::text = 'event'::text) AND ((metadata -> 'action_for'::text) @>  …
                                                    Rows Removed by Filter: 4
                                                    Buffers: shared hit=135
                                              ->  Index Scan using messages_conversation_visibility_idx on messages suivant_1  (cost=0.28..19.65 rows=1 width=48) (never executed)
                                                    Index Cond: ((conversation_id = lp.conversation_id) AND (id > messages_1.id))
                                                    Filter: ((deleted_at IS NULL) AND ((type)::text = 'event'::text) AND ((metadata -> 'object'::text) = (messages_1.metadata -> 'object'::text)) AND (((metadata -> 'action …
                                SubPlan 16
                                  ->  Nested Loop Semi Join  (cost=0.56..75.21 rows=1 width=0) (actual time=0.006..0.006 rows=0 loops=58)
                                        Join Filter: (((messages_2.metadata -> 'action_for'::text) @> to_jsonb(autre.user_id)) AND (NOT EXISTS(SubPlan 15)))
                                        Buffers: shared hit=293
                                        ->  Index Scan using conversation_participants_conversation_id_user_id_unique on conversation_participants autre  (cost=0.28..10.78 rows=2 width=8) (actual time=0.002..0.003 rows=1 …
                                              Index Cond: (conversation_id = lp.conversation_id)
                                              Filter: ((left_at IS NULL) AND (user_id <> '58'::bigint))
                                              Rows Removed by Filter: 1
                                              Buffers: shared hit=174
                                        ->  Materialize  (cost=0.28..27.87 rows=1 width=48) (actual time=0.002..0.002 rows=0 loops=73)
                                              Buffers: shared hit=119
                                              ->  Index Scan using messages_conversation_visibility_idx on messages messages_2  (cost=0.28..27.86 rows=1 width=48) (actual time=0.002..0.002 rows=0 loops=50)
                                                    Index Cond: (conversation_id = conversations.id)
                                                    Filter: ((deleted_at IS NULL) AND ((lp.handled_at IS NULL) OR (created_at > lp.handled_at)) AND ((type)::text = 'event'::text))
                                                    Rows Removed by Filter: 4
                                                    Buffers: shared hit=119
                                        SubPlan 15
                                          ->  Index Scan using messages_conversation_visibility_idx on messages suivant_2  (cost=0.28..18.26 rows=1 width=0) (never executed)
                                                Index Cond: ((conversation_id = messages_2.conversation_id) AND (id > messages_2.id))
                                                Filter: ((deleted_at IS NULL) AND ((type)::text = 'event'::text) AND ((metadata -> 'object'::text) = (messages_2.metadata -> 'object'::text)) AND (((metadata -> 'action_for …
                          SubPlan 4
                            ->  Aggregate  (cost=4.00..4.01 rows=1 width=8) (actual time=0.018..0.018 rows=1 loops=58)
                                  Buffers: local hit=58
                                  ->  Seq Scan on commitments ce  (cost=0.00..4.00 rows=1 width=8) (actual time=0.013..0.016 rows=0 loops=58)
                                        Filter: ((due_at < '2026-11-19 02:46:50'::timestamp without time zone) AND ((beneficiary_id = 58) OR f.equipe) AND (conversation_id = conversations.id) AND ((status)::text = 'open' …
                                        Rows Removed by Filter: 100
                                        Buffers: local hit=58
                          SubPlan 7
                            ->  Aggregate  (cost=16.64..16.65 rows=1 width=8) (actual time=0.013..0.014 rows=1 loops=58)
                                  Buffers: shared hit=259
                                  InitPlan 6
                                    ->  Result  (cost=8.31..8.32 rows=1 width=8) (actual time=0.008..0.008 rows=1 loops=58)
                                          Buffers: shared hit=134
                                          InitPlan 5
                                            ->  Limit  (cost=0.28..8.31 rows=1 width=8) (actual time=0.003..0.003 rows=0 loops=58)
                                                  Buffers: shared hit=134
                                                  ->  Index Scan Backward using messages_conversation_visibility_idx on messages mm  (cost=0.28..8.31 rows=1 width=8) (actual time=0.002..0.002 rows=0 loops=58)
                                                        Index Cond: ((conversation_id = conversations.id) AND ((visibility)::text = 'all'::text))
                                                        Filter: ((deleted_at IS NULL) AND ((type)::text <> ALL ('{system,event}'::text[])) AND COALESCE(CASE WHEN f.equipe THEN (sender_id = ANY ('{25,26,27,39,57,58}'::big …
                                                        Rows Removed by Filter: 1
                                                        Buffers: shared hit=134
                                  ->  Index Scan using messages_conversation_visibility_idx on messages ma  (cost=0.28..8.31 rows=1 width=8) (actual time=0.002..0.002 rows=1 loops=58)
                                        Index Cond: ((conversation_id = conversations.id) AND ((visibility)::text = 'all'::text) AND (id > COALESCE((InitPlan 6).col1, '0'::bigint)))
                                        Filter: ((deleted_at IS NULL) AND ((type)::text <> ALL ('{system,event}'::text[])) AND ((f.handled_at IS NULL) OR (created_at > f.handled_at)) AND (NOT COALESCE(CASE WHEN f.equipe  …
                                        Buffers: shared hit=125
                    SubPlan 2
                      ->  Aggregate  (cost=106.06..106.07 rows=1 width=32) (actual time=0.008..0.008 rows=1 loops=18)
                            Buffers: shared hit=101
                            ->  Index Scan using conversation_participants_conversation_id_user_id_unique on conversation_participants q  (cost=0.28..106.05 rows=1 width=8) (actual time=0.007..0.007 rows=0 loops=18)
                                  Index Cond: (conversation_id = conversations.id)
                                  Filter: ((left_at IS NULL) AND (user_id <> '58'::bigint) AND ((g.msg_moi AND (NOT COALESCE(CASE WHEN g.equipe THEN (user_id = ANY ('{25,26,27,39,57,58}'::bigint[])) ELSE (user_id = 58) E …
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=101
                                  SubPlan 1
                                    ->  Nested Loop Anti Join  (cost=0.56..47.63 rows=1 width=0) (actual time=0.002..0.002 rows=0 loops=22)
                                          Buffers: shared hit=47
                                          ->  Index Scan using messages_conversation_visibility_idx on messages  (cost=0.28..27.97 rows=1 width=48) (actual time=0.002..0.002 rows=0 loops=22)
                                                Index Cond: (conversation_id = conversations.id)
                                                Filter: ((deleted_at IS NULL) AND ((g.handled_at IS NULL) OR (created_at > g.handled_at)) AND ((type)::text = 'event'::text) AND ((metadata -> 'action_for'::text) @> to_jso …
                                                Rows Removed by Filter: 2
                                                Buffers: shared hit=47
                                          ->  Index Scan using messages_conversation_visibility_idx on messages suivant  (cost=0.28..19.65 rows=1 width=48) (never executed)
                                                Index Cond: ((conversation_id = conversations.id) AND (id > messages.id))
                                                Filter: ((deleted_at IS NULL) AND ((type)::text = 'event'::text) AND ((metadata -> 'object'::text) = (messages.metadata -> 'object'::text)) AND (((metadata -> 'action_for': …
                    SubPlan 3
                      ->  Limit  (cost=2.51..2.52 rows=1 width=48) (actual time=0.023..0.023 rows=1 loops=18)
                            Buffers: local hit=18
                            ->  Sort  (cost=2.51..2.52 rows=1 width=48) (actual time=0.022..0.022 rows=1 loops=18)
                                  Sort Key: cp.due_at, cp.id
                                  Sort Method: quicksort  Memory: 25kB
                                  Buffers: local hit=18
                                  ->  Seq Scan on commitments cp  (cost=0.00..2.50 rows=1 width=48) (actual time=0.010..0.017 rows=1 loops=18)
                                        Filter: ((conversation_id = conversations.id) AND ((status)::text = 'open'::text))
                                        Rows Removed by Filter: 99
                                        Buffers: local hit=18
Planning:
  Buffers: shared hit=993
Planning Time: 23.417 ms
Execution Time: 6.931 ms
```

Plan des comptes (`meta.counts` + `gestes`) :

```
Aggregate  (cost=12108.45..12108.46 rows=1 width=40) (actual time=3.141..3.149 rows=1 loops=1)
  Buffers: shared hit=884, local hit=58
  ->  Nested Loop Left Join  (cost=96.73..12107.00 rows=58 width=33) (actual time=0.204..3.114 rows=58 loops=1)
        Buffers: shared hit=884, local hit=58
        ->  Hash Semi Join  (cost=31.92..54.58 rows=58 width=46) (actual time=0.128..0.371 rows=58 loops=1)
              Hash Cond: (conversations.id = conversation_participants.conversation_id)
              Buffers: shared hit=25
              ->  Seq Scan on conversations  (cost=0.00..19.76 rows=776 width=46) (actual time=0.013..0.173 rows=776 loops=1)
                    Filter: (deleted_at IS NULL)
                    Buffers: shared hit=12
              ->  Hash  (cost=31.19..31.19 rows=58 width=8) (actual time=0.080..0.082 rows=58 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 11kB
                    Buffers: shared hit=13
                    ->  Nested Loop  (cost=4.87..31.19 rows=58 width=8) (actual time=0.036..0.071 rows=58 loops=1)
                          Buffers: shared hit=13
                          ->  Index Scan using users_pkey on users  (cost=0.14..8.16 rows=1 width=8) (actual time=0.012..0.013 rows=1 loops=1)
                                Index Cond: (id = '58'::bigint)
                                Filter: (deleted_at IS NULL)
                                Buffers: shared hit=2
                          ->  Bitmap Heap Scan on conversation_participants  (cost=4.73..22.45 rows=58 width=16) (actual time=0.022..0.049 rows=58 loops=1)
                                Recheck Cond: (user_id = '58'::bigint)
                                Filter: (left_at IS NULL)
                                Heap Blocks: exact=9
                                Buffers: shared hit=11
                                ->  Bitmap Index Scan on conversation_participants_user_archived_index  (cost=0.00..4.71 rows=58 width=0) (actual time=0.012..0.012 rows=58 loops=1)
                                      Index Cond: (user_id = '58'::bigint)
                                      Buffers: shared hit=2
        ->  Subquery Scan on g  (cost=64.81..207.79 rows=1 width=33) (actual time=0.035..0.036 rows=1 loops=58)
              Buffers: shared hit=859, local hit=58
              ->  Subquery Scan on f  (cost=64.81..207.78 rows=1 width=63) (actual time=0.035..0.035 rows=1 loops=58)
                    Buffers: shared hit=859, local hit=58
                    ->  Nested Loop Left Join  (cost=64.81..203.73 rows=1 width=52) (actual time=0.018..0.018 rows=1 loops=58)
                          Buffers: shared hit=859
                          InitPlan 2
                            ->  Nested Loop Left Join  (cost=0.42..23.04 rows=1 width=8) (never executed)
                                  ->  Nested Loop Left Join  (cost=0.28..14.83 rows=1 width=16) (never executed)
                                        ->  Seq Scan on maintenance_requests smr  (cost=0.00..6.51 rows=1 width=16) (never executed)
                                              Filter: (id = conversations.subject_id)
                                        ->  Index Scan using properties_pkey on properties smp  (cost=0.28..8.29 rows=1 width=16) (never executed)
                                              Index Cond: (id = smr.property_id)
                                  ->  Index Scan using leases_pkey on leases sml  (cost=0.15..8.17 rows=1 width=16) (never executed)
                                        Index Cond: (id = smr.lease_id)
                          InitPlan 3
                            ->  Index Scan using leases_pkey on leases sl  (cost=0.15..8.17 rows=1 width=8) (actual time=0.002..0.002 rows=1 loops=23)
                                  Index Cond: (id = conversations.subject_id)
                                  Buffers: shared hit=46
                          InitPlan 4
                            ->  Index Scan using bookings_pkey on bookings sb  (cost=0.27..8.29 rows=1 width=8) (actual time=0.002..0.002 rows=1 loops=21)
                                  Index Cond: (id = conversations.subject_id)
                                  Buffers: shared hit=63
                          InitPlan 5
                            ->  Index Scan using properties_pkey on properties fp  (cost=0.28..8.29 rows=1 width=8) (actual time=0.001..0.001 rows=0 loops=14)
                                  Index Cond: (id = conversations.property_id)
                                  Buffers: shared hit=18
                          InitPlan 6
                            ->  Index Scan using leases_pkey on leases fl  (cost=0.15..8.17 rows=1 width=8) (actual time=0.000..0.000 rows=0 loops=8)
                                  Index Cond: (id = conversations.lease_id)
                          InitPlan 7
                            ->  Index Scan using conversation_participants_user_id_conversation_id_index on conversation_participants ap  (cost=0.28..8.30 rows=1 width=0) (never executed)
                                  Index Cond: ((user_id = conversations.assigned_to_id) AND (conversation_id = conversations.id))
                                  Filter: (left_at IS NULL)
                          ->  Index Scan using conversation_participants_user_id_conversation_id_index on conversation_participants lp  (cost=0.28..8.30 rows=1 width=25) (actual time=0.002..0.003 rows=1 loops=58)
                                Index Cond: ((user_id = '58'::bigint) AND (conversation_id = conversations.id))
                                Buffers: shared hit=174
                          ->  Limit  (cost=0.28..8.30 rows=1 width=24) (actual time=0.002..0.002 rows=0 loops=58)
                                Buffers: shared hit=130
                                ->  Index Scan Backward using messages_conversation_visibility_idx on messages m  (cost=0.28..8.30 rows=1 width=24) (actual time=0.002..0.002 rows=0 loops=58)
                                      Index Cond: ((conversation_id = lp.conversation_id) AND ((visibility)::text = 'all'::text))
                                      Filter: ((deleted_at IS NULL) AND ((type)::text <> ALL ('{system,event}'::text[])))
                                      Buffers: shared hit=130
                          SubPlan 8
                            ->  Aggregate  (cost=47.63..47.64 rows=1 width=8) (actual time=0.002..0.003 rows=1 loops=58)
                                  Buffers: shared hit=135
                                  ->  Nested Loop Anti Join  (cost=0.56..47.63 rows=1 width=8) (actual time=0.002..0.002 rows=0 loops=58)
                                        Buffers: shared hit=135
                                        ->  Index Scan using messages_conversation_visibility_idx on messages  (cost=0.28..27.97 rows=1 width=56) (actual time=0.002..0.002 rows=0 loops=58)
                                              Index Cond: (conversation_id = lp.conversation_id)
                                              Filter: ((deleted_at IS NULL) AND ((lp.handled_at IS NULL) OR (created_at > lp.handled_at)) AND ((type)::text = 'event'::text) AND ((metadata -> 'action_for'::text) @> to_jso …
                                              Rows Removed by Filter: 4
                                              Buffers: shared hit=135
                                        ->  Index Scan using messages_conversation_visibility_idx on messages suivant  (cost=0.28..19.65 rows=1 width=48) (never executed)
                                              Index Cond: ((conversation_id = lp.conversation_id) AND (id > messages.id))
                                              Filter: ((deleted_at IS NULL) AND ((type)::text = 'event'::text) AND ((metadata -> 'object'::text) = (messages.metadata -> 'object'::text)) AND (((metadata -> 'action_for'::t …
                          SubPlan 10
                            ->  Nested Loop Semi Join  (cost=0.56..75.21 rows=1 width=0) (actual time=0.006..0.006 rows=0 loops=58)
                                  Join Filter: (((messages_1.metadata -> 'action_for'::text) @> to_jsonb(autre.user_id)) AND (NOT EXISTS(SubPlan 9)))
                                  Buffers: shared hit=293
                                  ->  Index Scan using conversation_participants_conversation_id_user_id_unique on conversation_participants autre  (cost=0.28..10.78 rows=2 width=8) (actual time=0.002..0.003 rows=1 loops …
                                        Index Cond: (conversation_id = lp.conversation_id)
                                        Filter: ((left_at IS NULL) AND (user_id <> '58'::bigint))
                                        Rows Removed by Filter: 1
                                        Buffers: shared hit=174
                                  ->  Materialize  (cost=0.28..27.87 rows=1 width=48) (actual time=0.002..0.002 rows=0 loops=73)
                                        Buffers: shared hit=119
                                        ->  Index Scan using messages_conversation_visibility_idx on messages messages_1  (cost=0.28..27.86 rows=1 width=48) (actual time=0.002..0.002 rows=0 loops=50)
                                              Index Cond: (conversation_id = conversations.id)
                                              Filter: ((deleted_at IS NULL) AND ((lp.handled_at IS NULL) OR (created_at > lp.handled_at)) AND ((type)::text = 'event'::text))
                                              Rows Removed by Filter: 4
                                              Buffers: shared hit=119
                                  SubPlan 9
                                    ->  Index Scan using messages_conversation_visibility_idx on messages suivant_1  (cost=0.28..18.26 rows=1 width=0) (never executed)
                                          Index Cond: ((conversation_id = messages_1.conversation_id) AND (id > messages_1.id))
                                          Filter: ((deleted_at IS NULL) AND ((type)::text = 'event'::text) AND ((metadata -> 'object'::text) = (messages_1.metadata -> 'object'::text)) AND (((metadata -> 'action_for'::tex …
                    SubPlan 1
                      ->  Aggregate  (cost=4.00..4.01 rows=1 width=8) (actual time=0.015..0.015 rows=1 loops=58)
                            Buffers: local hit=58
                            ->  Seq Scan on commitments ce  (cost=0.00..4.00 rows=1 width=8) (actual time=0.012..0.014 rows=0 loops=58)
                                  Filter: ((due_at < '2026-11-19 02:46:50'::timestamp without time zone) AND ((beneficiary_id = 58) OR f.equipe) AND (conversation_id = conversations.id) AND ((status)::text = 'open'::text …
                                  Rows Removed by Filter: 100
                                  Buffers: local hit=58
Planning:
  Buffers: shared hit=31
Planning Time: 3.606 ms
Execution Time: 3.413 ms
```

---
id: TCK-2744
title: "Un agent n'a qu'une visite confirmée à la fois : chaque écriture qui pose un agent et une heure refuse le chevauchement de ses visites, pas seulement de celles du bien"
status: todo
phase: P2
family: bug
estimate: M
wave: null
created: 2026-11-11
updated: 2026-11-11
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
tags: [back, visits, planification, agent, chevauchement, suivi-lot-2]
---

## Objectif utilisateur

Quand l'agence confirme, planifie, déplace ou attribue une visite, l'agent n'est jamais attendu à deux endroits à la
même heure. Aujourd'hui, la grille des créneaux (TCK-2585) tient compte des visites de l'agent, mais aucune écriture
ne refuse ce chevauchement. Un admin qui confirme la demande d'un collègue, qui l'attribue ou qui planifie pour lui
peut lui donner deux visites confirmées à 10:00, sur deux biens différents.

## Contrat de données

Aucune migration ni aucune route nouvelle : on ajoute un refus aux écritures existantes de
`PropertyVisitController` et `VisitSchedulingService`.

**Prémisse remesurée sur `abd3c4768`** par un test jetable (une exécution, puis supprimé). Décor : l'agent X a une
visite confirmée de 10:00 à 10:30 sur le bien B ; chaque écriture ci-dessous porte X sur le bien A à 10:00.

| Chemin d'écriture qui pose un agent et une heure | Garde de chevauchement aujourd'hui | Mesuré |
|---|---|---|
| `POST /api/property-visits` par le personnel (`planForCustomer` → `createConfirmedOrFail`) ; la visite naît confirmée, avec l'agent donné ou l'appelant | bien seul (`assertNoOverlap`, sous verrou) | 201 ; X a 2 visites confirmées à 10:00 |
| `POST /api/property-visits/{visit}/confirm` (`confirmOrFail`) | bien seul, sous verrou | 200 |
| `POST /api/property-visits/bulk-confirm`, ligne par ligne (`confirmOrFail`) | bien seul | 2 lignes du même agent à 11:00 sur deux biens : `ok: 2, failed: 0` ; X a 2 visites confirmées à 11:00 |
| `PUT/PATCH /api/property-visits/{visit}` : `agent_id` changé sur une visite **confirmée** | **aucune** | 200 ; l'agent passe à X |
| `PUT/PATCH /api/property-visits/{visit}` : `scheduled_at` ou `duration_minutes` sur une visite **confirmée** | bien seul, **sans verrou** | 200 ; la visite de X passe de 12:00 à 10:00 |
| `POST /api/property-visits/bulk-assign` sur une visite **confirmée** | **aucune** | `ok: 1` ; l'agent passe à X |
| `POST /api/property-visits/{visit}/claim` d'une visite **confirmée** sans agent | **aucune** | 200 |

**Chemins qui n'occupent aucun créneau**, donc hors de cette règle : ils posent une visite `scheduled`, et le refus
interviendra à la confirmation.
- `POST /api/property-visits` par un client pour lui-même (`createOrFail`, `agent_id` null) ;
- `POST /api/public/properties/{slug}/visit-request` (`createOrFail`, agent = contact principal, statut `scheduled`) ;
- `POST /api/property-visits/{visit}/reschedule` (`rescheduleOrFail`, qui repasse la visite en `scheduled`).

**Bornes mesurées sur la garde du bien, qui reste inchangée.** Une visite qui finit quand la suivante commence est
acceptée, avant comme après (09:30 + 30 min et 10:30 → 201). Un chevauchement d'une minute est refusé (10:29 → 422
`visit.slot_overlap`). La grille de l'agent dit la même chose (`agent_id=X` : 09:30 libre, 10:00 prise, 10:30 libre).
La règle neuve reprend exactement ces bornes, c'est-à-dire l'intervalle semi-ouvert de `assertNoOverlap`.

## Direction UX / Artistique

Sans objet : le ticket est côté back. Le front n'a qu'à dire le nouveau refus, voir le Delta.

## Contraintes strictes (métier)

- **Une visite occupe son agent** dès qu'elle est `confirmed`, qu'elle a une heure fixée (`preferred_window` nul) et
  qu'elle porte un agent. Les visites `scheduled`, `cancelled`, `completed` et `no_show`, ou demandées par tranche,
  n'occupent personne : c'est la même définition que celle qui occupe un bien.
- **La personne compte, pas l'agence.** Un agent membre du personnel de deux agences n'est pas à deux endroits à la
  fois. Le refus tient donc compte de toutes ses visites confirmées, quelle que soit l'agence du bien.
- **Le refus ne révèle rien de la visite qui occupe l'agent** : ni son id, ni le bien, ni l'agence, ni le visiteur. Il
  ne rend que le code et le message (même règle que la grille, qui ne dit ni qui ni pourquoi).
- **Le code d'erreur.** 422, avec un code propre, `visit.agent_overlap` : distinct de `visit.slot_overlap`, pour que
  le front dise « l'agent est déjà pris » et non « le bien est pris ». Quand le bien et l'agent sont pris tous les
  deux, c'est `visit.slot_overlap` qui sort, ce qui ne change pas le code d'aujourd'hui.
- **Une écriture refusée n'écrit rien.** Statut, agent, heure et durée relus inchangés. Aucun SMS ni aucune
  notification au visiteur ou à l'agent. Au chemin de planification qui part d'une demande de contact (TCK-2582), la
  demande reste non traitée et aucune fiche n'est convertie : le refus vit dans la transaction existante.
- **Point de sérialisation : la ligne `users` de l'agent**, verrouillée (`lockForUpdate`) dans la transaction qui lit
  ses visites puis écrit. Verrouiller les visites existantes ne ferme pas la course entre deux confirmations
  simultanées du même agent sur deux biens différents, puisque chacune verrouille son bien. C'est le patron de
  `takussan-api/CLAUDE.md`, « Migrations », piège n° 2 (la ligne parent).

## Delta à produire

- [ ] Service : `VisitSchedulingService::assertAgentFree(PropertyVisit $visit, ?int $agentId, ?Carbon $start, ?int $durationMinutes, bool $lockForUpdate)`.
  Elle verrouille la ligne de l'agent, puis cherche une visite confirmée, à heure fixée, de cet agent, différente de
  `$visit`, qui chevauche l'intervalle demandé ; si elle en trouve une, 422 `visit.agent_overlap`. Rien n'est vérifié
  quand l'agent ou l'heure manque.
- [ ] `createConfirmedOrFail`, `confirmOrFail` (donc `confirm` et `bulk-confirm`) : appel après `assertNoOverlap`,
  dans la même transaction.
- [ ] `PropertyVisitController::update` : sur une visite confirmée, appel quand `agent_id`, `scheduled_at` ou
  `duration_minutes` change, avec les valeurs **résultantes** (nouvel agent, nouvelle heure, nouvelle durée). Les
  deux gardes (bien et agent) et l'écriture passent dans une transaction, `assertNoOverlap` sous verrou compris.
- [ ] `bulkAssign` (par ligne, dans la `bulkRow`) et `claim` : appel quand la visite est confirmée.
- [ ] Langue API : `errors.visit.agent_overlap` dans `lang/{fr,en,wo}/errors.php`. Le wolof porte le texte français
  tel quel, comme l'exige la mise en pause du wolof. `LangGroupParity` reste vert.
- [ ] Front (intentionnel) : partout où `visit.slot_overlap` est dit aujourd'hui (feuille « Planifier une visite »),
  ainsi que dans les refus du lot de la liste des visites (`refus.<code>`) et dans les gestes unitaires (confirmer,
  attribuer, déplacer, prendre en charge), `visit.agent_overlap` se dit « L'agent est déjà pris à cette heure ».
  Ce n'est ni « refus.autre » ni un message générique. La feuille de planification relit alors les créneaux, comme
  pour le bien.
- [ ] Tests : `tests/Feature/Api/VisitAgentOverlapTest.php`, avec un cas par critère ci-dessous. Chaque refus est
  vérifié par ablation (garde retirée → rouge).

## Critères d'acceptation

Décor commun : l'agent X a une visite **confirmée** de 10:00 à 10:30 (J+2, heure de Dakar) sur le bien B de son
agence. Les écritures visent le bien A de la même agence, sauf mention contraire.

- [ ] **AC1 — confirmer.** Une demande à heure fixe à 10:00 sur A, attribuée à X, `POST …/confirm` → 422
  `visit.agent_overlap`. La visite relue reste `scheduled`, et aucun SMS ne part. Même résultat pour une demande par
  tranche confirmée avec `scheduled_at` à 10:00. La même demande à 10:30 → 200.
- [ ] **AC2 — confirmer en lot, à l'intérieur du lot.** X est libre. Deux demandes de X à 11:00, sur A et sur C, dans
  un même `bulk-confirm` → la première `ok: true`, la seconde `ok: false` avec `code: visit.agent_overlap`, `meta`
  `ok: 1, failed: 1`. En base, exactement une visite confirmée de X à 11:00.
- [ ] **AC3 — planifier.** `POST /api/property-visits` en admin avec `agent_id = X` à 10:00 → 422
  `visit.agent_overlap`, et aucune visite créée. Sans `agent_id`, quand l'appelant est lui-même pris à 10:00 (il
  devient l'agent par défaut) → 422. Avec `contact_lead_id` et `create_customer` : la demande reste non traitée et
  aucune fiche n'est créée.
- [ ] **AC4 — déplacer.** La visite confirmée de X à 12:00 sur A, `PATCH scheduled_at` à 10:00 → 422, et l'heure
  relue reste 12:00. La visite confirmée de X à 09:30 sur A, `PATCH duration_minutes` à 31 → 422 ; la même avec 30
  → 200. Un `PATCH` qui ne fait que repasser la durée actuelle de la visite → 200 : elle ne se chevauche pas
  elle-même.
- [ ] **AC5 — attribuer.** Une visite confirmée à 10:00 sur A, d'un autre agent :
  - `PATCH agent_id = X` → 422, et l'agent relu est inchangé ;
  - `bulk-assign` vers X → ligne `ok: false`, `code: visit.agent_overlap` ;
  - la même visite au statut `scheduled` → attribution acceptée (elle n'occupe personne).
- [ ] **AC6 — prendre en charge.** Une visite confirmée à 10:00 sur A sans agent, `claim` par X → 422 ; la même au
  statut `scheduled` → 200.
- [ ] **AC7 — bornes.**
  - Fin égale au début de la suivante : acceptée avant (09:30 + 30 min) comme après (10:30).
  - Une minute de chevauchement : refusée (10:29, ou 09:31 + 30 min).
  - Une durée nulle compte pour `DEFAULT_DURATION_MINUTES`, des deux côtés : une visite d'occupation à durée nulle
    à 10:00 refuse 10:29.
- [ ] **AC8 — ce qui n'occupe pas.** La visite de X sur B passée tour à tour en `cancelled`, `scheduled`,
  `completed`, `no_show`, ou portant une `preferred_window` → l'écriture d'AC1 est acceptée. Une visite sans agent
  n'est jamais refusée pour ce motif.
- [ ] **AC9 — parité avec la grille.** Sur le décor commun, `GET /api/property-visits/slots?agent_id=X` sur A rend 10:00
  `available: false` et 10:30 `available: true`. Confirmer à 10:00 est refusé (`visit.agent_overlap`), confirmer à
  10:30 est accepté. Une heure que la grille dit libre pour X n'est jamais refusée pour ce motif, et inversement.
- [ ] **AC10 — priorité des codes.** Si le bien **et** l'agent sont pris (la visite d'occupation est sur A), le refus
  est `visit.slot_overlap`, inchangé.
- [ ] **AC11 — d'une agence à l'autre, sans rien révéler.** X est aussi du personnel de l'agence 2, et sa visite
  confirmée de 10:00 est sur un bien de l'agence 2. Confirmer dans l'agence 1 à 10:00 → 422 `visit.agent_overlap`.
  Le corps de la réponse n'a que les clés `code` et `message` : ni id, ni titre de bien, ni agence.
- [ ] **AC12 — le verrou est pris.** Un test qui écoute les requêtes (`DB::listen`) pendant `confirm` voit un
  `select … from "users" … for update` sur la ligne de X **avant** la lecture de ses visites. Retirer le verrou fait
  rougir ce test.

## Hors périmètre

- **Les réattributions en masse** : passation d'un agent qui part (`AgentHandoverService`), reprise de mandat Radar
  (`RadarMandateTakeBack`, `RadarClaims`), suppression de compte (`AccountDeletionService`, qui vide `agent_id`). Une
  passation refusée pour un conflit d'agenda est une décision produit (bloquer, signaler, ou attribuer quand même et
  lister les conflits). Ticket à part si on la veut.
- Les visites en double **déjà présentes** en base : ni reprise ni détection.
- L'heure proposée par la liste des visites (« Confirmer 15:00 » d'après les créneaux de l'appelant) : défaut d1 de
  TCK-2587, corrigé dans ce ticket-là. Ce ticket-ci est le refus serveur qui tient même quand un client se trompe.
- La ligne de `docs/features.md` § 1.3 qui énonce la règle : elle suit par `/sync-specs` après la fusion.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

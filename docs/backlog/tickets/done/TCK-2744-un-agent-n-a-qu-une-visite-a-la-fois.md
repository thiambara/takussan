---
id: TCK-2744
title: "Un agent n'a qu'une visite confirmée à la fois : chaque écriture qui pose un agent et une heure refuse le chevauchement de ses visites, pas seulement de celles du bien"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-11-11
updated: 2026-11-12
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

**Le garde.** `VisitSchedulingService::assertAgentFree()` : verrou de la ligne `users` de l'agent, puis lecture de ses
visites qui occupent (confirmées, à heure fixée, la définition de `assertNoOverlap` et de `availableSlots`), toutes
agences confondues, intervalle semi-ouvert, durée absente = `DEFAULT_DURATION_MINUTES` des deux côtés (« durée nulle »
est lue comme `NULL`, la seule valeur que la grille et le garde du bien replient ; `duration_minutes` est validé ≥ 5).
Appelé après `assertNoOverlap` (le bien parle d'abord, AC10) dans `confirmOrFail` (donc `confirm` et `bulk-confirm`)
et `createConfirmedOrFail` ; dans `update` (valeurs résultantes) et dans `attribuer()` (`bulk-assign`, `claim`).

**L'ordre des verrous.** `update` et `attribuer()` verrouillent et relisent d'abord la ligne de la VISITE
(`relireSousVerrou`), puis l'agent : l'ordre de `confirmOrFail` (la visite, les visites confirmées du bien, l'agent).
Verrouiller l'agent d'abord pouvait croiser une confirmation concurrente qui tient déjà la visite (interblocage
PostgreSQL), et le statut se jugeait sur le modèle lu avant la transaction. Hors AC ; épinglé par
`test_prendre_en_charge_et_modifier_verrouillent_la_visite_avant_l_agent`. Le garde du bien d'`update` court
désormais sous verrou, dans la même transaction que l'écriture.

**Écart au delta, à trancher.** `update` juge l'agent dès que l'écriture PORTE `agent_id`, `scheduled_at` ou
`duration_minutes`, même inchangé (le delta dit « quand … change »). C'est ce qui donne un sens à l'AC4 « une durée
repassée telle quelle → 200 » (elle ne se chevauche pas elle-même : l'ablation de l'exclusion de soi rougit).
Conséquence : un `PATCH` qui repasse la même valeur sur une visite déjà en double (hors périmètre) est refusé.
Recommandation : garder, une écriture d'agenda qui porte l'heure se juge à l'heure.

**Visite confirmée à tranche.** Elle n'occupe personne (`preferred_window` non nul) : l'attribuer passe ; lui fixer
une heure par `PATCH scheduled_at` la juge (test dédié).

**Le front — non fait ici, en attente d'accord.** `CODES_ERREUR_BFF` ne s'applique pas : il ne liste que les codes
émis par le BFF lui-même ; `visit.agent_overlap` est un code de l'API, sa prose localisée (`lang/*/errors.php`,
`LangGroupParity` vert) est ce qu'affichent les gestes unitaires (`messageErreurApi` préfère la prose du serveur).
Restent deux retouches, dans des fichiers d'autres travaux en cours : la clé `visits.parLeTemps.refus.visit_agent_overlap`
(fr/en/wo, wo = fr) pour le lot, et `PlanifierUneVisite.tsx`, qui doit traiter `visit.agent_overlap` comme
`visit.slot_overlap` (erreur sous « Quelle heure ? », créneaux relus).

**Tests.** `tests/Feature/Api/VisitAgentOverlapTest.php` (15 tests, un par AC, plus la tranche et l'ordre des
verrous). 23 ablations, toutes rouges, chacune nommée par le test qui la voit : garde retiré ; appel retiré de
`confirmOrFail`, de `createConfirmedOrFail`, d'`update`, d'`attribuer()` ; sans exclusion de soi ; tranche ou tout
statut occupant ; durée absente nulle (occupation, demande) ; bornes fermées ; sans verrou ; agent avant bien ; agence
du bien seule ; ancienne heure, durée ou agent dans `update` ; attribution de tout statut ; sans relecture sous verrou
(`attribuer`, `update`) ; tranche occupante, heure fixée ignorée. Les 49 fichiers de test des visites et
`LangGroupParityTest`, joués un à un : verts.

**Spec.** La règle de `docs/features.md` § 1.3 suit par `/sync-specs`.

**d3 — l'effacement écrivait des biens après la ligne `users` (contre-vérification du 2026-11-12).**
`ErasedAccountListings::handle()` dépublie, en dernier geste d'`anonymize()`, les biens restés sans contact
(`$bien->update(…)`), et `TitulaireALaSaisie::delier()` délie les biens saisis pour l'invitation de bailleur que
l'effacement révoque (mise à jour de masse) : deux écritures sur `properties` APRÈS le verrou du compte, hors de la
passe des biens. Une écriture verrouille sa ligne comme un `for update`. Course mesurée par verif-commercial (s9 :
le compte, agent de l'agence ET titulaire d'un bien en ligne sans autre contact, effacé contre la confirmation d'une
visite de ce bien qui lui est attribuée) : **18 interblocages sur 20** avant, **0 sur 20** avec la requête de
`handle()` ajoutée à la passe triée. Correctif : `lockInGlobalOrder()` ajoute à sa passe unique, par les requêtes
mêmes qui écriront, `ErasedAccountListings::candidates()` (propriétaire ou collaborateur) et
`TitulaireALaSaisie::biensLies()` des invitations de bailleur ouvertes (`invitationsDeBailleurOuvertes()`, partagée
avec la révocation). `delier()` lui-même n'a pas été rejoué en course ; même mécanisme, même correctif.
Test : `OrdreDesVerrousDuRetraitTest::test_l_effacement_verrouille_aussi_les_biens_qu_il_depublie_et_ceux_qu_il_delie`
— chaque bien ÉCRIT (dépublié, collaboré, délié) figure dans la première passe, triée ; il ne compte pas les verrous,
l'épingle `DB::listen` ne voyant pas les `update`. Ablations 2/2 rouges (sans les candidats, sans les biens liés).

Autres appelants de `delier()`, relus : la purge des invitations expirées et la révocation (`InvitationService`)
verrouillent l'invitation puis écrivent les biens, sans ligne `users` ; l'acceptation (`PropertyOwnerTransfer::
aLAcceptation`, dans la transaction de `InvitationService` l. 1021) écrit le compte qui accepte puis les biens —
utilisateur → bien. Un cycle y demanderait que le bailleur qui accepte soit aussi l'agent d'une visite confirmée au
même instant sur un de ces biens : non mesuré, non corrigé ici, à reprendre s'il le faut par un ticket.

Harnais de course (hors dépôt, jamais un test) : `course.php` de la contre-vérification, scénarios s5 à s9, sur une
base jetable `UTF8/C` migrée (jamais `fresh`), SMS et WhatsApp en `log`, Scout `null`. Les courses ne se rejouent
pas en CI ; elles se relancent à la main quand un écrivain de ces tables change.

Piège n° 10 de `takussan-api/CLAUDE.md` complété : l'ordre se prolonge jusqu'à la délégation (TCK-2746), une
écriture verrouille comme un `for update`, et l'épingle ne voit pas les verrous implicites.

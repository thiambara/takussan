---
id: TCK-617
title: "Tableau de bord et agenda de l'agent : les visites d'une autre agence n'y passent plus, le lien d'agenda meurt avec la session volée, le pipeline compte enfin ses changements d'étape (suites de TCK-590, TCK-591 et TCK-595)"
status: todo
phase: P1
family: full
estimate: M
wave: 74
created: 2026-10-08
updated: 2026-10-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#16-crm--relation-client
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#21-authentification--comptes
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#72-calendarfeed-
    - docs/models-spec.md#7-customer
tags: [back, front, tableau-de-bord, agenda, ical, crm, cloisonnement, sessions, securite, activitylog]
---

# TCK-617 — Le tableau de bord et l'agenda de l'agent, cloisonnés

## Objectif utilisateur

Un agent qui travaille pour deux agences ne voit sur le tableau de bord de l'une que ce qui lui
appartient ; un utilisateur qui change son mot de passe après un vol de session coupe aussi le lien
d'agenda que le voleur a pu créer ; un manager lit un vrai nombre de changements d'étape du pipeline.

## Contexte

Suites relevées par les contre-vérifications de **TCK-590** (passe 5), **TCK-591** (passe 3, et le
relevé de tck-591), **TCK-589** (passe 4, observation 1, sur le lien d'agenda de 591) et **TCK-595**
(Notes du ticket, lot 15 « En suite »), consignées dans `FILE-D-ATTENTE.md` (« Points hors périmètre à
ticketer »).

**Re-mesure sur `839be671` (2026-10-08)** :

1. **Visites d'une autre agence sur le tableau de bord (590 p5).** `DashboardAgentService`
   (`takussan-api/app/Services/Dashboard/DashboardAgentService.php:82-85` pour `upcoming_visits`,
   `:139-150` pour `visits_today`) filtre `PropertyVisit` par `agent_id` **sans** agence : un agent
   retiré de X mais personnel de Y voit, sur le tableau de bord de Y, le titre des biens et le nom des
   clients de X. Les autres blocs sont bornés par `agency_id` (`:58-61`, `:236-249`).
2. **Le lien d'agenda survit au vol de session (589 p4, obs. 1).** Seul le blocage du compte par la
   console révoque les `CalendarFeed` (`takussan-api/app/Http/Controllers/Api/Admin/UserLifecycleController.php:47`).
   `PasswordResetController`, `SessionController` (révocation des sessions par l'utilisateur),
   `UserSupportService::revokeSessions` et `::forcePasswordReset`, `AccountDeletionService` n'y
   touchent pas (`grep -c CalendarFeed` : 0 dans chacun). Un lien `.ics` créé avec un jeton volé
   continue de livrer l'agenda (clients, adresses, horaires) après la reprise du compte.
3. **Le pipeline ne compte aucun changement d'étape (591).** `PipelineStatsService`
   (`takussan-api/app/Services/Crm/PipelineStatsService.php:107-109`) lit
   `properties->'old'->>'pipeline_stage'` ; spatie/activitylog est en **5.1.0** (`composer.lock`) et
   écrit les changements dans `attribute_changes` (`database/migrations/2026_04_17_154616_create_activity_log_table.php:18`) :
   `stage_changes_last_30d` vaut 0 quoi qu'il arrive. TCK-603 a payé le même écart dans sa commande de
   réparation.
4. **Libellé inexact (591 p3).** `POST /api/me/calendar-feed` sans profil choisi, par un agent de deux
   agences : 403 `calendar.feed_not_staff` (`takussan-api/app/Services/Calendar/CalendarFeedService.php:40-42`)
   — l'agent **est** du personnel, il n'a pas choisi d'agence. Comportement sûr, message faux.
5. **Liste et détail des tâches divergent (591 p3).** `GET /api/tasks` masque la tâche d'un parent
   supprimé en douceur (`TaskController.php:41`, `whereHasMorph` applique la portée de suppression),
   quand `GET /api/tasks/{id}` la rend au personnel légitime. Sens prudent, mais une tâche ouverte
   disparaît de la liste de son responsable.
6. **`/dashboard/me` sans `view_agency` (595, lot 15).** Les chiffres **non financiers** de l'agence
   y restent servis à un membre sans la capacité ; les financiers en ont été retirés par 595.

## Décision du porteur

- **Point 5** : une tâche dont le parent est supprimé reste-t-elle dans la liste de son responsable ?
  *Recommandation* : oui, marquée « parent supprimé » (la liste ⊇ ce que le détail rend), plutôt que
  de cacher du travail ouvert.
- **Point 6** : quels chiffres non financiers un membre sans `view_agency` lit-il sur `/dashboard/me` ?
  *Recommandation* : les siens seulement (ses visites, ses tâches, ses clients), jamais ceux de
  l'agence.
- **Tuile des commissions (595, lot 15)** — deux lectures à confirmer, sans code tant qu'elles le
  sont : le repli sur `commission_amount` pour un bail sans ligne du grand livre ; un bail dont toutes
  les lignes sont annulées garde sa base pleine (commission signée, pas versée).

## Contraintes strictes (métier)

1. Toute lecture du tableau de bord d'un agent se juge sur le couple (agent, agence active) —
   l'agence est la frontière d'isolation (principe n°2).
2. Les gestes qui révoquent les jetons d'un compte (réinitialisation du mot de passe, changement de
   mot de passe, révocation des sessions par l'utilisateur ou par le support, suppression du compte)
   révoquent **aussi** ses liens d'agenda, dans la même transaction. Un seul point les rassemble.
3. Le pipeline lit `attribute_changes` (activitylog 5.1) ; aucune autre lecture de
   `activity_log.properties` pour un changement d'attribut ne reste dans `app/`.
4. Libellés par codes, fr/en/wo.

## Delta à produire

- [ ] `DashboardAgentService` : visites bornées par l'agence active (via le bien).
- [ ] `App\Services\Auth\AccountTokenRevoker` (ou équivalent) : jetons Sanctum **et** `CalendarFeed`,
      appelé par les cinq gestes de la contrainte 2 et par le blocage de la console.
- [ ] `PipelineStatsService` : `attribute_changes`.
- [ ] `CalendarFeedService::issue` : code `calendar.feed_agency_required` quand l'utilisateur est du
      personnel d'au moins une agence sans en avoir choisi ; libellé front.
- [ ] Tâches et `/dashboard/me` : selon la décision.
- [ ] Tests : `DashboardAgentCrossAgencyTest`, `CalendarFeedRevocationTest`, `PipelineStatsTest`
      (changement d'étape réel), `CalendarFeedIssueTest`.

## Critères d'acceptation

- [ ] **AC1 (rouge sur `839be671`).** Agent retiré de X, personnel de Y, une visite demain sur un bien
      de X : `GET /api/dashboard/agent` dans Y ne la compte ni ne la liste.
- [ ] **AC2 (rouge sur `839be671`).** Lien d'agenda créé, puis réinitialisation du mot de passe par le
      lien d'oubli : `GET` du flux `.ics` → 404 (même réponse qu'un lien inconnu). Même résultat après
      chacun des autres gestes de la contrainte 2.
- [ ] **AC3 (garde).** Un test énumère les sites qui suppriment des jetons Sanctum
      (`grep -rln "tokens()->delete\|tokens()->where" app`, relu par le test) et affirme que chacun passe
      par le point commun. *Un sixième geste qui coupe les jetons sans couper l'agenda rougit.*
- [ ] **AC4 (rouge sur `839be671`).** Un client passe de `lead` à `qualified` : `stage_changes_last_30d`
      vaut 1. Aucune occurrence de `properties->'old'` ni `properties->'attributes'` dans `app/`.
- [ ] **AC5.** L'agent de deux agences sans profil choisi : 403 `calendar.feed_agency_required` ; un
      ex-agent sans agence : `calendar.feed_not_staff` (inchangé).
- [ ] **AC6 (décisions).** Tâches et `/dashboard/me` selon la décision, affirmés dans les deux sens.
- [ ] Ablations consignées.

## Hors périmètre

- Le flux iCal des biens (`PropertyCalendarFeed`, TCK-596) : il n'est pas personnel.
- Les chiffres financiers de `/dashboard/me` (TCK-595, fait).

## Notes d'implémentation

_(à remplir par implementing-specs)_

---
id: TCK-617
title: "Tableau de bord et agenda de l'agent : les visites d'une autre agence n'y passent plus, le lien d'agenda meurt avec la session volée, le pipeline compte enfin ses changements d'étape (suites de TCK-590, TCK-591 et TCK-595)"
status: todo
phase: P1
family: full
estimate: M
wave: 76
created: 2026-10-08
updated: 2026-11-16
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

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé.**

- Point 1 — **fermé par TCK-1361** (`fd7822238`, P127.05) : `DashboardAgentService` borne visites
  (`:124-131`, `:198-200`) par l'agence du bien ; « Aujourd'hui » (TCK-2596) lit `/api/property-visits`,
  borné par `VisitesLisibles` ; l'onglet Rapports (TCK-2628) lit `/api/dashboard/agent`. Test : `DashboardAgentAgencyBoundTest`.
- Point 2 — **fermé pour la seule suppression du compte** par TCK-2887 (ADR-0121, `29bf91335`) ; les
  autres sites qui coupent les jetons ne touchent toujours pas aux `CalendarFeed`.
- Point 3 — **fermé par TCK-985** (P56.01). Points 4 et 6 toujours vrais ; point 5 attend sa décision
  (TCK-2595 l'a laissé hors périmètre).

Reste à faire : point commun de révocation (Sanctum + `CalendarFeed`) branché sur les sites listés au
point 2, et sa garde AC3 ; code `calendar.feed_agency_required` + libellé ; points 5 et 6 selon décision.

**Décisions attendues du porteur** : (1) tâche d'un parent supprimé — (a) gardée dans la liste,
marquée, ou (b) masquée ? (2) admin d'agence sans `viewReports` sur `/dashboard/me` — (a) ses chiffres
seuls ou (b) inchangé ? (3) tuile des commissions — les deux lectures sont-elles confirmées ? (4) quels
gestes de la liste du point 2 doivent couper l'agenda — tous, ou lesquels ?

> **Mise à jour du 2026-11-10 (audit UX, familles 3 et 5).** La vue agent `/app/overview/agent`
> disparaît : son contenu se répartit entre **« Aujourd'hui »**, l'accueil de l'agent (**TCK-2596**),
> et l'onglet « Vue d'ensemble » de la page **Rapports** (**TCK-2628**). La règle du point 1 (les
> visites d'une autre agence n'y passent plus) doit tenir **sur ces deux pages** : à livrer avant
> TCK-2628, ou ses critères se vérifient sur les nouvelles adresses. **Le point 3 est déjà corrigé**
> (P56.01 : `PipelineStatsService` lit `attribute_changes`) ; le taux de conversion qui lit encore
> `updated_at` est repris par **TCK-2591**. ~~Les points 1, 2, 4 et 6 restent entiers ; le point 5
> attend toujours sa décision.~~ *Corrigé le 2026-11-16 :* le point 1 est corrigé (TCK-1361, P127.05 :
> visites bornées à l'agence active par le bien, sur `/dashboard/agent` donc sur l'onglet Rapports ;
> « Aujourd'hui » lit `/api/property-visits`, borné par `VisitesLisibles`). Le point 2 est corrigé pour
> la suppression du compte seulement (TCK-2887). Les points 2 (reste), 4 et 6 restent ; le point 5
> attend sa décision.

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
   — **fermé par TCK-1361** (P127.05) ; lignes ci-dessus périmées : aujourd'hui `:124-131` et `:198-200`.
2. **Le lien d'agenda survit au vol de session (589 p4, obs. 1).** Seul le blocage du compte par la
   console révoque les `CalendarFeed` (`takussan-api/app/Http/Controllers/Api/Admin/UserLifecycleController.php:49`).
   `PasswordResetController`, `SessionController` (révocation des sessions par l'utilisateur),
   `UserSupportService::revokeSessions` et `::forcePasswordReset` n'y
   touchent pas (`grep -c CalendarFeed` : 0 dans chacun). *2026-11-16 :* `AccountDeletionService`
   les révoque depuis TCK-2887 (`:388`), de même `AgencyMemberRemovalService` (`:100`) ; restent sans
   révocation `TeamMemberSuspensionService` (`:98`), `OwnerDepartureService` (`:76`),
   `PlatformProfileObserver` (`:28`) et `SuperAdminCooptationService` (`:280`), qui coupent aussi des jetons. Un lien `.ics` créé avec un jeton volé
   continue de livrer l'agenda (clients, adresses, horaires) après la reprise du compte.
3. **Le pipeline ne compte aucun changement d'étape (591).** `PipelineStatsService`
   (`takussan-api/app/Services/Crm/PipelineStatsService.php:107-109`) lit
   `properties->'old'->>'pipeline_stage'` ; spatie/activitylog est en **5.1.0** (`composer.lock`) et
   écrit les changements dans `attribute_changes` (`database/migrations/2026_04_17_154616_create_activity_log_table.php:18`) :
   `stage_changes_last_30d` vaut 0 quoi qu'il arrive. TCK-603 a payé le même écart dans sa commande de
   réparation. — **fermé par TCK-985** (P56.01).
4. **Libellé inexact (591 p3).** `POST /api/me/calendar-feed` sans profil choisi, par un agent de deux
   agences : 403 `calendar.feed_not_staff` (`takussan-api/app/Services/Calendar/CalendarFeedService.php:41-43`)
   — l'agent **est** du personnel, il n'a pas choisi d'agence. Comportement sûr, message faux.
5. **Liste et détail des tâches divergent (591 p3).** `GET /api/tasks` masque la tâche d'un parent
   supprimé en douceur (`Task::scopeParentAgencyIn`, `app/Models/Task.php:259-266`, appelé par `TaskController.php:48-49` :
   `orWhereHasMorph` applique la portée de suppression, quand `scopeParentInAgency` `:244-249` garde les parents supprimés),
   quand `GET /api/tasks/{id}` la rend au personnel légitime. Sens prudent, mais une tâche ouverte
   disparaît de la liste de son responsable.
6. **`/dashboard/me` sans `reports.view_agency` (595, lot 15).** ~~Les chiffres **non financiers** de l'agence
   y restent servis à un membre sans la capacité~~ *(2026-11-16)* : un agent n'y lit que ses chiffres
   (`AgentMeMetrics`, `SCOPE_MINE`) ; la question ne concerne plus que l'**admin d'agence** sans
   `viewReports` (`AgencyMeMetrics`, `Adapters/AgencyMeMetrics.php:25-39`), qui garde portefeuille et
   activité de l'agence. La capacité est `reports.view_agency` (`Capability::ReportsViewAgency`), la
   garde `AgencyPolicy::viewReports`. Les financiers en ont été retirés par 595.

## Décision du porteur

**Tranché le 2026-11-16 :**

1. **Tâche d'un parent supprimé** (bien, bail, client…) : **gardée et marquée** — ni supprimée, ni cachée.
2. **`/dashboard/me` de l'admin d'agence sans `viewReports`** (option a) : **ses chiffres seuls**
   (ses visites, ses tâches, ses clients…), comme un agent — jamais ceux de toute l'agence. Avec
   `reports.view_agency`, inchangé.
3. **Tuile des commissions** : **confirmée** telle que décrite (repli sur `commission_amount` sans
   ligne du grand livre ; base pleine quand toutes les lignes sont annulées). Aucun code.
4. **Tous les gestes de révocation** (retrait d'un agent, suspension, révocation ou fin d'une
   délégation, fin de profil, et ceux qui coupent les jetons) coupent l'accès à l'agenda du révoqué.

*Recommandations d'origine, pour mémoire :*

- **Point 5** : une tâche dont le parent est supprimé reste-t-elle dans la liste de son responsable ?
  *Recommandation* : oui, marquée « parent supprimé » (la liste ⊇ ce que le détail rend), plutôt que
  de cacher du travail ouvert.
- **Point 6** : quels chiffres non financiers un admin d'agence sans `viewReports` (`reports.view_agency`) lit-il sur `/dashboard/me` ?
  *Recommandation* : les siens seulement (ses visites, ses tâches, ses clients), jamais ceux de
  l'agence.
- **Tuile des commissions (595, lot 15)** — deux lectures à confirmer, sans code tant qu'elles le
  sont : le repli sur `commission_amount` pour un bail sans ligne du grand livre ; un bail dont toutes
  les lignes sont annulées garde sa base pleine (commission signée, pas versée).

## Contraintes strictes (métier)

1. Toute lecture du tableau de bord d'un agent se juge sur le couple (agent, agence active) —
   l'agence est la frontière d'isolation (principe n°2).
2. Les gestes qui révoquent les jetons d'un compte (réinitialisation du mot de passe par oubli —
   l'API n'a pas de changement de mot de passe connecté —, révocation des sessions par l'utilisateur ou
   par le support, suppression du compte ; et, relevés le 2026-11-16, suspension d'un membre d'équipe,
   départ d'un bailleur, retrait d'un profil plateforme, cooptation super-admin — lesquels doivent couper
   l'agenda est à trancher)
   révoquent **aussi** ses liens d'agenda, dans la même transaction. Un seul point les rassemble.
3. Le pipeline lit `attribute_changes` (activitylog 5.1) ; aucune autre lecture de
   `activity_log.properties` pour un changement d'attribut ne reste dans `app/`. (Tenu par TCK-985, relevé 2026-11-16.)
4. Libellés par codes, fr/en/wo.

## Delta à produire

- [x] `DashboardAgentService` : visites bornées par l'agence active (via le bien). (tenu par TCK-1361, relevé 2026-11-16)
- [x] `App\Services\Auth\AccountTokenRevoker` (ou équivalent) : jetons Sanctum **et** `CalendarFeed`,
      appelé par les gestes de la contrainte 2 (liste relevée le 2026-11-16) et par le blocage de la console.
- [x] `PipelineStatsService` : `attribute_changes`. (tenu par TCK-985, relevé 2026-11-16)
- [x] `CalendarFeedService::issue` : code `calendar.feed_agency_required` quand l'utilisateur est du
      personnel d'au moins une agence sans en avoir choisi ; libellé front.
- [x] Tâches et `/dashboard/me` : selon la décision.
- [x] Tests : `DashboardAgentCrossAgencyTest`, `CalendarFeedRevocationTest`, `PipelineStatsTest`
      (changement d'étape réel), `CalendarFeedIssueTest`.

## Critères d'acceptation

- [x] **AC1 (rouge sur `839be671`).** (tenu par TCK-1361, relevé 2026-11-16 — `DashboardAgentAgencyBoundTest`) Agent retiré de X, personnel de Y, une visite demain sur un bien
      de X : `GET /api/dashboard/agent` dans Y ne la compte ni ne la liste.
- [x] **AC2 (rouge sur `839be671`).** Lien d'agenda créé, puis réinitialisation du mot de passe par le
      lien d'oubli : `GET` du flux `.ics` → 404 (même réponse qu'un lien inconnu). Même résultat après
      chacun des autres gestes de la contrainte 2.
- [x] **AC3 (garde).** Un test énumère les sites qui suppriment des jetons Sanctum
      (`grep -rln "tokens()->delete\|tokens()->where" app`, relu par le test) et affirme que chacun passe
      par le point commun. *Un sixième geste qui coupe les jetons sans couper l'agenda rougit.*
- [x] **AC4 (rouge sur `839be671`).** (tenu par TCK-985, relevé 2026-11-16) Un client passe de `lead` à `qualified` : `stage_changes_last_30d`
      vaut 1. Aucune occurrence de `properties->'old'` ni `properties->'attributes'` dans `app/`.
- [x] **AC5.** L'agent de deux agences sans profil choisi : 403 `calendar.feed_agency_required` ; un
      ex-agent sans agence : `calendar.feed_not_staff` (inchangé).
- [x] **AC6 (décisions).** Tâches et `/dashboard/me` selon la décision, affirmés dans les deux sens.
- [x] Ablations consignées.

## Hors périmètre

- Le flux iCal des biens (`PropertyCalendarFeed`, TCK-596) : il n'est pas personnel.
- Les chiffres financiers de `/dashboard/me` (TCK-595, fait).

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- **Point commun** `App\Services\Auth\AccountTokenRevoker` (`revokeAll`, `revokeOne`, `revokeFeeds`),
  transactionnel : jetons Sanctum **et tous** les liens d'agenda du compte (on ne sait pas quelle
  session a créé un lien). Branché sur la réinitialisation par oubli, la révocation d'une session
  (titulaire et support), `revokeSessions`, la réinitialisation forcée, le blocage, la demande et
  l'exécution de l'effacement, `PlatformProfileObserver`, la cooptation retirée, le départ d'un
  bailleur, la suspension du dernier profil actif. ADR-0034 amendé.
- **Décision 4 au-delà des jetons** : la suspension révoque le lien de l'agence même quand le membre
  garde ses jetons ailleurs (et la voie `AgentInvitationService::suspend`) ; la fin ou l'expiration
  d'une délégation et le passage au rôle de bailleur (`UserRoleController`, `AgencyMemberRoleController`) révoquent le lien de l'agence si le
  titulaire n'y est plus personnel (`CalendarFeedService::revokeUnlessStaff`). Sans écriture, le lien
  éteint à la lecture revivait à la réactivation.
- **AC2** — `CalendarFeedRevocationTest` (13) : 404 du `.ics` après réinitialisation par oubli et
  révocation de session ; pour les autres gestes, la ligne écrite (`revoked_at`, copie chiffrée nulle)
  et le lien encore mort après réactivation / délégation neuve — le 404 seul serait vert sans
  correctif (`resolve()` refuse déjà le non-personnel). Départ d'un bailleur et cooptation retirée :
  couverts par le point commun et la garde AC3, sans test de lien propre. Ablations : point commun
  neutralisé → 5 rouges ; suspension → 1 ; voie `AgentProfileController` → 1 ; délégation → 2 ;
  changement de rôle → 1. ⚠ Révoquer UNE session coupe aussi les liens d'agenda de son titulaire.
- **AC3** — `tests/Feature/Architecture/AccountTokenRevokerGuardTest` lit le code de `app/`
  (commentaires retirés, instructions multilignes repliées) : `->tokens()…->delete()`,
  `PersonalAccessToken::…->delete()`, variable tirée de l'un ou l'autre puis supprimée,
  `currentAccessToken()->delete()`. Exemptions fermées et motivées : déconnexion, expiration par
  inactivité (`PruneIdleSessionTokens`, trouvée par la garde), fin d'impersonation. Ablation :
  `tokens()->delete()` réinjecté dans `PasswordResetController` → rouge.
- **AC5** — `CalendarFeedIssueTest` : 403 `calendar.feed_agency_required` (fr/en/wo) pour l'agent de
  deux agences sans espace choisi, `feed_not_staff` pour l'ex-agent ; le front l'affiche par sa clé
  `agentCrm.calendar.feed.agencyRequired`. Ablations API et front → rouge.
- **AC6, tâches** — `Task::scopeParentAgencyIn` (liste, agenda et flux `.ics`) et la branche du
  suppléant gardent le parent supprimé en douceur, comme la policy ; `parent_deleted` dans la réponse
  de `/api/tasks` et dans l'événement d'agenda (`property_id` nul), `taskable.label` reste nul ; le
  front écrit « Bien supprimé » / « Client supprimé » sans lien (ligne, fiche, tableau, en-tête de
  groupe). Un parent d'une autre agence, ou effacé pour de bon, reste hors liste et hors agenda.
  `TaskParentDeletedTest` (5), `LigneDeTache.tck-617.test.tsx` ; ablations (portée, marque d'agenda,
  marque front) → rouge.
- **AC6, `/dashboard/me`** — `DashboardRoleResolver` : l'admin d'une agence (non individuelle) sans
  `AgencyPolicy::viewReports` reçoit la vue d'agent (`AgentMeMetrics`, `role: agent`, portée « les
  miens ») ; avec la capacité, la vue d'agence. `DashboardMeAgencyAdminScopeTest` : sans capacité,
  `tasks_open` = 1 (la sienne ; les 2 d'un collègue n'y entrent pas), ni portefeuille ni consolidés ;
  avec, `role: agency_admin` et les 3 biens de l'agence. `DashboardAgencyAccessTest::test_m1_…` mis à
  jour (il épinglait l'ancienne lecture). Ablation (vue d'agence rendue sans condition) → rouge.

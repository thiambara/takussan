---
id: TCK-2855
title: "Ma journée, côté API : « 3 sans photo » et « 310 000 F à venir » sous les chiffres de l'agent, le prospect qui attend depuis le plus longtemps, et les biens à proposer à un client"
status: todo
phase: P1
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2856]
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#35-agentprofile-"
tags: [back, journee, agent, crm, rapprochement, audit-ux, app]
---

## Objectif utilisateur

L'agent qui a une journée libre se voit proposer un geste nominatif utile (« Ibrahima Sarr attend depuis 9 jours », « 3 biens à proposer à Mariama ») et lit sous ses chiffres ce qui demande son attention (« 3 sans photo », « 310 000 F à venir »).

## Contrat de données

Relevé le 2026-11-15 (`dev` 8c60f4c58) :

- `GET /api/dashboard/me` (agent) → `AgentMeMetrics` : `properties_managed`, `pipeline_total`, `tasks_open`, `commissions_month`… — **ni le compte des biens gérés sans photo, ni les commissions à venir** (`MesChiffres.tsx:54, 57`, contexte `null`). Écarté par TCK-2596 `hors_perimetre` « faute de donnée servie », sans suite.
- Rapprochement : `GET /api/customers/{customer}/matching-properties` (`ProspectMatchController::forCustomer`) — par client seulement ; rien ne choisit **quel** client a des biens à proposer.
- Clients à relancer : `filter[follow_up]=1&filter[referent]=me` rend un compte, pas le plus ancien nommé (`JourneeLibre.tsx:47`, texte fixe `relancerDetail`).

## Contraintes strictes (métier)

- `AgentMeMetrics` gagne :
  - `properties_without_photo` : biens que l'agent suit (définition de `TeamPerformanceService::managed`, sans la recopier) qui n'ont aucune photo publiée ;
  - `commissions_upcoming` : somme des commissions de l'agent dues et non versées (`CommissionEntry` au statut à venir), dans la devise de l'agence.
- `GET /api/dashboard/me?include=suggestions` (ou lecture dédiée sous `/api/me`) rend au plus :
  - `follow_up` : `{customer {id, full_name}, waiting_days}` — le client à relancer de l'agent qui attend depuis le plus longtemps ;
  - `matches` : `{customer {id, first_name}, count, sample [{id, title, neighborhood}]}` — le client de l'agent qui a le plus de biens rapprochés **non encore proposés**, par la même règle que `matching-properties` (sans la recopier), `count ≥ 1`.
- Cloisonnement : seulement les clients et biens de l'agence active que l'agent peut voir (`CustomerPolicy::view`).
- Coût : une lecture bornée (pas de rapprochement pour tous les clients à chaque appel : bornage documenté, cache court admis).

## Delta à produire

- [ ] Deux chiffres dans `AgentMeMetrics` / `DashboardAgentService`.
- [ ] Suggestions `follow_up` et `matches`.
- [ ] Tests `AgentDayMetricsTest` (biens sans photo, commissions à venir, cloisonnement) et `AgentDaySuggestionsTest` (le plus ancien à relancer ; le client aux biens les plus nombreux ; rien → clés `null` ; client d'un autre agent sans `crm.view_all` invisible).

## Critères d'acceptation

- [ ] AC1 — Agent qui suit 12 biens dont 3 sans photo : `properties_without_photo = 3`.
- [ ] AC2 — Commissions de l'agent : 310 000 F dues non versées, 90 000 F versées → `commissions_upcoming = 310000`.
- [ ] AC3 — Ibrahima Sarr à relancer depuis 9 jours, un autre depuis 2 : `suggestions.follow_up.customer.full_name = "Ibrahima Sarr"`, `waiting_days = 9`.
- [ ] AC4 — Mariama Fall avec 3 biens rapprochés à Mermoz et Ouakam : `suggestions.matches.count = 3`, deux quartiers dans `sample`.
- [ ] AC5 — Ablation : retirer le filtre de cloisonnement fait paraître le client d'un autre agent (test rouge).

## Hors périmètre

- L'écran : TCK-2856.

## Notes d'implémentation

Livré le 2026-11-15 (worktree `feat/audit-manques-2026-11-15`).

**Contrat servi.**
- `GET /api/dashboard/me` (agent) : `metrics.properties_without_photo` (int) et `metrics.commissions_upcoming`
  (décimal). Aussi sous `GET /api/dashboard/agent` : `properties_without_photo`, `finance.commissions_upcoming`,
  tous deux listés dans `period.as_of_today` (états du jour, la période ne les change pas).
- `GET /api/dashboard/me?include=suggestions` (agent seul) : `data.suggestions = {follow_up, matches}`, chaque clé
  `null` quand il n'y a rien. Sans `include`, la clé `suggestions` est absente (rien n'est calculé). Un `include`
  en tableau n'inclut rien. Hors agent, `include=suggestions` est ignoré.

**Décisions tranchées (consigne « valide tes choix »).**
1. *Sans photo* : aucun média dans la collection `photos` (un plan ou une vidéo ne compte pas), parmi la même
   liste que `properties_managed` (`Property::managedBy`, hors portefeuille sorti — la définition de
   `TeamPerformanceService::propertiesManaged`), réutilisée telle quelle dans `DashboardAgentService::summary()`.
2. *À venir* : SES lignes `due` du grand livre dans l'agence active, quelle que soit `earned_at` ; même dans le
   périmètre `agency` de `/dashboard/agent`, c'est le chiffre de l'agent (« à venir » se dit de lui).
3. *Les clients de l'agent* : ceux dont il est le référent (relation `agent_client` principale active — le
   `filter[referent]=me` que lit déjà `JourneeLibre.tsx`), dans l'agence active, et lisibles
   (`Customer::scopeVisibleTo`, la règle de `CustomerPolicy::view`).
4. *Relance* : `CustomerFollowUpQuery` (filtre `follow_up=1` + tri `-follow_up_days`, puis `forPage()` pour
   `waiting_days`), rien de recopié.
5. *Non encore proposé* : Takussan n'enregistre aucun « envoi » d'un bien à un client. Un bien est tenu pour
   proposé dès que le client l'a visité (une visite, quel que soit son état) ou demandé (réservation,
   candidature ou offre non supprimée).
6. *Rapprochement* : `ProspectMatcher::propertiesFor()` tel quel ; les candidats passent par
   `ProspectMatcher::whereMatchable()` — extrait de `customersFor()` (actif, ni gagné ni perdu, au moins un
   critère), qui l'appelle désormais : une seule définition.
7. *Coût* : rapprochement calculé pour les 20 fiches rapprochables les plus récemment modifiées
   (`AgentDaySuggestions::MATCH_CANDIDATES`), un COUNT chacune, et seulement sous `include=suggestions`. Pas de
   cache : la suggestion doit tomber dès que le bien est proposé. `sample` : 3 biens, ordre de
   `matching-properties` (publication décroissante). Égalité de compte : la fiche la plus récemment modifiée.

**Prémisse re-mesurée.** Conforme au relevé du ticket (aucun des deux chiffres, aucune suggestion servis).

**Tests.** `tests/Feature/Dashboard/AgentDayMetricsTest.php` (3), `tests/Feature/Dashboard/AgentDaySuggestionsTest.php`
(7) — verts ; plus `ProspectMatcherTest`, `SendProspectMatchDigestTest`, `DashboardKeyValuesTest`, `DashboardMeTest`,
`DashboardPeriodTest`, `DashboardQueryBudgetTest`, `DashboardAgentTest` et les trois gardes d'architecture : 68 verts.
Ablations une à une (rouge, puis restauration prouvée par md5) : filtre photo, statut `due`, borne d'agence
(AC5), `visibleTo` (AC5), exclusion des visites, exclusion des réservations, filtre du référent.

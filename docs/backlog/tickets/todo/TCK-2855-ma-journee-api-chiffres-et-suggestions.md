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

_(à remplir par implementing-specs)_

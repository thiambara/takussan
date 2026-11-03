---
id: TCK-032
title: Reporting & tableaux de bord
status: done
phase: P1
family: applicatif
estimate: L
wave: 4
created: 2026-04-15
updated: 2026-05-02
depends_on: [TCK-034, TCK-027, TCK-028]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#3-property
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#25-invoice-
    - docs/models-spec.md#28-payout-
    - docs/models-spec.md#32-task-
tags: [back, front, dashboard, reporting, charts, export]
---

## Objectif utilisateur

Chaque utilisateur authentifié accède à un tableau de bord personnalisé présentant les indicateurs clés de son rôle (agence, bailleur, agent, locataire) via un unique point d'entrée API adaptatif — sans que le frontend ait à connaître le profil à l'avance.

## Contrat de données

**Modèles source et champs utilisés :**

| Rôle | Modèles | Champs clés |
|------|---------|-------------|
| Agence | Agency, Property, LeasePayment, User | `properties_count` (cache), `active_leases_count` (cache), `views_count`, `status=late`, `status=active` |
| Bailleur | Property, Lease, LeasePayment, Payout | `landlord_id`, `monthly_rent`, `status`, `net_amount` |
| Agent | Task, Customer, PropertyCollaborator | `assigned_to_id`, `pipeline_stage`, `due_at`, `status` |
| Locataire | Lease, LeasePayment, Document | `tenant_id` → Customer, `due_date`, `status`, `paid_at` |

**Endpoints à créer :**

- `GET /api/dashboard/me` — point d'entrée adaptatif ; réponse `{ role, metrics, sections }`
- `GET /api/dashboard/agency` — métriques agence (scopé `agency_id`)
- `GET /api/dashboard/owner` — métriques bailleur (scopé `landlord_id`)
- `GET /api/dashboard/agent` — métriques agent (scopé `assigned_to_id`)
- `GET /api/dashboard/tenant` — métriques locataire (scopé customer lié)

**Structure réponse `/api/dashboard/me` :**
```json
{
  "role": "agency_admin",
  "metrics": {
    "properties_count": 42,
    "active_leases_count": 31,
    "monthly_revenue": 1540000,
    "overdue_count": 3,
    "occupancy_rate": 73.8,
    "total_views": 1280,
    "active_agents_count": 5
  },
  "sections": ["portfolio", "revenue", "payments", "agents"]
}
```

## Direction UX / Artistique

- Page unique `/dashboard` : appel à `GET /api/dashboard/me` au chargement, rendu conditionnel sur `role` — aucun rechargement de page lors du changement de contexte
- Registre de widgets par rôle : `AgencyDashboard`, `OwnerDashboard`, `AgentDashboard`, `TenantDashboard` — la valeur `role` détermine quel bloc s'affiche
- KPI card générique : valeur principale large, label localisé, variation Δ vs mois précédent (si disponible)
- Squelettes de chargement (skeleton) pendant le fetch initial — pas de flash de contenu non pertinent
- Densité d'information élevée pour les rôles admin/agent, interface épurée pour le locataire
- Palette, typographie et espacements issus de `docs/design-guidelines.md`

## Contraintes strictes (métier)

- `GET /api/dashboard/me` : 401 si non authentifié
- Isolation stricte des données : agence scopée à `User.agency_id`, bailleur à `landlord_id`, agent à `assigned_to_id`, locataire au `customer_id` lié via `User→Customer`
- Prioriser les compteurs cachés (`Agency.properties_count`, `Agency.active_leases_count`) — ne déclencher des agrégations SQL que pour les métriques sans cache
- `/api/dashboard/agency` → rôle `agency_admin` ou `super_admin` requis (403 sinon)
- `/api/dashboard/owner` → au moins un `Lease.landlord_id = auth()->id()` requis (403 sinon)
- `/api/dashboard/agent` → rôle `agent` requis (403 sinon)
- `/api/dashboard/tenant` → `User→Customer` lié à un `Lease.tenant_id` actif requis (403 sinon)
- Résolution de rôle dans `/api/dashboard/me` : priorité `super_admin` > `agency_admin` > `agent` > `landlord` > `tenant` ; si aucun profil résolu → 404 avec message explicite
- Endpoints GET uniquement — aucune mutation

## Delta à produire

### P1 — MVP

**Backend**
- [ ] Interface `App\Contracts\DashboardMetrics` avec méthode `resolve(User $user): array`
- [ ] Services dans `app/Services/Dashboard/` : `AgencyDashboardService`, `OwnerDashboardService`, `AgentDashboardService`, `TenantDashboardService`
- [ ] `DashboardRoleResolver` — résout le service approprié selon les rôles Spatie et la présence de leases/customer
- [ ] `DashboardController` avec méthodes : `me()`, `agency()`, `owner()`, `agent()`, `tenant()`
- [ ] Endpoint `GET /api/dashboard/me` — délègue à `DashboardRoleResolver`
- [ ] Endpoint `GET /api/dashboard/agency` — `properties_count` (cache), `active_leases_count` (cache), `total_views` (SUM Property.views_count), `monthly_revenue` (SUM LeasePayment.amount WHERE paid_at mois courant), `overdue_count` (COUNT LeasePayment WHERE status=late), `occupancy_rate` (active_leases_count / properties_count * 100), `active_agents_count` (COUNT User WHERE agency_id AND status=active)
- [ ] Endpoint `GET /api/dashboard/owner` — `portfolio_count` (COUNT Property WHERE user_id), `active_leases_count` (COUNT Lease WHERE landlord_id AND status=active), `monthly_cashflow` (SUM Payout.net_amount WHERE landlord_id ET mois courant), `occupancy_rate`, `pending_payouts_amount` (SUM Payout.net_amount WHERE status=pending), `overdue_amount` (SUM LeasePayment.amount WHERE lease.landlord_id AND status=late)
- [ ] Endpoint `GET /api/dashboard/agent` — `pipeline` (COUNT Customer par pipeline_stage lié à l'agent), `tasks_open` (COUNT Task WHERE assigned_to_id AND status IN [open,in_progress]), `tasks_due_today` (COUNT Task WHERE assigned_to_id AND due_at::date = today), `assigned_properties_count` (COUNT PropertyCollaborator WHERE user_id)
- [ ] Endpoint `GET /api/dashboard/tenant` — `active_lease` (Lease WHERE tenant=customer AND status=active), `next_payment` (LeasePayment WHERE payer_id AND status=pending ORDER BY due_date LIMIT 1), `overdue_amount` (SUM LeasePayment.amount WHERE payer_id AND status=late), `recent_documents` (3 derniers Document liés au bail actif)
- [ ] Routes dans `routes/api/dashboard.php`
- [ ] Tests : `DashboardMeTest` (résolution de rôle par priorité, 401, 404 sans profil), `DashboardAgencyTest`, `DashboardOwnerTest`, `DashboardAgentTest`, `DashboardTenantTest`

**Frontend**
- [ ] Page Next.js `/dashboard` : appel `GET /api/dashboard/me`, switch sur `role` pour le rendu
- [ ] Composants : `AgencyDashboard`, `OwnerDashboard`, `AgentDashboard`, `TenantDashboard`
- [ ] Composant `KpiCard` générique : `label`, `value`, `delta?`, `unit?`
- [ ] Skeletons de chargement par section

### P2

- [ ] Endpoint `GET /api/export/{entity}?format=csv` — `entity` ∈ `{payments, leases, customers}` ; délégué à `ExportJob` en arrière-plan, réponse signée ou streaming direct
- [ ] Endpoint `GET /api/export/{entity}?format=pdf` — quittances/factures via medialibrary
- [ ] Endpoint `GET /api/dashboard/agency/timeseries?metric=revenue&period=12m` — revenus mensuels sur N mois
- [ ] Endpoint `GET /api/dashboard/owner/timeseries?metric=cashflow&period=12m`
- [ ] Graphiques temporels dans le frontend pour les métriques timeseries

### P3

- [ ] KPI personnalisables par agence (persistés dans `Agency.settings`)
- [ ] Endpoint `GET /api/dashboard/agency/alerts` — alertes actives (taux d'impayés > seuil, vacance > seuil) configurées dans `Agency.settings`

## Critères d'acceptation

- [ ] `GET /api/dashboard/me` retourne `role` + `metrics` adaptés au profil de l'utilisateur connecté, sans exposer les données d'un autre profil
- [ ] Un `agency_admin` reçoit uniquement les métriques de son agence (scoped `agency_id`)
- [ ] Un bailleur reçoit uniquement ses biens et baux (scoped `landlord_id`)
- [ ] Un agent reçoit son pipeline CRM et ses tâches assignées
- [ ] Un locataire voit son bail actif, son prochain loyer et ses 3 derniers documents
- [ ] Un utilisateur sans profil résolu reçoit 404 avec un message explicite
- [ ] Les compteurs cachés (`Agency.properties_count`, `active_leases_count`) sont utilisés — aucune agrégation SQL redondante sur ces champs
- [ ] La page `/dashboard` affiche les bons widgets selon `role` sans rechargement
- [ ] Les exports CSV P2 contiennent toutes les colonnes du modèle demandé

## Hors périmètre

- Export comptable FEC (→ P3 futur)
- KPI personnalisables par agence (→ P3)
- Alertes sur seuils configurables (→ P3)
- Dashboard `super_admin` plateforme globale (métriques Takussan cross-agences → P3 futur)
- Notifications temps réel des métriques (WebSockets → P3)
- Passerelle de paiement et rapprochement bancaire (→ TCK-028 P2)

## Notes d'implémentation

- **PR #38** (Vague 3) avait livré ~80 % du P1 backend : 4 services par rôle (`DashboardAgencyService`, `OwnerService`, `AgentService`, `TenantService`) avec `summary()` + `monthlyTimeseries()`, 4 controllers `dashboard/{agency,owner,agent,tenant}` avec sparse `fields[summary]=…` / `?include=timeseries`, `KpiResolver`, observers de compteurs cachés et tests par rôle. Le legacy `dashboard/stats` est conservé tel quel.
- **Gap fermé ici** : l'entrée adaptive `GET /api/dashboard/me` manquait. Ajouts : interface `App\Contracts\DashboardMetrics`, 4 adapters `App\Services\Dashboard\Adapters\*MeMetrics` qui aplatissent les `summary()` existants en `metrics` + `sections`, `App\Services\Dashboard\DashboardRoleResolver` (priorité super_admin → agency_admin → agent → owner → tenant, 404 sinon), méthode `DashboardController::me()`, route `dashboard.me`, tests `DashboardMeTest` (12 cases). Aucun nouveau modèle, aucune nouvelle agrégation SQL : les adapters dérivent des `summary()` existants.
- Pour un **super_admin sans `agency_id`** : la cascade ne résout pas (404), conformément à l'AC. Le frontend (TCK-115 / TCK-130) gère le `NoAgencyState` avant ou après cet appel.
- P2/P3 (timeseries dédiés `/agency/timeseries?metric=...`, exports CSV/PDF, alerts seuils, dashboard global super_admin) restent partiellement couverts par le code de PR #38 (`?include=timeseries`, `ExportController`, `ThresholdAlert`) — pas de nouvelle implémentation dans cette passe.

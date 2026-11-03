---
id: TCK-2275
title: "Une colonne de bailleur ne désigne son bailleur que selon BailleurDuBien, chez tous ses lecteurs : tableaux de bord, export, archive RGPD, effacement, fils de messagerie"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
    - "docs/features.md#17-communication--messagerie"
  adr:
    - "docs/adr/0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md#amendement-du-2026-10-25--laccès-suit-lappartenance"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-232--lecteurs-hors-policy-et-hors-liste-qui-tiennent-landlord_id-ou-user_id-pour-le-bailleur"
tags: [api, authorization, dashboard, export, rgpd, messaging, account-deletion, pistes]
---

## Contexte

Réfs : **P232.01, P232.06, P232.03, P232.02, P232.05** du fichier de pistes, `validé` par le porteur
le 2026-10-25. Décision D1 de l'amendement du 2026-10-25 d'ADR-0031 : la partie C (« une colonne de
bailleur ne désigne son bailleur que selon `BailleurDuBien` ») vaut pour **tous** les lecteurs de
`leases.landlord_id` et `properties.user_id`, pas seulement ceux qu'elle énumérait.

L'agent qui saisit un bien d'agence en est le `user_id` (`PropertyController::store`), et
`LeaseService::create` le recopie en `landlord_id`. Cinq lecteurs le tenaient encore pour bailleur :
le tableau de bord (résolveur de `/api/dashboard/me`, `DashboardOwnerService`, `PortfolioScope`),
l'export (`ExportDataService::scopeToActor`), l'archive RGPD (`DataExportBuilder`), les
obligations de l'effacement (`AccountDeletionService::collectOpenObligations`) et l'exception
« partie » des fils de bail et de bien (`ConversationAccess`).

## Décision du porteur

- **P232.01** :
  > validé — validation du porteur (2026-10-25) : `BailleurDuBien` dans le résolveur du tableau de bord et dans `PortfolioScope::landlord` (partie C d'ADR-0031 étendue à tous les lecteurs de `landlord_id` et `properties.user_id`)
- **P232.06** :
  > validé — validation du porteur (2026-10-25) : `BailleurDuBien::restreindre` sur les trois clauses de `scopeToActor`, avec le `PortfolioScope` de P232.01
- **P232.03** :
  > validé — validation du porteur (2026-10-25) : `BailleurDuBien` dans `contextAllows` et `constrainContext` de `ConversationAccess`, avec la mesure du cas du retiré et de l'avis de `NotifyNewMessageJob`
- **P232.02** :
  > validé — validation du porteur (2026-10-25) : l'archive RGPD lit les baux par `BailleurDuBien::restreindre`, agent actif compris (précédent TCK-1017) ; les lignes par `collector_id` et `created_by_id` vont à l'angle 247
- **P232.05** :
  > validé — validation du porteur (2026-10-25) : les deux clauses de baux de l'effacement bornées par `BailleurDuBien` ; `agenciesOwingPayout` aligné sur le prédicat de bénéficiaire de P232.07 (TCK-997)

## Delta à produire

- [x] `BailleurDuBien::agences()` : la sous-requête des agences où l'utilisateur détient un profil
      propriétaire, écrite une fois ; `restreindre` la lit et accepte un identifiant.
- [x] `PortfolioScope::landlord` borne biens et baux par `BailleurDuBien` (`properties()`,
      `leases()`, `propertiesSql()` pour le SQL brut) ; `PortfolioMetrics` les lit partout.
- [x] `DashboardOwnerService::summary` : biens, baux et biens dérivés par le même périmètre.
- [x] `DashboardRoleResolver` : branche « possède des biens » par `BailleurDuBien::restreindre`.
- [x] `ExportDataService::scopeToActor` : les trois clauses du bailleur par `BailleurDuBien::restreindre`.
- [x] `DataExportBuilder` : `leases.json` par `BailleurDuBien::restreindre(…, 'landlord_id')`.
- [x] `AccountDeletionService::collectOpenObligations` : les baux « as landlord » par `BailleurDuBien`.
- [x] `ConversationAccess` : « partie » par `BailleurDuBien::est` (`contextAllows`) et
      `BailleurDuBien::restreindre` (`constrainContext`).
- [x] `tests/Feature/Authorization/ColonneDeBailleurAgentCreateurTest.php`.

## Critères d'acceptation

- [x] AC1 (P232.01) — Agent créateur suspendu, puis retiré : `GET /api/dashboard/me` rend `role:
      tenant`, et son résumé de bailleur ne compte ni le bien, ni le bail, ni loyer encaissé, ni
      dépôt, ni impayé, ni occupation. Agent créateur actif : vue d'agent.
- [x] AC2 (P232.01) — Le particulier sans agence, l'hôte d'une agence `individual` et le bailleur
      bloqué gardent la vue du bailleur et tous leurs chiffres.
- [x] AC3 (P232.06) — Bailleur d'une agence B, agent suspendu d'une agence A : `/api/dashboard/owner`
      et les exports des baux, des biens et des paiements ne rendent que les lignes de B. Le bailleur
      de l'agence exporte toujours les siennes.
- [x] AC4 (P232.02) — L'archive de l'agent créateur (actif, suspendu, retiré) ne contient plus le
      bail du bien qu'il a saisi ; le bailleur bloqué, le locataire et le particulier gardent les leurs.
- [x] AC5 (P232.05) — Le bail d'un bien saisi n'est pas une obligation de l'agent (actif, suspendu,
      retiré) ; il l'est pour le bailleur actif, le bailleur bloqué, le particulier et le locataire.
- [x] AC6 (P232.03) — Agent créateur suspendu : fils du bail et du bien refusés, absents de la liste,
      sans avis de `NotifyNewMessageJob` ; le locataire les garde et reçoit l'avis ; le bailleur
      bloqué garde les fils de son bail et de son bien. Agent retiré : aucun accès, aucune liste,
      aucun avis (mesuré, voir les notes).

## Reste à faire

- P232.05 : `agenciesOwingPayout` aligné sur le prédicat de bénéficiaire de P232.07 (TCK-997). La
  précision le rattache à TCK-997, `todo` : il n'est pas touché ici.
- P232.02 : les lignes de l'archive par `collector_id` et `created_by_id` vont à l'angle 247 (hors
  de ce ticket, selon la précision).

## Hypothèses

- **« Les deux clauses de baux de l'effacement »** : sur l'arbre, `AccountDeletionService` lit les
  baux par `landlord_id` en deux endroits, `collectOpenObligations` (l. 486) et `agenciesOwingPayout`
  (l. 623). La seconde est dans la fonction que la précision renvoie à TCK-997. L'autre lecture par
  `landlord_id` (l. 577) est `payouts.landlord_id`, le bénéficiaire d'un reversement : ce n'est pas un
  bail, et c'est le domaine de P232.07. Seule la clause de `collectOpenObligations` est donc bornée
  ici ; les deux autres restent telles quelles (option conservatrice : l'obligation d'un reversement
  à venir n'est pas retirée).
- **`payouts.landlord_id` dans `PortfolioScope`** reste lu tel quel (« net reversé », reprises) : il
  nomme le bénéficiaire du reversement, pas le bailleur d'un bien. Sa règle est celle de P232.07.
- Le résumé du bailleur (`DashboardOwnerService::summary`) lit aussi `properties.user_id` hors de
  `PortfolioMetrics` (portefeuille, réservations en attente, devis, visites, avis) : ces lectures
  suivent le même périmètre, au titre de D1 (« tous les lecteurs »).

## Notes d'implémentation

- Ablation, fichier par fichier (17 tests de la classe, charge 2,2 à 3,2 sur 8 cœurs) :
  `DashboardRoleResolver` remis → 2 rouges (`role: owner`) ; `DashboardOwnerService` remis → 3
  rouges (« bien saisi compté », « le bien de A compté ») ; `PortfolioMetrics` remis → 3 rouges
  (« loyer encaissé compté », 230 000 attendu 80 000) ; borne SQL des biens éligibles seule remise
  → 2 rouges (« occupation comptée ») ; bornes des baux de `depositsHeld`, `overdue`, `unpaidRate`
  remises → 2 rouges (« dépôt compté ») ; `ExportDataService` remis → 1 rouge (export des baux) ;
  `DataExportBuilder` remis → 3 rouges ; `AccountDeletionService` remis → 3 rouges ;
  `contextAllows` seul remis → 1 rouge (« fil du bail ouvert ») ; `constrainContext` seul remis → 1
  rouge (« fils listés »). Correctif rétabli → 17 verts.
- **Avis de `NotifyNewMessageJob`, mesuré** : avant correctif, l'agent créateur suspendu reçoit
  l'avis des deux messages postés dans les fils du bail et du bien (2) ; après, 0. Le job filtre par
  `branchesAllow`, qui lit `contextAllows` : aucune ligne du job ne change.
- **Le cas du retiré, élucidé** : ses profils sont supprimés en douceur, et `inactiveOnlyAgencyIds`
  ne lit pas les profils supprimés : la branche « contexte » ne le voit pas. C'est le retrait qui
  lui fait quitter (`left_at`) les fils rattachés à un bail de l'agence (tout type) et les **groupes**
  rattachés au seul bien (TCK-1711, TCK-2021). Sonde (retirée) sur quatre formes de fil : groupe du
  bail, groupe du bien, fil `type = lease`, fil `type = property`. Les trois premiers sont quittés,
  refusés, non listés, sans avis. Le fil `type = property` sans bail reste ouvert, listé et avisé.
  Aucun code de `app/`, de `database/` ni de test n'écrit ce type (`grep ConversationType::Property`
  ne rend rien), et `StoreConversationRequest` n'accepte que `direct` et `group`. C'est vraisemblablement
  l'écart que le mesureur a vu. Il ne relève pas de ce correctif, et il n'est pas gardé.
- `constrainContext` lisait `DB::table('leases' | 'properties')`, supprimés compris : les
  sous-requêtes de « partie » passent par `Lease::withTrashed()` et `Property::withTrashed()`, pour
  garder les mêmes lignes sous `BailleurDuBien::restreindre` (qui veut un constructeur Eloquent).
- `impacted-tests --connus` sélectionne environ 250 classes : la CI de la PR les joue. Lancées en
  local, outre la classe neuve : `DashboardOwnerTest`, `DashboardOwnerMetricsTest`,
  `DashboardMeRoutingTest`, `DashboardMeTest`, `DashboardQueryBudgetTest`, `ExportScopingTest`,
  `ExportControllerTest`, `DashboardPortfolioCountTest`, `MembreSuspenduFilsDeContexteTest`,
  `ConversationTest`, `AccountDeletionRequestTest`, `EffacementBailleurReversementTest`,
  `Admin/DataExportTest`, `PayoutClawbackTest`, `OwnerIsolationWithinAgencyTest` : 225 verts.

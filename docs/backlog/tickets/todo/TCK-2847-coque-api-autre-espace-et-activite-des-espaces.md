---
id: TCK-2847
title: "Coque, côté API : dire qu'une fiche introuvable existe dans un autre de vos espaces, et la ligne d'activité de chaque espace (« 4 demandes · 2 visites aujourd'hui »)"
status: todo
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2848]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#profils--contexte-actif-tck-138--tck-142"
  models:
    - "docs/models-spec.md#2-agency"
tags: [back, coque, espaces, introuvable, audit-ux, app]
---

## Objectif utilisateur

L'agent de deux agences qui ouvre un lien vers une fiche de l'autre agence apprend où elle est et y bascule ; et, avant de changer d'espace, il voit ce qui l'attend dans chacun.

## Contrat de données

Relevé le 2026-11-15 sur `dev` (8c60f4c58) :

- Une fiche d'une autre agence répond 404 (cloisonnement, principe 2) : l'API **ne distingue pas** « inexistant » de « dans une autre de vos agences ». TCK-2619 l'a écarté pour cette raison (hors périmètre). Seules les notifications connaissent l'agence de leur objet (`LienDansLAgence`).
- `GET /api/me/profiles` (`MeProfilesController::index`) rend les profils actifs (`ProfileResource` : agence, rôle, ville) — **aucun compteur par espace**. TCK-2621 l'a écarté (« l'API ne les sert pas », ticket « — »).
- Les compteurs de l'espace **actif** existent (compteurs du menu, `useCompteursDuMenu`).

## Contraintes strictes (métier)

- **Écrire l'ADR d'abord** (premier item du delta) : révéler qu'une fiche existe dans une autre agence touche la frontière d'isolation (principe 2). La règle proposée : la réponse ne nomme l'autre agence **que si l'appelant y a un profil actif qui peut lire la fiche** (même Policy que si l'espace était actif) ; sinon 404 inchangé, sans aucune différence de forme ni de temps observable.
- **Où-est-elle** — `GET /api/me/locate?type={bien|demande|client|bail|intervention|visite|reservation|bailleur}&id={id}` (nom définitif au choix de l'implémentation, documenté dans `docs/spatie-query-builder.md` si filtré) :
  - rend `{profile_id, agency {id, name}, role}` du premier profil actif de l'appelant qui peut lire l'objet ;
  - 404 sinon (objet absent, ou aucun profil qui le lit) ;
  - jamais le titre ni aucune donnée de l'objet.
- **Activité par espace** — ajoutée à `GET /api/me/profiles` sous `include=activity` (ou lecture dédiée) : pour chaque profil actif, les compteurs que la persona du profil affiche dans « Aujourd'hui » (agent/admin : demandes non traitées, visites du jour ; bailleur : biens, loyers en retard ; prestataire : interventions du jour ; locataire : échéance due). Chaque compteur est calculé **comme si ce profil était actif** (mêmes règles que les compteurs du menu, sans les recopier).
- Pas de N+1 : nombre de requêtes borné et indépendant du nombre d'objets ; mesuré entre 1 et 4 profils.
- **Notifications** (audit app-notifications e1, écart « donnée ») : la maquette compte **toutes** les notifications par famille (`app-notifications.tsx` l. 436-445 : « Toutes 42 » = somme des familles), l'API ne rend que les non lues. La lecture des comptes par famille gagne le total (à côté du non lu, sans le remplacer).

## Delta à produire

- [x] ADR (numéro suivant libre) : « une fiche d'une autre de vos agences se nomme, sans se montrer », avant le code.
- [x] Endpoint de localisation + tests `LocateAcrossProfilesTest` (fiche de l'agence B ouverte depuis A → agence B ; profil B suspendu → 404 ; aucun profil → 404 ; forme identique entre « inexistant » et « illisible »).
- [x] `include=activity` sur les profils + `MeProfilesActivityTest` (agent de deux agences : compteurs différents par espace ; requêtes constantes).
- [x] Compte total par famille des notifications + test (42 notifications dont 3 non lues → total 42, non lues 3).

## Critères d'acceptation

- [x] AC1 — Agent actif dans « Dakar Immo » (actif) et « Thiès Properties » : `locate?type=bien&id={bien de Thiès}` rend `agency.name = "Thiès Properties"` et le `profile_id` de ce profil ; même appel par un utilisateur sans profil à Thiès : 404 avec le même corps qu'un id inexistant.
- [x] AC2 — Profil de Thiès passé `blocked` : 404.
- [x] AC3 — `me/profiles?include=activity` rend, pour l'agent, `{unhandled_leads: 4, visits_today: 2}` à Dakar et des valeurs propres à Thiès (fixtures distinctes) ; pour un bailleur, `{properties: 2, rent_overdue: 1}`.
- [x] AC4 — Ablation : forcer la Policy à vrai fait rougir AC1 (cas sans profil) ; c'est elle, et non un `where agency_id`, qui garde la réponse.

## Hors périmètre

- L'écran (page introuvable, menu du compte, choix d'espace) : TCK-2848.

## Notes d'implémentation

2026-11-15 (agent, worktree `feat/audit-manques-2026-11-15`).

**Livré**
- ADR-0116 (`docs/adr/0116-une-fiche-d-une-autre-de-vos-agences-se-nomme-sans-se-montrer.md`), écrit avant le code.
- `GET /api/me/locate?type=…&id=…` (`MeLocateController`, `LocateRequest`, `OuEstLaFiche`, route `me.locate`, `throttle:30,1`) → `{data: {profile_id, agency: {id, name} | null, role}}`. La policy `view` de la fiche est jugée sous CHAQUE profil actif (`SousLeProfil::juger`, attribut `active_profile` posé puis rendu en `finally`, motif de `DocumentExpiryReminder`) ; les profils de l'agence de la fiche sont essayés d'abord (ordre, pas filtre). Absent, en corbeille ou illisible : `abort(404)`, un seul chemin, corps identiques (testé). Super-admin : 404 (`Gate::before` lui accorderait tout, sous n'importe quel profil). `type`/`id` hors bornes (liste, 30 chiffres, négatif) : 422.
- `GET /api/me/profiles?include=activity` (`ActiviteDesEspaces`) : `activity` sur chaque profil, calculé sous ce profil, par les règles des listes — agent/admin `{unhandled_leads, visits_today}` (portée de l'index des demandes sous `filter[handled]=0` ; `VisitesLisibles` sous `filter[day]`, l'onglet « Aujourd'hui » de `property-visits/counts`), bailleur `{properties, rent_overdue}` (`PortfolioScope::landlord(...)->dansLAgence()` : `portfolio.total` et `finance.overdue_count` de son accueil, bornés à l'agence du profil), prestataire `{interventions_today}` (`MaintenanceRequest::visibleTo` + `filter[assigned_to|scheduled_from|scheduled_to]`, hors `FINISHED_STATUSES`).
- Pour ne pas recopier la portée des demandes : `PropertyContactLeadPolicy::scopeIndex()` (tirée de `ContactLeadController::index`, qui l'appelle désormais). `PortfolioScope::dansLAgence()` ajouté (borne d'agence sur `properties()`, `leases()`, `propertiesSql()`).
- Notifications : `meta.counts.total` et `meta.counts.total_par_famille` (lues comprises), dans la même requête groupée ; `unread`, `par_famille`, `a_traiter_non_lues` inchangés. Type front `ComptesDesNotifications` complété (champs optionnels).

**Prémisses qui différaient**
- Le locataire n'est pas un profil commutable (`ActiveProfileResolver::TYPE_MAP` : agency_admin, owner, agent, service_provider) : pas de ligne d'espace, donc pas de compteur « échéance due ».
- Le compteur du menu des visites est « en attente, à venir », pas « du jour » : `visits_today` suit l'onglet « Aujourd'hui » (tout statut, journée de Dakar), comme le dit le ticket.
- L'accueil du bailleur (`dashboard/owner`) compte TOUT son portefeuille, toutes agences ; la ligne d'un espace bailleur ne compte que l'agence de ce profil : un bien ou un bail SANS agence compte à l'accueil et dans aucune ligne d'espace.
- AC2 : un `AgentProfile` n'a pas d'état `blocked` ; le test passe le profil à `suspended` (tout état non actif sort de la même façon).

**Requêtes** (`MeProfilesActivityTest`, mesuré) : `me/profiles` sans activité 13 ; 1 profil 23 ; 4 profils (2 agents, bailleur, prestataire) 50. Identique avec 1 ou 6 objets de chaque sorte.

**Ablations** (une à une, restaurées par md5) : la policy forcée vraie dans `OuEstLaFiche` → AC1 sans profil, AC2 et « profil qui ne lit pas » rouges ; sans `SousLeProfil` dans `OuEstLaFiche` → AC1 rouge ; sans `SousLeProfil` dans `ActiviteDesEspaces` → AC3 agent rouge ; sans `dansLAgence` → bailleur de deux agences rouge ; borne d'agence retirée des seuls baux → même test rouge (loyers en retard 1/0) ; total compté sur les seules non-lues → test des 42 rouge. AC4 est aussi un test permanent (`Gate::policy` rebranchée sur une policy qui dit oui : Dakar est nommé pour une fiche de Thiès).

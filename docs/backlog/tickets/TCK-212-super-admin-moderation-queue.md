---
id: TCK-212
title: "Super-admin — File de modération unifiée (signalements cross-tenant)"
status: done
phase: P2
family: applicatif
estimate: L
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-145]
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#111-avis--réputation
    - docs/features.md#26-audit--traçabilité
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#11-review
tags: [back, front, super_admin, moderation, p2]
---

## Contexte

La modération existe actuellement par silo : biens (TCK-098 / `/admin/properties/moderation` agency-side, logique dans `App\Services\Property\PropertyModerationService`) et avis (TCK-067 / `/admin/moderation`, logique inline dans `ReviewController::moderate`). Côté super-admin, seule la modération d'agences est exposée (TCK-144). Aucun écran n'agrège les files cross-tenant — un super-admin doit ouvrir deux pages distinctes pour suivre l'arriéré plateforme. La modération messagerie n'est pas couverte ici : `features.md` §1.7 ne la prévoit pas et aucune infrastructure (modèle `MessageReport`, endpoint, workflow) n'existe.

## Objectif utilisateur

Un super-admin ouvre `/super-admin/moderation` et voit l'arriéré global plateforme — biens et avis signalés ou en attente — toutes agences confondues, avec filtre par type, agence, ancienneté ; il traite et journalise depuis cette seule vue.

## Contrat de données

Endpoint à exposer :

- `GET /api/admin/moderation?filter[type]=property|review&filter[status]=pending|flagged&filter[agency_id]=...&sort=-reported_at&include=subject,reporter` — file unifiée, élément polymorphe (`subject_type`, `subject_id`)
- `POST /api/admin/moderation/{id}/decide` — body `{ decision: 'approve'|'reject'|'hide'|'remove', reason: string }` ; route polymorphe vers le service de modération du type concerné

Resource `Admin\ModerationItemResource` agrège les colonnes nécessaires par type. Le filtre `type` est une enum stricte (`property`, `review`) — aucune autre valeur acceptée.

## Direction UX / Artistique

Tableau dense avec onglets (Biens / Avis / Tous), filtres par agence et ancienneté. Chaque ligne expose le sujet (lien direct), le rapporteur, la raison signalée, l'âge. Action panel à droite : approuver / masquer / supprimer / rejeter le signalement, avec champ raison. Compteurs en haut par type. Bandeau d'alerte si un item a > 7 jours.

## Contraintes strictes (métier)

- Endpoint super-admin-only.
- L'endpoint `decide` **doit** router vers les services métier existants — aucune duplication de règle :
    - **Biens** → `App\Services\Property\PropertyModerationService` (existant)
    - **Avis** → `App\Services\Review\ReviewModerationService` (à **extraire** de `ReviewController::moderate` dans le même ticket — la méthode existante du controller doit ensuite déléguer au service afin que les deux chemins partagent le même code)
- Chaque décision génère un événement audit `super_admin_moderation_decision` avec `decision`, `subject_type`, `subject_id`, `reason`.
- Toujours utiliser `fields[...]`, `filter[...]`, `include=`.
- L'agrégation est faite côté serveur (UNION ALL ou vue SQL) — pas de fan-out par type côté client.
- Ne pas prendre en compte les items résolus depuis > 90 jours par défaut (filtre par défaut pour limiter le volume).

## Delta à produire

- [ ] Refacto : extraire la logique de `App\Http\Controllers\Api\ReviewController::moderate` dans un service `App\Services\Review\ReviewModerationService` (même comportement, même tests passants), et déléguer le controller au service
- [ ] Vue SQL ou table de queue agrégeant `properties` (statuts modération) et `reviews` (statuts modération + signalements) — décision lors de l'implémentation, mais le payload API reste figé
- [ ] Service `App\Services\Admin\UnifiedModerationService` (lecture) + délégation vers `PropertyModerationService` / `ReviewModerationService` pour les décisions
- [ ] Controller `Admin\ModerationQueueController` (`index`, `decide`)
- [ ] Resource `Admin\ModerationItemResource`
- [ ] Routes `GET /api/admin/moderation`, `POST /api/admin/moderation/{id}/decide`
- [ ] Activity log événement `super_admin_moderation_decision`
- [ ] Frontend page `src/app/(super-admin)/super-admin/moderation/page.tsx`
- [ ] Composants : `ModerationQueueTable`, `ModerationFilters`, `ModerationDecisionPanel`
- [ ] Lien dans la sidebar super-admin
- [ ] Tests backend :
    - `ReviewModerationServiceTest` (couvre les scénarios déjà testés sur le controller, devenus tests de service)
    - `Tests\Feature\Api\Admin\ModerationQueueTest` : 200 super-admin, 403 hors rôle, filtre `type` en whitelist stricte, décision route correctement vers chaque service, audit présent
- [ ] Tests UI : filtres, décision, refresh

## Critères d'acceptation

- [ ] `/super-admin/moderation` affiche les 2 types (biens, avis) en une seule liste paginée
- [ ] Une décision sur un item modifie l'entité sous-jacente via le service métier (pas de chemin parallèle)
- [ ] `ReviewController::moderate` continue de fonctionner pour les agency_admin et appelle le **même** `ReviewModerationService` que le chemin admin (test direct vérifiant qu'aucune règle n'est dupliquée)
- [ ] Un agency_admin reçoit 403 sur `/api/admin/moderation*`
- [ ] Aucun item n'apparaît côté agency_admin dans `/admin/moderation` après décision super-admin (cohérence cross-couche)
- [ ] Chaque décision génère une entrée d'audit avec `decision` et `reason`
- [ ] Le filtre par agence renvoie uniquement les items de l'agence
- [ ] `filter[type]` n'accepte que `property` ou `review` (toute autre valeur → 422)

## Hors périmètre

- Modération messagerie (signalement de message, masquage, ban) — non spécifié dans `features.md` §1.7 ; nécessite une extension de spec et la création des modèles `MessageReport` + service dédié avant tout ticket UI
- Anti-fraude / détection automatique de listings dupliqués (extension de spec requise)
- Bannissement IP / device fingerprint (extension de spec requise)
- Édition par le super-admin du contenu modéré (uniquement décision oui/non)

## Notes d'implémentation

- Agrégation par `UNION ALL` applicatif dans `UnifiedModerationService` plutôt qu'une table persistée : biens `pending_review`, signalements de biens non résolus et avis `pending/reported`.
- Les signalements de biens sont traités via `PropertyModerationService::resolveReport`; les décisions sur biens en attente continuent d'utiliser `approve/reject`.
- `ReviewModerationService` porte désormais la règle commune pour `/api/reviews/{review}/moderate` et `/api/admin/moderation/{id}/decide`.

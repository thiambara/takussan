---
id: TCK-212
title: "Super-admin — File de modération unifiée (signalements cross-tenant)"
status: todo
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
    - docs/models-spec.md#20-message
tags: [back, front, super_admin, moderation, p2]
---

## Contexte

La modération existe actuellement par silo : biens (TCK-098 / `/admin/properties/moderation` agency-side), avis (TCK-067 `/admin/moderation`), signalements message ad-hoc. Côté super-admin, seule la modération d'agences est exposée (TCK-144). Aucun écran n'agrège **toutes** les files cross-tenant — un super-admin doit ouvrir trois pages distinctes pour suivre l'arriéré plateforme.

## Objectif utilisateur

Un super-admin ouvre `/super-admin/moderation` et voit l'arriéré global plateforme — biens, avis, messages signalés — toutes agences confondues, avec filtre par type, agence, ancienneté ; il assigne, traite et journalise depuis cette seule vue.

## Contrat de données

Endpoint à exposer :

- `GET /api/admin/moderation?filter[type]=property|review|message&filter[status]=pending|flagged&filter[agency_id]=...&sort=-reported_at&include=subject,reporter` — file unifiée, élément polymorphe (`subject_type`, `subject_id`)
- `POST /api/admin/moderation/{id}/decide` — body `{ decision: 'approve'|'reject'|'hide'|'remove', reason: string }` ; route polymorphe vers le service de modération du type concerné

Resource `Admin\ModerationItemResource` agrège les colonnes nécessaires par type.

## Direction UX / Artistique

Tableau dense avec onglets (Biens / Avis / Messages / Tous), filtres par agence et ancienneté. Chaque ligne expose le sujet (lien direct), le rapporteur, la raison signalée, l'âge. Action panel à droite : approuver / masquer / supprimer / rejeter le signalement, avec champ raison. Compteurs en haut par type. Bandeau d'alerte si un item a > 7 jours.

## Contraintes strictes (métier)

- Endpoint super-admin-only.
- L'endpoint `decide` route vers le service métier existant (`PropertyModerationService`, `ReviewModerationService`, `MessageReportService`) — ne dupliquer aucune règle ; le ticket consolide la file, il ne réinvente pas la décision.
- Chaque décision génère un événement audit `super_admin_moderation_decision` avec `decision`, `subject_type`, `subject_id`, `reason`.
- Toujours utiliser `fields[...]`, `filter[...]`, `include=`.
- L'agrégation est faite côté serveur (UNION ALL ou table de queue) — pas de fan-out par type côté client.
- Ne pas prendre en compte les items résolus depuis > 90 jours par défaut (filtre par défaut pour limiter le volume).

## Delta à produire

- [ ] Migration : table `moderation_queue` (polymorphe) OU vue SQL agrégeant les sources existantes — décision lors de l'implémentation, mais le **payload** servi côté API reste le même
- [ ] Service `App\Services\Admin\UnifiedModerationService` (lecture) + délégation vers les services métier existants pour les décisions
- [ ] Controller `Admin\ModerationQueueController` (`index`, `decide`)
- [ ] Resource `Admin\ModerationItemResource`
- [ ] Routes `GET /api/admin/moderation`, `POST /api/admin/moderation/{id}/decide`
- [ ] Activity log événement `super_admin_moderation_decision`
- [ ] Frontend page `src/app/(super-admin)/super-admin/moderation/page.tsx`
- [ ] Composants : `ModerationQueueTable`, `ModerationFilters`, `ModerationDecisionPanel`
- [ ] Lien dans la sidebar super-admin
- [ ] Tests backend : 200 super-admin, 403 hors rôle, décision route correctement vers le service du type, audit présent
- [ ] Tests UI : filtres, décision, refresh

## Critères d'acceptation

- [ ] `/super-admin/moderation` affiche les 3 types (biens, avis, messages) en une seule liste paginée
- [ ] Une décision sur un item modifie l'entité sous-jacente via le service métier existant (pas de chemin parallèle)
- [ ] Un agency_admin reçoit 403
- [ ] Aucun item n'apparaît côté agency_admin dans `/admin/moderation` après décision super-admin (cohérence cross-couche)
- [ ] Chaque décision génère une entrée d'audit avec `decision` et `reason`
- [ ] Le filtre par agence renvoie uniquement les items de l'agence

## Hors périmètre

- Anti-fraude / détection automatique de listings dupliqués (extension de spec requise)
- Bannissement IP / device fingerprint (extension de spec requise)
- Édition par le super-admin du contenu modéré (uniquement décision oui/non)

## Notes d'implémentation

_(à remplir par implementing-specs)_

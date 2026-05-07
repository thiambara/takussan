---
id: TCK-213
title: "Super-admin — Tags & amenités globaux (référentiel plateforme)"
status: review
phase: P1
family: front
estimate: S
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-145]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#10-tag
tags: [front, super_admin, tags, p1]
---

## Contexte

Les tags / amenités sont des entités **globales** partagées entre toutes les agences (cf. `models-spec.md#10-tag`). TCK-066 a livré l'UI de gestion sous `/admin/` (audience `agency_admin`), mais §2.9 P0 désigne `🛡️` (super_admin) comme acteur — ce qui crée un conflit de surface d'autorité : l'agency_admin ne devrait pas modifier un référentiel partagé. Le référentiel plateforme doit vivre dans la console super-admin.

## Objectif utilisateur

Un super-admin ouvre `/super-admin/tags` et gère le référentiel plateforme (tags, amenités, types de biens) — créer, renommer, regrouper par catégorie, désactiver — sans qu'un agency_admin puisse écrire ce référentiel.

## Contrat de données

Endpoints existants (TCK-023) inchangés. Migration des permissions :

- `GET /api/tags` reste lisible par tous (les agents l'utilisent pour sélectionner des tags sur un bien)
- `POST/PATCH/DELETE /api/tags` deviennent **super-admin-only** — déplacer leur déclaration sous `routes/api/admin.php` ou ajouter le middleware `super-admin` sur ces verbes

Sparse fieldsets : `fields[tags]=id,type,label,slug,icon,is_active,properties_count`.

## Direction UX / Artistique

Reprend la table de TCK-066 (filtres par type, inline edit, modale de création). Cohérence avec le shell super-admin (couleur d'accent Takussan). Compteur `properties_count` permet de juger avant désactivation. Toast informatif si un tag est utilisé par > 0 biens à la suppression (409 visible).

## Contraintes strictes (métier)

- Écriture (`POST/PATCH/DELETE`) **exclusivement** super-admin. Toute écriture par un agency_admin retourne 403.
- Lecture inchangée (les agences continuent de lister via `GET /api/tags`).
- Retirer la page `/admin/tags` agency-side — le code source reste mais la route est démontée et redirige vers `/admin` avec un toast "Référentiel géré par la plateforme".
- Activity log obligatoire sur création / renommage / désactivation.
- Le slug est généré côté serveur, immuable une fois posé.

## Delta à produire

- [ ] Backend : déplacer / gater les écritures `tags` sous `super-admin` (middleware) ; lecture publique inchangée
- [ ] Backend : test exhaustif `Tests\Feature\Api\TagWriteAuthorizationTest` (super-admin OK, agency_admin 403, agent 403)
- [ ] Frontend : nouvelle page `src/app/(super-admin)/super-admin/tags/page.tsx` (réutilisable du composant existant `/admin/tags` adapté)
- [ ] Frontend : démontage de `/admin/tags` côté agency (route + lien sidebar)
- [ ] Lien sidebar super-admin
- [ ] Activity log événement `super_admin_tag_created|updated|disabled`
- [ ] Migration des tests existants `/admin/tags` vers la nouvelle route

## Critères d'acceptation

- [ ] `POST /api/tags` retourne 403 pour un agency_admin et 200 pour un super_admin
- [ ] `GET /api/tags` continue de fonctionner pour tous les rôles authentifiés
- [ ] La page `/admin/tags` (agency) n'est plus accessible (404 ou redirect)
- [ ] La page `/super-admin/tags` rend la table avec filtres et inline edit
- [ ] Chaque écriture génère une entrée d'audit
- [ ] Un test de régression vérifie qu'aucun bien n'a perdu son lien tag

## Hors périmètre

- Ajout de nouvelles colonnes à `Tag` (rester sur le schéma existant)
- Hiérarchie de tags (parent/enfant) — non couvert
- Import en masse depuis CSV — out of scope

## Notes d'implémentation

- Les URL API de lecture/écriture restent `/api/tags`; l'écriture est verrouillée dans `TagController` via `User::isSuperAdmin()` pour préserver les consommateurs existants.
- L'ancien écran agence `/admin/settings/tags` redirige vers `/admin?notice=tags-platform-managed`; le manager est monté dans `/super-admin/tags`.
- Le schéma ne possède pas `is_active`; l'action destructive existante reste une suppression protégée par 409 quand le tag est utilisé, avec audit `super_admin_tag_disabled`.

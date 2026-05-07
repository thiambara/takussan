---
id: TCK-224
title: "Super-admin — Annonces in-app cross-tenant (broadcast par segment)"
status: review
phase: P2
family: applicatif
estimate: M
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-145]
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#46-announcement-
    - docs/models-spec.md#47-announcementdismissal-
tags: [back, front, super_admin, notifications, p2]
---

## Contexte

La spec étend §2.3 avec la diffusion d'annonces in-app cross-tenant. Aujourd'hui le super-admin n'a aucun moyen de communiquer transversalement (info release, incident en cours, modification CGU) sauf à utiliser un canal externe — ce qui ne touche pas les utilisateurs internes des dashboards et passe à côté du contexte applicatif.

## Objectif utilisateur

Un super-admin compose une annonce multilingue depuis `/super-admin/announcements`, choisit un segment cible (rôle, agence, %), une fenêtre de diffusion et une sévérité — l'annonce s'affiche en bandeau ou dans le centre de notifications jusqu'à dismissal individuel ou expiration.

## Contrat de données

Endpoints super-admin :

- `GET /api/admin/announcements?filter[is_active]=...&sort=-starts_at`
- `POST /api/admin/announcements` — `{ title:{fr,en,wo}, body:{fr,en,wo}, severity, segment, starts_at, ends_at?, is_active }`
- `PATCH /api/admin/announcements/{id}`
- `POST /api/admin/announcements/{id}/deactivate`

Endpoints utilisateur authentifié :

- `GET /api/announcements/active` — set d'annonces actives + non dismissées pour l'utilisateur courant (cacheable 60s, segment résolu côté serveur)
- `POST /api/announcements/{id}/dismiss` — crée une `AnnouncementDismissal`

## Direction UX / Artistique

Composer en deux colonnes : édition multilingue à gauche (TitleField FR/EN/WO + body riche), prévisualisation à droite. Sélecteur de segment compact (chips multi-rôles + sélecteur agences + slider %). Liste à plat avec filtres `is_active` / sévérité. Côté utilisateur : bandeau persistant en haut du dashboard (severity = critical fond rouge, warning ambre, success vert, info gris), bouton "x" pour dismiss. Centre de notifications affiche aussi les annonces non dismissées.

## Contraintes strictes (métier)

- Endpoints `POST/PATCH/POST(deactivate)` super-admin-only.
- Résolution de segment côté serveur uniquement — l'utilisateur ne reçoit que les annonces qui le ciblent (rôle global ou rôle dans le profil actif, ou agence du profil actif, ou bucket rollout%). Le payload n'expose **jamais** les autres annonces (test isolation).
- Le bucket rollout% est déterministe (hash stable sur `announcement_id:user_id`).
- Une annonce avec `severity=critical` ne peut pas être dismissée tant qu'elle est `is_active` (forçage). Les autres niveaux sont dismissibles.
- Activity log obligatoire (`super_admin_announcement_*`).
- Toujours utiliser `fields[...]`, `filter[...]`, `include=`.

## Delta à produire

- [ ] Migrations : `announcements`, `announcement_dismissals`
- [ ] Modèles `Announcement`, `AnnouncementDismissal`
- [ ] Service `App\Services\Announcements\AnnouncementResolver` (segment match + bucket rollout déterministe)
- [ ] Controller `Admin\AnnouncementController` + `Api\AnnouncementController` (lecture utilisateur, dismiss)
- [ ] FormRequests (validation locales requises FR / EN / WO, dates cohérentes)
- [ ] Activity log événements
- [ ] Frontend super-admin : page `/super-admin/announcements` + composer
- [ ] Composants utilisateur : `GlobalAnnouncementBanner` (monté côté `(public)` et `(dashboard)`) + intégration dans le centre de notifications existant
- [ ] Hook `useActiveAnnouncements()` consomme `/api/announcements/active`
- [ ] Tests backend : isolation segment (un user A ne reçoit pas une annonce ciblant rôle B), critical non dismissable, dismiss créé une row unique, 403 hors super-admin sur écriture
- [ ] Tests UI : composer, bandeau visible, dismiss

## Critères d'acceptation

- [ ] Une annonce ciblant `roles=[agency_admin]` n'est **jamais** retournée à un user `customer` via `GET /api/announcements/active`
- [ ] Le bucket `rollout_percentage` est stable : un user reçoit le même verdict à chaque appel
- [ ] Une annonce `critical` reste affichée tant qu'elle est `is_active` même si `dismiss` est appelé (le bandeau ne disparaît pas)
- [ ] `POST /dismiss` deux fois ne crée qu'une seule `AnnouncementDismissal` (idempotent)
- [ ] Un agency_admin reçoit 403 sur `POST /api/admin/announcements`
- [ ] Chaque mutation produit une entrée d'audit
- [ ] `GET /api/announcements/active` répond ≤ 1 requête SQL (cache + jointure dismissals)

## Hors périmètre

- Push notifications transverses (mobile / web push) — out of scope, in-app only ici
- Campagnes email ciblées — out of scope, ticket dédié post-V2
- A/B testing d'annonces — out of scope
- Acquittement avec lien CTA tracké — out of scope

## Notes d'implémentation

Le matching de segment est centralisé dans `AnnouncementResolver`; l'endpoint actif charge les annonces candidates puis filtre les rôles/agences/rollout côté service pour éviter d'exposer des annonces hors segment dans le payload.

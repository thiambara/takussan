---
id: TCK-366
title: "Annonces cross-tenant — éditer une annonce existante"
status: todo
phase: P2
family: front
estimate: S
wave: 46
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, super-admin, annonces]
---

## Objectif utilisateur

Le super-admin corrige une annonce diffusée — une faute, une date, un ciblage trop large — au lieu de la désactiver et d'en republier une autre.

## Contrat de données

- `PATCH /api/admin/announcements/{announcement}` **existe côté API et n'a aucun appelant côté front.** `patchAdminAnnouncement` est la seule fonction de requête orpheline de `src/lib/queries/super-admin.ts` sur environ quatre-vingt-dix.
- `GET /api/admin/announcements`, `POST /api/admin/announcements`, `POST /api/admin/announcements/{announcement}/deactivate` sont déjà consommés.

## Direction UX / Artistique

- La console sait créer et désactiver ; elle ne sait pas modifier. Le formulaire de création existe déjà et porte les mêmes champs — c'est un mode d'édition qui manque, pas un écran.
- Le ciblage (rôles, agences) se saisit aujourd'hui en **listes d'identifiants séparés par des virgules** (`12,18`). C'est acceptable pour créer vite ; c'est hostile pour relire ce qui a été ciblé. À l'édition surtout, le ciblage doit être lisible sans décodage.
- Une annonce déjà diffusée qu'on modifie doit le dire : l'écran distingue « brouillon » de « en cours de diffusion ».

## Contraintes strictes (métier)

- Éditer une annonce active ne la republie pas et ne réarme pas le `dismissal` déjà posé par les utilisateurs, sauf si l'API en décide autrement — comportement à constater, pas à supposer.
- Les trois langues d'une annonce restent éditables ensemble ; on ne publie pas une correction en français seulement.
- Le ciblage par agence reste borné à des agences existantes.

## Delta à produire

- [ ] Mode édition sur le formulaire d'annonce existant, câblé sur `patchAdminAnnouncement`
- [ ] Distinction visible brouillon / en diffusion
- [ ] Ciblage rôles et agences rendu lisible en lecture (au minimum : noms résolus plutôt que des identifiants nus)
- [ ] Tests : édition d'une annonce active, édition d'un brouillon, ciblage préservé après édition

## Critères d'acceptation

- [ ] AC1 — une annonce existante peut être modifiée depuis `/super-admin/announcements` sans être désactivée puis recréée
- [ ] AC2 — `grep -rn 'patchAdminAnnouncement' takussan-web/src` renvoie au moins un appelant hors de `src/lib/queries/`
- [ ] AC3 — le ciblage (rôles, agences) est restitué **et préservé** après une édition qui ne le touche pas, vérifié par un test sur la charge utile émise
- [ ] AC4 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Le canal de diffusion et le `dismissal` côté utilisateur.
- La planification d'une annonce dans le futur.
- Le ciblage par segment.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

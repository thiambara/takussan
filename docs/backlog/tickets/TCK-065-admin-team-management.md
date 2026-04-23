---
id: TCK-065
title: "Admin — Gestion équipe (ajout / retrait agents)"
status: todo
phase: P1
family: front
estimate: M
created: 2026-04-23
updated: 2026-04-23
depends_on: [TCK-015, TCK-014, TCK-057, TCK-054]
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#22-rôles--permissions
    - docs/features-by-actor.md
  models:
    - docs/models-spec.md#1-agency
    - docs/models-spec.md#2-user
tags: [admin, team, roles, front]
---

## Contexte

TCK-015 (agency members) + TCK-014 (roles & permissions) sont `review` : endpoints d'ajout, retrait, attribution de rôles aux membres d'une agence existent. Le frontend a une page `/admin/roles` fonctionnelle (assignation globale), mais aucune UI dédiée à la gestion d'équipe par agence (invitation d'agents, retrait, rôle par membre).

## Objectif utilisateur

Un admin d'agence doit pouvoir voir la liste des membres de son agence, inviter un nouvel agent (par email), attribuer ou retirer un rôle (agent, agency_admin), et retirer un agent de l'agence.

## Contrat de données

Endpoints à consommer (existants, TCK-015) :

- `GET /api/agencies/{id}/members` — liste membres avec rôles agrégés (filter[role], filter[search])
- `POST /api/agencies/{id}/members` — ajouter un membre existant (par email ou user_id) avec rôle initial
- `PATCH /api/agencies/{id}/members/{user}` — changer le rôle d'un membre
- `DELETE /api/agencies/{id}/members/{user}` — retirer un membre de l'agence
- `POST /api/agencies/{id}/invitations` (si exposé) — envoyer invitation à un email non inscrit

Si l'endpoint d'invitation par email n'existe pas, le fallback est : créer d'abord l'utilisateur (ou demander qu'il s'inscrive) puis l'ajouter par email existant. À confirmer à l'implémentation.

## Direction UX / Artistique

Liste d'équipe claire, à la Slack workspace members / Linear team. Ligne = membre avec avatar, nom, email, rôle badge, date d'ajout, menu action (…). Action "Inviter" en primary top-right, ouvre un modal compact (email + rôle initial). Retrait d'un membre passe par une confirmation explicite.

## Contraintes strictes (métier)

- Seuls `agency_admin` et `super_admin` accèdent à cette page.
- Un `agency_admin` ne peut pas retirer le dernier `agency_admin` de l'agence (guard backend — la UI doit masquer/griser l'action).
- Les rôles attribuables depuis cette UI sont limités à : `agent`, `agency_admin` (pas `customer`, `owner`, etc. — ceux-ci se gèrent ailleurs).
- L'ajout d'un membre existant vérifie d'abord que l'email correspond à un User actif.

## Delta à produire

- [ ] Page `/admin/team` (ou section sous `/admin/agency/team`) : table membres filtrable
- [ ] Modal "Inviter un agent" : champ email, sélecteur rôle, bouton valider
- [ ] Menu action par ligne : Changer rôle · Retirer de l'agence (avec confirmation)
- [ ] Entry navigation dans la sidebar admin ou onglet dans `/admin/agency`
- [ ] Tests Vitest : rendu table, flow invitation, flow retrait, guard dernier admin

## Critères d'acceptation

- [ ] AC1 — La table liste tous les membres de l'agence avec nom, email, rôle, date d'ajout
- [ ] AC2 — Le flow "Inviter" accepte un email existant et attribue le rôle choisi ; erreur 422 mappée si l'email n'existe pas côté back
- [ ] AC3 — Changer le rôle d'un membre persiste et rafraîchit la ligne sans rechargement complet
- [ ] AC4 — Retirer le dernier `agency_admin` est bloqué (UI + message clair) — soit l'action est masquée, soit elle affiche une erreur backend lisible
- [ ] AC5 — Un utilisateur `agent` (non admin) est redirigé en accédant à la page
- [ ] AC6 — `npm run build` + `npm run test` verts

## Hors périmètre

- Invitation par email non inscrit (= workflow email + signup link) — P2, ticket séparé si le besoin émerge
- Gestion permissions granulaires au niveau membre (delegation, scopes custom) — P2/P3
- Congés / disponibilité des agents (P3)

## Notes d'implémentation

_(Rempli à l'implémentation)_

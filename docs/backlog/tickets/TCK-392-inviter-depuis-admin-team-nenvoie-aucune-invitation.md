---
id: TCK-392
title: "« Inviter » depuis /admin/team n'envoie aucune invitation — l'endpoint qui le fait n'a aucun appelant"
status: todo
phase: P1
family: bug
estimate: M
wave: 48
created: 2026-08-27
updated: 2026-08-27
depends_on: [TCK-368]
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#29-administration--configuration
tags: [front, admin, team, invitations, dead-code]
---

## Contexte

Mesuré le 2026-08-27, en implémentant TCK-368. Le ticket TCK-368 posait comme acquis
qu'« une invitation envoyée depuis `/admin/team` » existe. **Elle n'existe pas.**

| Ce qu'on croit | Ce qui est |
|---|---|
| Le bouton « Inviter » de `/admin/team` envoie une invitation | Il appelle `POST /api/agencies/{id}/members` → `AgencyController::addAgent()`, qui **exige un `User` déjà inscrit** (`abort_if($target === null, 422, 'user_not_found_by_email')`) et attache directement `AgentProfile` (+ `AgencyAdminProfile`). **Aucune ligne `invitations` n'est écrite.** |
| Il n'y a pas d'endpoint d'invitation d'agent | `POST /api/agencies/{agency}/agents/invite` existe depuis TCK-258, avec son service, sa policy, son garde `kind=individual`, son profil `draft`, son mail et ses tests. `grep -rn "agents/invite" takussan-web/src` → **aucun résultat** |
| C'est cohérent | `admin.inviteMember.description` dit déjà la vérité — « Saisissez l'email d'un utilisateur **déjà inscrit** » — sous un bouton et un titre qui disent « Inviter » |

Conséquence directe : la zone « invitations en attente » livrée par TCK-368 ne peut être
alimentée que par les assistants Propriétaire et Prestataire. **Un admin d'agence ne peut pas
faire entrer dans son équipe quelqu'un qui n'a pas déjà un compte Takussan.**

## Contrat de données

Aucun endpoint à créer.

- `POST /api/agencies/{agency}/agents/invite` — `email`, `role` ∈ {`agent`, `agent_senior`,
  `agent_manager`}, `first_name`, `last_name`, `phone?`. 403 sur agence `individual`,
  409 si l'e-mail est déjà un agent actif de l'agence.
- `POST /api/agencies/{agency}/members` — reste le chemin « ajouter un compte existant ».

## La décision à prendre — et pourquoi elle n'a pas été prise dans TCK-368

Les deux chemins ne se remplacent pas l'un l'autre, et **`agency_admin` n'est invitable par
aucun des deux** :

- `AgentInvitationService::ALLOWED_ROLES` exclut `agency_admin` délibérément (« promoting /
  creating other admins lives in a separate, more-restricted flow », TCK-209).
- Le générique `POST /api/invitations` accepte `role=agency_admin`, mais **son acceptation ne
  crée aucun profil** : `InvitationService::finalizeAccept()` ne bascule que l'`invitable`, et
  une invitation sans `invitable` n'en a pas. L'invité obtiendrait un compte accepté et
  **aucun accès** — pire que le refus actuel.
- `MemberAgencyRoleSelect` (TCK-279) ne promeut pas non plus : il filtre par
  `base_profile_type`, donc un `AgentProfile` ne peut recevoir qu'un rôle d'agent.

Aujourd'hui, `POST /api/agencies/{id}/members` avec `role=agency_admin` est donc **le seul
chemin existant** vers un second administrateur d'agence — et il exige un compte existant.
Le retirer sans le remplacer serait une régression ; c'est pourquoi TCK-368 n'y a pas touché.

## Delta à produire

- [ ] `/admin/team` propose l'invitation par e-mail d'une personne **sans compte**, câblée sur
      `POST /api/agencies/{agency}/agents/invite`
- [ ] Le chemin « ajouter un compte existant » reste atteignable, et les deux se distinguent
      à l'écran (un libellé « Inviter » qui ajoute sans invitation est ce qui a produit ce ticket)
- [ ] Trancher le cas `agency_admin` : soit l'élargissement d'`ALLOWED_ROLES` avec le profil
      correspondant créé en `draft`, soit un parcours de promotion dédié — **avec un ADR si la
      décision est structurelle**
- [ ] i18n fr/en/wo
- [ ] Tests : un e-mail inconnu produit une ligne `invitations`, et la section de TCK-368
      l'affiche sans rechargement

## Critères d'acceptation

- [ ] AC1 — inviter un e-mail **inconnu de la plateforme** depuis `/admin/team` crée une ligne
      `invitations` en `sent`, et la zone « invitations en attente » l'affiche sans rechargement
- [ ] AC2 — `grep -rn "agents/invite" takussan-web/src` trouve au moins un appel
- [ ] AC3 — le cas `agency_admin` est soit couvert par un test, soit explicitement documenté
      comme hors parcours, avec l'endroit où il se fait à la place
- [ ] AC4 — une agence `individual` ne voit aucun de ces gestes, et l'API les refuse (403) même
      si l'écran est contourné
- [ ] AC5 — `npm run lint`, `npx tsc --noEmit`, `npm run test` et
      `php artisan test tests/Feature/Invitation/` passent

## Hors périmètre

- La zone « invitations en attente » elle-même — TCK-368, livrée.
- Les invitations de propriétaires et de prestataires, qui ont déjà leurs assistants.

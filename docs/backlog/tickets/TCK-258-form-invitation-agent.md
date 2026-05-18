---
id: TCK-258
title: "Écran \"Équipe\" + form invitation Agent (avec choix de rôle)"
status: done
phase: P0
family: applicatif
estimate: S
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-249]
blocks: [TCK-259]
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#22-rôles--permissions"
  models:
    - "docs/models-spec.md#48-invitation-"
    - "docs/models-spec.md#35-agentprofile-"
tags: [back, front, onboarding, agent, invitation, p0]
---

## Objectif utilisateur

Un `agency_admin` doit pouvoir gérer son équipe depuis un écran dédié `/app/team` : voir les agents existants, **inviter un nouvel agent** en choisissant son rôle (junior / senior / manager), suspendre, retirer.

## Contrat de données

Repose sur le pattern Invitation unifié (TCK-249) :

- `POST /api/invitations` avec body :

  ```json
  {
    "email": "agent@example.com",
    "role": "agent|agent_senior|agent_manager",
    "agency_id": 42,
    "invitable_type": "AgentProfile",
    "invitable_data": { "first_name": "...", "last_name": "...", "phone": "..." }
  }
  ```

Endpoints équipe :

- `GET /api/agencies/{agency}/team` — liste des AgentProfiles + AgencyAdminProfiles avec statut.
- `PATCH /api/profiles/{agent_profile}/suspend` — passe `status = suspended`.
- `DELETE /api/profiles/{agent_profile}` — soft delete (archive, pas hard delete).

## Direction UX / Artistique

Page `/app/team` :
- Liste des membres avec avatar, nom, rôle, statut (Actif / Invité / Suspendu)
- Bouton "Inviter un agent" → modal : email + prénom/nom + select rôle
- Action menu par membre : "Renvoyer l'invitation", "Suspendre", "Retirer"

Pas accessible aux agences `individual` (gate UI + backend).

## Contraintes strictes (métier)

- Restriction `Agency.kind = standard` uniquement.
- Permission requise : `manage_team` (par défaut `agency_admin`).
- Conflit email : si déjà membre actif → 409. Si user existe sans profil dans cette agence → invitation créée.
- Choix du rôle limité à `agent`, `agent_senior`, `agent_manager` (pas `agency_admin` — création d'autres admins est un autre flow plus restreint, voir TCK-209).
- Activity log : `agent_invited`, `agent_suspended`, `agent_removed`.

## Delta à produire

- [ ] Endpoint `GET /api/agencies/{agency}/team`
- [ ] Endpoint `PATCH /api/profiles/{agent_profile}/suspend`
- [ ] Endpoint `DELETE /api/profiles/{agent_profile}` (soft)
- [ ] Service : `App\Services\Invitation\AgentInvitationService`
- [ ] Policy : `AgentProfilePolicy@invite|suspend|delete` (kind=standard + manage_team)
- [ ] Tests backend : invitation, list, suspend, delete, refus si individual, refus si pas la permission
- [ ] Page frontend `/app/team` (accessible depuis sidebar `agency_admin`)
- [ ] Composant `<InviteAgentModal>`
- [ ] Composant `<TeamMembersList>` avec actions
- [ ] i18n FR/EN/WO
- [ ] Sidebar : ajout du lien "Équipe" pour les agency_admin de standard uniquement

## Critères d'acceptation

- [ ] AC1 — Un agency_admin standard envoie une invitation, le membre apparaît avec statut "Invité".
- [ ] AC2 — Le menu "Équipe" n'apparaît pas pour un agency_admin individual.
- [ ] AC3 — Suspendre un agent flippe `status = suspended` et le rend non-listable côté CRM/biens (à valider en aval, mais le flag est posé).
- [ ] AC4 — Retirer un agent fait un soft delete, l'historique reste consultable.
- [ ] AC5 — Activity log entries pour les 3 événements clés.

## Hors périmètre

- Wizard onboarding Agent post-acceptation (KYC, zones) — TCK-259.
- Éditeur de rôles personnalisés — autre ticket P1 (existe).
- Délégation fine de permissions à un agent — autre ticket P2.

## Notes d'implémentation

- Backend : `AgentInvitationService` (mirror de `OwnerInvitationService` TCK-256) + `AgentProfilePolicy` (gate `kind === standard` + permission `manage_team`).
  Permission `manage_team` ajoutée au seeder, default-granted à `agency_admin`.
- Endpoints :
  - `GET /api/agencies/{agency}/team` (TeamController, paginé via spatie HasQueryBuilder)
  - `POST /api/agencies/{agency}/agents/invite` (AgentInvitationController)
  - `PATCH /api/profiles/{agent_profile}/suspend` (toggle ; body `{active: true}` réactive)
  - `DELETE /api/profiles/{agent_profile}` (soft delete via SoftDeletes — la migration créait déjà `deleted_at`)
- Migration ajoutée pour rendre `agent_profiles.user_id` nullable (besoin du flow draft → accept, comme owner_profiles).
- AgentProfile : ajout HasQueryBuilder hooks (`$queryFields`, `$requestFilterable`, `$requestLoadable`),
  relation polymorphique `invitations()`, accessor `display_name` (mirror OwnerProfile).
- Activity log : `agent_invited`, `agent_suspended`, `agent_reactivated`, `agent_removed`.
- AgencyAdminProfile : modèle inexistant (les agency_admin sont des `User` avec rôle spatie, pas un profil dédié) ;
  le listing /team retourne donc uniquement les `AgentProfile`. Si un agency_admin doit apparaître dans /team
  côté UI, ce sera via une iteration ultérieure (nouveau ticket).
- Sidebar : entrée "Équipe" visible pour `agency_admin` / `super_admin` ; le gate `kind === 'standard'` est
  appliqué côté page (`redirect('/app')` pour les agences `individual`) — l'info `agency.kind` n'étant pas
  exposée dans le contexte sidebar côté client.
- Frontend : page `/app/team`, `<TeamMembersList>`, `<InviteAgentModal>` (mirror de `<InviteOwnerSheet>`),
  query layer `lib/queries/team.ts` (spatie compliant). i18n FR/EN/WO `team.*`.
- Tests :
  - `tests/Feature/Invitation/InviteAgentTest.php` (11 tests)
  - `tests/Feature/Team/TeamManagementTest.php` (7 tests)
  Total : 18 nouveaux tests, 53 assertions, tous verts.

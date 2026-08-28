---
id: TCK-392
title: "« Inviter » depuis /admin/team n'envoie aucune invitation — l'endpoint qui le fait n'a aucun appelant"
status: done
phase: P1
family: bug
estimate: M
wave: 48
created: 2026-08-27
updated: 2026-08-28
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

- [x] AC1 — inviter un e-mail **inconnu de la plateforme** depuis `/admin/team` crée une ligne
      `invitations` en `sent`, et la zone « invitations en attente » l'affiche sans rechargement
  > Vérifié 2026-08-28, les deux moitiés. **Back** : `InviteAgentTest::test_agency_admin_can_invite_agent_in_standard_agency`
  > poste sur `agents/invite` un e-mail que rien n'a créé, assert `data.status = sent`, la ligne
  > `invitations` avec `invitable_type = AgentProfile`, et le profil `draft` à `user_id = null`
  > (`AgentInvitationService::invite()` ne cherche aucun `User`). `php artisan test tests/Feature/Invitation/`
  > → **82 passés, 283 assertions**. **Front** : `InviteMemberButton.test.tsx` prouve que « Inviter »
  > ouvre bien `InviteAgentDialog` (et non le dialogue « compte existant »), et que son succès
  > invalide `['agency-invitations']` — la clé que lit `PendingInvitationsSection`, donc pas de
  > rechargement ; `InviteAgentDialog.test.tsx` prouve la charge utile envoyée à `inviteAgencyAgent`,
  > qui poste sur `/api/agencies/{id}/agents/invite` (`agency-invitations.ts:166`). 25 cas verts.
- [x] AC2 — `grep -rn "agents/invite" takussan-web/src` trouve au moins un appel
  > Vérifié : 7 occurrences, dont **l'appel réel** `takussan-web/src/lib/queries/agency-invitations.ts:166`
  > (`apiRequest('/api/agencies/${agencyId}/agents/invite', { method: 'POST', … })`). Les six autres
  > sont des docblocks et des tests.
- [x] AC3 — le cas `agency_admin` est soit couvert par un test, soit explicitement documenté
      comme hors parcours, avec l'endroit où il se fait à la place
  > Vérifié — **les deux**, et non l'un ou l'autre. Test back :
  > `InviteAgentTest::test_invite_rejects_disallowed_roles` poste `role = agency_admin` → **422**
  > (`ALLOWED_ROLES = ['agent','agent_senior','agent_manager']`). Test front :
  > `InviteAgentDialog.test.tsx` — « n'offre pas `agency_admin` et renvoie vers le chemin qui
  > existe » assert l'absence du rôle **et** la présence de « Ajouter un compte existant ».
  > L'endroit de remplacement est nommé à l'écran (`admin.inviteAgent.adminNote`, présente en
  > fr/en/wo) et dans le docblock de `inviteAgencyAgent` : `addAgencyMember` → `POST /members`.
- [x] AC4 — une agence `individual` ne voit aucun de ces gestes, et l'API les refuse (403) même
      si l'écran est contourné
  > Vérifié. **Écran** : `app/(dashboard)/admin/team/page.tsx:28` appelle
  > `ensureStandardAgencyOrRedirect(user)` **avant** de rendre `InviteMemberButton` ; le garde est
  > fail-closed et éprouvé par `src/lib/access/__tests__/server-guards.test.ts` (17 cas verts, dont
  > « refuse une agence `individual` », « refuse quand le jeton est absent », et les cinq cas de
  > panne). **API** : les TROIS gestes rendent 403 —
  > `test_individual_agency_admin_gets_403` (`agents/invite`),
  > `test_individual_agency_cannot_add_an_existing_account_as_member` (`POST /members`) et
  > `test_individual_agency_cannot_change_a_member_role` (`PUT`/`PATCH` du rôle, qui rendaient 200
  > avant ce lot). Tous verts dans les 82.
- [x] AC5 — `npm run lint`, `npx tsc --noEmit`, `npm run test` et
      `php artisan test tests/Feature/Invitation/` passent
  > **3 commandes sur 4** mesurées par l'agent de vérification le 2026-08-28 — `npx tsc --noEmit`
  > → sortie 0, aucune ligne ; `npm run lint` → sortie 0, **0 erreur** (38 avertissements
  > préexistants, `no-unused-vars`) ; `php artisan test tests/Feature/Invitation/` → 82 passés /
  > 283 assertions. Les 4 fichiers front du périmètre joués nommément : 25 cas verts.
  >
  > **La quatrième, `npm run test` en entier, jouée par la session déléguante au rituel de fin de
  > branche, le 2026-08-28 : 316 fichiers / 2663 tests / 0 échec.** La case est cochée sur cette
  > exécution-là — celle qui a été prise machine peu chargée, la seule qui dise quelque chose du
  > dépôt plutôt que de la machine.

## Hors périmètre

- La zone « invitations en attente » elle-même — TCK-368, livrée.
- Les invitations de propriétaires et de prestataires, qui ont déjà leurs assistants.

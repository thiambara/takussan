---
id: TCK-2365
title: "Un compte existant entre dans l'équipe par l'invitation, au rôle agent ou administrateur ; `POST /agencies/{id}/members` est retirée, et un membre retiré revient au rôle système"
status: done
phase: P2
family: full
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#48-invitation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-242--post-apiagenciesidmembers-face-au-parcours-dinvitation"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-251--gardes-dexistence-et-dédoublonnages-sur-le-mail-seul-face-aux-comptes-créés-par-numéro"
  adr:
    - "docs/adr/0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md"
tags: [api, front, agencies, team, invitations, membership, super-admin, pistes]
---

## Objectif

Faire entrer un compte existant dans l'équipe d'une agence par le seul parcours d'invitation
(brouillon, lien, acceptation par le compte), au rôle agent ou administrateur. Un membre retiré puis
rattaché reçoit le rôle système demandé. La console de création d'agence demande, facultatif, le
numéro du gérant.

## Contexte

Réfs : **P242.01**, **P242.02**, **P242.03** (angle 242) et **P251.01**, **P251.02** (angle 251), du
fichier de pistes, toutes `validé` (second tour, 2026-10-25).

- `POST /api/agencies/{id}/members` (et son alias historique `POST …/agents`,
  `AgencyController::addAgent`) faisait d'un compte quelconque, désigné par son e-mail, un agent
  **actif** de l'agence, sans invitation, sans accord, sans avis, et rendait ses coordonnées. Elle
  disait aussi si une adresse avait un compte (P242.03), et ne trouvait ni une adresse en casse
  mixte ni un compte créé par numéro (P251.01).
- `ProfileMaterializer::materializeOrRestore` restaurait la ligne d'un membre retiré **avec son
  `agency_role_id`**, donc avec ses capacités d'avant : un rôle personnalisé revenait sans
  `team.assign_role` (P242.02).
- Mesuré au départ (sonde retirée) : réinviter un agent retiré par `agents/invite` rend 201, et son
  acceptation rend **500** (`unique(user_id, agency_id)` heurtée par le brouillon, la ligne retirée
  comptant encore). Une fois la route directe retirée, l'invitation devient le seul chemin de
  retour : il doit aboutir.
- L'invitation d'agent n'admettait pas `agency_admin` (`AgentInvitationService::ALLOWED_ROLES`) et
  son acceptation ne matérialisait aucun `AgencyAdminProfile` (TCK-392, TCK-455).
- La console super-admin ne refusait que l'e-mail déjà pris (409 `agency.admin_email_taken`) ; un
  gérant qui a un compte créé par numéro en recevait un second (P251.02).

## Décision du porteur

- P242.01 : validation du porteur (2026-10-25) : le rattachement d'un compte existant passe par l'invitation (profil brouillon, lien, acceptation par le compte), au rôle agent ou administrateur ; la route `POST /api/agencies/{id}/members` qui crée un profil actif est retirée et le dialogue passe par l'invitation
- P242.02 : validation du porteur (2026-10-25) : un membre retiré puis rattaché reçoit le rôle système demandé, jamais son ancien rôle personnalisé
- P242.03 : validation du porteur (2026-10-25) : fermée par P242.01 : une invitation ne dit rien de l'existence du compte
- P251.01 : validation du porteur (2026-10-25) : fermée par P242.01 : la route est retirée, et l'invitation cherche déjà le compte par adresse repliée ou numéro vérifié
- P251.02 : validation du porteur (2026-10-25) : la console demande, facultatif, le numéro du gérant, cherché parmi les numéros vérifiés : s'il appartient à un compte, rattacher ce compte ou refuser en 409, comme pour l'e-mail

## Delta à produire

- [x] Routes `POST api/agencies/{agency}/members` et `POST api/agencies/{agency}/agents` retirées,
  avec `AgencyController::addAgent`, `AddAgentAgencyRequest` et leur entrée de `ProtectedActions`.
- [x] `AgentInvitationService` : `ALLOWED_ROLES` = `agent`, `agency_admin`. Inviter au rôle
  `agency_admin` se juge en plus par `AgencyPolicy::changeMemberRole` (`team.assign_role`, règle de
  TCK-2205), 403 sinon.
- [x] `InvitationService` : `agency_admin` → `AgentProfile` dans `INVITABLE_TYPE_BY_ROLE` ;
  `finalizeAccept` lie le compte au brouillon et, pour `agency_admin`, matérialise un
  `AgencyAdminProfile` actif. Un compte dont le profil d'agent de cette agence a été retiré : la
  ligne retirée est restaurée (au rôle système), le brouillon est retiré, l'invitation pointe la
  ligne restaurée.
- [x] `ProfileMaterializer` : une ligne restaurée reçoit le rôle système de son type dans son agence.
- [x] `InvitationResource` : `invited_user_id` n'est rendu qu'une fois l'invitation acceptée
  (P242.03 : avant, il disait à l'invitant si l'adresse avait un compte).
- [x] `AgencyProvisioningService` et `StoreAgencyOnboardingRequest` : `admin.phone` facultatif ;
  numéro vérifié d'un compte existant → 409 `agency.admin_phone_taken`.
- [x] Front : le dialogue « Inviter » propose le rôle (administrateur à qui porte
  `team.assign_role`) ; « Ajouter un compte existant » et `addAgencyMember` disparaissent ;
  `destinationDInvitation` mène l'administrateur invité à l'assistant d'agent ; la console de
  création d'agence demande le numéro du gérant.
- [x] ADR-0031 (amendement du 2026-10-25), `docs/features.md`, `docs/models-spec.md` (§48).

## Critères d'acceptation

- [x] AC1 — `POST /api/agencies/{a}/members` et `POST …/agents` ne sont plus enregistrées ; un admin
  qui les appelle reçoit 405 (`members`, dont `GET` reste) et 404 (`agents`), et aucun profil n'est
  écrit.
- [x] AC2 — un admin invite un compte existant au rôle `agency_admin` : 201, profil d'agent
  `draft` sans compte, aucun `AgencyAdminProfile` avant l'acceptation ; à l'acceptation, le compte
  est agent et administrateur actif de l'agence.
- [x] AC3 — un admin sans `team.assign_role` invite au rôle `agency_admin` : 403, aucune invitation ;
  au rôle `agent` : 201. L'admin principal invite au rôle `agency_admin` sans la capacité.
- [x] AC4 — un agent retiré, au rôle personnalisé (`team.assign_role`, `payouts.approve`), réinvité
  au rôle `agent`, accepte : 200 (et non 500), un seul profil d'agent pour le couple, actif, au rôle
  système « agent » ; il ne porte plus ni `team.assign_role` ni `payouts.approve`.
- [x] AC5 — `PUT …/members/{u}/role` agent → owner → agent : le profil restauré porte le rôle
  système, pas le rôle personnalisé d'avant.
- [x] AC7 — une adresse connue (en casse mixte) et une adresse inconnue rendent la même réponse
  d'invitation, `invited_user_id` nul ; le compte est pourtant trouvé (en base).
- [x] AC6 — console : `admin.phone` = numéro vérifié d'un compte existant → 409
  `agency.admin_phone_taken`, ni agence ni compte créés ; numéro non vérifié ou sans compte → 201.

## Hypothèses

- P251.02 : « rattacher ce compte ou refuser en 409, comme pour l'e-mail » — l'e-mail refuse en 409 ;
  le numéro fait de même. Le numéro saisi sert à la recherche et n'est pas écrit sur le compte neuf :
  un numéro tapé par un tiers n'est pas celui du compte (P234.04, TCK-2280), et le gérant le
  vérifiera lui-même.
- La reprise d'une ligne retirée à l'acceptation ne vaut que pour le profil d'agent ; le bailleur
  retiré puis réinvité garde le comportement d'avant (hors des pistes du lot).
- Le dialogue « Ajouter un compte existant » est fondu dans « Inviter » : l'invitation par e-mail
  trouve déjà le compte existant (acceptation après connexion), deux boutons qui font le même geste
  tromperaient.

## Hors périmètre

- Promouvoir un membre existant reste `PUT /agencies/{id}/members/{u}/role` (`team.assign_role`) :
  c'est le second chemin vers un administrateur, inchangé.
- Le bailleur retiré puis réinvité (même `unique(user_id, agency_id)`), à mesurer à part.

## Notes d'implémentation

- Avant correctif : 9 rouges sur 11 (API) — route enregistrée, `POST …/members` 200, invitation
  `agency_admin` 422, acceptation d'un agent retiré **500**, rôle personnalisé restauré, numéro
  ignoré (201). Puis le test d'existence : `invited_user_id` = 2 au lieu de `null`.
- Ablations API (chaque correctif retiré, puis remis) : remise du rôle système dans
  `ProfileMaterializer` → 2 rouges ; reprise de la ligne retirée → 1 rouge (500) ; garde
  `changeMemberRole` → 1 rouge ; création de l'`AgencyAdminProfile` → 1 rouge ; masque
  d'`invited_user_id` → 1 rouge ; garde du numéro dans le service → 1 rouge ; règle `admin.phone`
  → 2 rouges.
- Ablations front : rôle envoyé figé à `agent` → 1 rouge ; filtre `team.assign_role` → 1 rouge ;
  numéro non envoyé → 1 rouge ; message du conflit de numéro → 1 rouge ; `agency_admin` retiré de
  `destinationDInvitation` → 1 rouge ; ancien `InviteMemberButton` remis → 1 rouge.
- Piège : la première version du test du bouton cherchait « compte existant » par son libellé. La
  clé de traduction partie avec le geste, l'ancien bouton remis s'affichait sous sa clé brute, et le
  test restait vert. Le test compte désormais les boutons.
- `InviteMemberDialog.double-facteur` et `.role-admin` sont supprimés avec leur composant : la garde
  du second facteur est déjà éprouvée par `InviteAgentDialog.double-facteur.test.tsx`, et le cas du
  rôle d'administrateur est repris dans `InviteAgentDialog.test.tsx`.
- Tests retirés avec la route : les quatre cas `POST …/members` d'`AgencyMembersListTest`, les trois
  cas de rattachement de `MemberRoleChangeCapabilityTest` (TCK-2205), les deux d'`InviteAgentTest`,
  celui d'`AgencyMembersRolesDansLAgenceTest` et le cas `membre` d'`ExistsLigneSupprimeeTest`.
  `TeamFormationBoundaryTest` porte la frontière sur les deux rôles de l'invitation.

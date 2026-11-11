---
id: TCK-2739
title: "Juger les capacités de rôle de N membres en un nombre fixe de requêtes : étendre l'amorce de MembershipCapabilityResolver::primed() aux rôles"
status: todo
phase: P3
family: technique
estimate: M
wave: null
created: 2026-11-11
updated: 2026-11-11
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [technique, autorisation, performance, capacites, suivi-lot-2]
---

## Objectif utilisateur

Ce ticket ne change aucun écran ni aucun verdict d'autorisation. Une liste qui juge une capacité pour
plusieurs membres d'une agence coûte le même nombre de requêtes pour une équipe de 2 et pour une équipe de 10.

## Contexte

`MembershipCapabilityResolver::primed()` (TCK-603) charge en groupe, le temps d'un callback, l'**appartenance**
des couples (utilisateur, agence) : sortes `staff`, `agent`, `owner`, et les sortes paresseuses `owner_any` et
`blocked_owner`. Il ne charge **aucune capacité de rôle**. `allows()` → `resolveDirect()` relit, pour chaque
utilisateur jugé :

- le niveau de plateforme (`resolvePlatform`) ;
- une requête par type de profil (`roleAllows`, `agency_role_id` des profils actifs) ;
- la collaboration de prestataire (`serviceProviderRoleAllows`) ;
- les délégations en vigueur (`delegationAllows`), et le délégant rejugé en propre ;
- et, côté policy, souvent un `Agency::find()` (par exemple `InvitationPolicy::invitesAt`).

Deux tickets du lot 2 ont mesuré ce coût et l'ont accepté borné, par décision de la session (2026-11-11) :

- **TCK-2723, AC3** : la lecture d'une alerte coûte à l'agent 5 requêtes de plus qu'à l'admin (43 contre 38 à
  20 alertes). L'écart est constant de 1 à 20 alertes, et l'AC est tenu « à écart constant ». L'admin passe le
  résolveur par son raccourci de profil, l'agent par la table de vérité.
- **TCK-2726, AC5** : la demande d'un nouveau lien d'invitation coûte 29 requêtes pour une équipe de 2 et 93 pour 10,
  par repli (l'invitant parti), soit environ 8 requêtes par membre jugé par `InvitationPolicy::resend`. Le cas nominal
  est constant. L'AC est accepté borné, car la voie est rare et limitée (5 demandes par heure et par IP, une résolution
  par 24 h et par invitation).

## Ce qui a déjà été rejeté, et pourquoi

Une **mémoïsation** par (utilisateur, agence, capacité) a été essayée en revue de TCK-395 et retirée : elle faisait
rougir 4 des 10 cas de `RoleDelegationCapabilityTest`. Surtout, la fenêtre d'une délégation n'a rien à quoi
s'accrocher : aucun événement n'est émis quand l'horloge franchit `ends_at` (docblock de
`MembershipCapabilityResolver::filterAllowed()`). Ce ticket ne la réintroduit pas. Une **amorce** ne vit que le
temps du callback et ne survit ni à la requête ni à l'appel, comme les sortes actuelles de `primed()`.

## Delta à produire

- [ ] Des sortes d'amorce neuves, paresseuses comme `owner_any` et chargées à la première demande pour tous les
      couples de l'amorce : les `agency_role_id` des profils actifs par (utilisateur, agence, type), les rôles des
      collaborations actives de prestataire, les délégations en vigueur avec leur délégant, et le niveau de
      plateforme des utilisateurs de l'amorce.
- [ ] `roleAllows`, `serviceProviderRoleAllows`, `delegationAllows` et `resolvePlatform` lisent l'amorce quand elle
      couvre le couple, et jugent seuls sinon. Les portées (`active()`, `enVigueur()`) sont exactement celles des
      jugements unitaires.
- [ ] Le délégant d'une délégation est rejugé **en propre** (borne de TCK-395). S'il n'est pas dans l'amorce, il est
      jugé hors amorce.
- [ ] Les appelants mesurés passent par l'amorce : `InvitationRenewalRequests::recipients()` (repli),
      `ThresholdAlertReading::forAlerts()`.

## Critères d'acceptation

- [ ] AC1 — **Parité** : pour un décor qui croise profils actifs et suspendus, rôle personnalisé, collaboration de
      prestataire, délégation en vigueur, délégation échue et délégant dépouillé de la capacité, le verdict de
      `allows()` est identique avec et sans amorce, capacité par capacité. Une ablation qui change une portée rougit.
- [ ] AC2 — `InvitationRenewalRecipientsTest` : le coût par repli est le même pour une équipe de 2 et pour une équipe
      de 10. L'épinglage actuel, borné au cas nominal, devient l'égalité des deux voies.
- [ ] AC3 — `ThresholdAlertRecipientsVisibilityTest` : l'agent et l'admin coûtent le même nombre de requêtes, ou
      l'écart restant est nommé et justifié dans le test.
- [ ] AC4 — `RoleDelegationCapabilityTest` et `RoleDelegationActivityWindowTest` restent verts sans modification.

## Hors périmètre

- Toute mémoïsation qui survivrait au callback (rejetée, voir plus haut).
- `Agency::find()` dans les policies : à amorcer par l'appelant (relation chargée) s'il pèse encore après ce ticket.

## Notes d'implémentation

**2026-11-11 — implémenté (back-3).**

### Ce que l'amorce charge, et comment

`MembershipCapabilityResolver::primed()` porte cinq sortes de plus. Ce sont des **lignes** (identifiants de rôle,
délégations, niveau de plateforme), jamais un verdict : `AgencyRoleCapabilityCache` est relu à chaque jugement, et
le délégant reste rejugé en propre par `resolveDirect()`. Rien ne survit au callback.

- `roles` — **sans requête de plus** : les trois requêtes de profils actifs que `primed()` posait déjà (`agent`,
  `staff`, `owner`) rendent aussi `agency_role_id`. Même portée que `roleAllows()` (`active()`), une liste par
  (utilisateur, agence, type).
- `collaborations`, `delegations`, `system_roles`, `platform` — paresseuses, chargées à la première demande pour
  tous les couples (`paresseuse()`). Portées reprises des jugements unitaires : collaboration `active`, à rôle,
  profil de prestataire non supprimé (le `whereHas`) ; délégations `enVigueur()` avec leur délégant ; rôles
  `is_system` ; profil plateforme `active()` non supprimé.
- Couverture : `couvert()` exige l'utilisateur **et** l'agence dans l'amorce ; hors d'elle, le jugement est
  unitaire. Un délégant hors amorce est donc jugé hors amorce.
- `HasProfiles::activePlatformLevel()` lit l'amorce (`niveauPlateformeAmorce()`) quand la relation n'est pas
  chargée : c'est ce qui rend constant `Gate::before` (`isSuperAdmin()`), qui ne passe pas par le résolveur.

### Écart au « Hors périmètre » — `Agency::find()` de `InvitationPolicy` (à confirmer)

AC2 exige l'égalité stricte, et `InvitationPolicy::invitesAt()` relisait l'agence pour **chaque** membre jugé
(10 des 93 requêtes). Le ticket la met hors périmètre, « à amorcer par l'appelant (relation chargée) s'il pèse encore ».
Il pesait encore : `revoke()` passe la relation `agency` de l'invitation si elle est chargée, `invitesAt()` la lit si
c'est la bonne agence, **qu'elle porte `primary_admin_id` et `status` et n'est pas supprimée** (sinon
`Agency::find()`, comme avant : une relation chargée en `fields[agencies]=id` jugerait autrement), et `InvitationRenewalRequests::recipients()` la charge une
fois (`loadMissing`). Le nominal ne change pas de coût (un chargement remplace une relecture).
`InvitationPolicyAgenceChargeeTest` (4 tests) : sans relation, relation complète et relation en champs restreints
rendent le même verdict pour l'admin principal (raccourci), une agence suspendue, une agence supprimée, et l'admin
d'une agence active (versant accordé). Ablations : sans le contrôle des champs → 3 rouges ; sans le contrôle de
suppression → 1 rouge.
**Recommandation** : garder ; c'est exactement la forme que le « Hors périmètre » prévoyait, appliquée au seul site mesuré.

### Mesures

- AC2 — `test_le_cout_du_repli_ne_croit_pas_avec_l_equipe` (nouveau) : repli (l'invitant parti), équipe de 2 et de 10
  → **même compte** de requêtes (avant : 29 et 93). Le nominal garde son épinglage. Ablations, md5 restauré : la policy
  qui relit l'agence au lieu de la relation → rouge ; `activePlatformLevel()` qui ignore l'amorce (`Gate::before` relit
  le profil plateforme de chaque membre) → rouge.
- AC3 — `ThresholdAlertReading::forAlerts()` amorce le lecteur **et les admins** de chaque agence de la page (lus
  avant l'amorce, une requête par agence comme avant). Agent 31, admin 30 (avant : 43 et 38). L'écart d'**une**
  requête est nommé et épinglé dans le test : +2 pour l'agent (collaborations et délégations, que seul un jugement
  refusé parcourt), +1 pour l'admin (`staffAgencyId()` → `isStaffAt()`, hors amorce, qui borne la liste dans
  `ThresholdAlertController::index` — tracé par pile d'appels —, et essaie le profil d'agent avant celui d'admin). Les jugements `reports.view_agency` des admins (`forMetric`) ne coûtent plus une
  série de requêtes par admin.
- AC1 — `tests/Unit/Services/Membership/MembershipCapabilityResolverPrimedParityTest.php` : `allows()` (49 capacités ×
  22 membres, agence de l'amorce, et une seconde agence pour quatre d'entre eux ; amorcé sur une agence, puis sur les
  deux — le prestataire y a des verdicts opposés), dont une collaboration supprimée en douceur, `filterAllowed()` et
  `allowsDirectly()` jugent pareil avec et sans amorce. Le décor discrimine (18 assertions sur des verdicts attendus).
  Ablations, une à la fois, md5 restauré :
  - P1 `roles` sans `active()` → rouge ;
  - P2 `collaborations` sans le statut → rouge ;
  - P3 `collaborations` avec le profil de prestataire supprimé (`withTrashed` aux deux endroits) → rouge ;
  - P4 `delegations` en `active()` au lieu d'`enVigueur()` → rouge ;
  - P5 `platform` sans `active()` → rouge ;
  - P6 `couvert()` sans le contrôle d'agence → rouge.

### Non-régression

- AC4 : `RoleDelegationCapabilityTest` et `RoleDelegationActivityWindowTest` verts **sans modification**.
- Joués un par un (84 fichiers, 576 tests, tous verts) : les classes des délégations, du résolveur
  (`MembershipCapabilityResolverTest`, `…CacheTest`, `ServiceProviderAgencyRoleTest`), des appelants existants de
  `primed()` (`DocumentVaultPrimedVaultParityTest`, `DocumentVaultPrimedVerdictParityTest`, `DocumentVaultOwnerTest`,
  `PropertyIndexQueryBudgetTest`, `PropertyOccupancyQueryCountTest`), des alertes de seuil, de toutes les invitations,
  des niveaux de plateforme et de l'impersonation, `StaffAgencyIdTest`, `BasePolicyTest` — avant le durcissement de
  la policy ; rejoués depuis : la parité, `InvitationPolicyAgenceChargeeTest`, `InvitationRenewalRecipientsTest`,
  `ThresholdAlertRecipientsVisibilityTest`.
- Aucun changement de spec.
- Portée : `activePlatformLevel()` lit désormais l'amorce dans **tout** callback de `primed()` (liste des biens,
  coffre de documents, `DocumentResource`), pas seulement dans les deux appelants mesurés — même portée, une requête
  pour tous les utilisateurs de l'amorce au lieu d'une par jugement.
- Coût : la classe de parité ajoute ~30 s à la suite (le versant « sans amorce » coûte ~6 requêtes par jugement).

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

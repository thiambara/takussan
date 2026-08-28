---
id: TCK-395
title: "Une délégation accorde `agency_admin` en entier, ou rien du tout — les deux se mesurent"
status: doing
phase: P2
family: back
estimate: M
wave: 48
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#1-user
tags: [back, permissions, delegation, securite, dette-ac]
---

## Contexte — d'où vient ce ticket

Ouvert pendant l'implémentation de [TCK-369](TCK-369-delegation-temporaire-ecran-manquant.md),
qui a livré l'écran de délégation. Le ticket excluait explicitement toute modification du backend
(« il est livré et éprouvé par TCK-108 »). L'écran l'a pourtant rendu visible : **il faut bien
proposer une liste de rôles, et c'est en la mesurant qu'on voit ce que chaque entrée accorde.**

Trois mesures prises le 2026-08-27, chacune reproductible en une commande.

## Mesure 1 — deux des trois rôles délégables n'accordent RIEN

`config('role_delegations.delegable_roles')` déclare `['agency_admin', 'agent', 'owner']`.

Une délégation n'est consultée que par `HasProfiles::hasActiveAgencyDelegation($agencyId, $role)`.
Ses sites d'appel :

```
$ grep -rn "hasActiveAgencyDelegation(" app/Policies app/Services/Invitation \
    | sed 's/.*hasActiveAgencyDelegation/hasActiveAgencyDelegation/' | sort | uniq -c
   6 hasActiveAgencyDelegation((int) $agency->id, 'agency_admin');
```

**Six sites, un seul rôle interrogé.** `MembershipCapabilityResolver` — le résolveur de capacités —
ne consulte pas les délégations du tout (`grep -i delegat` sur le fichier ne rend rien).

Conséquence : déléguer `agent` ou `owner` écrit une ligne, émet trois événements, envoie deux
notifications, s'affiche « Active » à l'écran… et **n'accorde aucun droit nulle part**. C'est un
geste offert par la configuration dont le résultat est vide.

## Mesure 2 — le délégant peut accorder plus qu'il ne détient

`RoleDelegationService::create()` vérifie trois choses : pas d'auto-délégation, bénéficiaire
membre de l'agence, bénéficiaire pas déjà administrateur principal. **Il ne compare jamais le rôle
délégué aux capacités du délégant.**

Or depuis TCK-279, deux `agency_admin` de la même agence peuvent porter des `AgencyRole`
différents, donc des jeux de capacités différents. Un `agency_admin` dont le rôle personnalisé a
été dépouillé peut donc déléguer la chaîne `'agency_admin'` — et les six sites d'appel ci-dessus
l'honoreront comme l'administrateur d'agence *plein*, pas comme celui du délégant.

**La délégation est le seul chemin du dépôt où une capacité s'obtient sans passer par le pivot
`agency_role_capabilities`.** C'est précisément ce que TCK-315 avait fermé pour la branche
prestataire (« plus aucun chemin d'autorisation ne court-circuite le pivot ») ; celui-ci était
resté ouvert.

## Mesure 3 — la policy garde par TYPE de profil, pas par capacité

```php
// app/Policies/RoleDelegationPolicy.php
public function viewAny(User $user, Agency $agency): bool
{
    if ($user->agency_id !== $agency->id) return false;
    return $agency->primary_admin_id === $user->id || $user->isAgencyAdminAt((int) $agency->id);
}
```

`create` et `revoke` délèguent à `viewAny`. Le catalogue `Capability` n'a **aucun** cas
`delegations.*` (`grep -i delegat app/Models/Enums/Capability.php` → rien).

C'est une violation directe du principe non négociable n°1 (« le rôle est un profil polymorphe,
pas une permission ») dans son versant opérationnel : *une capacité se juge pour un couple
(utilisateur, agence)*, pas sur la présence d'un profil. L'écran de TCK-369 garde son bouton par
`team.assign_role` faute de mieux ; **l'écran et la policy ne posent donc pas la même question**, et
c'est la policy qui décide.

## Delta à produire

- [ ] Décider ce que `agent` et `owner` doivent signifier : soit les câbler (le résolveur de
      capacités consulte les délégations), soit les retirer de `delegable_roles`. **Les laisser
      offerts et inertes n'est pas une option.**
- [ ] Borner ce qu'une délégation peut accorder par ce que le délégant détient réellement.
- [ ] Un cas `Capability` dédié pour le geste de délégation, et une policy qui l'interroge.
- [ ] Tests : le délégant restreint ne peut pas accorder plus que lui-même ; un rôle délégable
      accorde effectivement quelque chose.

## Critères d'acceptation

- [ ] AC1 — un `agency_admin` dont l'`AgencyRole` ne porte pas la capacité X ne peut pas produire
      une délégation qui accorde X, et un test le prouve **par exécution d'un geste autorisé
      derrière la délégation**, pas par un assert sur un champ
- [ ] AC2 — chaque valeur de `delegable_roles` accorde un droit mesurable, ou n'y figure plus ;
      un test énumère la config et échoue sur toute entrée inerte
- [ ] AC3 — la policy de délégation interroge une capacité, et un `agency_admin` privé de cette
      capacité reçoit 403 (et non 200)
- [ ] AC4 — retirer le correctif d'AC1 fait rougir son test (vérification par ablation)

## Hors périmètre

- L'écran, livré par TCK-369.
- La délégation de capacités atomiques et le workflow d'approbation — hors périmètre de TCK-108,
  et rien ne les a redemandés depuis.

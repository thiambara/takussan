# Glossaire du domaine

Le vocabulaire de Takussan : un terme par concept, ce qu'il **est**, l'identifiant qui le porte dans le code quand le
français et l'anglais divergent, et les mots à ne plus employer. Format et règles :
[`.agent/skills/domain-modeling/FORMAT-DU-GLOSSAIRE.md`](../.agent/skills/domain-modeling/FORMAT-DU-GLOSSAIRE.md).

**Il grandit au moment où un terme se tranche**, par `/grill-with-docs` (la compétence `domain-modeling`), jamais en
inventaire : un terme absent n'est pas un oubli à combler, c'est un terme que personne n'a encore eu besoin de
trancher. Les entrées ci-dessous sont celles que les ADR fixent déjà ; chacune cite le sien, et chaque ligne
*À éviter* s'appuie sur lui ou sur le code.

Ce fichier ne décrit pas ce que le produit fait (`docs/features.md`) ni les modèles (`docs/models-spec.md`).

## Les acteurs et le périmètre

**Agence** :
L'organisation qui gère des biens pour le compte de **Bailleurs**, et la frontière d'isolation de toute donnée : une
**Capacité** se juge toujours pour un couple (utilisateur, agence). ([ADR-0002](adr/0002-role-est-un-profil-polymorphe.md),
[ADR-0031](adr/0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md))
_Dans le code_ : `Agency`.
_À éviter_ : tenant, locataire (au sens multi-locataire) — `tenant` désigne le **Locataire** dans le code.

**Profil** :
Ce qui fait le rôle d'une personne dans une **Agence** : un rôle est l'existence d'un profil actif, jamais une
permission attachée au compte. Une personne peut en avoir plusieurs, dans plusieurs agences.
([ADR-0002](adr/0002-role-est-un-profil-polymorphe.md))
_Dans le code_ : `app/Models/Profiles/` — `OwnerProfile`, `AgentProfile`, `AgencyAdminProfile`,
`ServiceProviderProfile`, `PlatformProfile`.
_À éviter_ : rôle (au sens d'une permission), permission.

**Profil actif** :
Le **Profil** sous lequel une requête agit ; son agence est le périmètre de la requête.
([ADR-0004](adr/0004-profil-actif-resolu-par-middleware.md))
_Dans le code_ : `request()->activeProfile()`, résolu par `ResolveActiveProfile`.

**Capacité** :
Un geste qu'un utilisateur peut faire dans une **Agence**, nommé `<domaine>.<verbe>`. Les capacités s'additionnent
entre les profils ; l'absence de capacité est le refus. ([ADR-0003](adr/0003-capacites-enum-code-defined.md))
_Dans le code_ : l'enum `Capability`, résolu par `MembershipCapabilityResolver`.
_À éviter_ : permission — `spatie/laravel-permission` est banni (ADR-0002).

**Personnel** (d'une agence) :
Les agents et administrateurs **actifs** d'une **Agence**, délégations en vigueur comprises : eux seuls ont le
périmètre de l'agence. ([ADR-0031](adr/0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md))
_Dans le code_ : `MembershipCapabilityResolver::staffAgencyId()`.

**Bailleur** :
La personne qui confie des biens à une **Agence** et en reçoit les loyers ; il n'a accès qu'à ses propres
ressources. ([ADR-0031](adr/0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md))
_Dans le code_ : `OwnerProfile` ; `landlord_id` sur un bail.

**Locataire** :
La personne qui occupe un bien au titre d'un bail. ([ADR-0005](adr/0005-contrat-http-conserve-roles.md) : `tenant`
est l'un des types de `roles[]`)
_Dans le code_ : `tenant` (`tenant_id` sur un bail).

## Termes retirés

**Courtier** : n'existe plus dans Takussan — ni profil, ni table, ni libellé. Le « password broker » de Laravel est
un homonyme sans rapport. ([ADR-0030](adr/0030-le-courtier-quitte-le-code-et-la-base.md))

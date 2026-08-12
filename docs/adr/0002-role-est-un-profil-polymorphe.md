# ADR-0002 — Le rôle est un profil polymorphe, pas une permission

- **Statut** : Accepté
- **Date de la décision** : 2026-05-17 · **Rédigé rétroactivement** : 2026-08-12
- **Tickets** : TCK-278 (phase 1, socle) · TCK-279 (phase 2, rôles personnalisés — `blocked`) · TCK-138→142 (profils polymorphes)

## Contexte

`spatie/laravel-permission` était utilisé avec son *team scope* pour porter le multi-agence : un
utilisateur avait des rôles, et le contexte d'agence était posé par `setPermissionsTeamId()`.

Deux choses ne rentraient pas dans ce modèle.

**La même personne n'a pas un rôle, elle a plusieurs appartenances.** Chez Takussan, quelqu'un est
propriétaire de trois biens dans une agence, agent salarié dans une autre, et apporteur d'affaires
dans une troisième. Le team scope de spatie force à choisir un contexte à la fois et à le poser
globalement — un état mutable, porté par le conteneur, qu'un seul middleware pouvait posséder sans
que rien ne l'empêche d'être écrasé ailleurs.

**Un rôle porte des données propres.** Un `AgentProfile` a un statut, une date d'entrée, une
collaboration ; un `OwnerProfile` peut exister sans utilisateur rattaché (un propriétaire saisi par
l'agence avant d'avoir un compte). Un rôle spatie est une chaîne dans une table de jointure : il ne
peut rien porter.

## Décision

**Le rôle d'une personne est l'existence d'un profil polymorphe actif dans un contexte.**
`spatie/laravel-permission` est **désinstallé** et son retour est interdit.

Six profils dans `app/Models/Profiles/` : `OwnerProfile`, `AgentProfile`, `AgencyAdminProfile`,
`BrokerProfile`, `ServiceProviderProfile`, `PlatformProfile` — plus deux pivots de collaboration.

`hasRole('agent')` devient `isAgentAt($agency)`. La question d'autorisation n'est jamais *« quel est
son rôle ? »* mais toujours *« peut-elle faire ceci, ici ? »* — cf. [ADR-0003](0003-capacites-enum-code-defined.md).

## Conséquences

**Ce que ça rend possible.** Les appartenances multiples cessent d'être un cas limite : elles sont
le modèle. Un profil se désactive dans une agence sans toucher aux autres. Un profil existe sans
utilisateur, ce qui permet de saisir un propriétaire avant qu'il ait un compte.

**Ce que ça coûte.** Le cutover a été large et **irréversible** : les tables `roles`,
`permissions`, `model_has_*` sont supprimées, et le `down()` de
`2026_05_18_120000_drop_spatie_permission_tables` lève délibérément une exception. Il n'existe donc
**aucun chemin de rollback** au-delà de cette migration : la reprise passe par un dump SQL
antérieur. C'est un arbitrage assumé — reconstituer des rôles historiques depuis un seeder n'aurait
restauré qu'une approximation, ce qui est pire qu'un refus.

**Ce que ça n'a pas résolu.** La phase 2 — des rôles personnalisés par agence, portés par un modèle
`AgencyRole` (TCK-279) — **n'est pas implémentée** : le modèle n'existe pas. Or la « Règle 6 » de
`models-spec.md` la décrit **au présent de l'indicatif**, comme une loi en vigueur. C'est une dette
documentaire active (ardoise D-18) : le document promet une invariance que rien ne tient.

**La dette qui subsiste.** Plusieurs docblocks décrivent encore le mécanisme supprimé —
`HasProfiles` se présente comme « Sister trait of HasRoles (spatie) », `LeasePolicy` parle d'« une
permission `leases.renew` (Spatie) », `bootstrap/app.php` présente `ResolveActiveProfile` comme
« sole owner of the spatie team context ». Ces commentaires survivent au code qu'ils décrivent, avec
la même autorité qu'un commentaire juste (ardoise D-21).

## Application

- `app/Models/Profiles/` — 8 fichiers · `app/Models/Concerns/HasProfiles.php` — l'API publique.
- `composer.json` et `composer.lock` : **aucune** occurrence de `spatie/laravel-permission`.
- `database/migrations/2026_05_18_120000_drop_spatie_permission_tables.php` — le cutover.
- **La garde** : `.github/workflows/api-ci.yml`, étape *« Guard — no `Spatie\Permission` imports »*,
  qui `exit 1` sur toute réapparition du namespace dans `app/`, `tests/`, `database/`, `config/`.
  C'est la seule garde d'architecture exécutable du dépôt — et pendant longtemps la seule trace
  vérifiable de cette décision.

# ADR-0003 — Les capacités sont un enum défini en code, résolu par un service unique

- **Statut** : Accepté
- **Date de la décision** : 2026-05-17 · **Rédigé rétroactivement** : 2026-08-12
- **Tickets** : TCK-278 (phase 1) · TCK-279 (phase 2 — `blocked`, non implémentée)

## Contexte

[ADR-0002](0002-role-est-un-profil-polymorphe.md) supprime les rôles au profit des profils. Il faut
alors répondre autrement à la question *« cette personne peut-elle faire ceci, ici ? »*.

Deux voies. Stocker les droits en base — une table de permissions par agence, modifiable à chaud —
ou les définir en code. La première est ce que faisait spatie, et elle a un coût qu'on connaissait :
une table de vérité qui vit en base ne se relit pas, ne se teste pas facilement, et diverge d'un
environnement à l'autre.

Mais la phase 2 du chantier (TCK-279) prévoit précisément des **rôles personnalisés par agence** —
donc des droits en base. La question n'était pas « lequel des deux » mais « comment passer du premier
au second sans réécrire les sites d'appel ».

## Décision

**Les capacités sont un enum PHP `Capability` de 44 cas au format `<domaine>.<verbe>`, sur 12
domaines. Leur résolution passe par un service unique, `MembershipCapabilityResolver::allows(User,
Capability, ?Agency): bool`, dont la signature est gelée.**

Le modèle est **additif** : un utilisateur peut agir s'il a **au moins un** profil qui l'autorise
(OR entre profils, jamais AND). Il n'y a pas de refus explicite — l'absence de capacité est le refus.

La signature gelée est le cœur de la décision : elle est ce qui permettra à la phase 2 de remplacer
la table de vérité par une lecture en base **sans toucher un seul site d'appel**.

## Conséquences

**Ce que ça donne.** Les droits sont lisibles dans un fichier, testables sans base, et identiques
partout. Une capacité inconnue est une erreur de compilation, pas un `false` silencieux.

**Le pont de rétrocompatibilité.** `AppServiceProvider::bootGatesAndPolicies()` boucle sur
`Capability::cases()` et enregistre une `Gate::define()` par capacité — c'est ce qui fait que
`$user->can('leases.terminate')` continue de fonctionner. La Gate dérive l'agence dans un ordre
précis : 2ᵉ argument de `can()` s'il porte une agence → `request()->activeProfile()->agency_id` →
`$user->agency_id`. Ce pont a un coût : il rend l'agence **implicite** dans la plupart des appels,
alors que la décision voulait la rendre explicite.

**Ce qui n'a pas suivi.** `BasePolicy` mappe `viewAny`/`view`/`update` vers des abilities
`{resource}.view` et `{resource}.update` qui **ne correspondent à aucun cas de l'enum** — il n'existe
que `properties.update_own`/`update_any`, et **aucun `*.view`**. Ces méthodes sont donc mortes par
construction. Trois policies sur seize étendent `BasePolicy` (ardoise D-35).

**Ce que la documentation promet et que le code ne tient pas.** La « Règle 6 » de `models-spec.md`
décrit les rôles personnalisés par agence **au présent de l'indicatif** — « chaque profil métier
pointe vers exactement un `AgencyRole` via `agency_role_id NOT NULL` ». Le modèle `AgencyRole`
n'existe pas. TCK-279 est `blocked`. Un lecteur de la spec construit sur une invariance qui n'a
jamais existé.

## Application

- `app/Models/Enums/Capability.php` — 44 cas, méthode `domain()`.
- `app/Services/Membership/MembershipCapabilityResolver.php` — la table de vérité.
- `app/Models/Concerns/HasProfiles.php` — `canActAt(Capability, ?Agency)`, l'API publique.
- `app/Providers/AppServiceProvider.php:415` — `bootGatesAndPolicies()`, le pont.
- `app/Providers/AppServiceProvider.php:362` — `Gate::before()`, le bypass super-admin.
- `tests/Unit/Services/Membership/MembershipCapabilityResolverTest.php`.

> ⚠️ **12 des 16 policies ne sont nommées dans aucun test** (ardoise D-27). Sur un produit
> multi-tenant où l'agence est la frontière d'isolation, c'est la couche dont un défaut est le plus
> coûteux et le moins visible.

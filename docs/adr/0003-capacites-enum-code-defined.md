# ADR-0003 — Les capacités sont un enum défini en code, résolu par un service unique

- **Statut** : Accepté, **amendé le 2026-10-24** (cf. § *Amendement du 2026-10-24 — `payments.reconcile`,
  et une capacité neuve qu'un geste existant exige*)
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

## Amendement du 2026-10-24 — `payments.reconcile`, et une capacité neuve qu'un geste existant exige

Décision du porteur du 2026-10-23, validée le 2026-10-24, sur P116.07 du fichier de pistes
(`docs/plans/2026-10-15-pistes-d-amelioration.md`). Ticket :
[TCK-2260](../backlog/tickets/TCK-2260-gestes-d-admin-juges-par-une-capacite-du-catalogue.md).

**Constat.** Trois gestes de l'admin d'agence ne se jugeaient que par son type de profil
(`isAgencyAdminAt`), sans capacité du catalogue : le rapprochement bancaire
(`BankStatementPolicy`), le journal d'audit de l'agence (`AuditLogController`,
`IndexAuditLogRequest`, `ActivityLogPolicy::export`) et l'accès de l'admin au tableau de bord du
bailleur (`DashboardOwnerController`). L'éditeur de rôles ne pouvait ni les retirer ni le dire.
`payments.record`, la plus proche, est tenue par le rôle système d'agent : elle aurait ouvert à
chaque agent les relevés, lignes et contreparties de toute l'agence.

Ajouter une capacité à l'enum ne la donne pas à tous ceux qui la tenaient de fait. Le résolveur ne
lit plus que le pivot `agency_role_capabilities` (phase 3). `SystemRoleCapabilities::agencyAdmin()`
rend `Capability::agencyAssignable()`, et `membership:reconcile-system-roles` (`docker/release.sh`)
étend les rôles **système** au déploiement. Un admin dont le profil pointe un rôle **personnalisé**
ne la reçoit de nulle part : exiger la capacité neuve lui retirerait le geste.

**Décision.**

1. **`payments.reconcile` entre au catalogue** (48 cas). Elle est réservée par défaut à l'admin :
   le rôle système d'admin la porte, celui d'agent non. Les quatre gestes bancaires (liste, détail,
   import, clôture) l'exigent, avec les lignes, le mapping CSV et la recherche de paiements qui
   lisent la même policy. La forme est celle d'`AgencyPolicy::configure` : l'admin de l'agence ET
   la capacité à cette agence, l'admin principal passant.
2. **Le journal d'audit de l'agence et l'accès de l'admin au tableau de bord du bailleur se jugent
   par `reports.view_agency`**, sous la même forme, sans passe de l'admin principal, comme
   `AgencyPolicy::viewReports`. Le bailleur garde son propre tableau de bord par son seul profil.
3. **Une capacité neuve qu'un geste existant se met à exiger arrive avec une migration de
   données.** Celle-ci l'insère dans les rôles personnalisés dont la base tenait le geste (ici
   `agency_admin`). Elle est idempotente (`insertOrIgnore` sur l'unique du pivot) et en ajout seul,
   et oublie le cache des rôles touchés (`AgencyRoleCapabilityCache`). Son `down()` ne retire la
   capacité que de ces rôles, car aucun ne pouvait la porter avant elle. Les rôles système restent
   à `membership:reconcile-system-roles`.

**Ce qui n'est pas gardé.**

- Aucune garde ne vérifie le point 3 : une capacité neuve exigée par un geste existant, sans
  migration vers les rôles personnalisés, ne rougit rien. Le test qui épingle la largeur
  d'`agency_admin` (`MembershipCapabilityResolverTest`) ne voit que le rôle système.
- Le nombre de rôles personnalisés de base `agency_admin` en préproduction n'est pas compté : la
  migration a été éprouvée sur la base de test seulement.
- Un rôle personnalisé de base `agent` à qui l'éditeur donne `payments.reconcile` n'en tire rien
  (forme « admin ET capacité »), et l'éditeur ne le dit pas.


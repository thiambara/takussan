# ADR-0016 — Le rôle d'agence d'un prestataire est porté par la collaboration, pas par le profil

- **Statut** : Accepté, **amendé le 2026-10-25** (cf. § *Amendement du 2026-10-25 — un seul profil de
  prestataire par compte, tenu par le code*)
- **Date** : 2026-08-17
- **Ticket** : TCK-315
- **Se lit avec** : [ADR-0002](0002-role-est-un-profil-polymorphe.md) (le rôle est un profil
  polymorphe), [ADR-0003](0003-capacites-enum-code-defined.md) (les capacités sont un enum),
  [ADR-0014](0014-catalogue-code-defini-materialise-et-reconcilie.md) (le catalogue se réconcilie)

## Contexte

TCK-279 a posé le pointeur `agency_role_id` sur **trois** tables de profils métier — `agent_profiles`,
`agency_admin_profiles`, `owner_profiles` — et l'a passé NOT NULL. La Règle 6 de `models-spec.md`
(« 1 profil = 1 rôle personnalisé ») en cite **quatre**. La quatrième, `service_provider_profiles`,
n'a rien reçu.

**Ce n'est pas un oubli, c'est un refus à la mesure**, et le refus était le bon geste. Le contrat de
données, relevé sur les migrations le 2026-08-16 :

| Table | `agency_id` | Cardinalité vis-à-vis d'une agence |
|---|---|---|
| `agent_profiles` | oui | 1 profil par (user, agence) |
| `agency_admin_profiles` | oui | 1 profil par (user, agence) |
| `owner_profiles` | oui | 1 profil par (user, agence) |
| **`service_provider_profiles`** | **aucune colonne**, `user_id` **UNIQUE** | **1 profil global, N agences** |

Le lien prestataire↔agence ne vit pas sur le profil : il vit sur
`service_provider_agency_collaborations`, qui porte `(service_provider_profile_id, agency_id)` en
contrainte unique, plus `status`, `started_at`, `ended_at`, `metadata`.

Poser `agency_role_id` sur `service_provider_profiles` aurait donc fait désigner par **un** pointeur
le rôle d'**une** agence, pour un profil qui en sert N. La violation du principe non négociable n°2 —
*une capacité se juge toujours pour un couple (utilisateur, agence)* — aurait été **silencieuse** : le
résolveur aurait rendu un verdict parfaitement plausible, tiré du rôle de la mauvaise agence.

En attendant l'arbitrage, la branche `service_provider` de `MembershipCapabilityResolver` est restée
sur la table de vérité phase 1 (`SystemRoleCapabilities`) :

```php
if ($user->isProviderAt($agencyId)) {
    return in_array($capability, $this->catalog->for(AgencyRoleBaseType::ServiceProvider), true);
}
```

**Cet état n'est pas cassé, et il ne faut pas le présenter comme tel.** `SystemRoleCapabilities` est
la source *même* dont les rôles système sont seedés : tant qu'aucun rôle personnalisé n'existe pour un
prestataire, les deux chemins rendent le même verdict. Ce qui manque n'est pas une correction, c'est
une **capacité** — un rôle personnalisé créé pour un prestataire n'a aujourd'hui aucun effet, et rien
ne le dit.

## Décision

**Le rôle d'agence d'un prestataire vit sur la COLLABORATION :
`service_provider_agency_collaborations.agency_role_id`, NOT NULL, FK `restrictOnDelete`.**

Un prestataire porte donc **un rôle par agence** : « plombier référent » chez l'une, « prestataire
ponctuel » chez l'autre. La ligne de collaboration porte déjà exactement le couple *(profil, agence)*,
c'est-à-dire la granularité que le principe n°2 exige — le pointeur y est à sa place, et aucune
cardinalité ne change.

`MembershipCapabilityResolver` cesse de lire le catalogue pour cette branche et interroge le pivot
`agency_role_capabilities` via le même `AgencyRoleCapabilityCache` **indexé par `agency_role_id`** que
les trois autres profils. Il n'y a plus de chemin d'autorisation qui court-circuite le pivot.

### Ce que la Règle 6 devient

> **1 profil = 1 rôle** — *sauf pour `ServiceProviderProfile`, où c'est **1 collaboration = 1 rôle**,
> soit **1 rôle par agence**.*

L'exception doit être **écrite** dans la Règle, jamais déduite de l'absence d'une colonne. Une
exception qui ne vit que dans un schéma se perd : le prochain lecteur de la Règle 6 verra quatre
profils cités, trois colonnes en base, et conclura à un bug — c'est exactement ce qui a failli se
produire ici.

Les trois autres profils gardent `agency_role_id` **NOT NULL**. Aucun `nullable` n'est rétabli « pour
uniformiser » : c'est le prix de l'uniformité qui serait faux, pas la Règle.

## L'option écartée, et pourquoi

**B — rendre `ServiceProviderProfile` agence-scopé** (lui ajouter `agency_id`, lever le `user_id`
UNIQUE, et poser le pointeur comme sur les trois autres).

Elle uniformise le modèle, et c'est son seul mérite. Elle paie cette uniformité par un **retrait de
capacité** : un prestataire ne pourrait plus servir plusieurs agences avec un seul compte. Le
`user_id` UNIQUE actuel le lui interdit déjà par ligne, et le lever revient à créer N profils pour un
seul humain — c'est-à-dire à recréer, en moins bien, la table de collaboration qui existe déjà pour
ça.

B supposait que le multi-agence était une erreur de modélisation. **C'était une question produit, pas
une question de schéma, et le produit a répondu que non** : la table de collaboration a été créée
délibérément pour porter le lien N:M, elle porte déjà `status` et des dates, et le cas d'usage réel
(un artisan qui travaille pour trois agences) est celui du marché visé.

## Conséquences

**Ce que ça ouvre.** Un rôle personnalisé peut désormais être créé pour un prestataire et il produit
un effet. Deux agences peuvent accorder des droits différents au même prestataire, et le résolveur
rend le verdict de l'agence **demandée**.

**Ce que ça coûte.** Une jointure de plus sur le chemin d'autorisation prestataire
(`service_provider_agency_collaborations` × `service_provider_profiles`), là où il y avait un
`exists()` puis une lecture en mémoire. Le résultat passe par le cache par rôle, donc le coût est
borné à la résolution des `agency_role_id`, pas à celle des capacités.

**Ce que ça n'élimine pas.** `AgencyRoleBaseType::assignableTypes()` continue de rendre les trois
types **portés par une table de PROFIL** — le résolveur s'en sert pour balayer les tables de profils,
et le prestataire est traité par une branche distincte parce que sa table est autre. Le nom est
étroit ; le renommer touchait `AssignAgencyRoleRequest`, hors périmètre de ce ticket.

**Ce que ça interdit.** Créer une collaboration sans rôle. Le hook `creating` de `HasAgencyRole` pose
le rôle système `service_provider` de l'agence quand l'appelant n'en déclare pas — c'est le même
mécanisme qui tient la Règle 6 pour les trois autres profils, et il évite d'exiger de chacun des sites
de création (invitation, onboarding, seeders, tests) qu'il pense au pointeur.

**Ce que ça exige au déploiement.** Le backfill (`2026_08_17_090100`) rattache chaque collaboration
existante — soft-deletées comprises, puisque la colonne passe NOT NULL pour **toutes** les lignes — au
rôle système `service_provider` de **son** agence, puis vérifie qu'il n'en reste aucune sans rôle. Il
échoue avec le compte exact plutôt que de laisser la migration NOT NULL suivante planter sur une
contrainte.

## Amendement du 2026-10-25 — un seul profil de prestataire par compte, tenu par le code

Décision du porteur du 2026-10-25 sur P234.02 du fichier de pistes
(`docs/plans/2026-10-15-pistes-d-amelioration.md`). Ticket :
[TCK-2280](../backlog/tickets/TCK-2280-invitation-acceptee-par-un-compte-existant.md).

**Constat.** Le tableau du Contexte donne `service_provider_profiles.user_id` **UNIQUE**. C'était
déjà faux le jour de la décision : la migration `2026_05_10_170000` a retiré cette contrainte, pour
que plusieurs brouillons d'invitation coexistent sans compte. Le « 1 profil global, N agences »
n'était plus tenu que par la recherche du profil existant à l'invitation (TCK-262). Or cette
recherche ne passait que par l'e-mail. Une invitation par numéro, acceptée par un compte qui avait
déjà son profil, lui en créait un second. `User::serviceProviderProfile()` est un `HasOne`, et la
liste des collaborations du prestataire lit `first()` : il ne voyait pas l'agence qui l'avait
invité, alors que l'agence le voyait.

**Décision.**

1. **Le profil existant se cherche sur le compte que l'invitation désigne**,
   `InvitationService::recipientAccount()` : le compte de l'e-mail, ou celui qui a **vérifié** le
   numéro (ADR-0033). C'est le compte que l'acceptation exigera. Le refus « déjà rattaché à
   l'agence » (409) se juge sur ce même profil.
2. **L'acceptation refuse de lier un brouillon de prestataire à un compte qui a déjà un profil de
   prestataire**, par un 409 nommé `invitation.service_provider_profile_exists`, avant toute
   écriture. L'invitation reste `sent`. Le cas que le point 1 ne couvre pas est celui d'un compte
   connecté dont l'adresse diffère, ou qui a vérifié le numéro après l'envoi.
3. **La règle du Contexte se lit donc ainsi** : un profil de prestataire par compte, tenu par ces
   deux points du code, **pas par le schéma**.

**Ce qui n'est pas gardé.**

- Aucune contrainte en base. Un autre chemin qui créerait un profil de prestataire pour un compte
  qui en a déjà un ne rougirait rien. Le 2026-10-25, l'invitation est le seul créateur
  (`grep -rn "ServiceProviderProfile::query()->create" app` → `ServiceProviderInvitationService`).
- Les comptes qui portent déjà deux profils ne sont ni comptés ni fusionnés.

## Application

- `takussan-api/database/migrations/2026_08_17_090000_add_agency_role_id_to_sp_agency_collaborations.php`
- `takussan-api/database/migrations/2026_08_17_090100_backfill_sp_collaboration_agency_roles.php`
- `takussan-api/database/migrations/2026_08_17_090200_make_agency_role_id_not_null_on_sp_collaborations.php`
- `takussan-api/app/Models/Profiles/ServiceProviderAgencyCollaboration.php` — porte `HasAgencyRole`
- `takussan-api/app/Services/Membership/MembershipCapabilityResolver.php` — `resolveServiceProvider()`
- `takussan-api/app/Models/AgencyRole.php` — `holderQuery()` : le porteur n'est plus toujours un profil
- `takussan-api/tests/Unit/Services/Membership/ServiceProviderAgencyRoleTest.php` — dont
  `test_provider_with_two_agencies_gets_two_different_verdicts`, **le** test qui distingue cette
  décision de l'état antérieur

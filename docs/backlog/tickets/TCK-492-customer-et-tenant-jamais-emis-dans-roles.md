---
id: TCK-492
title: "`customer` et `tenant` ne sont jamais émis dans `roles` — quatre surfaces front sont mortes"
status: done
phase: P0
family: full
estimate: M
wave: 56
created: 2026-08-30
updated: 2026-08-31
depends_on: []
blocks: [TCK-493, TCK-494]
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#1-user
tags: [back, front, roles, profils, onboarding, bug, p0]
---

## Objectif utilisateur

Un locataire ou un acheteur qui se connecte retrouve ses réservations, ses visites et ses baux dans
son menu — au lieu du tableau de bord de quelqu'un que le système ne sait pas nommer.

## Contrat de données

`UserResource:52` émet `'roles' => $this->profileTypes()->all()`.
`HasProfiles::profileTypes()` ne peut rendre que six valeurs : `super_admin`, `agency_admin`,
`agent`, `owner`, `broker`, `service_provider`. **Ni `customer`, ni `tenant`, jamais.**

Le front, lui, décide de tout le menu sur ces deux valeurs :

| Site | Ce qui en dépend | Effet mesuré le 2026-08-30 |
|---|---|---|
| `lib/roles.ts:21` | `isCustomer()` | toujours `false` |
| `lib/roles.ts:45` | `isTenant()` | toujours `false` |
| `AppSidebar.tsx:143` | `occupeUnLogement()` | `false` pour un acheteur pur → « Mes réservations », « Mes visites », « Mes baux » jamais rendues |
| `(accueil)/page.tsx:59` | `isCustomer(user.roles) ? <TenantOnboardingChecklistWidget/>` | le widget **livré par TCK-266** ne se monte jamais |
| `overview/page.tsx:59` | `redirect('/app/overview/tenant')` | branche morte |
| `AppShell.tsx:38` | `customerOnboardingActive` | toujours `false` → le livrable **P0 de TCK-253** ne se déclenche jamais |

**La divergence est datée et son origine est écrite.**
[TCK-278](TCK-278-rbac-profile-based-phase-1.md) (`created: 2026-05-17`) a remplacé les rôles spatie
par `profileTypes()`, et a explicitement renvoyé la suite à plus tard —
*« Profile-isation de `customer` et `tenant` (création de `CustomerProfile` / `TenantProfile`) →
ticket séparé si besoin émerge »* (§ Hors périmètre). **Ce ticket séparé n'a jamais été créé.**
[TCK-253](TCK-253-onboarding-wizard-customer.md) (`created: 2026-05-10`, `status: done`) est
antérieur de sept jours : son livrable a cessé de se déclencher sans que rien ne rougisse.

**La spec, elle, n'a pas bougé** : `features.md#22-rôles--permissions` liste en P0 les rôles
prédéfinis « `agency_admin`, `agent`, `owner`, `tenant`, `customer`, `service_provider` », et
`models-spec.md` note *« customer/tenant dérivés »*. C'est le code qui a divergé de la spec, pas
l'inverse.

## Contraintes strictes (métier)

1. **`customer` et `tenant` sont DÉRIVÉS, pas des profils polymorphes.** `models-spec.md` les
   qualifie de « dérivés » et TCK-278 a renvoyé la création de `CustomerProfile` / `TenantProfile`
   à un besoin qui n'a pas émergé. Créer deux tables pour porter une dérivation serait un
   élargissement de schéma non instruit — la dérivation se calcule.
2. **`tenant` n'est pas un état permanent.** Il se déduit d'un bail actif ; il disparaît quand le
   dernier bail se termine. `customer`, lui, est le plancher : toute identité authentifiée en est
   une, y compris celle qui porte par ailleurs un profil d'agence (principe non négociable n° 2 —
   les rôles sont additifs).
3. **Aucune requête supplémentaire par appel de `roles`.** `profileTypes()` est appelée sur le
   chemin de `/api/auth/me`, sollicité à chaque navigation ; six `exists()` s'y ajoutent déjà. Le
   coût de la dérivation se mesure avant d'être accepté.
4. **Le contrat HTTP ne change pas de forme** : `roles` reste un tableau de chaînes. Aucun client
   n'a à changer pour lire deux valeurs de plus.
5. **La bascule de profil actif n'est pas concernée** : `customer` et `tenant` ne sont pas des
   profils, ils n'entrent donc ni dans `ActiveProfileResolver::TYPE_MAP`, ni dans le sélecteur.

## Delta à produire

**Backend — prescriptif**

- [x] `App\Models\Concerns\HasProfiles::profileTypes()` — dérive `customer` (plancher) et `tenant`
      (au moins un bail actif), sans nouvelle table ni nouveau profil
- [x] Le coût en requêtes de la dérivation est mesuré et documenté dans le ticket
- [x] Tests : `HasProfilesTest` — un compte nu rend `['customer']` ; un compte avec bail actif rend
      `customer` **et** `tenant` ; un bail terminé retire `tenant` ; un `agency_admin` conserve ses
      deux natures

**Frontend — intentionnel**

- [x] Les quatre surfaces recensées ci-dessus redeviennent atteignables, sans qu'aucune ne soit
      réécrite : elles étaient justes, c'est leur condition qui ne s'allumait pas
- [x] Tests : le menu d'un acheteur pur porte réservations, visites et baux ; le widget de
      check-list locataire se monte pour un locataire

## Critères d'acceptation

- [x] **AC1** — `GET /api/auth/me` sur un compte fraîchement créé, sans aucun profil, rend
      `roles: ["customer"]`. *Ce test échoue sur le code actuel* : il rend `[]`.
- [x] **AC2** — Le même compte, devenu locataire d'un bail actif, rend `customer` et `tenant`. La
      fin du bail retire `tenant` et conserve `customer`.
- [x] **AC3** — Un `agency_admin` qui loue par ailleurs un logement rend ses deux natures : le
      modèle est additif, pas exclusif.
- [x] **AC4** — Le menu latéral d'un compte sans profil d'agence porte « Mes réservations »,
      « Mes visites » et « Mes baux ». *Ce test échoue sur le code actuel.*
- [x] **AC5** — Le widget de check-list d'onboarding locataire (TCK-266) se monte pour un locataire.
      *Ce test échoue sur le code actuel.*
- [x] **AC6** — Le nombre de requêtes de `GET /api/auth/me` est relevé avant et après ; l'écart est
      inscrit dans les notes d'implémentation. Une régression non bornée n'est pas acceptée.
- [x] **AC7** — Suite backend et suite front vertes ; Pint propre ; `npm run lint` et
      `npx tsc --noEmit` propres.

## Hors périmètre

- La création de `CustomerProfile` / `TenantProfile` : explicitement renvoyée par TCK-278 à un
  besoin qui n'a pas émergé, et une dérivation ne le fait pas émerger.
- La question d'intention à l'inscription → TCK-493.
- La garde de parité front ↔ back sur l'axe des rôles → TCK-494.
- Le sort du profil `broker` → TCK-495.
- Toute modification de `ActiveProfileResolver::TYPE_MAP` ou du sélecteur de profil.

## Notes d'implémentation

**Une prémisse du ticket était fausse, et elle aurait produit un code faux.**
`leases.tenant_id` **ne référence pas `users`** : la contrainte pointe `customers`
(`2026_04_17_160011_create_leases_table.php:15`), et `customers.user_id` est NULLABLE — un dossier
locataire existe pour quelqu'un qui n'a pas de compte. Un `hasMany(Lease::class, 'tenant_id')` posé
sur `User` aurait comparé un identifiant d'utilisateur à un identifiant de client : **silencieusement
vide dans le cas courant, et FAUX le jour où les deux séquences se croisent.** La relation retenue
est un `hasManyThrough` `User → Customer → Lease`, et
`test_le_bail_d_un_dossier_client_sans_compte_ne_deteint_sur_personne` épingle le cas.

**Le second piège était PostgreSQL, et il a rougi bruyamment.** `tenantLeases()` joint `customers`,
qui porte elle aussi une colonne `status`. Un `whereIn('status', …)` nu rend
`SQLSTATE[42702] column reference "status" is ambiguous` — mesuré par ablation. La requête écrit donc
`leases.status` qualifié (piège n° 7 de `CLAUDE.md`).

**Le coût mesuré (AC6) : 6 → 7 requêtes.** `customer` est gratuit (plancher, aucune requête) ;
`tenant` vaut exactement un `exists()`. Épinglé par
`test_la_derivation_coute_une_requete_et_une_seule`, qui compte les requêtes de `profileTypes()` —
un test qui rougit si quelqu'un ajoute une dérivation coûteuse sans s'en apercevoir.

**Ce que le ticket n'avait pas vu : la dérivation retourne le SENS d'`isCustomer` côté front.**
`customer` devenant le plancher, `isCustomer()` rend `true` pour un agent, un bailleur et un
super-admin. Or huit sites l'employaient comme DISCRIMINANT, dont
`buildNavItems`, qui enchaîne `if (isCustomer) … else if (isOwner) … else if (isAgent)` : rallumer
`customer` sans relire cette chaîne aurait donné **le menu d'un acheteur à tous les professionnels du
produit**, et aucun test existant ne l'aurait vu (les tables de `AppSidebar.test.tsx` sondent des
rôles isolés, `['agent']`, jamais les jeux que l'API émet réellement, `['agent', 'customer']`).

D'où `isCustomerOnly()` (`lib/roles.ts`), qui répond à « ce compte est-il un client ET RIEN
D'AUTRE ? ». `PROFESSIONAL_ROLES` s'en déduit par soustraction de `USER_ROLES`, jamais par une
seconde liste. Les huit sites ont été relus un par un :

| Site | Nouveau prédicat | Ce que l'ancien aurait produit |
|---|---|---|
| `AppSidebar:179` (chaîne `if/else if`) | `isCustomerOnly` | menu d'acheteur pour tous les professionnels |
| `AppSidebar` ×3 libellés | `isCustomerOnly` | « Mes réservations » affiché à un agent |
| `AppShell:38` (modale TCK-253) | `isCustomerOnly` | modale de bienvenue acheteur pour les admins |
| `MinimalProfileTriggerProvider` | `isCustomerOnly` | feuille de profil minimal pour un agent |
| `DashboardShortcuts:66` | `isCustomerOnly` | `/app/leases` poussé DEUX fois pour un bailleur |
| `profile/page.tsx` ×2 | `isCustomerOnly` | sections « client » sur le profil d'un agent |
| `(accueil):59` (widget TCK-266) | **`isTenant`** | requête de baux pour toute l'agence |
| `InventoryDetail:344` | **`isTenant`** | canevas de signature LOCATAIRE ouvert au bailleur |
| `overview:58` (`!isCustomer`) | terme retiré | prestataire pur plus jamais renvoyé vers `/app` |

`lib/__tests__/roles-derives.test.ts` (17 cas) garde ces jeux de rôles réels ; c'est le fichier à
lire avant de retoucher un prédicat de rôle.

**Ablation faite dans les deux sens** : retirer la dérivation fait rougir 8 des 9 cas de
`DerivedRolesTest` (le neuvième est un `assertNotContains`, vrai par vacuité — c'est attendu d'une
garde négative) ; déqualifier `leases.status` les fait tomber en `QueryException`.

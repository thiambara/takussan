# ADR-0005 — Le contrat HTTP conserve `roles[]`, désormais dérivé des profils

- **Statut** : Accepté — **avec une dette assumée et nommée**
- **Date de la décision** : 2026-05-17 · **Rédigé rétroactivement** : 2026-08-12
- **Tickets** : TCK-278

## Contexte

[ADR-0002](0002-role-est-un-profil-polymorphe.md) supprime la notion de rôle côté backend. Le
frontend, lui, en dépendait partout : construction de la navigation, verrouillage de routes, rendu
conditionnel — tout passait par `isAgent(user.roles)`, `isAdmin(user.roles)`.

Faire descendre les capacités jusqu'au front en même temps que le cutover backend aurait signifié
réécrire la navigation, les gardes de layout et les prédicats de rôle **dans le même chantier**. Le
cutover backend était déjà XL.

## Décision

**Le contrat HTTP conserve un champ plat `roles: string[]` sur le User. Il n'est plus stocké : il est
DÉRIVÉ des profils** (`HasProfiles::profileTypes()`, qui remplace l'ancien `getRoleNames()` de
spatie).

Le front continue de raisonner en rôles. Le back raisonne en capacités.

## Conséquences

**C'est une dette, et elle est nommée comme telle.** Deux modèles mentaux coexistent de part et
d'autre du contrat. Le backend sait répondre à *« peut-elle faire ceci, ici ? »* ; le frontend ne
sait poser que *« qu'est-elle ? »*. Ce sont deux questions différentes, et la seconde donne des
réponses fausses dès qu'une personne a des appartenances multiples : elle est « agent » globalement,
alors qu'elle n'est agent **que dans une agence**.

**Ce que ça ne casse pas.** L'autorisation réelle reste côté serveur. Un front qui affiche un bouton
qu'il ne devrait pas obtient un 403. Le défaut est ergonomique, pas sécuritaire — et c'est pour ça
que la dette a été jugée tenable.

**Ce qui la referme.** Faire descendre les capacités effectives dans la réponse `/me`, et remplacer
les prédicats de rôle par une lecture de capacités scopée par agence. Ce chantier n'est pas ouvert.

**La décision ne vit que dans un docblock.** `src/lib/roles.ts:3-10` porte la seule trace :
« TCK-278 — le contrat HTTP est inchangé ». Un lecteur de `src/types/user.ts`, qui voit
`roles: UserRole[]`, n'a aucune raison de deviner que ce champ est dérivé, ni que le backend n'a
plus de rôles du tout.

## Application

- `src/types/user.ts` — `roles: UserRole[]` dans le contrat.
- `src/lib/roles.ts:14-64` — les 7 prédicats (`isAgent`, `isOwner`, `isAdmin`, `isSuperAdmin`…).
- `src/components/layout/AppSidebar.tsx:57-90` — `buildNavItems(user)`, la navigation construite en
  TypeScript pur à partir des prédicats : pas de descripteur déclaratif, pas de permissions serveur.
- `app/Models/Concerns/HasProfiles.php` — `profileTypes(): Collection<string>`, la dérivation.
- **Aucune garde** ne vérifie que les deux modèles restent cohérents.

---
id: TCK-1287
title: "Statut d'un compte : le front dit `blocked`, comme l'API, et plus `banned`"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-115--statuts-denum-quaucun-chemin-de-app-nécrit"
tags: [web, api, console, utilisateurs, statut, pistes]
---

## Contexte

Réf : **P115.02** du fichier de pistes, `retenu · autonome` (A1, A3).

L'API connaît `active`, `inactive`, `blocked`, `deleted` (`App\Models\Enums\UserStatus`) et écrit
`blocked` au blocage. Le front type `'active' | 'inactive' | 'banned'` : le filtre « Bloqué » de la
console d'équipe envoie `filter[status]=banned` et rend toujours une liste vide ; le tiroir de
détail affiche `blocked` brut ; la page des utilisateurs du super-admin propose en plus `banned`
(« Banni »), toujours vide. `banned` vient d'un second enum PHP sans appelant,
`App\Models\Bases\Enums\UserStatus`.

Mesuré avant correctif (`pre-dev` a2398e474) : `AdminUsersFilters.test.tsx`, option « Bloqué » →
URL `?filter%5Bstatus%5D=banned`.

## Objectif

Le filtre « Bloqué » retrouve les comptes que l'API a bloqués, et le front ne connaît plus que les
statuts de l'API.

## Delta à produire

- [x] `types/user.ts` : `USER_STATUSES` (les quatre cas de l'enum) et `UserStatus` qui en dérive ;
      `AdminUserStatusFilter` passe à `blocked`.
- [x] Console d'équipe : options du filtre (`AdminUsersFilters`, typées `UserStatus`), tons
      (`AdminUsersTable`) et libellés connus du tiroir (`UserDetailDrawer`) sur `blocked`.
- [x] Clé `admin.users.status.banned` renommée `blocked` dans les trois dictionnaires, valeur
      gardée telle quelle (« Bloqué », « Blocked », et le texte `wo` existant, déplacé sans
      réécriture).
- [x] Page des utilisateurs du super-admin et `user-detail.tsx` : l'option et le ton `banned`
      retirés ; `superAdmin.pages.users.statuses.banned` n'a plus de lecteur possible et quitte
      les trois dictionnaires.
- [x] `takussan-api/app/Models/Bases/Enums/UserStatus.php` retiré (A3 : aucun appelant dans
      `app/`, `tests/`, `database/`, `routes/`).
- [x] Garde : `src/types/__tests__/user-status.parity.test.ts`, `USER_STATUSES` ↔ cas de
      `App\Models\Enums\UserStatus`, sur le modèle de `user-roles.parity.test.ts`.

## Critères d'acceptation

- [x] AC1 — Le filtre « Bloqué » de la console d'équipe envoie `filter[status]=blocked`.
- [x] AC2 — `USER_STATUSES` et l'enum de l'API ont les mêmes valeurs ; `banned` n'y est pas.
- [x] AC3 — `AdminUsersTable.*`, `user-detail.double-facteur` et la page des utilisateurs du
      super-admin restent verts.

## Hors périmètre

- L'option `inactive` des filtres, que l'API n'écrit jamais : le classement de la piste la laisse
  au porteur.
- Un libellé pour `deleted` dans la console d'équipe (texte neuf) : le tiroir et la table
  affichent la valeur brute, comme avant pour toute valeur inconnue.
- La ligne d'inventaire d'ADR-0007 qui cite encore `app/Models/Bases/Enums/UserStatus.php`
  (chemin fermé à l'implémenteur).

## Hypothèses

- `blocked` et `banned` désignaient le même état côté produit (« Bloqué » dans les deux
  dictionnaires de la console d'équipe ; le commentaire de la page super-admin le disait).

## Notes d'implémentation

- Ablation : `types/user.ts` et `AdminUsersFilters.tsx` remis → 3 rouges (les deux cas de parité
  et l'URL `banned`) ; remis → 6/6 verts.

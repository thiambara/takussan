---
id: TCK-1241
title: "La console super-admin hors session renvoie vers la connexion avec le chemin demandé, requête comprise"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#23-notifications"
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-97--liens-daction-des-courriels--page-visée-authentification-hôte"
tags: [front, auth, super-admin, notifications, pistes]
---

## Contexte

Réf : **P97.03** du fichier de pistes, `validé` (V2 accordé : la garde d'authentification de
l'opérateur).

Sans jeton, `(super-admin)/super-admin/layout.tsx` renvoyait vers la chaîne fixe
`/auth/login?redirect=%2Fsuper-admin` ; `src/proxy.ts` ne gardait que `/app`. Le lien d'un courriel
qui vise la console (`/super-admin/agency-upgrade-requests/{id}`, cible `kyc_review`) ouvert hors
session menait, après connexion, à l'accueil de la console.

## Décision du porteur

« validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

**Choix retenu** : la piste propose deux voies sans en recommander une (garder `/super-admin` dans
le proxy comme `/app`, ou transmettre le chemin par un en-tête). Retenue : **la garde du proxy**,
la plus étroite des deux — elle teste le même cookie que la mise en page (`getOperatorToken` lit
`auth_token`, impersonation comprise), donc ce qui entre ne change pas ; aucun en-tête neuf à
faire confiance, aucune lecture neuve dans la mise en page, qui garde son refus et son jugement de
l'opérateur (second facteur, `platform.console.access`).

## Objectif utilisateur

L'opérateur qui ouvre hors session le lien d'un courriel arrive, après connexion, sur la page que
le lien désignait.

## Contrat de données

Aucun endpoint.

## Contraintes strictes (métier)

- Avec un cookie `auth_token`, le proxy laisse passer : la mise en page reste seule juge de
  l'opérateur.
- Le retour reste filtré par `destinationInterne`.

## Delta à produire

- [x] `src/proxy.ts` : `/super-admin` (ancré sur une frontière de segment) sans jeton → 307 vers
  `/auth/login?redirect=<chemin + requête>`, comme `/app`.
- [x] `src/__tests__/proxy.test.ts` : chemin, requête, jeton présent, sosies.

## Critères d'acceptation

- [x] AC1 — `/super-admin/agency-upgrade-requests/12` sans jeton → `redirect` vaut ce chemin.
- [x] AC2 — la requête survit (`/super-admin/users?status=banned&q=a%20b`).
- [x] AC3 — avec un jeton, le proxy rend 200 sans `location`.
- [x] AC4 — `/super-administrateur`, `/super-admins` ne partent pas sur la connexion.

## Hors périmètre

- La redirection littérale de la mise en page, devenue un filet : on n'y arrive plus sans cookie
  que si le proxy ne tourne pas.
- `takussan-web/CLAUDE.md` dit encore que le matcher ne couvre pas `/super-admin/*` (chemin fermé à
  l'implémenteur) : à corriger en session.

## Notes d'implémentation

- Ablation : condition du proxy rendue à `isAppPath` seul → 4 rouges (les quatre chemins sans
  jeton rendent 200), remise → 45/45.

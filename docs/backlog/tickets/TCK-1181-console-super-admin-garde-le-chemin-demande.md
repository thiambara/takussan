---
id: TCK-1181
title: "La console super-admin garde le chemin demandé à la connexion : le lien d'une demande de passage en agence survit"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
    - "docs/features.md#23-notifications"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-97--liens-daction-des-courriels--page-visée-authentification-hôte"
tags: [front, auth, proxy, super-admin, notifications, pistes]
---

## Contexte

Réf : **P97.03** du fichier de pistes, `validé`.

Sans jeton opérateur, la mise en page de `/super-admin` renvoyait vers la chaîne fixe
`/auth/login?redirect=%2Fsuper-admin` : une mise en page Next ne reçoit pas le chemin demandé, et
`src/proxy.ts` ne gardait que `/app`. L'opérateur qui ouvrait hors session le lien d'un courriel
(`/super-admin/agency-upgrade-requests/{id}`, cible `kyc_review` → `/super-admin/kyc`) arrivait,
une fois connecté, sur l'accueil de la console.

### Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix de l'implémenteur.** La piste laisse deux voies sans en recommander une : garder
`/super-admin` dans le proxy comme `/app`, ou transmettre le chemin par un en-tête posé par le
proxy. Retenue : **la première**, la plus étroite. Le proxy lit le même cookie (`auth_token`) que
`getOperatorToken`, donc il ne renvoie à la connexion que les requêtes que la mise en page y
renvoyait déjà ; il réemploie la redirection éprouvée de `/app` (chemin et requête, P97.02), sans
en-tête neuf à lire ni à protéger contre une falsification. Avec un jeton, rien ne change : la mise
en page juge seule (second facteur, `platform.console.access`, jeton opérateur pendant une
impersonation).

## Objectif utilisateur

L'opérateur qui clique, hors session, le lien d'un courriel qui vise la console arrive après
connexion sur la page que le courriel annonçait.

## Contrat de données

Aucun endpoint.

## Contraintes strictes (métier)

- Le retour reste filtré par `destinationInterne` (redirection ouverte refusée).
- La garde de la mise en page reste en place, en défense en profondeur.
- Ancrage sur une frontière de segment : `/super-administrateurs` n'est pas la console.

## Delta à produire

- [x] `src/proxy.ts` : `/super-admin` sans jeton → `/auth/login?redirect=<chemin + requête>`.
- [x] `(super-admin)/super-admin/layout.tsx` : commentaire de la branche sans jeton mis à jour.
- [x] `src/__tests__/proxy.test.ts` : chemins avec et sans requête, passage avec jeton, sosies.

## Critères d'acceptation

- [x] AC1 — `/super-admin/agency-upgrade-requests/12` sans jeton → 307 `/auth/login`, `redirect` =
      `/super-admin/agency-upgrade-requests/12` ; idem `/super-admin/kyc`, `/super-admin` et une
      requête à plusieurs paramètres.
- [x] AC2 — avec un jeton, `/super-admin/…` passe sans redirection.
- [x] AC3 — `/super-administrateurs`, `/super-admins/x` ne partent pas sur la connexion.

## Hors périmètre

- `docs/adr/0010-auth-token-sanctum-en-cookie.md:49` et `takussan-web/CLAUDE.md` (« son matcher ne
  couvre pas `/super-admin/*` ») ne disent plus vrai : chemins fermés à l'implémenteur, signalé
  dans la PR.

## Notes d'implémentation

- Ablation : `src/proxy.ts` rendu à `HEAD` → 4 rouges (200 au lieu de 307) ; remis → 45/45.

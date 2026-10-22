---
id: TCK-1481
title: "La déconnexion borne son attente de l'API et efface la session quand même"
status: todo
phase: P1
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-113--appels-du-navigateur-vers-lapi-sans-délai"
tags: [front, auth, session, network, pistes]
---

## Contexte

Réf : **P113.05** du fichier de pistes, `validé`.

`AuthContext.logout()` attend `POST /api/auth/logout` sans borne avant de vider l'état local ; le
relais attend lui-même l'API (`impersonate/stop` sans aucune borne, `auth/logout` bornée à 30 s par
TCK-1215) avant d'effacer les cookies. Sur une API figée, « Se déconnecter » ne produit rien de
visible, et la session reste ouverte dans l'onglet comme dans les cookies.

## Décision du porteur

validé — porteur (2026-10-22) : effacer l'état local et les cookies sans attendre la révocation côté API : attente bornée à quelques secondes, effacement quand même

## Objectif utilisateur

« Se déconnecter » ferme la session en quelques secondes au plus, même quand l'API ne répond pas.

## Contrat de données

Aucun endpoint neuf : `POST /api/auth/logout` (relais Next), `POST /api/auth/logout` et
`POST /api/admin/impersonate/stop` (API), inchangés.

## Contraintes strictes (métier)

- Le relais borne l'attente de ses deux appels à l'API (une seule échéance, 3 s) puis efface
  toujours les cookies, comme sur un échec.
- Le client borne son attente du relais (5 s, au-dessus de celle du relais pour que les cookies
  soient effacés dans le cas courant) puis vide toujours l'état local.
- La révocation reste tentée : un jeton non révoqué expire de lui-même côté API.

## Delta à produire

- [ ] Relais `src/app/api/auth/logout/route.ts` : échéance commune aux deux appels.
- [ ] `logout(token)` de `src/lib/auth.ts` accepte un signal.
- [ ] `AuthContext.logout()` : attente bornée, effacement quand même.
- [ ] Tests : relais dont l'API ne répond jamais → cookies effacés sous la borne ; `AuthProvider`
      dont le `fetch` de déconnexion ne répond jamais → `user` à `null` sous la borne.

## Critères d'acceptation

- [ ] AC1 — API figée : le relais rend sa réponse et efface `auth_token`, `active_profile_id` et la
      session d'impersonation au bout de 3 s.
- [ ] AC2 — relais figé : `user` repasse à `null` au bout de 5 s.
- [ ] AC3 — API qui répond : comportement inchangé (révocation puis effacement).

## Hors périmètre

- Révoquer après avoir rendu la réponse (`after()`), autre voie de la `Piste` non retenue.
- Les autres écritures sans borne du navigateur (reste de P113.01).

## Notes d'implémentation

_(à remplir par implementing-specs)_

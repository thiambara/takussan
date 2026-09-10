---
id: TCK-509
title: "Session client — le jeton du navigateur suit la connexion et la déconnexion sans rechargement"
status: todo
phase: P0
family: bug
estimate: S
wave: 63
created: 2026-09-10
updated: 2026-09-10
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
tags: [front, auth, bug, session, react-query]
---

## Objectif utilisateur

Un utilisateur qui se déconnecte puis se reconnecte — avec le même compte ou un autre — sans
recharger la page retrouve un espace `/app` qui fonctionne : aucune erreur d'authentification,
aucune donnée du compte précédent.

## Contrat de données

**Prémisse mesurée le 2026-09-10** au navigateur (Chrome headless piloté en CDP, en-tête
`Authorization` relevé requête par requête, **un seul document, aucun rechargement**). A =
`owner1@dakarimmo.sn` (jeton `…da1cc4`), B = `agent1@dakarimmo.sn` (jeton `…fc45a3`) :

| Phase | Appels client directs à l'API | `Authorization` envoyé | Statut |
|---|---|---|---|
| Connexion de A depuis `/auth/login` chargée à froid | `conversations`, `property-visits` | **aucun** | **401** |
| Rechargement de `/app` (témoin) | `favorites`, `conversations`, `property-visits` | `…da1cc4` | 200 |
| Sur `/auth/login`, **après** la déconnexion de A | `conversations` | `…da1cc4` (révoqué) | 401 |
| B connecté, navigation dans `/app` | `favorites`, `conversations`, `property-visits`, `/app/messages` | **`…da1cc4`** | **401** |

Le jeton de B n'apparaît dans **aucune** requête client ; les appels BFF (`/api/me/*`, qui lisent
le cookie) rendent 200 aux mêmes instants.

**Cause.** Le jeton vit à deux endroits : le cookie httpOnly (tenu à jour par `set-token` et la
déconnexion) et l'état du contexte d'auth client, initialisé **une seule fois** depuis la prop
serveur du layout racine — que la navigation douce ne remonte pas. Les seules fonctions du
contexte qui mettent ce jeton à jour (`login`, `register`, `logout`) ont **zéro appelant** : la
page de connexion (formulaire et étape 2FA), l'inscription et le callback OAuth posent le cookie
puis n'appellent que `setUser` ; le menu utilisateur de `/app` se déconnecte par une server
action, la `Navbar` publique par le route handler, et aucun des deux ne prévient le contexte.
Le cache React Query n'est vidé nulle part (`grep queryClient.clear` → 0).

Aucun endpoint nouveau. Chemins existants concernés : `POST /api/auth/login` (Laravel),
`POST /api/auth/set-token`, `POST /api/auth/logout`, `GET /api/auth/session-expired` (BFF),
server action `logoutAction`.

## Direction UX / Artistique

Aucun changement visuel. La déconnexion reste une navigation vers `/auth/login`, la connexion une
navigation vers la destination demandée (`?redirect=`), sans écran intermédiaire.

## Contraintes strictes (métier)

- **Une identité côté client = le jeton du cookie courant.** Après toute transition — connexion,
  étape 2FA, inscription, callback OAuth, déconnexion par le menu de `/app` ou par la `Navbar`,
  expiration de session — le jeton que le client transmet est celui de la session en vigueur,
  ou aucun.
- **Aucun chemin d'entrée ni de sortie ne contourne le contexte d'auth.** Un nouveau chemin qui
  poserait le cookie sans en informer le client reproduirait le défaut.
- **Le correctif ne repose pas sur un rechargement complet du document.** Recharger masque la
  double source de vérité sans la supprimer ; la navigation douce est le comportement du produit
  et doit rester juste.
- **Un changement d'identité ne laisse rien de l'identité précédente** : ni réponse serveur en
  cache, ni favoris du store local, ni `active_profile_id` — quel que soit le chemin de
  déconnexion.

## Delta à produire

- [ ] Contexte d'auth : le jeton client suit la session serveur, et un changement d'identité vide
      le cache serveur client et le store local des favoris
- [ ] Connexion (formulaire + étape 2FA), inscription, callback OAuth : passent par le contexte
- [ ] Déconnexion : le menu utilisateur de `/app` et la `Navbar` publique convergent sur un chemin
      qui informe le client
- [ ] `POST /api/auth/logout` efface aussi `active_profile_id`
- [ ] Tests : le scénario A → déconnexion → B **sur un même arbre React**, le premier login à
      froid, et les chemins 2FA / OAuth — rouges sur `dev`, verts après

## Critères d'acceptation

- [ ] AC1 — Connexion depuis `/auth/login` chargée à froid, sans rechargement : **chaque** requête
      client directe à l'API porte le jeton de la session ouverte ; aucune ne part sans
      `Authorization`.
- [ ] AC2 — A connecté, déconnexion par le menu de `/app`, connexion de B **sur le même
      document** : après la déconnexion, aucune requête client ne porte le jeton de A ; après la
      connexion de B, chaque requête client directe à l'API porte **le jeton de B**, et aucune ne
      rend 401.
- [ ] AC3 — Même scénario que AC2 par la déconnexion de la `Navbar` publique.
- [ ] AC4 — Au démarrage de la session de B, le cache React Query ne contient aucune entrée
      obtenue sous A.
- [ ] AC5 — Après la déconnexion, le store local des favoris est vide (les cœurs de A ne
      s'affichent pas pour B ni pour un visiteur anonyme).
- [ ] AC6 — Après la déconnexion, par l'un ou l'autre chemin, le cookie `active_profile_id` est
      absent.
- [ ] AC7 — Le test du scénario AC2 **échoue sur `dev`** et passe avec le correctif — prouvé par
      ablation (retrait du correctif → rouge).
- [ ] AC8 — L'étape 2FA et le callback OAuth satisfont AC1.
- [ ] AC9 — `npm run lint` 0 erreur, `npx tsc --noEmit` propre, `npm run test` vert.

## Hors périmètre

- **Retirer le jeton du JavaScript.** Mesuré le 2026-09-10 : le HTML de `/app` contient le jeton
  en clair (50 caractères, 1 occurrence) parce qu'il est passé en prop au contexte client — le
  drapeau httpOnly du cookie n'y protège donc rien. Faire passer les appels client par le BFF
  same-origin est une décision structurelle : ADR puis ticket dédiés.
- La migration des 27 hooks `useApiQuery` / `useApiMutation` et des 28 fichiers qui lisent le
  jeton du contexte.
- La limitation de débit de `POST /api/auth/login` et la gestion des jetons Sanctum côté API.

## Notes d'implémentation

_(à remplir par implementing-specs)_

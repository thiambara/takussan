---
id: TCK-509
title: "Session client — le jeton du navigateur suit la connexion et la déconnexion sans rechargement"
status: review
phase: P0
family: bug
estimate: S
wave: 63
created: 2026-09-10
updated: 2026-09-11
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

- [x] Contexte d'auth : le jeton client suit la session serveur, et un changement d'identité vide
      le cache serveur client et le store local des favoris
- [x] Connexion (formulaire + étape 2FA), inscription, callback OAuth : passent par le contexte
- [x] Déconnexion : le menu utilisateur de `/app` et la `Navbar` publique convergent sur un chemin
      qui informe le client
- [x] `POST /api/auth/logout` efface aussi `active_profile_id`
- [x] Tests : le scénario A → déconnexion → B **sur un même arbre React**, le premier login à
      froid, et les chemins 2FA / OAuth — rouges sur `dev`, verts après

## Critères d'acceptation

- [x] AC1 — Connexion depuis `/auth/login` chargée à froid, sans rechargement : **chaque** requête
      client directe à l'API porte le jeton de la session ouverte ; aucune ne part sans
      `Authorization`.
- [x] AC2 — A connecté, déconnexion par le menu de `/app`, connexion de B **sur le même
      document** : après la déconnexion, aucune requête client ne porte le jeton de A ; après la
      connexion de B, chaque requête client directe à l'API porte **le jeton de B**, et aucune ne
      rend 401.
- [x] AC3 — Même scénario que AC2 par la déconnexion de la `Navbar` publique.
- [x] AC4 — Au démarrage de la session de B, le cache React Query ne contient aucune entrée
      obtenue sous A.
- [x] AC5 — Après la déconnexion, le store local des favoris est vide (les cœurs de A ne
      s'affichent pas pour B ni pour un visiteur anonyme).
- [x] AC6 — Après la déconnexion, par l'un ou l'autre chemin, le cookie `active_profile_id` est
      absent.
- [x] AC7 — Le test du scénario AC2 **échoue sur `dev`** et passe avec le correctif — prouvé par
      ablation (retrait du correctif → rouge).
- [x] AC8 — L'étape 2FA et le callback OAuth satisfont AC1.
- [x] AC9 — `npm run lint` 0 erreur, `npx tsc --noEmit` propre, `npm run test` vert.

## Hors périmètre

- **Retirer le jeton du JavaScript.** Mesuré le 2026-09-10 : le HTML de `/app` contient le jeton
  en clair (50 caractères, 1 occurrence) parce qu'il est passé en prop au contexte client — le
  drapeau httpOnly du cookie n'y protège donc rien. Faire passer les appels client par le BFF
  same-origin est une décision structurelle : ADR puis ticket dédiés.
- La migration des 27 hooks `useApiQuery` / `useApiMutation` et des 28 fichiers qui lisent le
  jeton du contexte.
- La limitation de débit de `POST /api/auth/login` et la gestion des jetons Sanctum côté API.

## Notes d'implémentation

**Forme retenue : un chemin d'entrée, un chemin de sortie, et pas de resynchronisation depuis la
prop.** `useAuth().openSession(token, user)` pose le cookie, vide le cache React Query puis expose
le jeton ; `useAuth().logout()` révoque, efface les cookies, vide le cache. Tous les écrans
d'entrée (formulaire, 2FA, inscription, OAuth) et les deux sorties (menu de `/app`, `Navbar`) y
passent. Resynchroniser l'état depuis `initialToken` n'a pas été retenu : la prop n'arrive qu'au
prochain rendu serveur du layout racine, donc *après* les premières requêtes — c'est la course
qu'on corrige.

- **La server action `logoutAction` a été retirée, avec `clearToken`** : un effacement de cookie
  côté serveur que le client n'apprend pas est exactement le défaut. Une garde structurelle
  (`src/context/__tests__/AuthContext.chemin-unique.test.ts`) casse sur tout autre appelant de
  `set-token`/`logout` et sur tout effacement de `AUTH_COOKIE_NAME` hors de `src/app/api/auth/`.
- **L'expiration de session** (`getMeAction` → `/api/auth/session-expired` → `/auth/login`) est
  rattrapée par `ReinitialiserSessionClient`, monté dans `(auth)/layout.tsx` : le proxy garantit
  qu'on n'y arrive que sans cookie, donc un jeton dans le contexte à cet endroit est périmé. Il ne
  juge que l'état **au montage** — sinon il refermerait la session que la page de connexion ouvre.
- **AC5 ne demandait aucun code dédié** : l'effet d'amorçage des favoris vide déjà le store quand
  `user` repasse à `null`. Il ne se déclenchait pas parce que le contexte n'apprenait jamais la
  déconnexion. Un `clearLocalFavorites()` explicite dans `logout` s'est révélé vert sous ablation,
  donc redondant, et a été retiré.
- **Les tests utilisent le vrai `createQueryClient()`** (5 min de `staleTime`) : avec un client de
  test à `staleTime: 0`, le scénario AC2 passerait sur `dev`, la requête se refaisant d'elle-même.
  La server action est simulée par son seul effet visible côté client (une navigation).

**AC7 — ablation ciblée**, chaque morceau retiré seul, le test qui le garde relancé :

| Retiré | Rouge |
|---|---|
| `queryClient.clear()` dans `openSession` | AC1 |
| `queryClient.clear()` dans `logout` | `ReinitialiserSessionClient` |
| `logout()` dans le menu de `/app` / dans la `Navbar` | AC2 / AC3 |
| effacement d'`active_profile_id` dans le route handler | AC6 |
| `openSession` → cookie seul, pour la connexion / l'inscription / OAuth | AC1 + 2FA / inscription / AC8 |
| `ReinitialiserSessionClient` inerte / qui juge l'état courant au lieu du montage | ses tests 1 / 3 |

Sur le code de `dev`, les nouveaux tests rendaient 9 rouges sur 10 (le seul vert est le témoin de
la garde structurelle), dont la sonde de la `Navbar` à `Bearer jeton-A` après la connexion de B :
le défaut signalé.

**Re-mesuré au navigateur le 2026-09-11**, protocole de la prémisse (un seul document,
`performance.timeOrigin` identique de bout en bout) : connexion de A à froid → `conversations`,
`favorites`, `property-visits` portent le jeton de A, **200** ; sur `/auth/login` après la
déconnexion par le menu de `/app`, plus aucun appel ne porte le jeton de A ; B connecté puis
quatre pages de `/app` → chaque appel porte le jeton de B, **200**, menu « — Ousmane Ndiaye ».
La sortie par la `Navbar` (AC3) n'est tenue que par son test de composant. ⚠ Le front du worktree
tournait sur `:3010`, l'API n'autorise que `:3000` : Chrome de mesure en `--disable-web-security`,
profil jetable — sans effet sur les en-têtes relevés.

**Reste hors périmètre, et c'est la suite logique** : le jeton est toujours dans le JavaScript
(prop du contexte), le drapeau httpOnly n'y protège rien — ADR à écrire avant tout ticket.
**Vague 63** : TCK-508, en cours sur une autre branche, a pris la 62 ; les deux ajoutent une ligne
à `waves.json`, conflit trivial à la fusion.

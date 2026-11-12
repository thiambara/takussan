---
id: TCK-2765
title: "Quand /api/auth/me dépasse sa borne au rendu du document, la console garde le compte que sa coque a lu : un agent ne voit plus l'état vide d'un visiteur"
status: todo
phase: P2
family: front
estimate: S
wave: 90
created: 2026-11-12
updated: 2026-11-12
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#17-communication--messagerie"
tags: [front, auth, session, messagerie, audit-ux, fragilite]
---

## Objectif utilisateur

L'agent qui ouvre la messagerie pendant que l'API répond lentement voit sa messagerie d'agent. Aujourd'hui, il peut voir celle d'un visiteur sans compte : « Parcourir les annonces » au lieu d'« Écrire à un client ».

## Constat

Relevé par verif-commercial le 2026-11-12 à 21 h 45, sur 0abcb873a, machine à `load average` ~50. Le code est relu le 2026-11-12 au soir (terrain-5).

- **Le layout racine borne sa lecture du compte.** `src/app/layout.tsx` attend `/api/auth/me` au plus `DELAI_ME_RACINE_MS`, soit 5 s (TCK-1217, TCK-1374). Au-delà, `initialUser` vaut `null` et la page part avec le repli anonyme.
- **La coque de `/app` attend la même lecture, sans borne.** Le layout `(dashboard)` appelle `getMeAction()` : la lecture est partagée, et la coque la reçoit quand elle aboutit. La navigation du personnel s'affiche donc.
- **`AuthContext` garde le `null` du layout racine.** Au premier document, l'état `user` d'`AuthContext` naît de `initialUser`, donc `null`. Rien ne le pose ensuite tant qu'aucun `router.refresh()` ni aucune action serveur ne rejoue le layout racine. La règle de TCK-2158 (« un `null` sous un jeton présent garde le compte ») protège un compte DÉJÀ posé, pas un premier rendu.
- **Les composants client lisent `useAuth().user`.** `EtatVideDeLaMessagerie.tsx` calcule `personnel` sur `user?.roles`. Avec `user === null`, l'agent tombe dans la branche visiteur : titre `list.empty`, aide `list.emptyHint`, bouton « Parcourir les annonces ».
- **Résultat : la coque dit « agent », le contenu dit « visiteur ».** Les deux lisent le même `/me`, à deux instants.

Reproduction (à rejouer avant tout correctif) :

1. Sur la démo, connecté en agent (`personas.json` : `agent`), ralentir `/api/auth/me` au-delà de 5 s. Utiliser un délai côté API en local seulement, ou la charge de la machine.
2. Ouvrir `/app/messages` par un chargement complet du document.
3. Attendu : l'état vide du personnel. Mesuré : l'état vide du visiteur, sous la navigation du personnel.

## Contrat

**Aucun changement d'API.** Le défaut est dans le front.

## Direction (à trancher à l'implémentation, une seule voie)

- **a) Recommandée : la coque pose le compte qu'elle a lu.** Le layout `(dashboard)` transmet l'utilisateur de `getMeAction()` à un petit composant client. Celui-ci appelle `setUser` quand `useAuth().user` est `null` sous un jeton présent. Le contexte et la coque disent alors la même chose, pour toute la console, pas seulement la messagerie. La règle de TCK-2158 ne change pas : un compte posé ne se remplace pas par un `null`.
- **b) Écartée : relever la borne de 5 s.** Elle existe pour qu'une page ne reste pas blanche tant que l'API ne répond pas (TCK-1217). La relever déplace le seuil sans fermer le défaut.
- **c) Écartée : corriger l'écran de la messagerie seul**, en le faisant lire le profil actif. Les autres lecteurs de `useAuth().user` dans `/app` gardent le même défaut.

## Critères d'acceptation

- **AC1.** Le layout racine rend `initialUser = null` sous un jeton, et la coque de `/app` reçoit l'utilisateur. L'état vide de la messagerie est alors celui du personnel. Test : layout racine moqué à `null`, coque à l'agent.
- **AC2.** Une déconnexion (`logout`) n'est pas annulée par le composant de a) : sans jeton, rien ne se pose.
- **AC3.** Un compte déjà posé n'est jamais remplacé par celui de la coque s'ils diffèrent. TCK-2158 reste vrai. Test à part.
- **AC4.** Chaque AC a son ablation rouge. Retirer le composant de a) rend AC1 rouge.

## Hors périmètre

- La valeur de `DELAI_ME_RACINE_MS`.
- Le temps de réponse de `/api/auth/me` sous charge.

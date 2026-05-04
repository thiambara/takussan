---
id: TCK-126
title: Fiche bien — "Envoyer un message" devrait rediriger vers /auth/login
status: done
phase: P2
family: bug
estimate: S
created: 2026-04-30
updated: 2026-04-30
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#21-authentification--comptes
tags: [front, bug, p2, auth, messaging, property-detail]
---

## Objectif utilisateur

Quand un visiteur non connecté clique "Envoyer un message" sur la fiche bien, il est redirigé vers la page de connexion `/auth/login` avec un paramètre `redirect=` pointant vers la fiche bien, afin de reprendre son intention après authentification.

## Contrat de données

Aucun changement backend. Le composant de messagerie déclenchable depuis la fiche bien doit vérifier l'état d'authentification avant d'ouvrir le formulaire de composition.

## Direction UX / Artistique

Comportement attendu : redirection directe vers `/auth/login?redirect=/properties/<slug>` — cohérent avec le guard des routes `/app/*` qui redirigent déjà avec ce pattern. La modale "Connexion requise" intermédiaire (comportement actuel) est acceptable comme étape si elle propose un bouton "Se connecter" qui redirige correctement (avec le `redirect=` param).

## Contraintes strictes (métier)

- L'utilisateur non connecté ne doit jamais voir le formulaire de composition de message (§1.7 — conversation 1↔1 entre client et agent nécessite un compte).
- Le paramètre `redirect` doit permettre de revenir sur la fiche bien après login.
- Si la modale "Connexion requise" est conservée, le bouton "Se connecter" de la modale doit inclure le paramètre `redirect=<current-url>`.

## Delta à produire

- [ ] Localiser le handler du bouton "Envoyer un message" sur la fiche bien
- [ ] Vérifier si la modale "Connexion requise" inclut un lien "Se connecter" avec le param `redirect=<current-url>`
- [ ] Si le lien est absent ou incomplet, l'ajouter avec `router.push('/auth/login?redirect=' + encodeURIComponent(pathname))`
- [ ] Tester le round-trip : clic → login → retour fiche bien avec formulaire de message accessible

## Critères d'acceptation

- [ ] Cliquer "Envoyer un message" sans être connecté ne donne pas accès au formulaire de composition
- [ ] L'utilisateur est guidé vers la connexion (via modale avec lien ou redirect directe)
- [ ] Après connexion, l'utilisateur revient sur la fiche bien (paramètre `redirect` respecté)
- [ ] Le comportement est cohérent avec le guard de "Faire une offre" sur la même page
- [ ] Aucune régression sur la messagerie pour les utilisateurs connectés

## Hors périmètre

- Refonte complète du composant de messagerie ou de la modale
- Création d'une conversation pré-remplie avec le bien (UX avancée)

## Notes d'implémentation

- **PropertyContactMessageDialog.tsx** : le guard auth `!user` était déjà en place (gate dialog "Connexion requise" avec lien "Se connecter"). Seul le chemin de redirection était cassé (`/login` → `/auth/login`). Corrigé dans le cadre de TCK-124.
- Aucun autre changement nécessaire — le composant bloquait déjà les utilisateurs non connectés et proposait un lien de connexion avec paramètre `redirect`.

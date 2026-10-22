---
id: TCK-1477
title: "Une seule fenêtre de bienvenue à la fois pour le client et le locataire"
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-101--axe-au-navigateur-des-écrans-app-des-autres-profils-et-des-pages-de-détail"
tags: [front, a11y, welcome, pistes]
---

## Contexte

Réf : **P101.03** du fichier de pistes, `validé`.

`AppShell` monte le parcours de bienvenue client et celui du locataire sous la même condition
(`isCustomerOnly`) : un locataire qui n'a vu ni l'un ni l'autre reçoit deux `Dialog` modaux
ouverts ensemble.

## Décision du porteur

validé — (a) : une file dans `AppShell` ouvre le parcours client d'abord, celui du locataire à sa fermeture, contenus inchangés ; limitée au client et au locataire (propriétaire, agent et administrateur d'agence hors de la piste) ; garde : test d'`AppShell` pour un locataire sans aucune clé vue, un seul `dialog` ouvert (porteur, 2026-10-22)

## Objectif utilisateur

Le locataire qui arrive dans son espace voit une fenêtre de bienvenue, puis la suivante quand il
ferme la première, jamais deux modales empilées.

## Contrat de données

Aucun endpoint neuf : `GET /api/me/welcome-seen` et `GET /api/leases` (baux actifs), déjà lus.

## Contraintes strictes (métier)

- Ordre : le parcours client d'abord, celui du locataire à sa fermeture.
- Le parcours locataire s'ouvre aussi quand le parcours client ne s'ouvre pas (clé déjà vue,
  lecture en échec) : la file ne bloque jamais la seconde fenêtre.
- Contenus des deux parcours inchangés.
- Propriétaire, agent et administrateur d'agence hors périmètre.

## Delta à produire

- [ ] `useWelcomeOnce` dit quand sa fenêtre est réglée (jugée déjà vue, lecture en échec, ou fermée).
- [ ] `CustomerWelcomeWizard` le signale à son parent.
- [ ] `AppShell` ne monte `TenantWelcomeWizard` qu'une fois le parcours client réglé.
- [ ] Test d'`AppShell` pour un locataire sans aucune clé vue : un seul `dialog`, puis le
      parcours locataire à la fermeture du premier.

## Critères d'acceptation

- [ ] AC1 — locataire sans clé vue : un seul `role="dialog"` ouvert, celui du parcours client.
- [ ] AC2 — à sa fermeture (« Passer »), le parcours locataire s'ouvre, toujours seul.
- [ ] AC3 — clé client déjà vue : le parcours locataire s'ouvre directement.

## Hors périmètre

- Les fenêtres de propriétaire, d'agent et d'administrateur d'agence montées ensemble pour un
  compte qui cumule ces rôles.
- La double lecture de `/api/me/welcome-seen` par chaque parcours (P136.03).

## Notes d'implémentation

_(à remplir par implementing-specs)_

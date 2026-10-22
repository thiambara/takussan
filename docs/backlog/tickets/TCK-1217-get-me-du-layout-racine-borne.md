---
id: TCK-1217
title: "La mise en page racine borne `getMe` à 5 s et rend le visiteur anonyme au-delà"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1215]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-79--appels-du-serveur-next-vers-lapi-sans-délai"
tags: [front, resilience, auth, pistes]
---

## Contexte

Réf : **P79.02** du fichier de pistes, `validé`.

`RootLayout` (`src/app/layout.tsx`) attend `getMe` avant de rendre quoi que ce soit dès qu'un
cookie de session ou d'impersonation est présent. Son repli anonyme (`initialUser = null`) n'est
atteint qu'au rejet de `fetch` : 300 s avant TCK-1215, 30 s après. La mise en page racine est
au-dessus de toute page : tant qu'elle attend, aucune page ne part.

## Décision du porteur

« validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Critère accordé : V7. Le délégué avait relevé V2 (une session valide rendue en visiteur anonyme
sur une API lente) avant la validation, en le soumettant au porteur : il est tenu pour accordé
avec elle.

### Choix de l'implémenteur

- **Valeur : 5 s** (`DELAI_ME_RACINE_MS`), celle que recommande la ligne du délégué (« quelques
  secondes, par exemple 5 s »).
- **Seul le `getMe` de la mise en page racine** : `(dashboard)/layout.tsx` reste sous la borne
  générale de TCK-1215 (30 s), comme le délégué le recommande.
- Le repli anonyme actuel est gardé tel quel.

## Reste à faire

La mesure du premier octet par un rendu `next start` contre une API figée, avant et après, que la
piste demande : non lancée (aucun serveur ni build dans ce passage).

## Objectif

Un visiteur connecté reçoit la page, en anonyme, au plus 5 s après une API qui ne répond pas.

## Contrat de données

Aucun.

## Delta à produire

- [ ] `getMe` accepte un `signal` facultatif, transmis à `apiRequest`.
- [ ] `RootLayout` le passe, borné à `DELAI_ME_RACINE_MS`.
- [ ] Test de la mise en page racine avec un `getMe` qui ne se résout jamais.

## Critères d'acceptation

- [ ] AC1 — Sur un `getMe` figé, `RootLayout` se résout sous la borne avec `initialUser = null`.
- [ ] AC2 — La borne demandée vaut 5 s.

## Hors périmètre

- `(dashboard)/layout.tsx` (borne générale de TCK-1215).

## Notes d'implémentation

_(à remplir par implementing-specs)_

---
id: TCK-2816
title: "Sous impersonation, un rafraîchissement dont /me dépasse sa borne ne vide plus le compte : le layout racine dit l'impersonation à AuthProvider"
status: todo
phase: P2
family: front
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#29-administration--configuration"
tags: [front, auth, session, impersonation, fragilite, suite-de-tck-2802, audit-ux, app]
---

## Objectif utilisateur

Le super-admin qui voit la console « en tant que » un agent garde la vue de l'agent après une action qui rafraîchit
la page, même quand l'API répond lentement.

## Contrat de données

**Origine.** Écart relevé par TCK-2802 (notes, « Écart relevé, non traité »), défaut antérieur à ce ticket.

**Constat, relu sur HEAD (`765093279`, TCK-2802 commité) le 2026-11-14.**

- `src/app/layout.tsx` : sous le cookie d'impersonation, `token` vaut `undefined` (TCK-600, ADR-0055 §6) ; `/me` est
  borné à `DELAI_ME_RACINE_MS` (5 s). Au-delà, `initialUser` vaut `null`. `AuthProvider` reçoit
  `initialToken={null}`.
- `src/context/AuthContext.tsx` (TCK-2158) : quand les propriétés changent, un `initialUser` nul vide le compte si le
  jeton est nul aussi (`else if (nouveauJeton === null) setUser(null)`). Sous impersonation, le jeton est TOUJOURS nul :
  un `router.refresh()` dont `/me` dépasse sa borne, après un premier rendu réussi, vide donc le compte.
- `CompteDeLaCoque` (TCK-2765, TCK-2802) ne juge qu'une fois, au montage (`juge`) : il ne repose pas le compte après
  ce vidage. Les lecteurs de `useAuth().user` rendent alors un visiteur sous la navigation de l'agent.
- Hors impersonation, la règle de TCK-2158 est juste : un `null` sous un jeton présent garde le compte, un `null`
  sans jeton dit une session fermée.

## Direction UX / Artistique

Rien de visible ne change hors du cas décrit : sous impersonation lente, la console reste celle de la cible après un
rafraîchissement.

## Contraintes strictes (métier)

- **Aucun jeton ne rejoint la page sous impersonation** (TCK-600, invariant d'ADR-0055). Le signal est un booléen
  dit par le serveur, qui lit le cookie `httpOnly`, comme la coque le fait depuis TCK-2802.
- Sous impersonation, un `initialUser` nul venu d'un rendu serveur garde le compte en place, comme un `null` sous un
  jeton présent. Un utilisateur non nul se pose toujours.
- La sortie d'impersonation (le signal passe à faux, sans jeton) vide le compte comme une session fermée.
- Hors impersonation, TCK-2158, TCK-1992 et TCK-2765 restent vrais tels quels.

## Delta à produire

- Le layout racine transmet l'impersonation à `AuthProvider`.
- `AuthProvider` traite ce signal comme un jeton présent pour la seule règle de vidage.
- Tests vitest à côté de ceux de TCK-2158 et TCK-2802.

## Critères d'acceptation

- [ ] AC1 — `AuthProvider` monté sous impersonation avec l'agent cible, puis re-rendu avec `initialUser={null}` (même
  signal d'impersonation) : l'état vide de la messagerie est celui du personnel (texte présent vérifié), et
  `useAuth().user` est la cible.
- [ ] AC2 — Même séquence sans impersonation et sans jeton : le compte est vidé, l'état vide est celui du visiteur
  (TCK-2158 inchangé).
- [ ] AC3 — Sous impersonation, re-rendu avec un AUTRE utilisateur non nul : c'est lui qui est posé.
- [ ] AC4 — Le signal qui passe de vrai à faux, sans jeton : le compte est vidé.
- [ ] AC5 — Aucun jeton dans le rendu ni dans les propriétés sérialisées vers le client sous impersonation (le test
  d'AC4 de TCK-2802, rejoué sur le layout racine).
- [ ] AC6 — Ablation : le signal ignoré par `AuthProvider` rend AC1 rouge ; le signal traité comme toujours vrai rend
  AC2 et AC4 rouges.

## Hors périmètre

- Allonger ou supprimer la borne `DELAI_ME_RACINE_MS`.
- `CompteDeLaCoque` (TCK-2802) : son jugement unique au montage ne change pas.

## Notes d'implémentation

_(à remplir par implementing-specs)_

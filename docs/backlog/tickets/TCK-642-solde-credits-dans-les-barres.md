---
id: TCK-642
title: Solde de crédits de l'espace affiché dans la navbar publique et la barre de /app
status: review
phase: P1
family: full
estimate: M
wave: 77
created: 2026-10-14
updated: 2026-10-14
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
  models: []
tags: [back, front, credits, navigation, mobile]
---

## Objectif utilisateur

L'annonceur connaît son solde de crédits où qu'il soit, et rejoint la page « Crédits » d'un geste.

## Contrat de données

- `GET /api/credits` (TCK-633, ADR-0061) rend le solde **avec** les lots et un journal paginé :
  trop lourd pour une barre lue à chaque page. Ce ticket ajoute une lecture du seul solde de
  l'espace actif.

## Direction UX / Artistique

- Une pastille sobre (icône + nombre, chiffres tabulaires) qui mène à `/app/credits`.
- Ordinateur : dans la navbar publique et dans la barre de `/app`. Mobile : dans le menu
  (panneau de TCK-641 et menu de `/app`).
- Chargement et échec silencieux : la pastille ne s'affiche pas plutôt qu'un « 0 » faux.

## Contraintes strictes (métier)

- Le solde est celui de l'**espace actif** et suit le changement de profil.
- Visible seulement par qui peut voir le portefeuille (même autorisation que la page « Crédits ») ;
  pour les autres, ni pastille ni lien.
- Un profil sans espace (`credits.no_space`) n'affiche rien et ne produit aucune erreur visible.

## Delta à produire

- [x] Route `GET /api/credits/balance` (`credits.balance`) dans `routes/api/credits.php`
- [x] `CreditController::balance` : même résolution d'espace et même `authorize('viewAny', [CreditLot::class, $agency])` que `show`, réponse `{data: {balance}}`
- [x] Test `CreditBalanceEndpointTest` : solde de l'espace actif, 403 sans droit, 422 `credits.no_space`, solde d'un autre espace jamais lu
- [x] Pastille dans la navbar publique (ordinateur) et la barre de `/app` (ordinateur), entrée dans les menus mobiles
- [x] Tests front : affichée avec le solde, absente sans droit ou en échec

## Critères d'acceptation

- [x] AC1 — `GET /api/credits/balance` rend le solde de l'espace actif, égal au `balance` de `GET /api/credits`
- [x] AC2 — Un utilisateur sans droit sur le portefeuille reçoit 403, et ne voit aucune pastille
- [x] AC3 — La pastille mène à `/app/credits` depuis les deux barres et les deux menus mobiles
- [x] AC4 — Après un changement de profil actif, le solde affiché est celui du nouvel espace
- [x] AC5 — En échec réseau, aucune pastille « 0 » n'est rendue

## Hors périmètre

- L'achat de crédits
- Le rafraîchissement en temps réel après une dépense (relecture à la navigation suffit)

## Notes d'implémentation

- Back : `GET /api/credits/balance` partage avec `show()` la résolution d'espace et l'autorisation (`CreditController::walletAgency()`) ; ablation de l'`authorize` → le test du refus rougit.
- Front : `useSoldeCredits` (`lib/queries/credits-solde.ts`) ne relit qu'au changement de profil CONFIRMÉ par le serveur (le sélecteur écrit l'identifiant de façon optimiste avant le PATCH : indexer dessus relisait l'ancien espace), et par `resetQueries` pour ne pas montrer l'ancien solde pendant la relecture. La clé du cache des profils est recopiée (et gardée égale par un test) : importer `hooks/useProfiles` faisait entrer l'espace i18n `profile` dans la frontière publique.
- Pastille montée seulement pour qui voit le portefeuille (`voitLePortefeuille`) : aucune lecture pour les autres ; non-200 → rien, jamais un « 0 » faux. Barre de `/app` : jeton `background` et non `white` (garde des jetons de `/app`).
- Vérifié au navigateur : 495 (agence individuelle) dans le panneau public et le tiroir de `/app`, 0 (agence standard) dans les deux barres d'ordinateur, lien vers `/app/credits`.

---
id: TCK-1479
title: "Une mutation lancée hors ligne échoue tout de suite au lieu de partir à la reconnexion"
status: done
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
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-113--appels-du-navigateur-vers-lapi-sans-délai"
tags: [front, network, payments, pistes]
---

## Contexte

Réf : **P113.03** du fichier de pistes, `validé`.

`createQueryClient` ne pose pas de `networkMode` : TanStack applique `online`, et une mutation
lancée hors ligne reste suspendue (`isPaused`) sans le dire, puis part seule au retour du réseau.
Dans le sélecteur de paiement, la redirection chez le fournisseur peut alors survenir bien après
que l'utilisateur a renoncé.

## Décision du porteur

validé — porteur (2026-10-22) : `networkMode: 'always'` pour les seules mutations dans `createQueryClient` : une mutation hors ligne échoue tout de suite au lieu de partir seule à la reconnexion

## Objectif utilisateur

Hors ligne, un geste d'écriture (dont l'initiation d'un paiement) dit tout de suite qu'il a échoué,
au lieu de partir seul minutes plus tard.

## Contrat de données

Aucun endpoint touché.

## Contraintes strictes (métier)

- Les seules mutations : le `networkMode` des lectures reste celui par défaut.
- Aucun état d'écran neuf : l'échec passe par le chemin d'erreur existant de chaque écran.

## Delta à produire

- [x] `networkMode: 'always'` dans `defaultOptions.mutations` de `createQueryClient`.
- [x] Test : sous le vrai `createQueryClient`, `PaymentProviderPicker` hors ligne appelle le
      réseau tout de suite et affiche l'erreur ; les lectures gardent `online`.

## Critères d'acceptation

- [x] AC1 — hors ligne, l'initiation d'un paiement part tout de suite et son échec s'affiche.
- [x] AC2 — au retour du réseau, rien ne repart seul.
- [x] AC3 — les requêtes de lecture gardent leur `networkMode` par défaut.

## Hors périmètre

- Un état « hors ligne » visible lu par `isPaused` (option écartée par le porteur).
- L'idempotence des écritures côté API (P144.07).

## Notes d'implémentation

- Ablation : la ligne `networkMode: 'always'` retirée → les deux cas de
  `PaymentProviderPicker.hors-ligne.test.tsx` rouges (aucune alerte : la mutation reste
  suspendue, 0 appel réseau) ; remise → 2/2 verts.
- Le test passe par le vrai `useInitiatePayment` sous le vrai `createQueryClient`, `fetch`
  simulé en erreur réseau : c'est l'écran qui porte l'échec, aucun état neuf.

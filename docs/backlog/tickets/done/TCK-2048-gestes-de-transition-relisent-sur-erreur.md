---
id: TCK-2048
title: "Après l'échec d'un geste de transition, l'écran relit l'état"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-182--gestes-de-transition-rejoués-sur-un-état-déjà-atteint"
tags: [web, mutations, cache, pistes]
---

## Objectif

Un geste de transition (réservation, facture, reversement, commission, intervention, bail, visite)
qui échoue fait relire l'état de l'écran, qui montre alors le statut réel au lieu du bouton tiré
du cache.

## Contexte

Réf : **P182.02** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-23) : la recommandation du délégué, écrans d'argent compris

La recommandation du délégué (ligne `Mesure` du 2026-10-23, delegue) : une option
`relireSurErreur` de `useApiMutation`, posée mutation par mutation sur les seuls gestes de
transition de l'`Où` (réservation, facture, reversement, commission, intervention, bail, visite),
qui invalide sur erreur les clés déjà déclarées en tableau (et `invalidate` appelée sans `data`
n'est pas rejouée), plutôt que l'invalidation rejouée sur toute erreur.

- `useApiMutation` n'invalidait ses clés qu'en `onSuccess` ; les mutations ne se rejouent pas.

## Hypothèses (mode sans humain)

- Les gestes retenus sont ceux des écrans du constat : réservation (annuler, confirmer, refuser),
  facture (envoyer, payer, annuler), reversement (les quatre gestes de `PayoutDetailDialog` :
  approuver, verser, échec, annuler), commission (payer, annuler, `CommissionsLedger`),
  intervention (accepter, refuser), bail (activation sur papier, `LeaseSignaturePanel`), visite
  (confirmer, menée, absente, annuler). Les autres gestes du bail (signature en ligne) ne sont pas
  dans l'`Où`.
- La relecture n'est pas attendue avant de rendre l'erreur : après une coupure de réseau, elle
  peut elle-même tarder. L'invalidation marque les clés tout de suite.

## Delta à produire

- [x] Option `relireSurErreur` de `useApiMutation` : sur erreur, invalide les clés `invalidate`
  données en tableau, puis appelle l'`onError` de l'appelant.
- [x] L'option posée sur les 19 gestes listés.
- [x] Test du hook et de chaque geste.

## Critères d'acceptation

- [x] AC1 — Avec l'option, un échec invalide les clés déclarées, et seulement elles ; l'`onError`
  de l'appelant reçoit l'erreur.
- [x] AC2 — Sans l'option, un échec n'invalide rien.
- [x] AC3 — Une invalidation calculée depuis la réponse n'est pas rejouée sur erreur.
- [x] AC4 — Chacun des 19 gestes, en 422, invalide sa clé de fiche ou de liste.

## Hors périmètre

- La lecture par le front des codes de garde d'état (`invoice.not_draft_send`…).
- La borne des écritures du navigateur (coupure après écriture), relevée « à vérifier ».

## Notes d'implémentation

- Test : `takussan-web/src/hooks/__tests__/useApiMutation.relire-sur-erreur.tck-2048.test.tsx`.
  Avant correctif : 20 rouges sur 22 (seuls AC2 et AC3, qui disent « rien », passaient).
- Ablation : `useApiQuery.ts` à `HEAD` → 20 rouges ; option retirée des modules de requêtes, hook
  gardé → 19 rouges (les gestes) ; tout remis → 22 verts.
- `onError` est désormais tiré des options par le hook et composé : un appelant qui en passe un
  le voit toujours appelé.

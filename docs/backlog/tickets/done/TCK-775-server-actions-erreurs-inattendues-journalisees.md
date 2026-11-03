---
id: TCK-775
title: "Une erreur hors ApiError dans une server action laisse une trace côté serveur"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-14--observabilité--ce-quon-ne-verrait-pas-en-production"
tags: [front, server-actions, observabilite, journal, pistes]
---

## Contexte

Réf : **P14.11** du fichier de pistes, `validé` (critère accordé : V3). Dans les modules
`'use server'` de `takussan-web/src/app/actions/`, une erreur qui n'est pas une `ApiError`
(`TypeError`, corps mal formé) rend le message de repli (« erreur réseau, réessayez ») et n'écrit
rien côté serveur Next : un bug devient une panne réseau, sans trace. Seul
`dashboard-properties.ts` journalisait, et sa ligne recopiait la `cause`.

## Décision du porteur

un failure() commun qui journalise côté serveur le nom, le message et la pile de toute erreur hors ApiError, jamais les données saisies

## Delta à produire

- [x] `src/lib/journal-erreur-action.ts` : `journaliserErreurInattendue(module, err)`, commune à
      tous les modules. Hors `ApiError`, un `console.error` qui porte le module, le nom, le
      message et la pile ; ni les arguments de l'action, ni la `cause`.
- [x] Branchée dans la fonction de repli de chaque module (`failure`, `mapError`, `echec`,
      `errorFromApi`) et dans chaque `catch` en ligne des 27 modules qui attrapent ; les `catch`
      sans nom d'erreur en prennent un.
- [x] Le journal maison de `dashboard-properties.ts` (qui écrivait la `cause`) cède la place à la
      fonction commune.
- [x] Une garde : le recensement des modules `'use server'` qui attrapent une erreur.

## Critères d'acceptation

- [x] AC1 — Un `TypeError` levé dans `getNotificationsAction` écrit une ligne qui porte le
      module, le nom, le message et la pile ; l'action rend toujours son repli.
- [x] AC2 — Une `ApiError` n'écrit rien.
- [x] AC3 — Une erreur dans `createIntegrationAction` est journalisée sans aucune des valeurs
      saisies (nom de l'intégration, clé d'API).
- [x] AC4 — Tout module `'use server'` de `src/app/actions/` qui contient un `catch` appelle
      `journaliserErreurInattendue`, et aucun `catch` n'y est sans nom d'erreur ; le recensement
      échoue s'il ne trouve aucun module.

## Hypothèses (mode sans humain)

- « Un failure() commun » est lu comme une **fonction de journalisation commune**, appelée par la
  fonction de repli de chaque module : les replis restent propres à chaque module, parce que leurs
  clés de traduction (`serverActions.<module>.*`) et leurs formes de retour diffèrent. Fusionner
  les seize fonctions de repli en une seule dépasserait la piste.
- Les deux `catch` de `getMeAction` / `getOperatorMeAction` (`auth.ts`) relancent l'erreur : Next
  la journalise déjà, ils ne sont pas touchés.
- Le message de l'erreur est journalisé, comme la précision le demande ; une erreur de bibliothèque
  dont le message recopierait une donnée saisie reste possible, et n'est pas filtrée.

## Notes d'implémentation

- Ablation : corps de `journaliserErreurInattendue` neutralisé → les deux cas exécutés rougissent
  (AC1, AC3) ; `notifications.ts` remis à `pre-dev` → AC1 et le recensement de ce module rougissent ;
  correctif remis → 58 verts, et les 17 fichiers de `src/app/actions/__tests__/` verts (200 tests).
- Le branchement a été écrit par script sur la fonction de repli de chaque module : le premier jet
  insérait l'appel dans l'accolade du **type de retour** multiligne (`Promise<{ … }>`), non dans le
  corps. À relire si on reproduit le geste.

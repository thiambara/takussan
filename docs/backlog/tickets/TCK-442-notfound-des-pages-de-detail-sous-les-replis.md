---
id: TCK-442
title: "Les 9 `notFound()` des pages de détail de `/app` rendent 200 : remonter la REQUÊTE, pas seulement la décision"
status: todo
phase: P3
family: front
estimate: M
wave: 49
created: 2026-08-27
updated: 2026-08-27
depends_on: [TCK-426]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
tags: [front, dashboard, http, observabilite]
---

## Objectif utilisateur

Une ressource qui n'existe pas se dit « elle n'existe pas », à un navigateur comme à une sonde.

## Contexte — ce que TCK-426 a laissé, et pourquoi il l'a laissé

[TCK-426](TCK-426-statuts-http-perdus-sous-les-replis-de-app.md) a rendu leur statut à **23 refus
d'autorisation** de `/app` en les remontant dans le `layout.tsx` de leur segment, au-dessus de la
frontière de suspension ouverte par `loading.tsx`. Vérifié de bout en bout sur l'application réelle,
prestataire authentifié : **307 sur les 18 surfaces agence**, contre 200 avant.

Il n'a **pas** traité l'autre moitié, et la coupure n'était pas arbitraire :

> Un refus fondé sur l'**utilisateur** — son rôle, son jeton, son agence — se décide avant toute
> donnée : il peut toujours monter dans un layout. Un refus fondé sur la **réponse** de l'API — « ce
> bail n'existe pas », « ce dossier n'est pas le vôtre » — ne monte pas sans que la **requête**
> monte avec lui.

C'est la différence entre déplacer six lignes et changer la forme de huit pages.

## La mesure

Relevé le 2026-08-27 sur `feat/lot-g4-app`, après TCK-426, par le test
`app/__tests__/etats-de-route.test.ts` lui-même (règle « aucune page ne refuse un UTILISATEUR depuis
sous une frontière », dont l'exclusion est dérivée : *dans un bloc `catch`* = réaction à une réponse) :

| Page | `notFound()` | `redirect()` dans un `catch` |
|---|---|---|
| `bookings/[id]` | 1 | — |
| `customers/[id]` | 2 | — |
| `documents/[id]` | 1 | — |
| `inventories/[id]` | 1 | — |
| `leases/[id]` | 1 | — |
| `maintenance/[id]` | 1 | — |
| `properties/[id]` | 1 | **1** (401/403 → `/app`) |
| `visits/[id]` | 1 | — |
| **total** | **9** | **1** |

Les huit segments portent chacun leur `loading.tsx` — posé par TCK-382, et c'est bien lui qui vole
le statut. Mécanisme mesuré par sondes jetables sur le Next 16.3.1 du dépôt (le tableau des huit
formes est dans TCK-426) : `notFound()` sans repli rend **404**, avec un repli **200**, et l'écran
introuvable est rendu quand même.

⚠ **Ce défaut est plus vieux que TCK-382**, et le ticket qui l'a posé le dit :
`app/properties/loading.tsx` existait avant lui, exactement au-dessus du seul `notFound()` que
`/app` portait alors. Ce 404 était déjà un 200, et personne ne l'avait vu.

⚠ Il y a une limite ANTÉRIEURE à celle-ci, qui la borne : sur cinq des huit pages, `notFound()` ne
se déclenche **que sur un identifiant illisible**, jamais sur un 404 de l'API — la requête est
déléguée à un composant client, où `notFound()` n'existe pas. `/app/bookings/999999` (identifiant
bien formé, réservation inexistante) ne rend donc *aucun* introuvable, ni avant ni après ce ticket.
C'est écrit dans le cliquet de `etats-de-route.test.ts`. **Les deux défauts se corrigent au même
endroit** : remonter la requête côté serveur.

## Delta à produire

- [ ] Trancher le patron, une fois, pour les huit segments. Deux tiennent :
      - **(a) la requête monte dans le `layout.tsx`** du segment, qui décide de l'introuvable et
        passe la ressource à la page. La page garde son squelette ; le layout, lui, n'en a pas
        besoin, il ne rend rien. Coût : le layout doit transmettre la donnée, ce que l'App Router
        ne permet pas directement (`children` est opaque) — il faut donc soit refaire la requête
        dans la page (mémoïsée par `cache()`, donc gratuite en réseau), soit passer par un
        `params`-scoped cache. **Mesurer laquelle avant d'écrire.**
      - **(b) le `loading.tsx` descend** sous la page dans un groupe de routes, comme TCK-426 l'a
        fait pour `(accueil)` et deux `(liste)`. Sur une page de détail il n'y a rien sous quoi le
        descendre : ce serait le supprimer, donc perdre le squelette que TCK-382 a acheté.
- [ ] Traiter au passage le `redirect()` du `catch` 401/403 de `properties/[id]` — ou le remplacer
      par un panneau « accès refusé » rendu, comme `customers/[id]` le fait déjà avec
      `CustomerDetailUnavailable`. *Deux pages sœurs qui répondent différemment au même 403 sont un
      choix ou un oubli ; il faut dire lequel.*
- [ ] Retirer de `etats-de-route.test.ts` l'exclusion « dans un `catch` » au fur et à mesure, et le
      test « délimite bien ce qui reste dû à TCK-442 » avec elle.

## Critères d'acceptation

- [ ] AC1 — `GET /app/leases/<id inexistant>` rend **404**, mesuré par `curl` sur l'application
      réelle avec une session valide, comme TCK-426 l'a fait pour les 307. Le relevé, sa date et sa
      commande sont écrits dans ce ticket.
- [ ] AC2 — le squelette d'attente de la page de détail est **toujours servi** pour une ressource
      qui existe : `data-testid="route-skeleton"` présent dans le HTML rendu (c'est la vérification
      qui a montré que TCK-426 ne coûtait aucun repli).
- [ ] AC3 — la règle de `etats-de-route.test.ts` couvre les `notFound()` sans exception dérivée ni
      listée, et l'ablation d'un seul correctif la fait rougir en nommant la page.
- [ ] AC4 — au moins une des huit pages traduit un **404 de l'API** en introuvable, et un test
      l'éprouve. Sans ça, ce ticket rend un statut juste à un cas (`id` illisible) qui n'est pas
      celui que rencontre un utilisateur.

## Hors périmètre

- Les refus d'autorisation : faits par TCK-426.
- Le catalogue public : tenu par TCK-335, qui a supprimé son `loading.tsx` pour la raison inverse
  (l'indexation lit ces statuts). **Ne pas recopier le patron retenu ici vers `(public)`.**

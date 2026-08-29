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

- [x] Trancher le patron, une fois, pour les huit segments. Deux tiennent :
      - **(a) la requête monte dans le `layout.tsx`** du segment, qui décide de l'introuvable et
        passe la ressource à la page. La page garde son squelette ; le layout, lui, n'en a pas
        besoin, il ne rend rien. Coût : le layout doit transmettre la donnée, ce que l'App Router
        ne permet pas directement (`children` est opaque) — il faut donc soit refaire la requête
        dans la page (mémoïsée par `cache()`, donc gratuite en réseau), soit passer par un
        `params`-scoped cache. **Mesurer laquelle avant d'écrire.**
      - **(b) le `loading.tsx` descend** sous la page dans un groupe de routes, comme TCK-426 l'a
        fait pour `(accueil)` et deux `(liste)`. Sur une page de détail il n'y a rien sous quoi le
        descendre : ce serait le supprimer, donc perdre le squelette que TCK-382 a acheté.
- [x] Traiter au passage le `redirect()` du `catch` 401/403 de `properties/[id]` — ou le remplacer
      par un panneau « accès refusé » rendu, comme `customers/[id]` le fait déjà avec
      `CustomerDetailUnavailable`. *Deux pages sœurs qui répondent différemment au même 403 sont un
      choix ou un oubli ; il faut dire lequel.*
- [x] Retirer de `etats-de-route.test.ts` l'exclusion « dans un `catch` » au fur et à mesure, et le
      test « délimite bien ce qui reste dû à TCK-442 » avec elle.

## Critères d'acceptation

- [ ] AC1 — `GET /app/leases/<id inexistant>` rend **404**, mesuré par `curl` sur l'application
      réelle avec une session valide, comme TCK-426 l'a fait pour les 307. Le relevé, sa date et sa
      commande sont écrits dans ce ticket.
- [x] AC2 — le squelette d'attente de la page de détail est **toujours servi** pour une ressource
      qui existe : `data-testid="route-skeleton"` présent dans le HTML rendu (c'est la vérification
      qui a montré que TCK-426 ne coûtait aucun repli).
- [x] AC3 — la règle de `etats-de-route.test.ts` couvre les `notFound()` sans exception dérivée ni
      listée, et l'ablation d'un seul correctif la fait rougir en nommant la page.
- [x] AC4 — au moins une des huit pages traduit un **404 de l'API** en introuvable, et un test
      l'éprouve. Sans ça, ce ticket rend un statut juste à un cas (`id` illisible) qui n'est pas
      celui que rencontre un utilisateur.

## Hors périmètre

- Les refus d'autorisation : faits par TCK-426.
- Le catalogue public : tenu par TCK-335, qui a supprimé son `loading.tsx` pour la raison inverse
  (l'indexation lit ces statuts). **Ne pas recopier le patron retenu ici vers `(public)`.**

## Ce qui a été livré — 2026-08-29

**Le patron retenu est (a) : la requête monte dans le `layout.tsx` du segment `[id]`.** (b) a été
écarté pour la raison que le ticket écrivait déjà — sur une page de détail il n'y a rien sous quoi
descendre le repli, donc le supprimer, donc perdre le squelette de TCK-382.

**Le point que le ticket demandait de mesurer avant d'écrire — comment le layout transmet la
donnée — ne se pose pas** : aucun des huit layouts ne transmet quoi que ce soit. Il **sonde**
l'existence et jette la réponse ; les pages continuent de charger ce qu'elles chargent déjà (cinq
par un composant client, deux côté serveur). La lecture est mémoïsée par `cache()` de React, donc
partagée avec la page qui relit la même ressource. Un `params`-scoped cache n'a pas été nécessaire.

| fichier | rôle |
|---|---|
| `takussan-web/src/lib/detail/ressource-de-detail.ts` | la sonde. **Trois issues, pas deux** : `existe` / `introuvable` / `indecidable`. Seul un **404 franc** produit l'introuvable ; 401/403/500/panne réseau laissent la page se rendre. Porte aussi la table segment → chemin d'API → table spatie (les trois divergent : `visits` → `/api/property-visits`, `fields[property_visits]`). |
| `…/app/{bookings,customers,documents,inventories,leases,maintenance,properties,visits}/[id]/layout.tsx` | 8 layouts neufs, un appel chacun. |
| `…/app/{bookings,customers,documents,inventories,properties,visits}/(liste)/` | 6 groupes de routes neufs : `page.tsx` + `loading.tsx` du segment PARENT y sont descendus. Sans ça, le repli d'ancêtre efface le statut du layout (ligne 3 du tableau de TCK-426). `leases` et `maintenance` avaient déjà le leur. |
| `…/app/properties/[id]/page.tsx` | le `redirect('/app')` du `catch` 401/403 devient un panneau **rendu** `PropertyDetailUnavailable`, jumeau de `CustomerDetailUnavailable`. Trois clés neuves dans **fr/en/wo**. |
| `…/app/__tests__/etats-de-route.test.ts` | `notFound` et `exigerRessource` entrent dans `REFUS` ; **`estDansUnCatch` et le test « délimite ce qui reste dû à TCK-442 » sont supprimés**, remplacés par un plancher « la règle a examiné ≥ 20 pages ». La règle des pages de détail est inversée : le `notFound()` doit être dans le **layout**, et un test-pendant refuse qu'il reste aussi dans la page. |
| `…/app/__tests__/introuvable-de-detail.test.tsx` | monte les 8 layouts (inventaire dérivé par `import.meta.glob`) : 404 → introuvable ; id illisible → introuvable sans requête ; **500 → PAS introuvable** ; ressource existante → enfants rendus ; et le `[id]/loading.tsx` de chaque segment est toujours là (AC2). |
| `takussan-web/src/lib/detail/__tests__/ressource-de-detail.test.ts` | la sonde seule, et la table confrontée aux segments `[id]` réellement posés sur disque, dans les deux sens. |

**Dommages collatéraux assumés, tous corrigés** : `(dashboard)/admin/properties/page.tsx` réexporte
désormais `../../app/properties/(liste)/page` (avec son test et `property-fields.coverage.test.ts`),
et deux tests lisaient les chemins déplacés (`crm/pipeline/__tests__/garde.test.tsx`,
`inventories/__tests__/geste-de-creation.test.tsx`).

### AC3 — les ablations, empreintes relevées avant et après la mutation

`md5 -q`, jamais `git diff --numstat` : il ne distingue pas une substitution à nombre de lignes égal.

| ablation | avant → après | ce qui rougit |
|---|---|---|
| `visits/[id]/layout.tsx` — l'appel à `exigerRessource` retiré | `3254ee60…` → `f8024ac7…` | « ces pages de détail ne refusent l'introuvable nulle part au-dessus de leur repli — **visits/[id]/page.tsx** » + 2 tests de montage |
| `documents/[id]/page.tsx` — un `notFound()` réintroduit dans la page | `15b9fac1…` → `350cf018…` | « ces refus rendent 200 + le squelette — **documents/[id]/page.tsx:19 → notFound(** » + le test-pendant |
| `bookings/(liste)/loading.tsx` remonté en `bookings/loading.tsx` | fichier déplacé, `0de3fddc…` | « ces layouts refusent depuis SOUS un repli d'ancêtre — **bookings/[id]/layout.tsx ← bookings/loading.tsx** » |
| la sonde réécrite en `catch { return 'introuvable' }` (**le mauvais correctif**) | `3c57166a…` → `49b7f1ba…` | **11 rouges** : les 8 « une PANNE ne devient pas un introuvable » + 500/403/réseau |
| **les 8 layouts retirés d'un coup** (corpus d'épreuve ET branche de garde démontés ensemble) | 8 fichiers déplacés | **2 rouges**, dont le test d'inventaire — et il fallait ce test : `it.each([])` était passé de 107 à 65 cas **sans échouer**, exactement le motif de l'en-tête de `scripts/check-enum-namespaces.mjs` |

Tous restaurés, empreintes re-vérifiées identiques ; suite du périmètre verte (104 fichiers,
769 tests), `npx tsc --noEmit` propre, `npm run lint` à 0 erreur.

### AC1 — ce que le `curl` doit vérifier, et pourquoi il n'est pas joué ici

**Non fait. Il exige un `next dev` servi, une session valide et une machine au repos** — c'est un
relevé de session principale, pas de tâche déléguée (une commande de plus de ~10 minutes est coupée
sans rien produire). Ce qu'il doit établir, exactement :

```bash
# 1. Se connecter et garder le cookie httpOnly (AUTH_COOKIE_NAME = auth_token).
curl -s -c /tmp/tck442.jar -X POST http://127.0.0.1:3000/api/auth/set-token \
     -H 'Content-Type: application/json' -d '{"token":"<jeton Sanctum d agent>"}'

# 2. AC1 — une ressource INEXISTANTE, identifiant BIEN FORMÉ (c'est tout le point : `999999`,
#    pas `abc`). L'API doit répondre 404 sur /api/leases/999999 pour que le test ait un sens.
curl -s -o /dev/null -b /tmp/tck442.jar -w '%{http_code}\n' \
     http://127.0.0.1:3000/app/leases/999999
#    ATTENDU : 404       AVANT ce ticket : 200 (avec l ecran introuvable affiche quand meme)

# 3. AC2 — une ressource qui EXISTE : le squelette part toujours avant la donnee.
curl -s -b /tmp/tck442.jar http://127.0.0.1:3000/app/leases/<id existant> \
  | grep -c 'data-testid="route-skeleton"'
#    ATTENDU : >= 1, ET le statut 200
```

**Ce qui compte comme succès, et pas autre chose :**

1. **404 au point 2** — pas 200, pas 500. Un 500 dirait que le layout a laissé remonter une
   exception au lieu de traduire le 404.
2. **200 + `route-skeleton` au point 3** — les deux ensemble. Le squelette seul ne prouve rien si le
   statut a bougé ; le 200 seul ne prouve pas que le patron (a) n'a rien coûté à TCK-382.
3. ⚠️ **Refaire le point 2 avec un identifiant ILLISIBLE (`/app/leases/abc`) doit aussi rendre
   404** : c'est le seul cas que les pages traitaient avant, et il ne doit pas avoir régressé.
4. ⚠️ **Prendre le relevé sur les huit segments, pas seulement `leases`** : les six `(liste)` créés
   par ce ticket sont autant d'occasions d'avoir laissé un repli d'ancêtre en place. Le test
   `etats-de-route.test.ts` le garde dans l'arbre, mais l'arbre n'est pas le serveur.
5. ⚠️ **Vérifier au passage que les six listes déplacées répondent encore** — `/app/bookings`,
   `/app/customers`, `/app/documents`, `/app/inventories`, `/app/properties`, `/app/visits`, plus
   `/admin/properties` qui réexporte la cinquième. Un groupe de routes ne change pas l'URL, mais
   c'est une affirmation sur Next, pas une mesure.


---
id: TCK-559
title: "Liste des biens : le compteur servi par le serveur repasse par « Chargement… », et une seconde requête de recherche part après l'hydratation"
status: obsolete
phase: P2
family: technique
estimate: S
wave: 68
created: 2026-09-22
updated: 2026-09-23
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models: []
tags: [front, perf, hydratation, recherche]
---

## Objectif utilisateur

Un visiteur qui arrive sur la liste voit le nombre de biens et les cartes stables dès le premier
affichage, sans clignotement ni grille qui se grise.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constat P9), sur `/fr/properties?contract_type=rent&q=Dakar`.

- Le HTML servi contient déjà `aria-live="polite">140 biens trouvés` (TCK-432 : résultats semés par
  le serveur).
- Côté navigateur, relevé par `MutationObserver` : « Chargement… » à 444 ms, puis « 140 biens
  trouvés » à 628 ms.
- `performance.getEntriesByType('resource')` montre ensuite une requête
  `/api/public/properties/search?contract_type=rent&q=Dakar&per_page=30` à 698 ms — la recherche
  que le serveur venait d'exécuter. Hypothèse, **non vérifiée** : la clef semée (`clefDeRecherche`)
  ne porte pas `per_page` quand le client l'ajoute ; les deux clefs diffèrent et la graine est
  écartée.

⚠ **Mesuré sous `next dev`**, dont l'hydratation n'est pas celle de la production (revue adverse).
Le premier critère d'acceptation est donc une re-mesure : si rien ne se reproduit sous
`next build && next start`, le ticket passe `obsolete` avec la mesure.

## Contrat de données

Aucun changement d'API. `GET /api/public/properties/search`, même requête côté serveur et client.

## Direction UX / Artistique

- Le premier affichage est l'affichage final : pas d'état de chargement pour des données déjà
  présentes.

## Contraintes strictes (métier)

- Une graine n'est réutilisée que si l'URL décrit **la même requête** (docblock de `page.tsx`,
  TCK-432) : ne pas corriger en réutilisant la graine plus largement.
- Une seule chaîne pour une requête (`lib/recherche-publique.ts`) : pas de seconde fabrique de clef.

## Delta à produire

- [x] Re-mesure sous `next build && next start` (compteur et requêtes réseau), consignée dans les
      notes.
- [ ] Si reproduit : cause établie, clefs serveur et client alignées, sans élargir la réutilisation.
      *(Sans objet : rien ne se reproduit en build de production — cf. Notes. Ticket clos
      `obsolete` le 2026-09-23.)*
- [x] Test : la clef semée et la clef calculée côté client sont égales pour une URL sans `per_page`
      et pour une URL avec `per_page=30` explicite.

## Critères d'acceptation

- [x] AC1 — la re-mesure en build de production est consignée (texte du compteur dans le temps,
      requêtes `/search` après chargement).
- [x] AC2 — sous build de production, `/fr/properties?contract_type=rent&q=Dakar` n'émet **aucune**
      requête `/api/public/properties/search` dans les 3 s qui suivent le chargement.
- [x] AC3 — le compteur ne passe jamais par « Chargement… » au premier affichage.
- [x] AC4 — changer un filtre déclenche toujours une requête (la graine n'est pas réutilisée pour
      une autre requête).

## Hors périmètre

- Les trois appels à `/api/public/property-types` relevés au même chargement (à mesurer à part).
- Le squelette de la frontière de suspension (TCK-432, choix documenté).

## Notes d'implémentation

### Re-mesure en build de production — 2026-09-23 (AC1)

`npx next build` puis `npx next start -p 3016` (worktree, commit `c300eb19`), API du dépôt sur
`:8002`, Chrome headless piloté par CDP, émulation 360×740 `mobile:true` (`innerWidth` relevé :
**360**, le viewport n'est pas élargi). Charge machine au moment de la mesure : `load averages:
123.42 61.94 46.96` sur 8 cœurs — **les durées ci-dessous ne disent rien du dépôt**, seuls
l'ordre des états et le nombre de requêtes comptent.

Instruments, posés **avant** tout script de la page (`Page.addScriptToEvaluateOnNewDocument`) :
un `MutationObserver` sur tout le document qui relève le texte de chaque
`p[aria-live="polite"]` du compteur et s'il est dans un segment `hidden` ; les requêtes
`/public/properties/search` relevées **deux fois, par deux voies indépendantes** —
`performance.getEntriesByType('resource')` dans la page et `Network.requestWillBeSent` côté CDP.
Relevé 5 à 8 s après la navigation (donc bien au-delà des 3 s de l'AC2).

`/fr/properties?contract_type=rent&q=Dakar`, 6 chargements :

| | compteur dans le temps | `/search` (perf / CDP) | grille grisée (`.opacity-50`) |
|---|---|---|---|
| 1 | `140 biens trouvés` à 416 ms | 0 / 0 | jamais |
| 2 | `140` 815 → absent 822 → `140` 838 | 0 / 0 | jamais |
| 3 | `140` 844 | 0 / 0 | jamais |
| 4 | `140` 524 → absent 524 → `140` 547 | 0 / 0 | jamais |
| 5 | `140` 630 → absent 631 → `140` 678 | 0 / 0 | jamais |
| 6 à 8 (visibilité relevée) | `140 @cache(S:2)` → absent → `140 @visible` | 0 / 0 | jamais |

**« Chargement… » n'apparaît dans aucun relevé, et aucune requête `/search` ne part après le
chargement.** Le trou « absent » de quelques ms est le **déplacement du segment suspendu** : le
compteur est d'abord dans `<div hidden id="S:2">`, puis révélé par le `$RC(…)` inline — la
frontière de suspension documentée par TCK-432, hors périmètre ici. Le texte ne change jamais.

**Témoin positif des deux instruments (AC4)**, même session, clic sur la puce « Villa » du
panneau de filtres (`el.click()`) : l'URL devient `…&type=villa&page=1`, le compteur passe
`140 biens trouvés` → `Chargement…` → `12 biens trouvés`, et **une** requête
`/search?q=Dakar&contract_type=rent&type=villa&page=1&per_page=30` est relevée par les deux voies.
Les instruments voient donc bien une recherche quand il y en a une : leur 0 au chargement est un
vrai 0.

### Témoin : le constat de l'audit se reproduit sous `next dev`, et seulement là

Même banc, même URL, `npx next dev -p 3016` (charge : `92.34 65.96 52.24`), 3 chargements :
compteur `140 biens trouvés @cache(S:4)` → absent → **`Chargement…` visible** → `140 biens trouvés`,
grille grisée au même instant, et **une** requête
`/search?contract_type=rent&q=Dakar&per_page=30` relevée par les deux voies, ~200-350 ms après le
`load`. Le constat P9 est donc exact — sous `next dev`.

### Cause, établie par ablation : le double passage des effets du mode strict, pas la clef

- **L'hypothèse du ticket est fausse.** Le serveur et le client posent `per_page` par la MÊME
  fonction (`parametresDeRecherche`), et la requête relevée sous `next dev`, une fois triée par
  `clefDeRecherche`, **est** la clef semée : c'est le troisième test ajouté à
  `src/lib/__tests__/recherche-publique.test.ts`.
- **Ablation** : `reactStrictMode: false` posé temporairement dans `next.config.ts`, `next dev`
  relancé, 3 chargements → **0 requête `/search`, jamais `Chargement…`**, compteur identique à la
  production. Le fichier a été restauré à l'identique (copie reprise, `git status` propre dessus).
- Mécanisme : en développement, React 19 monte l'effet de `useSearch`, le démonte et le remonte.
  Le premier passage consomme `requeteDejaServie` (remis à `null`) et sort sans requête ; le second
  trouve la ref vide, passe en `LOADING` et relance la recherche. En production l'effet ne passe
  qu'une fois : la graine est consommée, rien ne part.

**Conclusion : rien ne se reproduit en production, aucun code applicatif n'est modifié.** Le ticket
relève d'`obsolete` (décision laissée à la session, `status` non touché).

### Le test ajouté, et ce qu'il garde vraiment

`describe('TCK-559 — per_page ne sépare pas la clef semée de la clef du client')`, 3 cas : URL de
l'audit sans `per_page`, avec `per_page=30` placé ailleurs dans l'URL que dans l'objet de Next, et
la requête relevée sous `next dev` comparée à la clef semée. Ablations :

- `copie.sort()` retiré de `clefDeRecherche` → **rougit** le 2ᵉ cas ;
- `per_page` par défaut désactivé dans `parametresDeRecherche` → **rougit** le 3ᵉ cas seulement.
  Les deux premiers passent par la même fonction des deux côtés : ils ne peuvent pas voir une
  régression de `parametresDeRecherche` elle-même, seulement une divergence d'entrée (objet de
  Next contre chaîne du navigateur). C'est le 3ᵉ qui fige la forme de la requête relevée.

### Correction après contre-vérification (tour 1, 2026-09-23)

**Une affirmation du tour précédent était fausse, et elle était présentée comme mesurée.** Elle
disait : *« `renderHook` sous `<StrictMode>` ne rejoue pas l'effet dans cette suite — un test “sans
requête sous StrictMode” serait vert sur le code actuel sans rien prouver. »* La mesure portait sur
une seule forme, `renderHook(…, { wrapper: StrictMode })`, et la conclusion a été étendue à toutes.
Re-mesuré dans ce worktree par un fichier temporaire (supprimé ensuite, `git status` propre) :

| forme | passages d'un `useEffect(…, [])` témoin |
|---|---|
| `renderHook(…, { wrapper: StrictMode })` | **1** |
| `renderHook(…, { reactStrictMode: true })` (option de RTL 16) | **2** |

Et sur le hook lui-même, graine de l'audit (`contract_type=rent&q=Dakar`), 200 ms après le montage :

| `renderHook(() => useSearch({ graine }), …)` | appels à `apiFetch` | suite des `loading` |
|---|---|---|
| `reactStrictMode: false` | **0** | `[false]` |
| `reactStrictMode: true` | **1** — `/public/properties/search?contract_type=rent&q=Dakar&per_page=30` | `[false,false,true,true,false,false]` |

**Le constat P9 de `next dev` se reproduit donc dans vitest, en une option.** Un test « un montage
semé ne fait aucune requête, sous `reactStrictMode: true` » est écrivable, et il serait **ROUGE**
sur le code actuel — l'inverse de ce que ce paragraphe affirmait. Cette mesure confirme au passage
la cause établie plus haut (le double passage de l'effet consomme la graine au premier passage),
par une seconde voie indépendante du navigateur.

Ce test n'est **pas** ajouté ici : ce ticket ne corrige rien (la production ne reproduit pas), et
un test rouge sans correctif n'a pas sa place dans la suite. Il est le point de départ tout prêt
d'un éventuel ticket « la graine survit au remontage du mode strict » — dont l'intérêt est la
fidélité de `next dev` à la production, pas l'utilisateur.

**Deux trous de test fermés dans le même tour** (mutations de la contre-vérification, rejouées ici
sur `src/lib/recherche-publique.ts`, fichier restauré par `cp`, md5 `b28721f6…` identique à HEAD) :

| mutation | avant (3 cas TCK-559) | après (5 cas) |
|---|---|---|
| M1 : `clefDeRecherche` ignore `per_page` (`copie.delete('per_page')`) | 23/23 verts | **2 rouges** |
| M2 : `parametresDepuisNext` perd `per_page` | 23/23 verts | **1 rouge** |

Cas ajoutés : la clef semée **contient** `per_page=30` (une clef qui l'ignore serait égale des deux
côtés et pourtant fausse : la page appelle l'API avec elle), et un `per_page=48` qui doit survivre
au chemin serveur (`per_page=30` explicite ne le pouvait pas : c'est aussi la valeur par défaut).

**Hors périmètre, relevé par la contre-vérification et non traité** : sur un `router.push` dans la
page, le composant serveur refait la recherche pour une graine que le hook ignore (elle ne vaut que
pour le premier montage), et le client la refait aussi — la même recherche part deux fois par
changement de filtre. À mesurer dans un ticket à part.

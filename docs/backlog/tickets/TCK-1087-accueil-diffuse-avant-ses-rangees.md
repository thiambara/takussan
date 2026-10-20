---
id: TCK-1087
title: "L'accueil public envoie sa coque avant la réponse de `discovery`, rangées dans la même réponse"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-69--fiche-bien-recherche-et-accueil-sous-3g-simulé-servis-par-next-start"
tags: [web, public, performance, pistes]
---

## Contexte

Réf : **P69.03** du fichier de pistes, `validé` (V7). `(public)/page.tsx` attendait
`decouverteDeLAccueil` et `raccourcisDeLAccueil` avant tout rendu : environ 1 s de TTFB sur `/fr`,
contre 0,04 à 0,19 s sur la liste (mesure de l'explorateur).

## Décision du porteur

> (a) une frontière `Suspense` autour de `HomepageDiscovery`, repli sur le squelette existant ; vérifier que le HTML diffusé porte toujours titres et liens `/properties/<slug>` (TCK-432) ; TTFB mesuré avant et après (porteur, 2026-10-20)

## Objectif

Le premier octet de l'accueil n'attend plus l'API ; les rangées restent dans la réponse diffusée.

## Delta à produire

- [x] `page.tsx` : la promesse des deux lectures n'est plus attendue ; `AccueilServi` la lit par
      `use()` sous `<Suspense fallback={<HomepageDiscovery repli />}>`.
- [x] `HomepageDiscovery` : prop `repli` — sans `<h1>`, sans l'`id` du contenu principal,
      `<main aria-busy>`.
- [x] Test `(public)/__tests__/accueil-diffuse-avant-ses-rangees.test.tsx`.

## Critères d'acceptation

- [x] AC1 : réseau retenu, la page se rend et la coque du flux est prête (`renderToReadableStream`
      résolu).
- [x] AC2 : réseau libéré, le HTML porte le titre du bien et son lien `/properties/<slug>`, et un
      seul `<h1>`.
- [x] AC3 : le repli porte la barre et le squelette, aucun `<h1>`.
- [x] AC4 : TTFB mesuré avant et après sur le même montage (notes).

## Hypothèses (mode sans humain)

- « Le squelette existant » est l'état de chargement d'`HomepageDiscovery` lui-même (barre, rangées
  en `loading`), rendu sans données. Il n'y avait pas d'autre squelette d'accueil.
- Le repli ne porte pas de `<h1>` : repli et contenu sont tous deux dans le HTML diffusé quand
  `discovery` tarde, et la page en aurait deux (mesuré). Pendant l'attente, la page n'a donc pas de
  titre de niveau 1.
- React n'hydrate pas le repli d'une frontière encore en attente : l'appel client de
  `useHomepageDiscovery` ne part pas du repli. Lu, non mesuré au navigateur.

## Hors périmètre

- Le cache de `discovery` (option (b) de la piste), écarté par la décision.
- Une mesure sous `next build`/`next start` et contre l'API réelle (voir notes).

## Notes d'implémentation

- TTFB sous `next dev` (port 3999), `API_URL` vers une API factice locale qui répond à
  `discovery` en 800 ms et à la recherche en 500 ms (l'API réelle compte des impressions dans la
  base partagée, fermée aux agents) ; charge 6 à 10 sur 8 cœurs : **avant 1,02 à 1,13 s**, **après
  0,23 à 0,43 s**, total inchangé (~1,03 à 1,17 s). HTML après : titres, 4 liens
  `/fr/properties/<slug>`, un seul `<h1>`.
- Piège : la première version du repli portait le `<h1>` ; le HTML servi en avait deux. Le
  harnais de `rendu-serveur.test` ne le voit pas (le contenu y est prêt avant la première
  écriture, il est alors écrit en ligne) : le repli est testé seul.
- Piège du harnais : sous jsdom, un flux lu avant `allReady` attend la frontière et ne se ferme
  pas ; le test lit après `allReady`.
- Ablations : page d'origine → AC1 rouge (« la page attend encore l'API ») ; frontière retirée,
  `use()` gardé → AC1 rouge (« la coque attend l'API ») ; repli sans `repli` → AC3 rouge (un
  `<h1>`). Correctif remis : 2 verts.

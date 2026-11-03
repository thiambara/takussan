---
id: TCK-361
title: "Rapports plateforme — de vraies séries temporelles (axes, graduations, infobulles, comparaison)"
status: done
phase: P2
family: front
estimate: M
wave: 46
created: 2026-08-26
updated: 2026-08-27
depends_on: [TCK-357]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
  models: []
tags: [front, super-admin, reporting, dataviz]
---

## Objectif utilisateur

Le super-admin lit une courbe de croissance ou de revenus : il voit l'échelle, situe une valeur dans le temps, la compare à la période précédente, et exporte ce qu'il regarde.

## Contrat de données

Endpoints existants et déjà consommés, aucun à créer :

- `GET /api/admin/reports/growth` — `{metric, period, granularity}` → `rows[{bucket, count}]` + `totals`
- `GET /api/admin/reports/revenue`, `GET /api/admin/reports/cohorts`, `GET /api/admin/reports/funnel`
- `GET /api/admin/reports/{report}/export`

Si la comparaison à la période précédente n'est pas servie par l'API, elle est obtenue par un second appel sur la fenêtre décalée — aucun calcul de série côté client au-delà de ça.

## Direction UX / Artistique

Le rendu actuel empile des `<div>` dont la hauteur est un pourcentage : **pas d'axe, pas de grille, pas de graduation, pas d'infobulle** (seulement l'attribut HTML `title`), pas d'état vide. Sur une page nommée « Rapports », c'est le gabarit provisoire qui a survécu.

- Axe des ordonnées gradué, lignes de grille discrètes, axe des abscisses lisible à 12 points comme à 3.
- Infobulle au survol **et au focus clavier** — l'attribut `title` n'est ni stylable, ni atteignable au clavier, ni lisible sur mobile.
- Comparaison à la période précédente en série secondaire assumée (jamais deux séries de même poids visuel).
- État vide explicite quand la période ne contient aucun point : aujourd'hui la zone se rend vide, sans le dire.
- Les couleurs de séries sortent des tokens `--chart-1..5` déjà définis dans `globals.css` — pas de teinte inventée sur place.
- Les onglets de `ReportingShell` passent sur `<Tabs>` (TCK-357).

## Contraintes strictes (métier)

- **Aucune dépendance de dataviz n'est ajoutée sans mesure d'impact sur le bundle** : la page est réservée au super-admin, donc à un chargement rare — si une bibliothèque entre, elle entre en import dynamique.
- Chaque graphique porte une description accessible (`aria-label` ou `<figcaption>`) résumant la série ; un lecteur d'écran ne doit pas rencontrer un bloc muet.
- Les montants restent formatés en XOF sans sous-unité, cohérents avec le reste de la console.
- L'export reste attaché à l'état affiché : ce qu'on télécharge est ce qu'on regarde, filtres compris.

## Delta à produire

- [x] Composant de graphique temporel commun (axes, grille, graduations, infobulle survol + focus, état vide, description accessible)
- [x] `GrowthChart` et `RevenueChart` migrés dessus
  - pour `RevenueChart` ce n'était pas une migration mais un **ajout** : il ne rendait aucune barre, c'était un `<table>` de MRR/ARR/souscriptions — conservée en détail sous la courbe, elle porte ce que la courbe ne montre pas.
- [x] Comparaison « période précédente » sur croissance et revenus
- [x] Plage de dates libre en complément des raccourcis 3m / 6m / 12m
  - a exigé un delta d'**API** que le ticket ne prévoyait pas : `period` était validé par `Rule::in(['3m','6m','12m'])` et `bucketsFor()` n'acceptait aucun ancrage. `starts_at`/`ends_at` sont additifs et rétrocompatibles ; aucun endpoint créé.
- [x] `CohortHeatmap` et `FunnelChart` : passage aux tokens `--chart-*` et ajout de l'état vide
- [ ] `ReportingShell` : onglets sur `<Tabs>`
  - **sans objet** : déjà fait par TCK-357, `depends_on` de ce ticket. `ReportingShell.tsx:6,41-46` importe `@/components/ui/tabs` et son test assère déjà `role="tab"`. Zéro ligne écrite — laissé décoché plutôt que coché à vide.
- [x] Tests : rendu avec 0, 1 et N points ; présence de la description accessible ; export porteur des filtres actifs

## Critères d'acceptation

- [x] AC1 — chaque graphique affiche un axe des ordonnées gradué et un axe des abscisses lisible, vérifié à 3 points **et** à 12 points
- [x] AC2 — l'infobulle est atteignable au clavier ; plus aucun attribut `title` ne porte de donnée dans `src/components/reporting/`
  - la garde de fichier a dû être **réécrite** : elle voyait une écriture, pas une propriété. Deux mutations la passaient au vert — l'élément SVG `<title>` (la seule forme qui produise réellement une infobulle native dans un `<svg>`) et `title = {…}` avec un espace autour du `=`. Elle contrôle désormais les deux mécanismes du DOM, sur le fichier entier, espaces et retours à la ligne tolérés. Rejoué dans l'arbre fusionné le 2026-08-27 : 14 tests verts, `grep` attribut → 0, `grep` élément → 0.
- [x] AC3 — une période sans donnée rend un état vide explicite (test sur `rows: []`), et non une zone vide
- [x] AC4 — la comparaison à la période précédente est visible sur croissance et revenus, et se distingue visuellement de la série principale
  - la distinction est assérée sur **trois observables** (`stroke-dasharray` présent, `stroke-width` strictement inférieur, jeton `--chart-4` contre `--chart-1`), pas sur la seule présence.
- [x] AC5 — l'export téléchargé correspond aux filtres actifs à l'écran (test sur les paramètres transmis)
  - ⚠ le test livré d'abord **ne déplaçait aucun filtre** : un export intégralement figé le cochait (mutation exécutée, 32/32 verts). Réécrit et dédoublé — il change la métrique **et** la période, puis pose une plage libre, et assère `starts_at`/`ends_at` qu'aucune constante ne peut imiter.
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent
  - **reste décochée.** `npm run lint` (0 erreur) et `npx tsc --noEmit` (exit 0) exécutés et rejoués par la revue ; `npm run test` **en entier** ne l'a été par personne — rituel de fin de branche de la session. `npm run build` a été joué, lui, et compile les composants neufs sous React Compiler, ce que `npm run test` ne fait pas.

## Hors périmètre

- Les rapports côté agence (`(dashboard)`), qui ont leur propre surface.
- Tout nouvel indicateur métier : ce ticket rend lisible ce que l'API sert déjà.
- L'export PDF.

## Notes d'implémentation

### Trois affirmations du ticket contredites par la mesure

1. **« Les onglets de `ReportingShell` passent sur `<Tabs>` »** — c'était **déjà fait** par TCK-357,
   `depends_on` de ce ticket. Zéro delta ; le test d'onglets existant reste vert.
2. **« Le rendu actuel empile des `<div>` dont la hauteur est un pourcentage »** — vrai de
   `GrowthChart` et `FunnelChart` seulement. **`RevenueChart` ne rendait aucune barre : c'était un
   `<table>`.** Il gagne donc un graphique, et garde la table comme détail (elle porte ARR et
   souscriptions, que la courbe MRR ne montre pas).
3. **« Si la comparaison n'est pas servie par l'API, elle est obtenue par un second appel sur la
   fenêtre décalée »** — **cette fenêtre n'était pas demandable.** `period` était une énumération
   fermée (`3m|6m|12m`) et `bucketsFor()` ancrait la fenêtre sur son propre `Carbon::now()` : aucun
   paramètre ne permettait de décaler ni de borner. Le repli que le ticket décrit comme disponible
   ne l'était pas, et la « plage de dates libre » du delta ne l'était pas davantage.

### La décision qui en découle : `starts_at` / `ends_at`, additifs

Plutôt que de simuler une comparaison en découpant côté client (ce que le ticket interdit), les deux
bornes ont été ajoutées à `growth`, `revenue` et à l'export. Aucun endpoint créé, aucun indicateur
métier neuf, `period` seul se comporte exactement comme avant.

**Gotcha qui a coûté un test :** la plage DOIT entrer dans la clé de cache (`windowKey`). Sans elle,
les deux appels de la comparaison se seraient resservi mutuellement leur entrée pendant 10 min — et
le défaut ne se serait vu qu'à l'écran, les deux séries devenant identiques sans qu'aucune erreur ne
soit levée. Vérifié par ablation : la clé retirée, `test_two_distinct_windows_do_not_share_a_cache_entry`
rougit.

### La fenêtre précédente se compte en BUCKETS, pas en millisecondes

Première version : « même durée, immédiatement antérieure ». Sur `2026-03-01 → 2026-04-30`
(61 jours), elle rendait `2025-12-30 → 2026-02-28`, que le serveur découpe en **trois** buckets
mensuels là où la série principale en a deux. La comparaison s'aligne par index : deux longueurs
différentes la décalent d'un cran, en silence. `fenetrePrecedente()` compte donc les buckets, et
lit les bornes **textuellement** — `new Date()` relit un `+00:00` dans le fuseau du navigateur et
peut reculer d'un mois quand la borne est un premier du mois, ce qu'elle est toujours ici.

### Reste

- La **granularité** est figée à `month` côté front. `fenetrePrecedente()` le suppose et le dit ;
  un appelant en `day`/`week` devrait lui passer la granularité.
- Vérification **navigateur non faite** : aucun serveur de développement ne tournait et la page
  exige une session super-admin. Ce qui est éprouvé l'est sous jsdom (survol et focus réels via
  `userEvent`, géométrie SVG sans `NaN`) plus `npm run build`, qui compile bien les composants neufs
  sous React Compiler — ce que `npm run test` ne fait pas (cf. `takussan-web/CLAUDE.md`).

### Ce que la revue adverse a trouvé — dont un vrai bug de production

La revue a **refusé** : *« le refus ne porte pas sur ce qui a été écrit, il porte sur ce qui
n'attrape rien »*. Trois AC sur six étaient cochés par des tests qu'une régression aurait cochés
aussi, et une plage libre rendait un chiffre **faux**. Les neuf défauts sont corrigés, chacun prouvé
par ablation.

- **Un chiffre faux, prouvé par exécution.** Dans `bucketsFor()`, la borne haute d'un bucket était
  ramenée dans la fenêtre, la borne basse **jamais**. Une plage `2026-03-15 → 03-31` comptait donc
  une agence créée le **2 mars**, quatorze jours avant la borne demandée. L'asymétrie se voyait à
  l'œil dans le code : le dernier bucket tronqué proprement, le premier qui déborde. Pire sur AC4,
  où la fenêtre de comparaison est toujours calée sur des 1ers du mois : on comparait un premier
  bucket gonflé à un bucket propre. Test écrit **d'abord**, rouge avant le correctif.
  *Effet de bord assumé :* le premier bucket du raccourci `period` est désormais borné lui aussi —
  plus juste, et c'est un changement de chiffre sur le chemin le plus fréquenté.
- **La garde de cache existait pour `growth` et pas pour `revenue`** — le piège central que
  l'implémenteur documente lui-même. Ablation : `windowKey` retiré de la seule ligne `revenue()`,
  16 tests verts. Jumeau écrit ; les deux gardes sont maintenant indépendantes (vérifié : sous
  ablation, l'une rougit et l'autre reste verte).

**Ce qui reste ouvert :** deux questions que le correctif a **découvertes sans les trancher** —
[TCK-388](TCK-388-comparaison-de-durees-inegales-sur-plage-partielle.md) (comparer 17 jours à
28 jours n'a pas de sens, et l'écran ne dit pas laquelle des deux fenêtres il montre) et
[TCK-389](TCK-389-plafond-de-60-buckets-tronque-en-silence.md). La **granularité** reste figée à
`month` côté front, et aucune vérification navigateur n'a été faite : sur un ticket dont l'objet est
la lisibilité d'un graphique, la lisibilité des étiquettes au vrai gabarit et le rendu en thème
sombre restent non mesurés.

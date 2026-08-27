---
id: TCK-361
title: "Rapports plateforme — de vraies séries temporelles (axes, graduations, infobulles, comparaison)"
status: todo
phase: P2
family: front
estimate: M
wave: 46
created: 2026-08-26
updated: 2026-08-26
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

- [ ] Composant de graphique temporel commun (axes, grille, graduations, infobulle survol + focus, état vide, description accessible)
- [ ] `GrowthChart` et `RevenueChart` migrés dessus
- [ ] Comparaison « période précédente » sur croissance et revenus
- [ ] Plage de dates libre en complément des raccourcis 3m / 6m / 12m
- [ ] `CohortHeatmap` et `FunnelChart` : passage aux tokens `--chart-*` et ajout de l'état vide
- [ ] `ReportingShell` : onglets sur `<Tabs>`
- [ ] Tests : rendu avec 0, 1 et N points ; présence de la description accessible ; export porteur des filtres actifs

## Critères d'acceptation

- [ ] AC1 — chaque graphique affiche un axe des ordonnées gradué et un axe des abscisses lisible, vérifié à 3 points **et** à 12 points
- [ ] AC2 — l'infobulle est atteignable au clavier ; plus aucun attribut `title` ne porte de donnée dans `src/components/reporting/`
- [ ] AC3 — une période sans donnée rend un état vide explicite (test sur `rows: []`), et non une zone vide
- [ ] AC4 — la comparaison à la période précédente est visible sur croissance et revenus, et se distingue visuellement de la série principale
- [ ] AC5 — l'export téléchargé correspond aux filtres actifs à l'écran (test sur les paramètres transmis)
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

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

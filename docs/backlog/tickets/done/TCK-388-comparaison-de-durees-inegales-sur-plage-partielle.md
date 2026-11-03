---
id: TCK-388
title: "Rapports — la comparaison oppose des durées inégales dès que la plage ne couvre pas des mois entiers"
status: done
phase: P2
family: back
estimate: M
wave: 46
created: 2026-08-27
updated: 2026-08-28
depends_on: [TCK-361]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
  models: []
tags: [back, front, super-admin, reporting, exactitude]
---

## Objectif utilisateur

Quand le super-admin coche « Comparer à la période précédente » sur une plage qu'il a choisie
lui-même, l'écart qu'il lit est un écart d'activité — pas un écart de **durée** entre les deux
fenêtres comparées.

## Contexte

TCK-361 a rendu la fenêtre libre : le super-admin choisit ses deux bornes. Sa revue adverse a
trouvé que le premier bucket n'était borné qu'en haut (D5) — une plage commençant un 15 comptait
les quatorze jours qui la précédaient. **C'est corrigé** : `PlatformReportingService::bucketsFor()`
ramène désormais les DEUX bornes du bucket dans la fenêtre, et
`test_a_free_range_starting_mid_month_ignores_what_precedes_its_lower_bound` le garde.

Le correctif rend le chiffre juste et **découvre la question suivante**, qu'il ne tranche pas :

```
plage demandée   2026-03-15 → 2026-03-31   →  1 bucket « 2026-03 », couvrant 17 jours
fenêtre comparée 2026-02-01 → 2026-02-28   →  1 bucket « 2026-02 », couvrant 28 jours
```

`fenetrePrecedente()` (`takussan-web/src/components/reporting/window.ts`) décale d'un nombre entier
de buckets **mensuels**, et c'est délibéré : les deux séries s'alignent par INDEX, donc deux
longueurs différentes les décaleraient d'un cran, en silence. La conséquence est qu'une fenêtre
partielle se compare à une fenêtre pleine, et l'écart affiché contient une part de durée que rien
ne nomme à l'écran.

Deux effets de bord de la même racine, à trancher avec elle :

1. **L'étiquette d'un bucket partiel dit un mois entier.** Le bucket ci-dessus s'appelle `2026-03`
   et vaut 17 jours. Les lignes portent bien `starts_at` / `ends_at`, mais l'axe des abscisses ne
   porte que l'étiquette.
2. **Le raccourci `period` est concerné aussi, depuis le même correctif.** `periodStart('3m')`
   tombe en milieu de mois (`now - 3 mois`, à `startOfDay`) : le premier bucket d'un `period=3m`
   est donc désormais partiel lui aussi. C'est plus juste qu'avant — il ne compte plus rien
   au-delà de la fenêtre — et cela rend le même écart de durée sur le chemin le plus fréquenté.

## Contraintes strictes (métier)

- **L'alignement par index des deux séries est un invariant**, pas un détail d'implémentation :
  `TimeSeriesChart` lit `comparaison.points[i]` en face de `points[i]`. Toute solution qui rend
  deux longueurs différentes doit d'abord dire ce que le graphique en fait.
- **Ne pas « arrondir » la fenêtre demandée aux frontières de mois en silence.** L'utilisateur a
  choisi deux dates ; les élargir sans le dire rouvrirait D5 sous une autre forme.
- Le plafond de 60 buckets et le bornage des deux côtés restent acquis (cf. TCK-389 pour le
  plafond).

## Delta à produire

Trancher **une** des trois voies, et l'écrire dans le ticket avant de coder :

1. **Comparer à durée égale** — la fenêtre précédente couvre exactement le même nombre de JOURS,
   et le graphique cesse de s'aligner par index pour s'aligner par rang de bucket. Le plus juste,
   le plus cher : il faut décider ce qu'affiche la comparaison quand elle rend 2 buckets contre 1.
2. **Normaliser la valeur** — comparer des moyennes journalières plutôt que des totaux sur les
   buckets partiels. Peu coûteux côté calcul, mais change ce que l'axe des ordonnées signifie, et
   ne peut pas rester implicite à l'écran.
3. **Nommer l'inégalité** — garder le décalage mensuel et faire dire au graphique que les deux
   premiers buckets ne couvrent pas la même durée (étiquette, légende, infobulle). Le moins cher,
   et honnête ; il ne rend pas la comparaison juste, il empêche de la mal lire.

Quelle que soit la voie : l'étiquette d'un bucket partiel doit cesser de dire un mois entier.

## Critères d'acceptation

- [x] **AC1** — un test d'API prouve, sur une plage `2026-03-15 → 2026-03-31` **et** sur son décalage,
  que le comportement retenu est celui du ticket. Le vérifier par ablation : retirer le correctif
  doit faire rougir ce test, et pas un autre.
- [x] **AC2** — un test de rendu prouve que l'écran ne peut pas présenter deux buckets de durées
  différentes comme comparables sans le dire. Formuler l'assertion sur ce que l'utilisateur LIT,
  jamais sur la présence d'un nœud (leçon de D9 : `data-testid="serie-comparaison"` était présent
  sur une comparaison qui ne traçait rien).
- [x] **AC3** — le raccourci `period` est couvert par le même choix que la plage libre ; si les deux
  divergent, le ticket dit pourquoi.
- [x] **AC4** — `npx vitest run src/components/reporting`, `npx tsc --noEmit`,
  `php artisan test tests/Feature/Api/Admin/PlatformReportingTest.php` et `./vendor/bin/pint` verts.

## Hors périmètre

- Le plafond de 60 buckets et sa troncature silencieuse — c'est TCK-389, même famille de défaut
  (une plage choisie par l'utilisateur qui rend un chiffre faux), racine différente.
- La granularité `day` / `week` côté écran : `fenetrePrecedente` la prend désormais en paramètre
  obligatoire et la traite correctement, mais aucun sélecteur ne l'expose.

## Notes d'implémentation

`window.ts` porte le raisonnement complet sur le décalage en buckets et sur la lecture textuelle
des bornes (fuseau `Africa/Dakar`). Le lire avant d'y toucher : deux des pièges qu'il décrit ont
déjà été payés.

## Voie retenue — 3, NOMMER L'INÉGALITÉ

Tranchée avant de coder, comme le demande le Delta.

**Pourquoi pas la voie 1 (« comparer à durée égale »).** Elle exige d'abandonner l'alignement par
index, que les contraintes strictes posent comme un INVARIANT : `TimeSeriesChart` lit
`comparaison.points[i]` en face de `points[i]`, et une fenêtre « de même durée » traverse les
frontières de mois — sur 61 jours elle rend trois buckets mensuels là où la principale en a deux.
Le ticket demande que toute solution rendant deux longueurs différentes dise d'abord ce que le
graphique en fait ; c'est une refonte du graphique, pas un correctif de fenêtre.

**Pourquoi pas la voie 2 (« normaliser »).** Elle change ce que l'axe des ordonnées signifie — des
moyennes journalières là où l'utilisateur a demandé des totaux — et ne peut pas rester implicite.
Elle échange un chiffre trompeur contre un chiffre juste dont personne n'a demandé l'unité.

**Ce que fait la voie 3.** L'API mesure la partialité au seul endroit qui connaisse encore les
bornes NATURELLES du bucket au moment où il les ramène dans la fenêtre, et l'expose : `days`
(jours calendaires couverts) et `partial` sur chaque ligne de `growth` et de `revenue`. L'écran
en tire deux choses :

1. l'étiquette d'un intervalle partiel cesse de dire un mois entier — `2026-03 · 17 j` ;
2. dès qu'un intervalle n'a pas la même durée que son vis-à-vis dans la comparaison, le graphique
   le DIT, en toutes lettres, sous la légende.

Elle ne rend pas la comparaison juste. Elle empêche de la mal lire — ce que le ticket dit
explicitement de cette voie.

## Notes d'implémentation

**Ce que la re-mesure a confirmé**, avant correctif :

```
plage 2026-03-15 → 2026-03-31 (month) → 1 bucket « 2026-03 », 17 jours
plage 2026-02-01 → 2026-02-28 (month) → 1 bucket « 2026-02 », 28 jours
```

**Ce qu'elle a contredit — le raccourci `period` a DEUX buckets partiels, pas un.** Le ticket ne
nomme que le premier (« `periodStart('3m')` tombe en milieu de mois »). Mesuré horloge figée au
2026-05-15 :

```
2026-02 days=14 partial=true      ← celui que le ticket nomme
2026-03 days=31 partial=false
2026-04 days=30 partial=false
2026-05 days=15 partial=true      ← le DERNIER l'est aussi, et l'était déjà avant TCK-361
```

Le dernier bucket est rogné par la borne haute depuis toujours — seule la borne basse était neuve.
Une comparaison sur `period` porte donc l'inégalité aux DEUX extrémités.

**Le CSV.** `days` et `partial` accompagnent chaque ligne jusque dans le fichier — c'est là qu'on
relit un rapport hors contexte. Et `downloadPayload()` écrit désormais `true`/`false` au lieu de
`1`/`` : la case VIDE d'un booléen faux se relit comme une donnée manquante, ce qui aurait perdu
exactement l'information que ce ticket ajoute.

**Hors AC, dans la même passe** : `enveloppe()` du test de `GrowthChart` porte un mois plein par
défaut, sinon toute série de test aurait déclenché la mention d'inégalité.

### Amendement après passe adverse (2026-08-27)

**Le cache servait l'ancienne forme pendant dix minutes après déploiement.** Le changement de forme
des lignes est invisible d'une clé de cache : `growth`/`revenue` auraient rendu des enveloppes sans
`days` ni `partial` pendant tout le TTL (600 s, redis en production), alors que `GrowthRow` les
déclare obligatoires. Rien ne plante — l'écran rend simplement, pendant dix minutes, le comportement
exact que ce ticket corrige.

Corrigé par une `ROW_SCHEMA_VERSION` dans la clé, **et non par un appel à `bumpCacheVersion()` au
déploiement** : *une invalidation qui dépend d'un geste humain au bon moment n'est pas une
invalidation.* La prochaine forme de ligne incrémente la constante ; il n'y a plus d'action de
déploiement à retenir. `bumpCacheVersion()` garde son rôle : l'invalidation événementielle.

Gardé par `test_an_envelope_cached_by_the_previous_row_shape_is_not_served`, qui empoisonne la clé
d'avant et vérifie qu'elle n'est pas servie. Le test reproduit cette clé à la main, ce qui est
fragile et assumé : il ne peut pas la demander au service, dont c'est le secret.

**`GenerateReportExport::toCsv()` a désormais un test**
(`test_the_async_export_writes_the_same_csv_as_the_synchronous_one`). Le chemin asynchrone n'est
atteint qu'au-delà de 10 000 lignes, donc jamais sous le plafond de 60 buckets — c'est précisément
pourquoi il en avait besoin : *un chemin qu'aucun appel ne prend est un chemin dont personne ne
verra la dérive.*

### Second amendement (2026-08-27)

`ROW_SCHEMA_VERSION` est posée sur DEUX clés, construites par deux `sprintf` distincts, et une seule
était gardée. Mesuré : retirer le jeton de la seule clé `revenue` laissait 29 tests verts. *Une
garde qui ne couvre qu'une moitié d'un correctif en deux endroits ne garde pas le correctif : elle
garde la moitié qu'on avait sous les yeux en l'écrivant.* D'où
`test_a_revenue_envelope_cached_by_the_previous_row_shape_is_not_served`, jumeau du précédent ;
l'ablation rend désormais 1 rouge.


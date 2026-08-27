---
id: TCK-388
title: "Rapports — la comparaison oppose des durées inégales dès que la plage ne couvre pas des mois entiers"
status: todo
phase: P2
family: back
estimate: M
wave: 46
created: 2026-08-27
updated: 2026-08-27
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

- **AC1** — un test d'API prouve, sur une plage `2026-03-15 → 2026-03-31` **et** sur son décalage,
  que le comportement retenu est celui du ticket. Le vérifier par ablation : retirer le correctif
  doit faire rougir ce test, et pas un autre.
- **AC2** — un test de rendu prouve que l'écran ne peut pas présenter deux buckets de durées
  différentes comme comparables sans le dire. Formuler l'assertion sur ce que l'utilisateur LIT,
  jamais sur la présence d'un nœud (leçon de D9 : `data-testid="serie-comparaison"` était présent
  sur une comparaison qui ne traçait rien).
- **AC3** — le raccourci `period` est couvert par le même choix que la plage libre ; si les deux
  divergent, le ticket dit pourquoi.
- **AC4** — `npx vitest run src/components/reporting`, `npx tsc --noEmit`,
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

---
id: TCK-331
title: "`--coverage-php` est passé DEUX FOIS — le cliquet sort en 1 sans un mot, et la carte d'impact n'a jamais été régénérée"
status: todo
phase: P2
family: technique
estimate: M
wave: 41
created: 2026-08-17
updated: 2026-08-17
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, ci, tests, outillage, dette]
---

## Objectif utilisateur

Que la carte d'impact se régénère réellement, et que le cliquet de couverture rende un verdict
plutôt qu'un silence. Aujourd'hui le step de test sort en **1** avec une suite **entièrement
verte**, et `tests/impact-map.json` ne s'est jamais mise à jour toute seule.

## Contrat de données

Aucune donnée applicative.

## La mesure

**`artisan test --coverage` passe DÉJÀ `--coverage-php` à PHPUnit en interne** — c'est ainsi qu'il
construit sa table par fichier et qu'il évalue `--min`. L'ajouter explicitement le rend présent
**deux fois** : PHPUnit l'écarte, le rapport d'artisan ne se matérialise jamais, `--min` n'a rien à
évaluer, et la commande sort en 1.

Le message existe. Il faut séparer `stderr` et isoler le vrai code de sortie pour le voir — un
`| tail` rend celui de `tail`, ce qui explique qu'il soit resté invisible en CI :

```
WARN  Option --coverage-php cannot be used more than once
```

### Ablation — une seule variable, même sous-ensemble

| | `Total:` | sortie |
|---|---|---|
| sans `--coverage-php` | **`Total: 0.7 %`** | **0** |
| avec `--coverage-php` | **absent**, + le WARN | **1** sous `--min=86` |

### Ce que ce n'est PAS

- **Pas la mémoire.** `cov.php` est écrit **en entier** : 493 Ko sur le sous-ensemble,
  **104 Mo sur la suite complète**. L'écrivain fonctionne.
- **Pas un seuil de taille de suite.** Le nombre de tests est passé de 2313 à 2552 sans rapport :
  l'option n'avait **jamais** tourné.
- **Pas une régression de couverture.** Le clover de l'exécution rouge mesure **86,33 %**, au-dessus
  du cliquet.

### Zéro succès, jamais

| exécution | résultat |
|---|---|
| push `4bd5aa71` | morte avant, sur le 429 à l'installation |
| PR #199, 1ʳᵉ | **rouge**, sortie 1 muette |
| PR #199, 2ᵈᵉ (`--coverage-php` retiré sur PR) | **verte** |
| push `d7132beb` | **rouge**, sortie 1 muette |

**Deux exécutions l'ont produit, deux échecs.** L'option et le step de régénération sont arrivés sur
`origin` avec le push de 38 commits ; le dernier run vert d'avant ne les contenait ni l'un ni l'autre.

## La conséquence, plus lourde que la CI rouge

**`tests/impact-map.json` n'a JAMAIS été régénérée automatiquement.** Elle date de son unique
construction manuelle (`eafab606`) et elle vieillit depuis. `bin/impacted-tests.php` fonctionne, mais
sa carte ne se met pas à jour comme TCK-320 l'annonce — et une carte périmée ne se signale pas : elle
sélectionne simplement moins de tests qu'il n'en faudrait.

⚠ **L'AC7 de TCK-320 a été coché sur LECTURE du workflow**, pas sur une exécution. La condition
`if:`, le `[skip ci]`, l'ordre `git add` / `git diff --cached` sont tous justes — et aucun n'avait
jamais tourné. *Ne jamais déduire l'état d'un environnement de la configuration qui le vise.*

## ⚠ Deux choses à savoir avant de proposer un raccourci

**1. Le clover ne peut PAS remplacer `cov.php`.** La carte d'impact a besoin de l'attribution
**test → lignes** : `bin/build-impact-map.php` lit l'objet `CodeCoverage` sérialisé, qui porte le
tableau des tests par ligne. Le clover ne porte que des **compteurs par fichier** — aucune trace de
quel test a couvert quoi. Une carte dérivée du clover serait **structurellement fausse**, et
`check-impact-map.mjs` la validerait sans broncher, puisqu'elle serait structurellement *cohérente*.
L'invocation directe de PHPUnit n'est donc pas une préférence de style, c'est la seule voie.

**2. La carte gelée se dégrade dans le BON sens — ne pas lire cette fiche comme « les sélections
sont fausses ».** Elle est figée à `eafab606` pendant que `dev` avance, et les deux mécanismes de
TCK-320 poussent alors vers **plus** de tests, jamais moins :

- un fichier de `app/` **absent de la carte** impose la **suite entière** (le défaut à l'escalade,
  durci en revue finale) ;
- la réparation de péremption ajoute d'office **toute classe de test modifiée depuis le commit de la
  carte** — et plus la carte vieillit, plus cet ensemble grossit.

`bin/impacted-tests.php` devient donc progressivement **plus lent et plus large**, pas plus
permissif. **Il ne fabriquera pas de faux vert.** C'est ce qui permet de traiter cette fiche comme
une dette sérieuse plutôt que comme une urgence : la garde ne ment pas, elle s'émousse.

## Delta à produire

- [ ] Faire produire les trois sorties de couverture par **une seule** invocation qui les accepte —
      PHPUnit directement plutôt qu'`artisan test --coverage` — et calculer le cliquet depuis le
      **clover** plutôt que depuis la table d'artisan. Ne PAS ajouter une seconde exécution de la
      suite : elle coûterait ~250 s par build. ⚠ Le clover sert au CLIQUET, jamais à la CARTE —
      cf. l'avertissement ci-dessus.
- [ ] Vérifier que le cliquet rend **la même valeur qu'aujourd'hui, à la décimale** (86,3 %).
- [ ] Réactiver le step de régénération de la carte, et **prouver qu'il tourne** — pas le relire.
- [ ] Corriger l'AC7 de TCK-320 par un **encadré daté** plutôt qu'une réécriture : la trace de ce
      qu'on croyait a de la valeur.
- [ ] Garde : une exécution qui ne rend pas de ligne `Total:` doit **échouer bruyamment**, pas
      silencieusement. Un `WARN` de PHPUnit ne doit jamais pouvoir se perdre dans un `| tail`.

## Critères d'acceptation

- [ ] AC1 — La suite CI sort en **0** sur `push` vers `dev`, avec sa table et son `Total:`.
- [ ] AC2 — `tests/impact-map.json` est régénérée par une exécution **observée**, et le commit
      automatique apparaît dans l'historique.
- [ ] AC3 — Le cliquet rend la même valeur qu'avant, à la décimale.
- [ ] AC4 — L'ablation est écrite : retirer le correctif fait revenir la sortie 1 muette.
- [ ] AC5 — L'encadré daté de TCK-320 existe et dit pourquoi l'AC7 n'était pas tenu.

## Hors périmètre

- Le seuil `--min=86` lui-même — il n'est pas en cause, mesuré à 86,33 %.
- La parallélisation en CI — c'est TCK-324.
- La fraîcheur de la carte au-delà de sa régénération automatique.

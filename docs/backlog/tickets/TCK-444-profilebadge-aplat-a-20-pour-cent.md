---
id: TCK-444
title: "`ProfileBadge` — 12 couples sur 20 sous le seuil de contraste : c'est le motif `bg-chart-N/20 text-chart-N` qui est en cause, pas une ligne de la table"
status: todo
phase: P2
family: front
estimate: S
wave: 50
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#25-reporting--tableaux-de-bord
tags: [front, design-system, a11y, tokens]
---

## Objectif utilisateur

Le badge qui nomme le profil d'un membre est lisible par tout le monde, dans les deux thèmes.

## Contexte

`ProfileBadge.tsx` envoie les **cinq** types de profil sur le même motif —
`bg-chart-N/20 text-chart-N` — c'est-à-dire du texte posé sur un aplat à 20 % de **sa propre
couleur**. Mesuré le 2026-08-27 (composition alpha en espace gamma, puis WCAG 2.x ; seuil AA
texte normal **4,5:1**) :

| type (jeton) | clair `--card` | clair `--background` | sombre `--card` | sombre `--background` |
|---|---|---|---|---|
| `agency_admin` (`--chart-1`) | 4,04 ✗ | 3,86 ✗ | 3,59 ✗ | 3,96 ✗ |
| `owner` (`--chart-2`) | 4,21 ✗ | 4,02 ✗ | 3,38 ✗ | 3,77 ✗ |
| `agent` (`--chart-3`) | **2,17** ✗ | **2,08** ✗ | 5,31 ✓ | 5,86 ✓ |
| `broker` (`--chart-4`) | 4,34 ✗ | 4,15 ✗ | 4,73 ✓ | 5,27 ✓ |
| `service_provider` (`--chart-5`) | 11,50 ✓ | 10,97 ✓ | 8,10 ✓ | 8,99 ✓ |

**12 couples sur 20 sont sous le seuil.**

**Le motif entier est en cause, et c'est le point du ticket.** Un aplat à 20 % d'une couleur sous
son propre texte ne peut pas atteindre 4,5:1 tant que la couleur n'est pas franchement plus
sombre que la surface : `--chart-5` passe partout précisément parce qu'il est presque noir en
clair et presque blanc en sombre. *Corriger la seule ligne `agent` corrigerait un cinquième du
défaut et laisserait le mécanisme intact.*

**Trois pièges que la mesure a révélés, et qu'une vérification courante manque :**

1. **Les deux surfaces ne se trompent pas dans le même sens selon le thème.** En clair,
   `--background` est **toujours pire** que `--card` ; en sombre, **toujours meilleur**. Mesurer
   sur une seule surface donne un classement faux.
2. **`--chart-3` inverse selon le thème** — pire jeton en clair (2,17), correct en sombre (5,31).
   Une vérification faite dans un seul thème conclut l'inverse de la vérité, exactement comme
   l'a relevé [TCK-404](TCK-404-chart-3-sous-le-seuil-de-contraste-en-clair.md).
3. **La garde existante ne voit pas ce défaut, et le dit elle-même.**
   `scripts/check-chart-contrast.mjs` mesure le jeton **nu** sur `--card` au seuil **3:1**
   (WCAG 2.2 §1.4.11, objet graphique) ; son en-tête écrit qu'elle « ne dit rien [d']une série
   posée sur une autre surface ». Elle est verte pendant que ces 12 couples échouent : ce n'est
   pas un défaut de la garde, c'est le périmètre qu'elle annonce.

⚠ **Ce ticket et TCK-404 ne mesurent pas la même chose** et ne se remplacent pas : TCK-404 pèse
`--chart-3` **nu** sur `--card` (2,57:1) au seuil de 3:1 ; celui-ci pèse le **texte sur son propre
aplat à 20 %** au seuil de 4,5:1. Une valeur de `--chart-3` qui satisferait TCK-404 ne suffirait
pas ici.

## Contrat de données

Aucune. Le badge lit `profile.type`, déjà servi.

## Direction UX / Artistique

Le badge doit rester une **catégorie** et non un état : cinq teintes distinguables, aucune
sémantique de gravité — l'acquis de TCK-381 ne doit pas être défait. Ce qui doit changer est la
**recette** qui fabrique le couple fond/texte, pas l'idée d'une couleur par type. Un aplat très
clair porté par un texte franchement plus sombre que lui, ou l'inverse en thème sombre, dit la
même chose en restant lisible. Le repli `FALLBACK_COLOR` pour un type inconnu reste en place.

## Contraintes strictes (métier)

- Les cinq types déclarés gardent des couleurs **distinctes** deux à deux —
  `ProfileBadge.test.tsx` l'exige déjà et a raison.
- Le seuil visé est **4,5:1** (texte normal), pas 3:1 : le badge porte du texte.
- Les **deux** thèmes et les **deux** surfaces (`--card`, `--background`) doivent passer : 20
  couples, pas 5 ni 10.
- Aucune couleur Tailwind brute : les valeurs restent des jetons du design system (acquis
  TCK-381).

## Delta à produire

- [ ] Remplacer le motif `bg-chart-N/20 text-chart-N` de la table `TYPE_COLOR` **entière**
- [ ] Étendre `scripts/check-chart-contrast.mjs` — ou poser une garde sœur — qui mesure le
      **couple rendu** (aplat composé + texte) au seuil 4,5:1, sur `--card` **et**
      `--background`, dans les deux thèmes
- [ ] Mettre à jour l'en-tête de la garde existante si son périmètre change
- [ ] Tests : le test de `ProfileBadge` couvre le contraste, pas seulement la distinction

## Critères d'acceptation

- [ ] AC1 — les **20** couples (5 types × 2 thèmes × 2 surfaces) atteignent 4,5:1, chiffres à
      l'appui
- [ ] AC2 — la garde ROUGIT si l'on remet un seul type sur `bg-chart-N/20 text-chart-N` ;
      vérifié par ablation
- [ ] AC3 — les cinq types restent distinguables deux à deux (test existant toujours vert)
- [ ] AC4 — la garde nomme le type, le thème ET la surface fautifs, pas seulement un total

## Hors périmètre

- La valeur de `--chart-3` elle-même → [TCK-404](TCK-404-chart-3-sous-le-seuil-de-contraste-en-clair.md).
- Les graphiques, qui relèvent du seuil 3:1 et de la garde existante.

## Notes d'implémentation

_(à remplir par implementing-specs)_

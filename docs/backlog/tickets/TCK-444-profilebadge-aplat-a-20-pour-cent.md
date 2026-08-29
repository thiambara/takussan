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

- [x] Remplacer le motif `bg-chart-N/20 text-chart-N` de la table `TYPE_COLOR` **entière**
- [x] Étendre `scripts/check-chart-contrast.mjs` — ou poser une garde sœur — qui mesure le
      **couple rendu** (aplat composé + texte) au seuil 4,5:1, sur `--card` **et**
      `--background`, dans les deux thèmes
- [x] Mettre à jour l'en-tête de la garde existante si son périmètre change
- [x] Tests : le test de `ProfileBadge` couvre le contraste, pas seulement la distinction

## Critères d'acceptation

- [x] AC1 — les **20** couples (5 types × 2 thèmes × 2 surfaces) atteignent 4,5:1, chiffres à
      l'appui
- [x] AC2 — la garde ROUGIT si l'on remet un seul type sur `bg-chart-N/20 text-chart-N` ;
      vérifié par ablation
- [x] AC3 — les cinq types restent distinguables deux à deux (test existant toujours vert)
- [x] AC4 — la garde nomme le type, le thème ET la surface fautifs, pas seulement un total

## Hors périmètre

- La valeur de `--chart-3` elle-même → [TCK-404](TCK-404-chart-3-sous-le-seuil-de-contraste-en-clair.md).
- Les graphiques, qui relèvent du seuil 3:1 et de la garde existante.

## Notes d'implémentation

### Ce qui a été livré, 2026-08-29

| Fichier | Rôle |
|---|---|
| `src/components/profile/ProfileBadge.tsx` | `TYPE_COLOR` **entière** : `text-chart-N` → `text-foreground` |
| `scripts/check-profile-badge-contrast.mjs` | la garde SŒUR (24 mesures, seuil 4,5:1) |
| `.github/workflows/repo-ci.yml` | la garde rejouée à chaque PR |
| `src/components/profile/__tests__/ProfileBadge.test.tsx` | +2 cas : le contraste, pas seulement la distinction |

**Le motif est remplacé, pas une ligne — et il fallait le prouver, pas l'affirmer.** La
démonstration tient en une phrase : l'aplat `bg-chart-N/20` vit ENTRE la surface et `--chart-N`,
donc le contraste de `text-chart-N` dessus est **borné par** celui du jeton nu sur la surface. Ce
majorant vaut **3,55:1** pour `--chart-3` — *aucune valeur d'alpha ne pouvait sauver `agent`*.
L'aplat reste (il porte la CATÉGORIE, acquis de TCK-381) ; c'est l'encre qui change pour
`--foreground`, qui s'inverse avec le thème.

**AC1 — les 20 couples, mesurés par la garde** (arrondi entier de l'aplat composé, comme le
navigateur) :

|  | clair `--card` | clair `--bg` | sombre `--card` | sombre `--bg` |
|---|---|---|---|---|
| `agency_admin` | 13,32 | 12,71 | 11,27 | 12,45 |
| `owner` | 13,40 | 12,79 | 11,45 | 12,75 |
| `agent` | 14,16 | 13,54 | 9,85 | 10,88 |
| `broker` | 13,32 | 12,74 | 10,24 | 11,41 |
| `service_provider` | 11,50 | 10,97 | 8,10 | 8,99 |
| *(repli `FALLBACK_COLOR`)* | 14,87 | 14,87 | 12,53 | 12,53 |

Minimum **8,10:1**, soit 1,80× le seuil, contre **2,87:1** avant. Le repli est mesuré lui aussi :
c'est ce qui s'affiche à un type inconnu du front, donc en production.

> ⚠ **Le 2,17:1 du tableau de ce ticket n'est pas reproductible, et ce n'est pas une erreur.** Il a
> été mesuré le 2026-08-27 sur `--chart-3 = #c89a4a` — valeur que **TCK-404 a corrigée le même
> jour** en `#ad8034`. Avec la valeur d'aujourd'hui le même couple rend **2,87:1**. Les quatre
> autres lignes sont inchangées à 0,02 près (arrondi). *Une mesure sans sa date devient une
> croyance* : celle-ci a vécu douze heures. Le verdict, lui, n'a pas bougé d'un cran.

**AC2 — ablation, hachages du contenu pris AVANT lecture du résultat :**

| état | md5 de `ProfileBadge.tsx` | garde |
|---|---|---|
| livré | `d1912b49914abed5c4dcdfdbee6aad1a` | ✓ 24 couples ≥ 4,5:1, minimum 8,10:1 |
| **un seul** type remis sur `text-chart-3` | `1ab909558d2fa480070c0d5fdc3bf3c7` | ✗ **2 défauts** (clair `--card` 2,87 ; clair `--background` 2,74) |
| les **cinq** types remis | `346be748783a99dd8200a5b646ea4357` | ✗ **12 défauts** — le compte exact du ticket |
| retour | `d1912b49914abed5c4dcdfdbee6aad1a` | ✓ |

⚠ L'ablation d'un seul type ne rougit **qu'en thème clair** : `--chart-3` se comporte bien en
sombre (5,30 / 5,90). C'est le piège n°2 du § Contexte, reproduit par l'ablation elle-même — une
garde d'un seul thème aurait conclu l'inverse.

**AC3** — les 29 cas préexistants de `ProfileBadge.test.tsx` restent verts, `CLASSE_DE_SERIE`
comprise : la recette garde son `bg-chart-N/20`, donc les cinq types restent distincts deux à deux.

**AC4** — le message nomme le type, la recette, le ratio, **le thème ET la surface**, plus les deux
couleurs composées : `« agent » (bg-chart-3/20 text-chart-3) rend 2.87:1 en thème clair sur --card
— encre #ad8034 sur aplat #efe6d6`.

### Sur la garde existante

`scripts/check-chart-contrast.mjs` **n'a pas changé de périmètre** — elle mesure les jetons NUS au
seuil de 3:1 (objet graphique), ce qu'annonce son en-tête — donc rien n'y était à corriger. Une
garde SŒUR plutôt qu'un élargissement : mélanger deux seuils dans un même script est précisément
l'erreur qui a laissé passer ce défaut. Les deux partagent en revanche leurs **valeurs de
contrôle** d'arithmétique (21:1 blanc sur noir, 2,57:1 pour `#c89a4a` sur blanc, la composition à
50 %), pour qu'une divergence de calcul entre les trois implémentations WCAG du dépôt fasse rougir
au lieu de se propager en silence.

### Trouvé au passage, non corrigé

Le même motif — du texte sur un aplat de sa propre couleur — vit ailleurs sur la **surface
publique**, et c'est la garde dérivée de TCK-458 qui l'a relevé indépendamment :
`text-primary sur bg-primary/{5,8,15}` (`SearchToolbar`, `SearchAutocomplete`, `FilterSidebar`) et
`text-success sur bg-success/5` (`FormSuccess`). Consignés dans l'ardoise de
`surface-publique.contraste.test.ts`, hors du périmètre de ce ticket.

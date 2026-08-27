---
id: TCK-404
title: "`--chart-3` rend 2,57:1 sur `--card` en thème clair — décider de la valeur ou du rôle"
status: doing
phase: P2
family: front
estimate: S
wave: 48
created: 2026-08-27
updated: 2026-08-27
depends_on: [TCK-374]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
tags: [front, design-system, a11y, charts]
---

## Objectif utilisateur

Un lecteur du back-office distingue toutes les couleurs de la charte sur une carte blanche, y
compris l'ambre — ou bien la charte assume que l'ambre n'est pas une couleur de série.

## Contexte

Mesuré le 2026-08-27 pendant TCK-374, par `node scripts/check-chart-contrast.mjs --report` :

| jeton | clair (`--card #ffffff`) | sombre (`--card #2a2018`) |
|---|---|---|
| `--chart-1` `#a85332` | 5,32:1 ✓ | 4,83:1 ✓ |
| `--chart-2` `#5d6e4f` | 5,51:1 ✓ | 4,48:1 ✓ |
| **`--chart-3` `#c89a4a`** | **2,57:1 ✗** | 8,17:1 ✓ |
| `--chart-4` `#6e655a` | 5,72:1 ✓ | 7,01:1 ✓ |
| `--chart-5` `#1f1812` | 17,53:1 ✓ | 15,16:1 ✓ |

Le seuil de 3:1 est celui de WCAG 2.2 §1.4.11 pour un objet graphique porteur de sens.

**Deux choses rendent ce défaut coûteux, et aucune n'est le nombre lui-même.**

1. **Il n'existe qu'en thème CLAIR.** En sombre, `--chart-3` est le deuxième meilleur jeton de la
   charte. Une vérification faite dans un seul thème — le réflexe — conclut l'inverse de la vérité.
2. **Le ticket qui l'a rencontré supposait le contraire.** TCK-374 posait que « la charte fournit
   déjà l'échelle ; la suivre suffit, et elle règle le contraste par la même occasion ». Mesuré,
   c'est faux d'un jeton sur cinq — et `--chart-3` rend moins bien que l'`emerald-500` hors charte
   qu'il était censé remplacer (2,54:1). *Adopter une charte n'est pas la mesurer.*

TCK-374 a **écarté** le jeton de l'ordre des séries (`1, 2, 4, 5` dans
`takussan-web/src/components/charts/palette.ts`) plutôt que de le corriger : changer la valeur d'un
jeton documenté est une décision de charte, hors du delta d'un ticket `S`. Ce ticket-ci porte cette
décision.

## Contrat de données

Aucun.

## Direction UX / Artistique

L'ambre de la charte sert aussi de **fond** (le ton `warning` de `StatCard` le porte à 15 %
d'opacité, où le seuil de 3:1 ne s'applique pas). Une décision qui ne regarderait que la série
casserait ce second usage. Les deux rôles doivent être tranchés ensemble.

## Contraintes strictes (métier)

- Toute nouvelle valeur reste dans la direction « Ancrage Local Contemporain » (`docs/design-guidelines.md`).
- Si `--chart-3` est corrigé, il rentre dans l'ordre des séries de `charts/palette.ts` et la garde
  le mesure — le retirer de la table sans le corriger reste l'état actuel, ce n'est pas une action.

## Delta à produire

- [ ] Trancher : corriger la valeur claire de `--chart-3`, ou acter qu'il n'est pas une couleur de
      série et l'écrire dans `docs/design-guidelines.md`
- [ ] Si correction : nouvelle valeur ≥ 3:1 sur `--card` clair, vérifiée sur les usages de fond
- [ ] Si correction : réintégrer le jeton dans les trois tables de `charts/palette.ts`

## Critères d'acceptation

- [ ] AC1 — `node scripts/check-chart-contrast.mjs --report` reste vert, et mesure **cinq** jetons
      par thème si la voie « corriger » est prise
- [ ] AC2 — la décision est écrite dans `docs/design-guidelines.md`, quelle qu'elle soit
- [ ] AC3 — aucune régression visuelle sur le ton `warning` de `StatCard`, mesuré en clair ET en
      sombre

## Hors périmètre

- Les quatre autres jetons, tous au-dessus du seuil dans les deux thèmes.

## Notes d'implémentation

**LA DÉCISION : corriger la valeur.** `--chart-3` passe de `#c89a4a` à `#ad8034` en `:root`. La
valeur `.dark` (`#d6b66c`, 8,17:1) ne bouge pas — elle n'a jamais été en défaut.

La valeur retenue garde la **teinte (38°)** et la **saturation (54 %)** de la charte au chiffre
près : seule la clarté HSL descend, de 54 % à 44 %. Ce n'est pas une couleur nouvelle, c'est la
même assez foncée pour se voir sur du blanc. Mesuré, pas estimé :

    #ad8034 sur --card #ffffff .......... 3,55:1   (seuil 1.4.11 : 3:1)
    #ad8034 sur --background #fcf9f3 .... 3,38:1

3,55:1 place le jeton au niveau du minimum déjà toléré par la garde (3,59:1 pour `bg-chart-1/80`),
pas au ras du seuil.

**⚠ CE QUE LA RE-MESURE A CONTREDIT — et c'est ce qui a rendu la décision facile.**

La section « Direction UX / Artistique » de ce ticket bloquait la correction sur un second rôle :
« l'ambre de la charte sert aussi de fond, le ton `warning` de `StatCard` le porte à 15 %, les deux
rôles doivent être tranchés ensemble ». **Mesuré le 2026-08-27 : c'est PÉRIMÉ.** TCK-381 a fait
passer ce ton sur `bg-warning/10`, et l'exemption `bg-chart-3/15` a disparu de `SURFACES` de
`scripts/check-chart-contrast.mjs` au même moment. Il n'y avait plus deux rôles à arbitrer.
**L'AC3 (« aucune régression sur le ton `warning` de `StatCard` ») est donc VACUE** : `StatCard` ne
touche plus `--chart-3`. Vérifiée quand même, par lecture du fichier et par la garde.

*Un ticket qui hérite d'un obstacle doit re-mesurer l'obstacle, pas seulement le défaut.*

**Un consommateur trouvé, NON corrigé, et signalé.** `components/profile/ProfileBadge.tsx:55` rend
`bg-chart-3/20 text-chart-3` — du TEXTE sur un aplat de lui-même : **2,17:1 avant, 2,90:1 après**.
Amélioré gratuitement par la correction, toujours sous les 4,5:1 d'AA, et hors du périmètre de
`check-chart-contrast.mjs` (qui ne lit que `components/charts` et `components/reporting`). C'est
ce consommateur qui a tranché entre les deux voies : **rétrograder le rôle n'aurait rien corrigé et
aurait entériné cet usage-là**, puisque « ce n'est pas une couleur de série » ne dit rien de son
emploi comme encre. À ouvrir en ticket.

Le docblock de `charts/StatCard.tsx` affirmait « `--chart-3` n'a plus AUCUNE occurrence hors des
séries ». C'était faux de celle-ci, et pour la raison exacte qui la rend coûteuse : elle est hors
du périmètre de la garde. *Un « aucune » vérifié dans le périmètre d'une garde est un « aucune dans
ce périmètre ».* Corrigé dans le docblock.

**⚠ Conséquence à connaître** : l'ordre des séries redevient `1,2,3,4,5`, donc un graphique à trois
séries voit sa troisième passer de taupe (`--chart-4`) à ocre (`--chart-3`).

**Suite de la revue du lead (2026-08-27).** Trois exigences, trois mesures :

1. **La garde mesure désormais SUR DEUX SURFACES**, `--card` et `--background`, et non plus sur la
   seule carte. Le second ratio (3,38:1) ne vivait que dans un commentaire, et *un ratio consigné
   dans une prose que rien ne rejoue est une croyance datée*. C'était un TROU et non un cadrage :
   les deux surfaces se trompent en sens opposés selon le thème. Relevé à l'ajout — **les 34
   nouvelles mesures passent toutes**, minimum 3,38:1 en clair et 3,85:1 en sombre : aucune
   correction n'a été nécessaire pour que la surface entre, ce qui est le seul moment où élargir
   une garde ne coûte rien. Cliquet `MESURES_ATTENDUES` 34 → 68.
2. **Le test assert désormais les VALEURS, pas seulement le seuil.** Un `>= 3` reste vert sur
   n'importe quelle valeur plus foncée : il garde le seuil, pas la DÉCISION. `#ad8034` a été
   choisi pour garder la teinte et la saturation de la charte ; un successeur qui assombrirait le
   jeton « pour avoir de la marge » sortirait de la charte sans qu'aucun test ne le dise. Les
   quatre ratios (3,55 / 3,38 / 8,17 / 8,99) sont écrits et comparés à 2 décimales.
3. **L'en-tête de `charts/palette.ts` était au PRÉSENT sur une mesure invalidée** — « `--chart-3`
   vaut `#c89a4a` et rend 2,57:1 ». Passé au passé, avec la raison écrite sur place : c'est
   exactement la documentation périmée dont on ne se méfie pas.

⚠ **Le défaut de `ProfileBadge` est plus large que ce que ce ticket a d'abord rapporté.** Les CINQ
types de profil y rendent `bg-chart-N/20 text-chart-N`, et **huit des dix couples (type × thème)
sont sous les 4,5:1 d'AA** — pas seulement `--chart-3`. Relevé sur `--card` :

| | clair | sombre |
|---|---|---|
| `chart-1` | 4,04 ✗ | 3,59 ✗ |
| `chart-2` | 4,21 ✗ | 3,38 ✗ |
| `chart-3` | 2,87 ✗ (était 2,17) | 5,31 ✓ |
| `chart-4` | 4,34 ✗ | 4,73 ✓ |
| `chart-5` | 11,50 ✓ | 8,10 ✓ |

C'est le motif entier qui est en cause — un aplat à 20 % d'une couleur sous son propre texte ne
peut pas atteindre 4,5:1 tant que la couleur n'est pas beaucoup plus foncée que sa surface. Pour
le ticket de suite.

**Un test double la garde**, et lit `globals.css` plutôt qu'une copie : le harnais
`src/test/contraste-wcag.ts` recopie les jetons à dessein, mais une valeur recopiée ne peut pas
dire qu'elle a changé. La garde tourne en CI ; ce cas-ci rougit dans la boucle de `npm run test`,
là où le jeton se modifie. Ablation rejouée : rétablir `#c89a4a` fait rougir les deux.

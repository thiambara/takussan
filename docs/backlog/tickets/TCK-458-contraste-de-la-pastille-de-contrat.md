---
id: TCK-458
title: "La pastille de type de contrat est sous le seuil AA sur toutes les cartes de bien — et la mesure de contraste ne couvrait que deux composants"
status: todo
phase: P2
family: front
estimate: M
wave: 49
created: 2026-08-28
updated: 2026-08-28
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, design-system, tokens, accessibilite, public]
---

## Objectif utilisateur

Le mot « Location » ou « Vente », lisible sur toutes les cartes de bien — y compris pour un
visiteur qui ne distingue pas bien les contrastes faibles.

## Contexte

`src/components/property/cards/ContractTypeChip.tsx:27` rend la variante *location* en
`bg-accent/90 text-accent-foreground`. C'est du **texte réel**, en 10-11 px semi-gras, donc
gouverné par le seuil AA de **4,5:1** (WCAG 2.1, 1.4.3), et il est rendu sur **toutes les cartes
de bien** de la surface publique.

Mesuré le 2026-08-28, alpha composé avant le calcul, indépendamment par deux agents (accord à
0,02 près) :

| thème | fond | ratio | verdict |
|---|---|---|---|
| clair | `--card` | **4,22:1** | ✗ sous 4,5 |
| clair | `--background` | **4,26:1** | ✗ |
| sombre | `--card` | **4,29:1** | ✗ |
| sombre | `--background` | **4,24:1** | ✗ |

L'autre variante de la même pastille — *vente*, `bg-foreground/85 text-background` — rend entre
10,5 et 12,4:1 et va très bien. **Le défaut n'est donc pas dans la forme de la pastille, il est
dans un seul couple de jetons.**

> ⚠ **La pastille est posée SUR LA PHOTO du bien** (`backdrop-blur-md`, en surimpression) : les
> 10 % restants laissent passer des pixels d'image quelconques, donc le ratio réel VARIE avec la
> photo.
>
> ⚠⚠ **Correction du 2026-08-28 — une première rédaction de ce ticket ajoutait « et non borné vers
> le bas ». C'ÉTAIT FAUX, et l'erreur allait dans le sens alarmiste.** La plaque vaut
> `0,9·accent + 0,1·pixel` composante par composante ; sa luminance est donc monotone croissante
> en chaque canal du pixel, et l'encre étant quasi blanche, le contraste est *minimal* quand la
> plaque est la plus claire — c'est-à-dire **sur un pixel blanc**. Le plancher est nommable :
>
>     pixel noir ......... 6,15:1        jaune vif .......... 4,30:1
>     gris moyen ......... 5,07:1        pixel BLANC ........ 4,22:1   ← le plancher
>
> Vérifié par balayage exhaustif de 18³ pixels : le minimum tombe exactement sur (255,255,255).
>
> ⚠ Un relevé indépendant donne **4,20:1** au lieu de 4,22 : l'écart vient de l'ARRONDI ENTIER de
> la plaque composée (109,2 / 124,5 / 96,6 → 109 / 125 / 97), et de rien d'autre — vérifié. Les
> deux chiffres sont justes sous leur convention ; celui-ci ne quantifie pas. La conclusion est la
> même à 0,02 près, et **très loin du seuil dans les deux cas**.
> **Et 4,22:1 est le chiffre déjà mesuré sur `--card`, parce que `--card` EST #ffffff.** Le
> tableau ci-dessus n'était donc pas une hypothèse optimiste à dépasser : il contenait déjà le
> pire cas.
>
> Ce que ça change, et c'est en faveur du correctif : **le pire fond est nommable, donc l'AC est
> exécutable** — on mesure sur un pixel blanc, pas sur « une photo quelconque ». Et le correctif
> reste petit : remonter l'alpha, ou assombrir le couple.
>
> ⚠ Reste vrai, indépendamment du ratio : un texte posé sur un média par un fond semi-transparent
> n'a pas de contraste garanti *par construction*. Ici on a de la chance — l'encre est claire et
> la plaque sombre, donc le pire cas est atteint sur du blanc. Avec une encre sombre, le pire cas
> serait sur du noir, et le raisonnement serait à refaire.

**Antérieur à la vague 49** : dernier commit sur le fichier, `d652222f` (TCK-292, i18n). Ce n'est
donc pas une régression de TCK-440 — c'est un défaut que TCK-440 aurait dû voir et n'a pas vu.

### Pourquoi la mesure de contraste ne l'a pas attrapé — le vrai sujet du ticket

TCK-440 a livré une mesure de contraste exécutable
(`src/components/home/__tests__/chrome-publique.contraste.test.tsx`) qui calcule le ratio WCAG de
chaque couple texte/fond **sur le fond réel remonté depuis le DOM**, dans les deux thèmes, et sur
`--card` comme sur `--background`. Elle est bonne. Elle a même trouvé un couple tendu que
personne ne cherchait — `--accent` sur `--card` en sombre, 4,48:1.

**Elle ne couvre que deux composants : la navbar et le pied de page.**

Et le couple trouvé l'a été sur une **icône `aria-hidden`** — contenu non textuel, gouverné par le
seuil de 3:1 (1.4.11), donc conforme — pendant que le même jeton, à deux fichiers de là, portait
du **texte** sous le seuil. *Une mesure juste sur un périmètre étroit produit une fausse
assurance : on croit avoir mesuré « le contraste », on a mesuré deux fichiers.*

C'est le motif de la vague 49, une fois de plus, sous sa forme la plus banale : **un périmètre
énuméré à la main.** Le remède est le même que partout ailleurs — dériver le périmètre au lieu de
l'écrire.

## Contrat de données

Sans objet — aucun endpoint.

## Direction UX / Artistique

Deux choses à trancher, et elles sont indépendantes :

1. **Le couple de jetons.** `--accent` (#5d6e4f) porte `--accent-foreground` (#fcf9f3) à 4,7:1 en
   plein, et l'alpha de 90 % le fait passer sous le seuil. Trois voies : retirer l'alpha (le plus
   simple, et le plus proche du rendu actuel), assombrir `--accent` (touche tout le produit,
   demande sa propre mesure), ou donner à la pastille le traitement de la variante *vente*, qui
   est déjà conforme. **Aucune ne doit être choisie sans re-mesurer les autres emplois d'`--accent`.**
2. **La pastille sur média.** Un fond semi-transparent sur photo ne garantit rien par
   construction ; ici le pire cas est heureusement borné (cf. § Contexte). Un fond opaque ou un
   voile sous la pastille ferme la question au lieu de la calculer.

   ⚠ **Le dégradé de `PropertyCardCover.tsx:45` ne sauve PAS la pastille**, et il ne faut pas
   compter dessus : il est `from-transparent via-transparent via-45% to-foreground/80`, donc il
   assombrit le BAS de l'image, alors que la pastille est en `top-3 left-3`. Rien ne passe sous
   elle. C'est en outre le **seul** des cinq points d'appel de la pastille à porter un dégradé —
   les quatre autres (`top-4 left-4`, `top-2 left-2` ×2, `top-3 left-3`) n'en ont aucun.

## Contraintes strictes (métier)

- Le seuil est celui du **texte** (4,5:1), pas celui du non textuel (3:1) : la pastille porte un
  mot, pas une icône. Le confondre est exactement l'erreur qui a laissé passer ce défaut.
- Le contraste se **mesure sur le fond réel**, alpha composé avant le calcul. Un ratio pris sur la
  couleur nominale d'un `/90` ne mesure rien.
- Sur `--card` **et** sur `--background` : le sens de l'écart entre les deux s'inverse avec le
  thème, donc une seule surface ne prouve rien.
- Le périmètre de la mesure se **dérive**, il ne s'énumère pas.

## Delta à produire

- [ ] Corriger le couple de la variante *location*, avec la mesure qui le justifie
- [ ] Trancher le traitement de la pastille sur média (fond opaque, ou voile)
- [ ] **Étendre la mesure de contraste à toute la surface publique**, périmètre DÉRIVÉ
- [ ] Recenser les autres emplois d'`--accent` avant de toucher au jeton lui-même
- [ ] Consigner chaque couple mesuré, comme le fait déjà le test de la chrome

## Critères d'acceptation

- [ ] AC1 — la variante *location* atteint 4,5:1 **sur son pire fond, qui est le pixel blanc**
      (démonstration en § Contexte), donc a fortiori sur `--card` et `--background`, dans les deux
      thèmes. Les ratios sont consignés. ⚠ Mesurer sur `--card` SUFFIT ici — `--card` vaut #ffffff,
      qui EST le pire fond — mais ce n'est vrai que parce que l'encre est claire ; l'écrire évite
      qu'on généralise la commodité en règle.
- [ ] AC2 — **le test de contraste couvre toute la surface publique, et son périmètre est dérivé**
      (parcours du système de fichiers ou de la clôture d'import), pas une liste de composants.
      Un composant neuf y entre sans que personne l'y déclare — c'est l'AC central du ticket.
- [ ] AC3 — l'ablation se fait sur un couple **inventé pour l'occasion** et non sur celui-ci : un
      test qui n'attraperait que le défaut connu passerait déjà, et c'est ce qui s'est produit.
- [ ] AC4 — un texte posé sur un média est mesuré **sur son pire fond, et ce pire fond se DÉRIVE
      par balayage des 256 valeurs de gris** — pas en choisissant une extrémité.

      ⚠⚠ **Une version antérieure de cette AC disait « pixel blanc si l'encre est claire, pixel
      noir sinon ». C'est vrai ici et FAUX en général.** Quand la luminance de l'encre tombe *à
      l'intérieur* de la plage que la plaque peut atteindre, le couple n'a pas de sens fixe et le
      minimum est **au croisement**, pas à une extrémité. Contre-exemple mesuré — encre `#808080`
      sur plaque `#808080/90` :

          pixel 0 → 1,20:1     pixel 128 → **1,00:1**  ← le vrai minimum     pixel 255 → 1,19:1

      Une règle « blanc ou noir selon le sens » rendrait 1,19 et manquerait 1,00, c'est-à-dire un
      texte littéralement invisible. *Choisir une extrémité est une optimisation qui suppose la
      monotonie ; elle est vraie pour cette pastille et fausse en général, et rien dans l'AC ne
      disait laquelle des deux on écrivait.* Le balayage coûte 256 évaluations — moins que la
      règle qu'il remplace.

      Pour cette pastille, le balayage confirme l'extrémité blanche (minimum en 255, à 4,22:1) :
      le chiffre du § Contexte tient.

      ⚠ **256 GRIS SUFFISENT — ne pas « améliorer » en balayant les 16,7 millions de couleurs.**
      C'est contre-intuitif, donc c'est écrit ici comme justification : le contraste ne dépend que
      de la LUMINANCE, la plaque est affine en le pixel, et l'ensemble des luminances atteignables
      sur le cube 256³ est exactement celui que la droite des gris parcourt. La 3-D n'ouvre aucune
      luminance nouvelle. Mesuré sur quatre couples, dont deux construits pour la mettre en
      défaut :

          pastille réelle ............... gris 4,2230 · 3D 4,2230 · écart 0,0000
          croisement décalé ............. gris 1,0000 · 3D 1,0000 · écart 0,0000
          croisement, encre colorée ..... gris 1,0002 · 3D 1,0000 · écart 0,0002
          encre médiane, alpha faible ... gris 1,0010 · 3D 1,0000 · écart 0,0010

      Le pire écart construit vaut 0,0010, et il se produit au croisement — là où 1,0000 et 1,0010
      sont mauvais de la même façon. *Sans cette note, quelqu'un remplacera 256 évaluations par
      16,7 millions pour gagner un millième de rapport sur un couple déjà refusé.*
- [ ] AC5 — le seuil appliqué distingue le texte (4,5:1) du non textuel (3:1), et le test dit
      lequel il applique à chaque couple. `--accent` sur `--card` à 4,48:1 sur une icône
      `aria-hidden` reste conforme et doit rester vert : un test qui le ferait rougir serait faux
      dans l'autre sens.

## Hors périmètre

- La conversion des couleurs brutes de la chrome —
  [TCK-440](TCK-440-chrome-publique-en-palette-brute.md).
- Le sort du thème sombre — [TCK-452](TCK-452-theme-sombre-inatteignable.md).
- Le contrôle des classes non émises — [TCK-453](TCK-453-classes-non-emises.md).

## Notes d'implémentation

Le harnais existe et n'est pas à réécrire : `src/test/contraste-wcag.ts` compose l'alpha avant le
calcul, remonte le fond réel ancêtre par ancêtre, et **lève** sur un jeton inconnu plutôt que de
mesurer contre une valeur de repli. Ce qui manque n'est pas la mesure, c'est son **périmètre**.

_(le reste à remplir par implementing-specs)_

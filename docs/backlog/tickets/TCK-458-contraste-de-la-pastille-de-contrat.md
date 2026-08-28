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

> ⚠ **Le fond réel est PIRE que ce tableau, et c'est le point le plus important.** La pastille est
> posée SUR LA PHOTO du bien (`backdrop-blur-md`, en surimpression). Les quatre ratios ci-dessus
> supposent qu'elle repose sur `--card` ou `--background` ; en vrai, les 10 % restants laissent
> passer **des pixels d'image quelconques**. Le contraste réel n'est donc pas 4,2 — il est
> *variable et non borné vers le bas*, selon la photo. Une pastille sur média demande soit un fond
> opaque, soit un voile sous elle, pas un alpha sur une couleur de surface.

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
2. **La pastille sur média.** Indépendamment du ratio, un texte posé sur une photo par un fond
   semi-transparent n'a pas de contraste garanti. C'est là que le jeton de voile a du sens.

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

- [ ] AC1 — la variante *location* atteint 4,5:1 sur `--card` ET sur `--background`, dans les deux
      thèmes. Les quatre ratios sont consignés.
- [ ] AC2 — **le test de contraste couvre toute la surface publique, et son périmètre est dérivé**
      (parcours du système de fichiers ou de la clôture d'import), pas une liste de composants.
      Un composant neuf y entre sans que personne l'y déclare — c'est l'AC central du ticket.
- [ ] AC3 — l'ablation se fait sur un couple **inventé pour l'occasion** et non sur celui-ci : un
      test qui n'attraperait que le défaut connu passerait déjà, et c'est ce qui s'est produit.
- [ ] AC4 — un texte posé sur un média a un contraste GARANTI, pas dépendant de l'image : le test
      le vérifie sur le pire fond possible, ou le composant pose un fond opaque.
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

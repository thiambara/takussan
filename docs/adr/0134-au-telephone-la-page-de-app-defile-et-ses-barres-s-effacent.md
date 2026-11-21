# ADR-0134 — Au téléphone, c'est la page de `/app` qui défile, et ses deux barres s'effacent au défilement

- **Statut** : Accepté le 2026-11-21 (maquette « L'écran économe » validée au téléphone par le porteur : décisions
  2c, 3a puis la v4 de l'animation ; « ok go » du même jour sur ce chantier)
- **Date** : 2026-11-21
- **Tickets** : TCK-2989 (la page défile), TCK-2990 (les barres s'effacent)
- **Amende** : [ADR-0089](0089-le-menu-de-app-se-derive-du-profil-actif.md) § 3 et TCK-503 (« rien ne passe sous la
  barre d'onglets ») ; **s'appuie sur** [ADR-0133](0133-une-mesure-de-la-fenetre-et-le-mode-saisie-des-formulaires-plein-ecran.md)
  (la mesure de la fenêtre, `data-saisie`)

## Contexte

Relevé le 2026-11-21 sur l'iPhone du porteur (Chrome iOS) et dans la maquette locale `playground/maquettes/ecran` :

- **La coque de `/app` fait la hauteur de l'écran (`h-dvh`) et c'est le `<main>` qui défile** (TCK-503).
  Le document, lui, ne défile jamais. Or Safari comme Chrome, sur iPhone, ne replient leurs barres (adresse en
  haut, outils en bas) que sur un défilement du DOCUMENT : elles restent déployées toute la vie de la page.
  Estimé sur la capture du porteur : environ 21 % de l'écran, qui ne se rend jamais.
- **Nos propres barres en prennent environ 14 % de plus** : l'en-tête de 56 px et la barre d'onglets de 64 px
  plus la zone sûre, toujours visibles.
- **La maquette a éprouvé l'autre mécanique, et le porteur l'a validée** : la page défile, le navigateur replie
  ses barres (constaté sur sa capture : l'adresse réduite, plus de barre d'outils) ; l'en-tête et la barre
  d'onglets partent au défilement vers le bas, d'un seul bloc, et reviennent au défilement vers le haut, puis
  repartent seuls après 2,5 s de repos ; une pastille au bas de l'écran les rappelle.
- **Relevé avant de changer** (2026-11-21, 390 × 844, compte propriétaire, 25 pages de la barre) : voir
  TCK-2989, « Relevé avant ».

## Décision

**Sous `md`, sur toute page de `/app` qui porte la barre d'onglets, c'est le document qui défile. L'en-tête du
téléphone colle en haut, la barre d'onglets est fixée en bas ; les deux s'effacent au défilement vers le bas,
reviennent vers le haut, et repartent seules au repos. Dès `md`, rien ne change.**

### 1. Le mode se décide par la ROUTE, jamais par une déclaration de la page

`defileLeDocument(pathname)` : `porteLaBarreDOnglets(pathname)` (toute la console hors plein écran), moins une
table de routes « boîte » qui ont besoin d'une hauteur bornée (`ROUTES_EN_BOITE`, `plein-ecran.ts`).

- **Pourquoi pas `data-barre-onglets`** : la barre s'en va EN COURS de page quand la page déclare une sélection
  (TCK-2836) ou une section à enregistrer (TCK-2635), et les déclarations arrivent du client. Le mode basculerait
  sous le doigt, et le défilement sauterait en haut.
- **Une seule bascule légitime** : la conversation ouverte de `/app/messages` (`declaration.conversation`, un
  ÉTAT de la page, pas une route), qui a besoin de sa boîte. Le retour à la liste rend le document.
- Publié sur la coque : `data-defilement="document"`. Tout le CSS du mode est sous `@media (width < 48rem)`.

### 2. Ce que le mode change (sous `md`)

- La coque : `min-height: 100dvh`, hauteur libre. La rangée du contenu et le `<main>` cessent d'être des
  conteneurs de défilement (`overflow: visible`) : sinon rien de ce qui colle ne collerait à l'écran.
- L'en-tête du téléphone (`en-tete-mobile`) : `position: sticky; top: 0`.
- La barre d'onglets : `position: fixed` en bas. Le `<main>` réserve sa hauteur en bas (plus celle de la barre
  d'action) : le dernier élément focalisable reste atteignable — le critère de TCK-503 tient, par une réserve et
  non plus par une boîte.
- La barre d'action collante (`#emplacement-barre-d-action`) et la barre de sélection : fixées en bas, à la place
  de la barre d'onglets quand celle-ci se retire, au-dessus d'elle sinon.
- Les éléments collés en haut d'une page (onglets de page, rangées de puces, en-têtes de liste) : leur conteneur
  de défilement était le `<main>`, c'est maintenant l'écran. Ils collent sous l'en-tête par
  `top: var(--haut-colle)` — la hauteur de l'en-tête visible, 0 quand il est parti, 0 dès `md`. Composant par
  composant, d'après le relevé (pas de sélecteur global sur des noms de classes).
- `scroll-padding-top` passe du `<main>` à `<html>`, en ajoutant la hauteur de l'en-tête.

### 3. L'effacement des barres

- **Un état, pas un suivi au doigt** (retour du porteur sur la maquette : sur iOS, les défilements arrivent par
  à-coups, une barre qui suit le doigt tremble). Le crochet ne décide que « visibles » ou « effacées » ;
  l'animation est une transition CSS de `transform`, jouée par le compositeur.
- **Seuils** : 40 px de défilement vers le bas pour effacer, 24 px vers le haut pour rappeler. Jamais effacées en
  haut ni en bas de page.
- **Départ automatique** : rappelées, les barres repartent 2,5 s après le dernier défilement — jamais pendant
  qu'un doigt les touche, ni si le focus est dedans.
- **Mouvement** (v4, validé) : 340 ms, d'un seul bloc ; retour `cubic-bezier(0.32, 0.72, 0, 1)`, départ
  `cubic-bezier(0.4, 0, 0.2, 1)`. Mouvement réduit demandé : un fondu de 160 ms, sans déplacement.
- **La pastille** : une barre de 40 × 5 px dans une zone de 96 × 32, au bas de l'écran, visible seulement quand
  les barres sont effacées ; un toucher les rappelle. C'est un bouton nommé.
- **Jamais effacées** : tiroir ouvert, barre d'action ou de sélection présente, focus dans l'une des deux barres
  (`:focus-within`, une barre déplacée par `transform` reste focalisable).
- **Clavier ouvert** (`data-saisie`, ADR-0133) : la barre d'onglets s'en va, la pastille aussi.
- Publié sur `<html>` : `data-barres-effacees`, pour que les portails et `--haut-colle` le lisent.
- Le dock flottant, le toast et les annonces de la boîte (`PilotageDeLaBoite`) **restent où ils sont** quand les
  barres s'effacent : au-dessus de la place de la barre. Ils ne la suivent pas.

## Options écartées

- **Garder la boîte et n'effacer que nos barres** au défilement du `<main>` : gagne nos 14 %, jamais les 21 % du
  navigateur.
- **Décider le mode sur `data-barre-onglets`** : bascule en cours de page (§ 1).
- **Un sélecteur global** sur `[class*="sticky"]` pour décaler les éléments collés : il toucherait des éléments
  qui ne collent qu'au bureau, et une classe renommée le rendrait muet.
- **Suivre le doigt** (décision 3a d'origine) : écartée par le porteur après essai sur iPhone.

## Conséquences

- **Le contrat TCK-503 change de forme** : du contenu passe sous la barre d'onglets pendant le défilement ; c'est
  voulu. La réserve en bas garde le dernier élément atteignable.
- **Une page qui a besoin d'une hauteur bornée** (carte plein écran, colonne qui défile seule) se range dans
  `ROUTES_EN_BOITE`. Le relevé avant/après de TCK-2989 en est la liste de départ.
- **Ce que seul un téléphone juge** : les feuilles et dialogues ouverts sur un document défilé (tiroir, feuille du
  compte, palette) — défilement de l'arrière-plan, saut en haut à la fermeture (TCK-551) — et le repli des barres
  de Chrome avec une barre fixée en bas.

## Application

- `src/components/layout/plein-ecran.ts` : `defileLeDocument`, `ROUTES_EN_BOITE`.
- `src/components/layout/AppShell.tsx` : `data-defilement`, l'effacement, la pastille.
- `src/components/layout/useEffacementDesBarres.ts` : l'état des barres.
- `src/app/globals.css` : le mode document sous `md`, `--haut-colle`, le mouvement.
- Les éléments collés relevés par TCK-2989.
- Les gardes : `CoqueHauteur.test.tsx`, `AppShell.barre-d-onglets.test.tsx` et
  `suites-point-porteur-1.tck-2712.test.ts`, réécrites vers ce contrat.

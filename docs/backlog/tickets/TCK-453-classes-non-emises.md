---
id: TCK-453
title: "Une classe dont le jeton n'existe pas ne fait AUCUNE erreur : la couleur disparaît, et rien dans le dépôt ne peut le voir"
status: doing
phase: P2
family: technique
estimate: M
wave: 49
created: 2026-08-27
updated: 2026-08-29
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, design-system, tokens, tests, garde, dette]
---

## Objectif utilisateur

Une couleur qui disparaît de l'écran fait rougir quelque chose. Aujourd'hui elle disparaît en
silence.

## Contexte

**Une classe Tailwind dont le jeton n'est pas déclaré n'émet aucune règle CSS — et ne produit
aucune erreur.** `tsc` ne la voit pas (c'est une chaîne), ESLint ne la voit pas, `next build`
réussit, les gardes de jetons du dépôt la déclarent conforme (elle *ressemble* à un jeton), et la
suite de tests passe. L'élément est simplement rendu **sans la couleur** : un voile devient
transparent, un fond devient blanc, une bordure disparaît.

Ce n'est pas un cas théorique. Il s'est produit pendant
[TCK-440](TCK-440-chrome-publique-en-palette-brute.md) : les quatre voiles de la surface publique
avaient été convertis vers un jeton livré sur **une autre branche**. Compilation Tailwind à
l'appui, les quatre classes n'émettaient rien — fond de lightbox, tiroir de filtres, surimpression
de galerie, pastille d'horodatage, tous transparents. Rien n'a signalé quoi que ce soit ; c'est
une relecture de diff qui l'a rattrapé.

> ⚠ **Portée : TOUT `takussan-web/src`, pas la seule chrome publique.** Le défaut n'a rien de
> propre au site public — il frappe partout où une classe est écrite, et d'autant plus fort dans
> la console, où les écrans sont moins regardés.

### La forme correcte est PLUS SIMPLE que la fausse — et c'est l'argument décisif

**Le compilateur est l'autorité sur la validité d'une classe. Aucune liste n'est nécessaire.**
Mesuré le 2026-08-27, en compilant `globals.css` avec `@tailwindcss/postcss` :

```
émettent une règle :   text-sm · bg-cover · border-2 · text-center · p-4.5 ·
                       hover:bg-muted · bg-card · text-muted-foreground/60 · bg-stone-100
n'émettent RIEN :      bg-scrim/40 · bg-inexistant/40 · text-pasunjeton
```

Tailwind émet une règle pour **tout utilitaire valide, couleur ou non**, et rien pour l'invalide.
Le contrôle juste est donc d'une ligne de logique : *toute chaîne de forme utilitaire écrite dans
`src/` doit se retrouver comme sélecteur dans la feuille compilée.* Pas de table de jetons, pas de
liste d'utilitaires non chromatiques, pas d'exceptions — **on retire la connaissance au lieu d'en
ajouter.**

### Pourquoi la tentative précédente ne pouvait pas marcher

Un tel contrôle a été écrit pendant TCK-440, dans `takussan-web/src/test/__tests__/jetons-compiles.test.ts`,
et **retiré le 2026-08-27 plutôt que désactivé** — un cas en sommeil est une invitation à le
réactiver sans le corriger. Son défaut, relevé par la revue adverse :

```ts
const radical = classe.replace(/^.*:/, '').replace(/^(?:bg|text|border|ring)-/, '').split('/')[0];
if (radical in JETONS_CLAIR) vues.add(classe);   // ← le relevé est filtré par les jetons CONNUS
```

Une classe dont le jeton n'existe pas était **écartée du relevé avant d'être contrôlée** :
exactement le cas que le contrôle prétendait attraper. L'ensemble des manquantes était vide *par
construction*, jamais par mesure.

**Et d'un cran plus loin : la boucle était fermée aux DEUX bouts par la même liste.** Ce relevé
filtré alimentait aussi le contenu donné à Tailwind pour la compilation. La classe écartée n'était
donc ni dans la liste contrôlée, ni dans la feuille où on la cherchait.

> ⚠ **Pourquoi elle SEMBLAIT marcher, et c'est le point à ne pas rejouer.** Sa première version
> portait `|| radical === 'scrim'` — une exception nommée pour le jeton qu'on cherchait. Elle a
> bel et bien rougi sur les quatre voiles, **parce qu'on lui avait soufflé le nom.** Elle n'a
> jamais eu de portée générale : elle attrapait le cas qu'on lui avait décrit, et rien d'autre.
>
> *Une garde qui ne connaît que la liste des valeurs valides et écarte le reste ne garde rien :
> « le reste » EST le défaut.* C'est le même motif que celui payé ailleurs dans la vague 49, sur
> du code de production comme sur du code de test.

### Ce que le contrôle attraperait, au-delà de la couleur

Sa valeur dépasse largement le motif qui l'a fait naître, puisqu'il ne sait rien des couleurs :

- un jeton **absent** ou **supprimé ailleurs** (le cas d'origine) ;
- une **faute de frappe** — `bg-primry`, `text-mutted-foreground` ;
- un **séparateur décimal** fautif — `p-4,5` au lieu de `p-4.5` ;
- une **variante mal écrite** — un `data-[state=open]` mal fermé, un `hover;` ;
- une classe héritée d'une **version antérieure de Tailwind** que la v4 n'émet plus.

### L'objection qui a été faite, et pourquoi elle est écartée

La revue adverse propose une autre forme : garder un filtre, mais le retourner — ne plus retenir
les radicaux *connus*, mais écarter les utilitaires **non chromatiques** connus (`sm`, `center`,
`cover`, `inset`, `2`…), ou n'accepter que les formes portant un alpha.

**Les deux positions, honnêtement :**

| | filtre inversé (revue) | dérivation du compilateur (retenu) |
|---|---|---|
| Ce qu'il faut savoir d'avance | la liste des utilitaires non chromatiques de Tailwind | rien |
| Ce qu'il attrape | un jeton absent de couleur | un jeton absent, une faute de frappe, un séparateur fautif, une variante mal écrite |
| Ce qui arrive quand Tailwind ajoute un utilitaire | la liste devient fausse, en silence | rien |
| Ce qui arrive quand un utilitaire est retiré | la liste devient fausse, en silence | rien |

**C'est écarté parce que c'est encore une liste, et que c'est la liste qui a échoué.** Le filtre
inversé déplace le défaut sans le supprimer : il faut toujours énumérer un ensemble ouvert que
Tailwind fait bouger sans nous prévenir, et l'erreur devient silencieuse dans l'autre sens — un
utilitaire non chromatique oublié dans la liste produit un faux positif, un utilitaire chromatique
oublié produit un faux négatif. Le compilateur, lui, connaît déjà la réponse.

⚠ L'objection garde un mérite qu'il faut nommer : elle rendrait le relevé **insensible à la
qualité de l'extracteur**, alors que la forme retenue y déplace tout le coût. C'est un vrai
échange, pas un mauvais argument — et c'est pourquoi la ligne de base de faux positifs est une
condition de livraison plutôt qu'un détail.

## Contrat de données

Sans objet — outillage de test.

## Direction UX / Artistique

Sans objet.

## Contraintes strictes (métier)

- **Aucune liste de jetons, d'utilitaires ou d'exceptions dans le relevé.** C'est la liste qui a
  échoué ; la réintroduire sous une autre forme (« filtrer les utilitaires non chromatiques
  connus ») rejouerait le même défaut à l'envers, et laisserait passer les fautes de frappe.
- **Une ligne de base de faux positifs MESURÉE est une condition de livraison**, pas un détail :
  une garde livrée sans elle est précisément ce que ce ticket corrige. Elle se prend comme celle
  de `check-public-chrome-tokens.mjs` (0 faux positif sur 484 classes distinctes de 1130 fichiers).
- Le contrôle doit **échouer en nommant la classe et son fichier** : « une couleur a disparu »
  sans dire laquelle ne vaut pas mieux que le silence.

## Delta à produire

- [x] Un relevé de candidats fondé sur la **FORME** seule — et, mieux, sur la **POSITION** :
      `takussan-web/scripts/classes-ecrites.mjs`
- [x] Compilation de `globals.css`, chaque candidat soumis par `@source inline("…")`, et
      comparaison aux sélecteurs réellement émis
- [x] Les six défauts d'extracteur : disparus **par construction**, pas corrigés un à un
- [x] Ligne de base mesurée sur tout `src/` — 923 fichiers, 1 533 classes distinctes,
      **0 faux positif**, le 2026-08-29
- [x] Garde rejouée en CI (`web-ci.yml`), échouant en nommant classe + fichier + ligne
- [x] Renvoi rétabli dans `jetons-compiles.test.ts`

### Les six défauts d'extracteur, mesurés — 75 fichiers, 162 candidats, 6 non émis, **0 défaut de code**

Relevé du 2026-08-27 sur le périmètre de TCK-440 avec un extracteur de forme naïf. Les six
« manquantes » étaient **toutes** des artefacts de l'extracteur, d'une seule famille : *la regex
mord au milieu d'un token plus long.*

| candidat non émis | d'où il vient réellement |
|---|---|
| `bg-scrim/` | la **PROSE d'un docblock** qui explique comment consommer le jeton — le piège du commentaire, pour la troisième fois de la vague |
| `div:first-child]:bg-transparent` | queue d'une variante arbitraire `[&>div:first-child]:bg-transparent` |
| `div:first-child]:border-none` | idem |
| `div:first-child]:shadow-none` | idem |
| `from-bottom` | morceau de `slide-in-from-bottom` (tw-animate-css) |
| `from-top-2` | morceau de `slide-in-from-top-2` |

**Remède** : exiger une vraie frontière avant le préfixe — `\b` matche après un `-` et après un
`]`, ce qui est la cause des cinq derniers — et traiter les crochets des variantes arbitraires
comme une unité. Le premier cas (la prose) est le rappel qu'**un extracteur lit aussi les
commentaires** ; à trancher explicitement, soit en les blanchissant, soit en l'assumant.

⚠ Ces six sont la mesure sur **75 fichiers**. Sur les ~1130 de `src/`, le compte sera plus élevé
et **doit être re-mesuré** : c'est le travail réel du ticket, et c'est ce qui interdit de le faire
à chaud.

## Critères d'acceptation

- [x] AC1 — une classe dont le jeton n'existe pas fait ROUGIR, en nommant la classe et son
      fichier. Le test l'éprouve par ablation, sur un jeton **inventé pour l'occasion** et non sur
      un nom que le contrôle connaîtrait : c'est le défaut exact de la version retirée.
- [x] AC2 — aucune liste de jetons, d'utilitaires ni d'exceptions n'apparaît dans le relevé. Une
      relecture du diff suffit à le vérifier ; si une liste est nécessaire, le ticket a échoué.
- [x] AC3 — la ligne de base de faux positifs est mesurée **sur tout `src/`** et consignée avec sa
      date. Zéro faux positif, ou chacun nommé avec la raison de le tolérer.
- [x] AC4 — le contrôle attrape au moins trois familles au-delà de la couleur : une faute de
      frappe de jeton, un séparateur décimal fautif, une variante mal écrite. Un test par famille.
- [x] AC5 — le contrôle tourne en CI. Un contrôle vert qu'on ne rejoue pas est un contrôle qui
      n'existe pas.

## Hors périmètre

- La conversion des couleurs de la chrome publique —
  [TCK-440](TCK-440-chrome-publique-en-palette-brute.md).
- Le sort du thème sombre — [TCK-452](TCK-452-theme-sombre-inatteignable.md).
- Les classes composées à l'exécution (`` `bg-${x}` ``) : aucun contrôle statique ne peut les
  voir. **Trou à DÉCLARER dans l'en-tête du contrôle**, pas à fermer.

## Notes d'implémentation

`spec_refs` est vide : ce ticket est de l'outillage de test, il ne décrit aucun comportement
produit. La preuve de faisabilité existe déjà — la compilation réelle est faite par
`takussan-web/src/test/__tests__/jetons-compiles.test.ts`, dont les trois contrôles restants
(confrontation des tables de `contraste-wcag.ts` à `:root` et `.dark`, identité de valeur du blanc
et des jetons de surface) sont sains et fournissent le harnais. Il n'y a donc pas de plomberie à
réinventer : seulement le relevé à écrire correctement.

### Ce qui a été livré — 2026-08-29

Deux fichiers neufs sous `takussan-web/scripts/`, branchés dans `web-ci.yml` :

- **`classes-ecrites.mjs`** — le relevé. Un lexeur TS/TSX autonome (aucun analyseur tiers : voir
  TCK-323, `typescript@7` n'exporte plus `createSourceFile`), et **deux routes** :
  *attribut* — tout littéral atteint depuis un `className=` / `class=` / `className:`, **sans
  aucun filtre de forme** — et *forme*, pour ce qui est écrit loin de sa position (bases de
  `cva()`, constantes de classes) : une chaîne d'au moins deux jetons, tous dans le jeu de
  caractères d'un utilitaire.
- **`check-classes-emises.mjs`** — la décision. Chaque candidat est soumis à Tailwind par un
  `@source inline("…")`, forme qui **court-circuite l'extracteur d'oxide** et force l'examen du
  candidat tel quel ; l'ensemble des classes émises est relu dans la feuille compilée, *déséchappé*
  (`.\32 xl\:grid-cols-3` → `2xl:grid-cols-3` — un candidat commençant par un chiffre serait
  déclaré non émis à tort par une comparaison naïve), et les feuilles CSS annexes du projet
  (`playground.css`) sont ajoutées.

**Le relevé ne connaît aucun nom de jeton, aucun nom d'utilitaire, aucune exception.** Le seul nom
lu dans tout le module est `className` — pour distinguer, dans un `buttonVariants({ variant:
'ghost', className: 'h-8' })`, la valeur qui EST une classe de celle qui la choisit.

### Le vrai coût s'est déplacé sur le DISCRIMINANT, pas sur l'extracteur

Le ticket annonçait que la forme retenue déplace tout le coût sur la qualité de l'extracteur. C'est
vrai, mais pas à l'endroit prévu. Les six artefacts du relevé du 2026-08-27 — regex mordant au
milieu d'un token, prose de docblock — **disparaissent par construction** : on ne cherche plus un
motif dans du texte brut, on découpe une chaîne de classes sur ses espaces, et le lexeur ne tire
aucun littéral d'un commentaire. `[&>div:first-child]:bg-transparent` et
`slide-in-from-bottom-2` sont des jetons entiers, indivisibles. Zéro ligne de code n'a été écrite
pour ces six cas ; ils ont six cas d'épreuve qui le prouvent (famille E).

Le coût réel était ailleurs, et il a demandé quatre passes de mesure : **une chaîne écrite dans une
position de classe n'est pas toujours une classe.** `cn(side === 'left' && 'inset-y-0')` en écrit
deux, et une seule est une classe. Sur tout `src/`, 51 chaînes relevaient de ce cas — `'left'`,
`'ghost'`, `'sm'`, `'XOF'`, `'neutral'`… Les écarter **par leur nom** aurait rejoué le défaut de
2026-08-27 un cran plus bas ; elles sont donc écartées **par leur syntaxe** : opérande d'une
comparaison, valeur d'une propriété dont la clé n'est pas `className`, indice d'un accès en membre,
branche d'un `switch`. Une classe inexistante placée au même endroit reste relevée (cas F1, F3).

### LE PREMIER RELEVÉ DE LA GARDE — quatre prises, dont un défaut de produit sur iOS

**C'est le meilleur argument de ce ticket, et il n'était pas acquis.** *Une garde qui ne trouve
rien à sa mise en service ne prouve pas qu'il n'y a rien* — elle ne prouve rien du tout, et c'est
exactement ce que la version retirée le 2026-08-27 rendait : un vert obtenu par construction.
Celle-ci a rougi le jour de sa mise en service, sur quatre classes, et zéro faux positif à côté.

| classe | où | ce qu'elle faisait, c'est-à-dire rien |
|---|---|---|
| `safe-area-bottom` | `PropertyMobileBottomBar.tsx:73` | **définie NULLE PART** — la barre d'action mobile de la fiche de bien n'avait **aucun** rembourrage de zone sûre sur iOS |
| `group/badge` | `ui/badge.tsx:8` | marqueur de groupe nommé **sans aucun consommateur** |
| `group/button` | `ui/button.tsx:7` | idem |
| `group/card-header` | `ui/card.tsx:28` | idem |

**Les trois marqueurs** sont morts au sens strict : `group/badge`, `group/button` et
`group/card-header` ont **0** consommateur, quand `group/card` en a 4, `group/tabs` 3 et
`group/avatar` 4. Les seconds ne sont pas signalés, et c'est le point : *la garde fait la
différence, pas une liste.* Les trois jetons sont retirés de leurs bases `cva()`.

**`safe-area-bottom` est le vrai défaut de produit, et il était pire qu'un rendu manquant :
TROIS endroits y croyaient, zéro l'implémentait.** La classe elle-même, un commentaire de
`useFloatingDockSlot.ts:70`, et — le plus coûteux — le § Contraintes de
[TCK-275](TCK-275-floating-dock-orchestrator.md), **ticket CLOS**, qui la donnait en exemple :
« l'orchestrateur respecte `safe-area-inset-bottom` comme le fait déjà `PropertyMobileBottomBar`
(`safe-area-bottom`) ». Le prochain implémenteur du dock aurait construit là-dessus. Les trois
sont corrigés ; TCK-275 reçoit une correction datée qui ne réécrit pas son histoire.

**Le remède retenu est LOCAL, pas un utilitaire partagé** — on ne déclare pas un mécanisme
commun pour rendre vraies deux phrases écrites à tort ; on corrige les phrases.

⚠ **Et la forme évidente était un piège, mesuré.** La barre porte déjà `py-3`.
`pb-[env(safe-area-inset-bottom)]` **remplace** ce rembourrage bas au lieu de s'y ajouter : sur
tout appareil sans encoche `env()` vaut `0px`, et la barre perdrait ses 12 px — iOS corrigé en
cassant tout le reste. La forme retenue additionne, et elle est **vérifiée par le compilateur de
cette garde même**, en une compilation :

```
émise (offset 4498)    py-3
émise (offset 4557)    pb-[calc(0.75rem+env(safe-area-inset-bottom))]
NON ÉMISE              safe-area-bottom

.py-3 { padding-block: calc(var(--spacing) * 3) }
.pb-\[calc\(0\.75rem\+env\(safe-area-inset-bottom\)\)\] {
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom)) }
```

Même spécificité, `pb-` vient **après** `py-` dans la feuille : la longhand l'emporte sur la
shorthand, les 12 px restent et l'encoche s'y ajoute. *Le même outil attrape la classe morte et
valide son remplacement — c'est la démonstration la plus propre qu'on pouvait en faire.*

### Le compte, et pourquoi il n'est pas celui du ticket

Le relevé du § ci-dessus donnait 75 fichiers / 162 candidats / 6 non émis, sur le périmètre réduit
de TCK-440. Mesure du 2026-08-29 sur tout `src/`, tests exclus :

    923 fichiers · 1 533 classes distinctes · 4 non émis · 0 faux positif · 0,53 s

### Les ablations

- **AC1, sur un jeton INVENTÉ** — `bg-zirkonpapaye/40` injectée dans
  `PropertyGalleryMosaic.tsx` (radical absent de tout le dépôt, vérifié) : la garde la nomme, elle
  et son fichier, à la ligne exacte. Empreintes `md5` avant / pendant / après restauration :
  `7aa1b05b…` → `838bdc99…` → `7aa1b05b…`.
- **La branche de garde démontée** (`!emises.has(c)` → `false`) : rouge, code 1, sur l'auto-épreuve
  de l'émission.
- **Le corpus vidé PUIS la branche démontée, dans cet ordre** : rouge, code 1, sur le plancher du
  corpus. C'est le geste qui a rendu `exit 0` chez trois gardes de la vague 50 ; il est sondé par
  la garde elle-même à chaque exécution.
- **Le relevé rendu muet** : rouge sur l'auto-épreuve du relevé.

### Ce qui reste hors de portée, et c'est déclaré, pas oublié

Les classes composées à l'exécution (`` `bg-${x}` ``) — aucun contrôle statique ne les voit, et
Tailwind ne les compile pas davantage ; les fichiers de test ; les commentaires ; et la **portée**
d'une feuille annexe — une classe de `playground.css` compte comme émise partout, alors qu'elle
n'existe que sur `/playground`. La garde répond « cette classe existe-t-elle ? », jamais
« s'applique-t-elle ici ? ».

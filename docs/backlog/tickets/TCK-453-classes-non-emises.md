---
id: TCK-453
title: "Une classe dont le jeton n'existe pas ne fait AUCUNE erreur : la couleur disparaît, et rien dans le dépôt ne peut le voir"
status: todo
phase: P2
family: technique
estimate: M
wave: 49
created: 2026-08-27
updated: 2026-08-27
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

- [ ] Un relevé de candidats fondé sur la **FORME** seule (préfixe d'utilitaire, variantes,
      alpha), sans aucune connaissance des jetons
- [ ] Compilation de `globals.css` avec `@source` sur `takussan-web/src`, et comparaison des
      candidats aux sélecteurs réellement émis
- [ ] Corriger les six défauts d'extracteur mesurés ci-dessous
- [ ] Mesurer la ligne de base de faux positifs **sur tout `src/`**, pas sur le périmètre réduit
- [ ] Une garde ou un test rejoué en CI, échouant en nommant classe + fichier
- [ ] Rétablir, dans `jetons-compiles.test.ts`, le renvoi vers le contrôle une fois qu'il existe

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

- [ ] AC1 — une classe dont le jeton n'existe pas fait ROUGIR, en nommant la classe et son
      fichier. Le test l'éprouve par ablation, sur un jeton **inventé pour l'occasion** et non sur
      un nom que le contrôle connaîtrait : c'est le défaut exact de la version retirée.
- [ ] AC2 — aucune liste de jetons, d'utilitaires ni d'exceptions n'apparaît dans le relevé. Une
      relecture du diff suffit à le vérifier ; si une liste est nécessaire, le ticket a échoué.
- [ ] AC3 — la ligne de base de faux positifs est mesurée **sur tout `src/`** et consignée avec sa
      date. Zéro faux positif, ou chacun nommé avec la raison de le tolérer.
- [ ] AC4 — le contrôle attrape au moins trois familles au-delà de la couleur : une faute de
      frappe de jeton, un séparateur décimal fautif, une variante mal écrite. Un test par famille.
- [ ] AC5 — le contrôle tourne en CI. Un contrôle vert qu'on ne rejoue pas est un contrôle qui
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

_(le reste à remplir par implementing-specs)_

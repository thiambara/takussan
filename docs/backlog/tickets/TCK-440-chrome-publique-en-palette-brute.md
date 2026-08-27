---
id: TCK-440
title: "La chrome publique en palette brute : 121 classes hors tokens, dont la navbar et un pied de page entièrement hors palette"
status: todo
phase: P2
family: front
estimate: M
wave: 49
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, design-system, tokens, public, dette]
---

## Objectif utilisateur

Le site public ressemble au produit : une seule palette, changeable en un endroit.

## Contexte

`docs/design-guidelines.md` pose une **règle fondamentale** : *« Zéro valeur hex arbitraire dans
le code. Toute couleur passe par une variable CSS définie dans `src/app/globals.css`. Changer la
palette demain = modifier `globals.css`, rien d'autre. »*

Mesuré le 2026-08-27 sur la surface publique — `src/app/(public)`, `components/home`,
`components/property`, `components/search`, `components/compare`, `components/favorites` :

```
$ grep -rhoE '\b(bg|text|border|ring)-(slate|gray|zinc|neutral)-[0-9]{2,3}\b' … | wc -l
  121
```

Réparties très inégalement — la concentration est le fait notable :

| Fichier | Occurrences de palette brute | Rendu sur |
|---|---|---|
| `components/home/Navbar.tsx` | **61** | toutes les pages publiques |
| `components/home/Footer.tsx` | **11** | toutes les pages publiques |
| `components/property/PropertiesDiscoveryPage.tsx` | 6 | `/properties` |
| `components/property/HomepageDiscovery.tsx` | **0** | `/` |

Les deux composants les plus vus du site sont les deux plus éloignés du design system, et la page
d'accueil — qui les contient tous les deux — est par ailleurs exemplaire. Le pied de page est le
cas extrême : `bg-slate-900 text-white` n'a **aucun** équivalent dans la palette Lin, dont le fond
sombre n'existe pas.

Trois conséquences concrètes :

1. **Changer la palette ne changerait pas la chrome** — exactement ce que la règle existe pour
   empêcher.
2. **`.dark` n'a aucune prise.** `globals.css` définit un thème sombre (`:root` puis `.dark`,
   lignes 6 et 251) ; `bg-white`, `text-gray-900` et `border-gray-300` y restent clairs. La navbar
   ne bascule pas.
3. **Le contraste n'est plus arbitré.** Les couples token/token sont mesurés ; `text-gray-400` sur
   `bg-white` ne l'est par personne.

C'est le motif déjà nommé par [TCK-384](TCK-384-primitives-partagees-couleur-brute.md) sur les
primitives partagées de la console — *« la couleur brute que la console rend sans pouvoir la
garder »* —, ici sur la surface que voient les inconnus.

## Contrat de données

Sans objet — aucun endpoint.

## Direction UX / Artistique

**Ce ticket ne redessine rien.** Il fait passer la chrome publique de couleurs figées à des rôles
sémantiques, à rendu visuel équivalent ou meilleur — sauf pour le pied de page, dont
`bg-slate-900` n'a pas d'équivalent : ce cas demande un arbitrage explicite (surface sombre
ajoutée à la palette, ou pied de page ramené dans le registre Lin).

L'occasion utile est le contraste : chaque couple retenu doit être mesuré, pas supposé. Le dépôt
a déjà un ticket ouvert sur un couple sous le seuil ([TCK-404](TCK-404-chart-3-sous-le-seuil-de-contraste-en-clair.md)) —
c'est le genre de chose qu'une conversion en masse fabrique si on ne la mesure pas.

## Contraintes strictes (métier)

- Toute couleur passe par un token exposé dans `globals.css` ; aucun hex, aucune échelle Tailwind
  brute sur la chrome publique.
- Le rendu en thème clair reste équivalent à l'existant — ce ticket n'est pas une refonte.
- Chaque couple texte/fond retenu atteint le seuil de contraste **mesuré**, et la mesure est ce
  qui décide, pas la ressemblance.
- La bascule `.dark` doit produire un résultat lisible sur la chrome convertie : si elle ne le
  produit pas, c'est un résultat à énoncer, pas à laisser passer en silence.

## Delta à produire

- [ ] Conversion de `Navbar.tsx` et `Footer.tsx` vers les tokens
- [ ] Conversion du reste de la surface publique mesurée
- [ ] Arbitrage du fond sombre du pied de page (token de surface sombre, ou registre Lin)
- [ ] Mesure de contraste des couples retenus, consignée
- [ ] Garde CI : la palette brute ne revient pas sur la surface publique — la garde naît à **zéro
      exception** sur ce périmètre, ou elle ne naît pas
- [ ] Tests : la bascule `.dark` change effectivement la chrome publique

## Critères d'acceptation

- [ ] AC1 — le compte de classes de palette brute sur la surface mesurée passe de 121 à 0. Le test
      rejoue **la commande du § Contexte**, pas une variante plus permissive.
- [ ] AC2 — une garde de dépôt échoue si une classe de palette brute est réintroduite dans la
      chrome publique, et elle est livrée sans liste d'exceptions. Une garde qui naît avec des
      exceptions n'est plus une garde.
- [ ] AC3 — le rendu en thème clair est inchangé à l'œil sur navbar, pied de page et `/properties` :
      la conversion est une équivalence, pas une refonte.
- [ ] AC4 — la bascule `.dark` modifie le fond et le texte de la navbar ; un test l'éprouve sur les
      valeurs calculées, pas sur la présence de la classe.
- [ ] AC5 — chaque couple texte/fond introduit atteint le seuil de contraste, mesuré et consigné ;
      un couple non mesuré fait échouer la revue.

## Hors périmètre

- Les primitives partagées de la console — [TCK-384](TCK-384-primitives-partagees-couleur-brute.md).
- Le contenu et les liens du pied de page — [TCK-437](TCK-437-pied-de-page-public.md).
- Toute refonte visuelle de la navbar ou de la grille de résultats.
- `/playground`, qui charge délibérément des palettes alternatives — son sort est tranché par
  [TCK-431](TCK-431-sitemap-et-robots-absents.md).

## Notes d'implémentation

_(à remplir par implementing-specs)_

---
id: TCK-439
title: "Le même champ de recherche écrit `q` ou `city` selon le bouton cliqué — et deux entrées du menu mobile mènent à `#`"
status: todo
phase: P1
family: bug
estimate: S
wave: 49
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models: []
tags: [front, public, navigation, search, bug]
---

## Objectif utilisateur

Ce que le visiteur tape dans la barre de recherche produit la même recherche, quel que soit le
bouton par lequel il la lance — et aucune entrée du menu ne fait semblant d'être un lien.

## Contexte

**1. Deux filtres pour un seul champ.** `src/components/home/Navbar.tsx` construit l'URL de
recherche à deux endroits, à partir de la **même** valeur `location` — celle du champ de
recherche :

```
ligne 137 (buildSearchUrl, via le bouton loupe / la touche Entrée) :
    if (location.trim()) params.set('q', location.trim());

ligne 163 (handleCategoryClick, via une puce de catégorie) :
    if (location.trim()) params.set('city', location.trim());
```

`q` est la recherche plein-texte ; `city` est un filtre d'égalité sur la ville. Un visiteur qui
tape « villa avec piscine » puis clique sur la loupe cherche un texte ; le même visiteur, qui
clique ensuite sur la puce « Villa », voit sa saisie devenir une **ville** nommée « villa avec
piscine » — filtre qui ne rendra rien. Rien ne le lui dit : la puce a l'air d'ajouter un critère,
elle change silencieusement le sens du précédent.

Le défaut est d'autant plus atteignable que les deux chemins partent du même écran et du même
champ, et qu'aucun des deux n'est un cas limite.

⚠️ Il coûte aussi au repli conjonctif livré par TCK-338 : celui-ci raisonne sur les **termes** de
`q`. Une saisie partie en `city` ne peut produire ni élargissement ni étiquette — la recherche
rend zéro résultat, sans explication.

**2. Deux entrées de menu qui ne mènent nulle part.** `src/data/navigation.ts:60-61` :

```
{ labelKey: 'sell',     href: '#', active: false },
{ labelKey: 'services', href: '#', active: false },
```

`navLinks` n'est consommé qu'au **menu mobile** de la navbar (`Navbar.tsx:441-450`). « Vendre » et
« Services » y sont donc rendus comme des liens, refermant le menu et ne bougeant pas la page.
C'est le motif de [TCK-419](TCK-419-quatre-liens-vers-des-routes-inexistantes.md) — un chemin sans
écran — sous une autre forme : ici la cible n'est pas seulement absente, elle est écrite `#`.

**3. Et ces liens rechargent la page.** `Navbar.tsx:443` est un `<a href>`, pas un `<Link>` : les
deux entrées valides du menu mobile (« Acheter », « Louer ») rechargent le document entier. Même
défaut qu'au pied de page, traité par [TCK-437](TCK-437-pied-de-page-public.md).

## Contrat de données

Aucun endpoint nouveau. `GET /api/public/properties/search` accepte déjà `q` et `city` comme
filtres distincts, et `src/types/search.ts` (`SEARCH_FILTER_KEYS`) fait autorité sur les clés —
c'est de lui que `useSearch` dérive sa sérialisation depuis TCK-340.

## Direction UX / Artistique

Rien de neuf à dessiner. La question est de **choisir le sens** du champ, une fois :

- soit il est plein-texte, et une puce de catégorie n'y touche pas ;
- soit l'autocomplétion (`SearchAutocomplete`, déjà livrée) distingue « ville choisie dans la
  liste » de « texte libre », et écrit `city` seulement dans le premier cas.

La seconde voie est la plus juste pour l'utilisateur, et c'est déjà ce que le commentaire de
`buildSearchUrl` décrit comme l'intention. Ce qui compte : **un seul chemin, pour les deux
boutons.**

Pour « Vendre » et « Services » : soit une destination existe, soit l'entrée disparaît du menu.
Un lien grisé qui ne fait rien est pire que son absence.

## Contraintes strictes (métier)

- Un champ, un sens. Aucun geste de l'interface ne doit réinterpréter une saisie déjà faite.
- La clé écrite dans l'URL doit venir de `SEARCH_FILTER_KEYS` — pas d'une chaîne littérale
  écrite dans la navbar. Deux littéraux à vingt-six lignes d'écart sont exactement ce qui a
  produit ce défaut.
- Tout lien interne passe par `<Link>`.
- Aucun `href="#"` ne subsiste dans les données de navigation.

## Delta à produire

- [ ] Unifier la construction d'URL des deux chemins de la navbar sur une seule fonction
- [ ] Faire dériver les clés écrites de `SEARCH_FILTER_KEYS`
- [ ] Trancher le sort de « Vendre » et « Services » : destination réelle, ou retrait
- [ ] Remplacer le `<a>` du menu mobile par `<Link>`
- [ ] Garde : aucun `href: '#'` dans `src/data/navigation.ts`, et tout lien de la chrome publique
      résout vers une route existante
- [ ] Tests : la même saisie produit la même clé de filtre par les deux chemins

## Critères d'acceptation

- [ ] AC1 — une saisie donnée dans le champ de recherche produit **la même clé de filtre** que le
      visiteur clique la loupe, presse Entrée, ou clique une puce de catégorie. Le test compare
      les URL des trois gestes entre elles ; un test qui n'éprouverait qu'un seul geste passerait
      déjà aujourd'hui.
- [ ] AC2 — cliquer une puce de catégorie après une recherche plein-texte **conserve** la
      recherche plein-texte et n'ajoute que le type. Un test l'éprouve sur une saisie qui n'est
      pas un nom de ville.
- [ ] AC3 — le repli conjonctif de TCK-338 reste atteignable après un clic sur une puce : la
      requête part toujours avec ses termes.
- [ ] AC4 — aucune entrée de `navLinks` ne porte `#`, et un test échouerait si une nouvelle en
      portait un.
- [ ] AC5 — les liens du menu mobile naviguent sans recharger le document ; un test l'éprouve par
      la conservation d'un état client, pas par la balise rendue.

## Hors périmètre

- Le comportement de `SearchAutocomplete` au-delà de la distinction ville / texte libre.
- Le pied de page — [TCK-437](TCK-437-pied-de-page-public.md).
- La palette de la navbar — [TCK-440](TCK-440-chrome-publique-en-palette-brute.md).
- La création d'un parcours « Vendre » ou « Services » : si aucune destination n'existe, ce
  ticket retire les entrées, il n'invente pas la surface.

## Notes d'implémentation

_(à remplir par implementing-specs)_

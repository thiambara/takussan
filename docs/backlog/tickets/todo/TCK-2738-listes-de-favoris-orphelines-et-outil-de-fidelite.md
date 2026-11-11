---
id: TCK-2738
title: "FavoritesList et SavedSearchesList, que plus rien ne rend, s'en vont ; l'outil de fidélité vise la barre d'onglets par son slot et balaye en français"
status: todo
phase: P2
family: technique
estimate: S
wave: null
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2618]
blocks: []
spec_refs:
  features: []
  models: []
tags: [technique, code-mort, favoris, outillage, fidelite, suivi-lot-2]
---

## Objectif utilisateur

Ce ticket ne change aucun écran. Le développeur qui ouvre `components/favorites/` n'y trouve plus deux listes que
plus aucune page ne rend, ni les tests qui les éprouvent. L'agent qui compare une page à sa maquette lit, pour la
barre d'onglets, la barre elle-même, et non une carte qui défile dessous. Il lit aussi les relevés de débord dans
la langue du produit.

## Contexte

Relevé par terrain-5 pendant TCK-2618 (rapport du lot 2, `a_signaler`). Re-mesuré le 2026-11-11 sur
`feat/audit-ux-app-lot-2` (0ac65b051, TCK-2618) :

1. **Deux composants sans rendu.** TCK-2618 a porté les favoris et les recherches dans la coque. Les pages
   `/app/favorites` et `/app/saved-searches` rendent désormais `SuiviDesFavoris` et son onglet « Recherches ».
   `FavoritesList.tsx` et `SavedSearchesList.tsx` n'ont plus d'importateur hors de leurs propres tests. Ils ne sont
   plus cités que dans des commentaires (`favorites/page.tsx`, `saved-searches/page.tsx`, `FavoriteNote.tsx`,
   `resume-de-criteres.ts`, `ReglageDAlerte.tsx`, `types/search.ts`, `surface-publique.contraste.test.ts`).
   Cinq fichiers de test les éprouvent encore : `FavoritesList.test.tsx` et `SavedSearchesList.{alerte,equipements,
   suppression-refusee.p210-03,villes.tck-2061}.test.tsx`. Les gestes qu'ils couvraient sont rejoués sur la page
   réelle par `favoris-dans-la-coque.tck-2618.test.tsx` (« rien ne se perd de … »).
   Leurs espaces de noms i18n (`favorites.page`, `search.saved`) restent lus par d'autres composants
   (`SuiviDesFavoris`, `OngletRecherches`, `CarteDeSuivi`, `ReglageDAlerte`, `resume-de-criteres`). Seules
   les clés que ces deux fichiers sont les seuls à lire deviennent orphelines.
2. **Rôle « barre d'onglets » de l'outil de fidélité.** `takussan-web/scripts/fidelite/roles-coque.json` repère
   la barre côté produit par `boiteDe: "Menu"`, soit la plus petite boîte qui contient ce texte, d'au moins
   56 px de haut. Sur l'accueil admin au téléphone, il retient la carte « Impayés » (171×128), qui défile sous la
   barre fixe, et non la barre. Les rapports de fidélité de TCK-2617 portent le même artefact. terrain-5 l'a
   contourné dans sa fiche (`coque: false`, produit `slot: barre-onglets`). La barre porte bien
   `data-slot="barre-onglets"` (`components/layout/BarreDOnglets.tsx`).
3. **`balayer` relève en anglais.** La capture (`fidelite.mjs`, l. 164) pose
   `Emulation.setLocaleOverride { locale: 'fr-FR' }`, mais `cmdBalayer` (l. 574 et suivantes) ne la pose pas. Il
   ne pose pas non plus de cookie `NEXT_LOCALE` : la page part en anglais (`Accept-Language` par défaut du
   navigateur sans tête), et les débords mesurés sont ceux de libellés anglais.

## Décision

**Aucune décision du porteur requise** : retrait de code mort et correctifs d'un outil interne. Ce ticket ne change
aucun comportement visible.

## Contrat de données

Aucun.

## Contraintes strictes

- (1) Ne retirer que ce que plus rien ne lit. Avant de retirer une clé, chercher dans `src/` chaque clé lue par les
  deux fichiers, hors eux et hors leurs tests. Une clé encore lue reste. Le retrait se fait dans `fr`, `en` et `wo`
  à la fois (parité de `check-i18n`).
- (1) Les comptes des gardes de contraste sont des cliquets à deux sens (`ENCRES_INVERSES` de
  `surface-publique.contraste.test.ts`, `RESTANTS` d'`encre-sans-alpha.contraste.test.ts`). S'ils baissent, les
  ajuster en notant la date et la cause, comme le veut leur en-tête. Les relever dans un arbre SANS maquettes du
  playground, qui sont locales et non suivies et les faussent.
- (1) Les commentaires qui citent l'histoire (« ce que la liste d'avant faisait ») restent vrais et peuvent rester.
  Un commentaire qui décrirait les deux composants comme vivants se corrige.
- (2) Le correctif porte sur l'outil, pas sur une fiche : le rôle commun vise la barre côté produit par son slot.
  La maquette garde son sélecteur si elle n'a pas ce slot.
- (3) `balayer` rend la même langue que la capture : `fr-FR`, et le cookie de langue si la page le lit.

## Delta à produire

- [ ] Retirer `components/favorites/FavoritesList.tsx`, `components/favorites/SavedSearchesList.tsx` et leurs cinq
      fichiers de test ; retirer les clés orphelines dans `src/messages/{fr,en,wo}.json` ; régénérer
      `src/i18n/namespaces.json` si un espace de noms disparaît.
- [ ] `scripts/fidelite/roles-coque.json` : rôle « coque · barre d'onglets », côté produit, sélecteur
      `slot: barre-onglets`.
- [ ] `scripts/fidelite/fidelite.mjs` `cmdBalayer` : locale `fr-FR` (et `NEXT_LOCALE=fr`), comme la capture.
- [ ] Rejouer la comparaison de coque de l'accueil admin au téléphone. Si un écart de TCK-2617 tenait à l'artefact,
      le dire dans son rapport, sans rouvrir le ticket.

## Critères d'acceptation

- [ ] AC1 — `grep -rn "FavoritesList\|SavedSearchesList" takussan-web/src` ne rend que des commentaires
      historiques. `npx tsc --noEmit`, `npm run lint`, `node scripts/check-i18n.mjs` et la suite front sont verts.
- [ ] AC2 — Aucune clé retirée n'est lue ailleurs : chaque clé retirée, cherchée dans `src/`, ne rend rien.
- [ ] AC3 — Sur l'accueil admin au téléphone, le rôle « coque · barre d'onglets » retient côté produit la boîte
      `data-slot="barre-onglets"` (hauteur de la barre, en bas du viewport), pas la carte « Impayés ».
- [ ] AC4 — `balayer` sur une page de `/app` relève des libellés français. Par exemple, dans la barre
      d'onglets de l'admin, « Accueil » et « Argent », et non « Home » et « Money ».

## Hors périmètre

- Les modales d'accueil qui couvrent l'écran des relevés au téléphone (masquées par l'outil, jamais fermées) :
  relevé à part par terrain-5, non traité ici.
- La régénération de `namespaces.json` pour les clés d'un autre agent (TCK-2618, `a_signaler`) : affaire de commit,
  pas de ticket.

## Notes d'implémentation

_(à remplir par implementing-specs)_

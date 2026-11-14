---
id: TCK-2738
title: "FavoritesList et SavedSearchesList, que plus rien ne rend, s'en vont ; l'outil de fidélité vise la barre d'onglets par son slot et balaye en français"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-11-11
updated: 2026-11-14
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

- [x] Retirer `components/favorites/FavoritesList.tsx`, `components/favorites/SavedSearchesList.tsx` et leurs cinq
      fichiers de test ; retirer les clés orphelines dans `src/messages/{fr,en,wo}.json` ; régénérer
      `src/i18n/namespaces.json` si un espace de noms disparaît.
- [x] `scripts/fidelite/roles-coque.json` : rôle « coque · barre d'onglets », côté produit, sélecteur
      `slot: barre-onglets`.
- [x] `scripts/fidelite/fidelite.mjs` `cmdBalayer` : locale `fr-FR` (et `NEXT_LOCALE=fr`), comme la capture.
- [x] Rejouer la comparaison de coque de l'accueil admin au téléphone. Si un écart de TCK-2617 tenait à l'artefact,
      le dire dans son rapport, sans rouvrir le ticket.

## Critères d'acceptation

- [x] AC1 — `grep -rn "FavoritesList\|SavedSearchesList" takussan-web/src` ne rend que des commentaires
      historiques. `npx tsc --noEmit`, `npm run lint`, `node scripts/check-i18n.mjs` et la suite front sont verts.
      Preuve (2026-11-14) : le grep ne rend que des commentaires historiques ; `tsc` sans erreur hors
      `.next/types` périmé ; ESLint vert sur les fichiers touchés ; `check-i18n` : parité verte, 0 écart
      hors `playground/maquettes` (105 écarts tous sous ces maquettes locales non suivies, comme pour
      TCK-2821) ; vitest sur 7 cibles, 50 fichiers et 443 tests verts. `npm run lint` entier et la suite
      front entière : laissés à la CI.
- [x] AC2 — Aucune clé retirée n'est lue ailleurs : chaque clé retirée, cherchée dans `src/`, ne rend rien.
- [x] AC3 — Sur l'accueil admin au téléphone, le rôle « coque · barre d'onglets » retient côté produit la boîte
      `data-slot="barre-onglets"` (hauteur de la barre, en bas du viewport), pas la carte « Impayés ».
- [x] AC4 — `balayer` sur une page de `/app` relève des libellés français. Par exemple, dans la barre
      d'onglets de l'admin, « Accueil » et « Argent », et non « Home » et « Money ».

## Hors périmètre

- Les modales d'accueil qui couvrent l'écran des relevés au téléphone (masquées par l'outil, jamais fermées) :
  relevé à part par terrain-5, non traité ici.
- La régénération de `namespaces.json` pour les clés d'un autre agent (TCK-2618, `a_signaler`) : affaire de commit,
  pas de ticket.

## Notes d'implémentation

**Re-mesure de la prémisse au HEAD (1db3d00ca, 2026-11-14).**

- (1) Tenue, avec un **sixième** importeur que le ticket ne listait pas :
  `components/search/__tests__/criteres-de-recherche-sauvegardee.test.tsx`, par **import dynamique**
  (`await import('@/components/favorites/SavedSearchesList')`). Aucun import statique ni dynamique hors
  des tests ; aucune mention dans `scripts/` sauf un commentaire d'exemples (`check-enum-namespaces.mjs`).
- (3) À moitié close : `48eae9295` posait déjà `NEXT_LOCALE=fr` dans `cmdBalayer`. Il ne manquait que
  `Emulation.setLocaleOverride { locale: 'fr-FR' }` (la locale d'`Intl`, celle des formats de date et de
  nombre).

**Retiré.** `FavoritesList.tsx`, `SavedSearchesList.tsx`, `FavoritesList.test.tsx`,
`SavedSearchesList.{alerte,equipements,suppression-refusee.p210-03,villes.tck-2061}.test.tsx`, et
`CARD_SIZES_FAVORITES_DASHBOARD` (`property/card-image-sizes.ts`), que `FavoritesList` était seule à lire.
Clés (fr, en, wo, retrait ligne à ligne, JSON vérifié égal au reste près) :
`search.saved.{empty_title,empty_description,empty_cta,error,relaunch}` et `favorites.page.similar`.
Cherchées par espace de noms (lecteurs de `search.saved` : `resume-de-criteres`, `ReglageDAlerte`,
`OngletRecherches` ; de `favorites.page` : `SuiviDesFavoris`, `CarteDeSuivi`) : aucune n'est lue.
Restent lues : `search.saved.{noCriteria,deleteAria,frequency,alertAria,alertOff,alertChannels,alertError}`,
`favorites.page.{error,empty,emptyHint,discoverCta,availability,removedTitle,remove,removeError,note}`.
`favorites.page.{title,subtitle,subtitleLoading}` ne sont lues par aucun fichier, mais ne l'étaient pas
non plus par les deux composants : hors de ce ticket. Aucun espace de noms ne disparaît :
`check-i18n-namespaces` vert sans `--update`.

**Porté avant le retrait** (rejoué sur les composants vivants) :
- `app/favorites/__tests__/rien-ne-se-perd.tck-2738.test.tsx`, sur les pages de route : pagination
  (`page=2` demandé, ablation `onPage(page)` → rouge), note modifiée par `PATCH /api/favorites/10`, favori
  retiré (`property: null`) et loué à côté d'un disponible, sans prix ni lieu, `DELETE /api/favorites/11`
  exact, alerte réglée sur « hebdomadaire » (`PATCH` sur la recherche 8), canaux effectifs seuls ;
- `favorites/__tests__/resume-de-criteres.tck-2738.test.tsx`, sur `useResumeDeCriteres` : équipements en
  en/wo/fr (TCK-633), villes du profil et les deux tests purs d'aller-retour (P185.02) ;
- `criteres-de-recherche-sauvegardee.test.tsx` : ses quatre tests de résumé (TCK-340) visent le même module.

**Outil.** `roles-coque.json` : la barre d'onglets côté produit est `{ "slot": "barre-onglets" }`, la
maquette garde `boiteDe: "Menu"`. `fidelite-comparer.test.ts` : les deux fixtures sont des relevés de
maquette (sans slot), le côté produit du rôle y reprend le sélecteur de maquette ; un cas synthétique (la
carte « Impayés » qui contient « Menu » sous la barre) éprouve le sélecteur réel — ablation (retour à
`boiteDe`) → rouge. `balayer` pose la locale et écrit `langue` sur chaque ligne (`document`, `intl`,
libellés de la barre d'onglets quand elle est rendue, `null` dès `md`).

**Mesures (390, persona admin, `/app`, 2026-11-14).**
- AC3 : sur le relevé réel, le rôle retient `slot=barre-onglets`, 390×64 à y=780 (bas à 844). Sur les
  données du jour, l'ancien sélecteur retenait aussi la barre : l'artefact ne se reproduit plus en
  direct, le cas synthétique le garde.
- AC4 : `langue: { document: "fr", intl: "fr-FR", onglets: [Accueil, Argent, Biens, Messages, Menu] }` ;
  sans la locale, `intl: "en-US"` ; sans locale ni cookie, `document: "en"` et `[Home, Money, Properties, …]`.
- Comparaison de coque rejouée (`app-coque/a/0` téléphone contre le produit) : la barre d'onglets est
  conforme, et seule la pastille « 2 » (une donnée) manque. L'artefact ne se reproduit plus sur les
  données du jour : les écarts passés de TCK-2617 ne peuvent être attribués ni à lui ni à autre chose
  depuis ce relevé. Le rapport de TCK-2617 n'est pas versionné, il n'a pas été annoté.

**Non traité, signalé** (ajouts de la vérification de TCK-2618, hors du Delta) : la zone « barre
latérale » à borner à la colonne (outil ; la maquette n'a pas de slot de colonne, il faut donc une
borne de zone nouvelle dans `choisir` — ticket à part), et « Comparer » sous `lg` dans `/app` (un écran,
voisin de TCK-2741) : ticket de suite TCK-2825.

## Ajouts de la vérification de TCK-2618 (2026-11-11)

- [x] Avant de supprimer `FavoritesList` : porter sur la page vivante (`SuiviDesFavoris`) les tests de la pagination (`page=2`) et de l'édition de la note d'un favori. Aujourd'hui, ces deux comportements ne sont testés que par `FavoritesList.test`.
- [ ] Outil de fidélité : la zone « barre latérale » couvre tout le cadre 1280×900. Les écarts de bureau ne mesurent donc pas la colonne. Il faut borner la zone à la colonne.
- [ ] Sous /app au téléphone, « Comparer » sur une carte de favori ne mène nulle part : ni barre, ni toast. Ce défaut existait avant TCK-2618. Il faut soit monter la pastille, soit retirer le bouton sous `lg`, conformément à l'ADR-0091 § 4.

- 2026-11-14 : clôturé — jugé au HEAD 0053d0bbd, tous les AC tenus avec preuve (verdict de clôture 2026-11-14-b).

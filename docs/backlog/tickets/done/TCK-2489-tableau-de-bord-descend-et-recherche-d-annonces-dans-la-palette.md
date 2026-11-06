---
id: TCK-2489
title: Le tableau de bord n'ouvre le menu que pour l'admin d'agence ; la recherche d'annonces entre dans la palette ; le modèle « Aujourd'hui »
status: done
phase: P2
family: front
estimate: S
wave: 83
created: 2026-11-06
updated: 2026-11-06
depends_on: []
blocks: [TCK-2490, TCK-2491]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, navigation, coque, adr-0090]
---

## Objectif utilisateur

Un hôte, un bailleur, un agent, un client trouvent d'abord ce qui fait leur métier, pas un tableau de
bord ; tout le monde cherche une annonce depuis « Aller à » sans barre du haut.

## Contrat de données

Aucun endpoint neuf. Données du front : `src/lib/navigation/dispositions.ts` (groupes par persona),
`a-traiter.ts` (`pastillesATraiter`, `priorites`), la palette (`PaletteDeCommandes.tsx`, `palette.ts`).

## Direction UX / Artistique

Décisions d'[ADR-0090](../../../adr/0090-la-coque-de-app-sans-barre-du-haut.md) §3 et §4.

## Contraintes strictes (métier)

- `admin-agence` : « Tableau de bord » reste la première entrée.
- Toute autre persona : l'entrée descend **après le deuxième groupe titré** (dans un groupe sans titre
  à elle) ; s'il y a moins de deux groupes titrés, après le dernier ; une persona sans groupe titré
  (prestataire) la place en quatrième ligne de sa tête. Aucune destination ne se perd (gardes
  d'ADR-0089), `/app` reste la page d'arrivée, la barre d'onglets ne change pas.
- « Aujourd'hui » : un modèle pur, dérivé des `priorites` et des comptes, qui rend pour chaque
  compte non nul une ligne (clé, nombre, href, **libellé d'action** i18n : « Messages non lus »,
  « Visites à confirmer », « Demandes de contact »…, une clé par `NavCounterKey` priorisé par une
  persona) ; liste vide quand tout est à zéro. Il remplace `pastillesATraiter` (plus de coupe à 4 +
  « autres » si le rendu n'en a plus besoin — à décider sur le rendu de TCK-2490).
- Palette : une action « Chercher un bien sur Takussan » ; avec du texte tapé, « Chercher « … »
  parmi les annonces », qui mène à `/properties?q=…` (relire le paramètre réel de la recherche
  publique). Hors `/app` rien ne change.
- i18n : fr/en/wo (wo = texte français tel quel).

## Delta à produire

- [x] Dispositions : position du tableau de bord par persona, comme une donnée ; tests par persona.
- [x] Modèle « Aujourd'hui » + libellés ; tests (zéros, ordre des priorités, entrée verrouillée).
- [x] Palette : action de recherche d'annonces ; tests.

## Critères d'acceptation

- [x] AC1 — Pour chaque persona, un test fige la place de « Tableau de bord » (premier pour
  `admin-agence`, la règle ci-dessus pour les autres) et rougit si on la remet en tête.
- [x] AC2 — Le modèle « Aujourd'hui » rend les lignes non nulles dans l'ordre des `priorites`, avec un
  libellé d'action par clé ; vide si tout est à zéro ; une entrée verrouillée n'y paraît pas.
- [x] AC3 — La palette propose « Chercher un bien » et transmet le texte tapé ; test.
- [x] AC4 — Gardes d'ADR-0089 vertes (aucune destination perdue, recensements), `check:*`, tsc, lint.
- [ ] AC5 — Suites par la CI.

## Hors périmètre

Le rendu de la barre (TCK-2490), la suppression de la barre du haut (TCK-2491).

## Notes d'implémentation

*2026-11-06, agent `atelier-nav`, branche `feat/coque-atelier`.*

**Modèle « Aujourd'hui »** (9e9fdebff). `lignesAujourdhui(entrees, comptes, priorites)` dans
`src/lib/navigation/a-traiter.ts` rend `{ cle, nombre, href }` pour chaque clé de `priorites`, dans
leur ordre, si une entrée rendue et non cadenassée la porte et que son compte est > 0. Il n'y a pas de
coupe : le rendu de TCK-2490 n'en a pas besoin. Les libellés sont sous `nav.sidebar.aujourdhui.titre`
et `.lignes.<cle>`, pour les cinq `NavCounterKey`. Ce sont des chaînes simples, parce que le nombre
est rendu à part.

**Place du tableau de bord** (cf3b36ce7). La place est écrite en toutes lettres dans
`dispositions.ts`, avec le groupe sans titre `TABLEAU_DE_BORD` (id `tableau-de-bord`).
`BASE_ADMIN` est éclaté (`ACTIVITE_ADMIN`, `PORTEFEUILLE_ADMIN`) : l'admin d'agence garde sa tête.
Écart à noter : la **plateforme** partageait la disposition de l'admin. Comme elle n'est pas
`admin-agence`, la règle la fait descendre après « Portefeuille ».

| Persona | Le tableau de bord vient… |
|---|---|
| admin-agence | 1re ligne de la tête (inchangé) |
| client | après « Mes démarches » |
| locataire | après « Mes recherches » |
| bailleur | après « Activité » |
| agent | après « Catalogue », avant « Gestion » |
| hôte | après « Mes locations », avant « Mon espace » |
| plateforme | après « Portefeuille », avant « Finances » |
| prestataire | 4e ligne de la tête |

Les onglets mobiles et `/app` ne changent pas (test : `onglets[0]`). Dans `onglets.test.ts`, un test
prenait le groupe `tete` comme menu court. Il prend maintenant `tete` + `tableau-de-bord`, avec la
même intention.

**Palette** (4dad8d8da, 3023936e0). Le paramètre a été relu dans le code : `parametreDe('q')` donne
`q`, celui qu'écrit `SearchAutocomplete`. La fonction pure `avecLaRechercheDAnnonces` :
- champ vide : « Chercher un bien sur Takussan » vers `/properties`, après les actions, sauf si le
  menu y mène déjà (l'action du client, l'entrée du locataire) ;
- avec du texte : « Chercher « … » parmi les annonces » vers `/properties?q=…`, dans le groupe
  « Annonces », le **dernier** de la palette.

**Écart d'interprétation.** Avec du texte, l'option n'est pas dans « Actions ». Elle vient en
dernier, sinon « mess » + Entrée ouvrait la recherche publique au lieu de la messagerie.

L'état vide « Aucun résultat » n'était plus atteignable, puisqu'une option reste toujours. Il dit
maintenant « Aucune page pour « … » » et s'affiche au-dessus de cette option. La navigation passe par
`hrefLocalise` au lieu de `cheminLocalise`, parce que la cible porte une requête. La palette lit
`lignesAujourdhui`.

**Ablations** (mutation, test et restauration dans un seul script, restauration vérifiée par `cmp`) :

| Mutation | Rouges |
|---|---|
| A1 — l'ordre du menu à la place des priorités | 4 |
| A2 — le cadenas ignoré | 2 |
| A3 — les zéros admis | 12 |
| A4 — une coupe à 4 dans le modèle | 2 |
| A5 — un libellé `en` absent | 1 |
| B1 — l'hôte remis en tête (« on la remet en tête ») | 4 |
| B2 — l'agent après le dernier groupe titré | 3 |
| B3 — l'admin d'agence descendu | 5 |
| B4 — le prestataire en ligne 1 | 4 |
| C1 — la recherche tapée en tête | 8 |
| C2 — le paramètre `search` à la place de `q` | 10 |
| C3 — sans dédoublonnage | 2 |
| C4 — le texte non transmis par le composant | 8 |
| C5 — l'action non branchée | 4 |

**Gardes**, à chaque commit : `tsc --noEmit` 0, `npm run lint` propre, `check:i18n`,
`check:i18n-namespaces`, `check:classes-emises`, `chemin-api.garde` 29/29 et
`src/lib/navigation` 830/830. Les `scripts/check-*.mjs` passent sur l'export de HEAD.

**`pastillesATraiter` n'est pas encore retirée.** Mesure prise à la clôture : sur HEAD, deux fichiers
de TCK-2490 l'importent encore, `AppSidebar.tsx` (avec `PASTILLES_VISIBLES`) et `BandeATraiter.tsx`.
Dans l'arbre de travail d'`atelier-coque`, plus rien ne l'importe. Elle découpe désormais
`lignesAujourdhui`, ce qui garde une seule règle de jugement. Elle se retire dans le commit qui
débranche la barre (TCK-2490), avec `PASTILLES_VISIBLES`, l'alias `PastilleATraiter` et ses tests
TCK-2479 de `a-traiter.test.ts`. Les tests de priorités restent, sur `lignesAujourdhui`.
**Mise à jour (2026-11-06)** : retirée par 759b06fd7 (TCK-2490) ; `grep -rn pastillesATraiter takussan-web/src` → 0.

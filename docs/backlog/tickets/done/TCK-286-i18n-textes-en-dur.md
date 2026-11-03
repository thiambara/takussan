---
id: TCK-286
title: "i18n — les libelles produits encore codes en dur"
status: done
phase: P2
family: front
estimate: L
wave: null
created: 2026-08-12
updated: 2026-08-16
depends_on: []
blocks: [TCK-292]
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models: []
tags: [front, i18n, qualite]
---

## Objectif utilisateur

Qu'un utilisateur qui choisit l'anglais ou le wolof obtienne réellement l'anglais ou le wolof —
partout, y compris dans la navigation.

## Contrat de données

Les trois dictionnaires existent : `src/messages/{fr,en,wo}.json`. `wo` est deep-mergé sur `fr`
pour un repli gracieux (`src/i18n/request.ts:95-101`).

> ⚠ **Les chiffres ci-dessus étaient faux et sont corrigés.** Ce ticket annonçait « 1376 clés
> `fr`/`en`, 1265 `wo` » : c'est le compte des NŒUDS de l'arbre JSON (feuilles + objets
> intermédiaires), pas celui des clés traduisibles. Mesuré le 2026-08-15 : **1 072 clés feuilles
> `fr`/`en` et 976 `wo`** avant ce ticket. Surtout, `en`/`wo` n'étaient pas « complets » :
> **`wo` accusait 96 clés de retard**, silencieusement rattrapées par le deep-merge, et personne
> ne l'avait jamais vu.

## Contraintes strictes (métier)

**La règle « le front possède le texte affiché » est une intention, pas un état.** Mesuré par AST
le 2026-08-15 : **431 fichiers portaient 3 735 occurrences** de texte affiché en dur, pour
85 fichiers seulement branchés sur next-intl (et non 82 sur 875 — ce compte-là mêlait les fichiers
de test). Des libellés produits sont codés en dur en français, **y compris dans la navigation**.

**Rien ne mesure l'écart.** C'est le point le plus important de ce ticket : sans garde, la
proportion se dégradera à chaque écran neuf, exactement comme elle s'est dégradée jusqu'ici. Une
règle que rien ne mesure n'est pas une règle.

## Direction UX / Artistique

Aucune — ce ticket ne change aucun rendu, il change d'où vient le texte.

## Delta à produire

- [x] **D'abord la garde, ensuite le travail.** `takussan-web/scripts/check-i18n.mjs` — scan AST
      (compilateur TypeScript, pas regex) sur quatre catégories, **cliquet PAR FICHIER**
      (`scripts/i18n-baseline.json`), plus un second contrôle : la **parité des clés entre les
      trois locales**.
- [x] ~~Le brancher dans `repo-ci.yml`~~ → **branché dans `web-ci.yml`**. `repo-ci.yml` n'exécute
      aucun `npm ci` et ses gardes n'importent que des modules `node:` natifs ; une garde AST y
      serait privée de `typescript`. La raison est écrite dans l'étape du workflow.
- [x] Résorber par surface : **coquille de navigation, états d'erreur, tunnel d'authentification**
      — ce qu'un utilisateur voit avant tout le reste. **Le reste part à TCK-292**, chiffré et
      découpé en douze lots.

## Critères d'acceptation

- [x] AC1 — la garde existe, tourne en CI (`web-ci.yml`), et ses seuils ne peuvent que descendre :
      un cliquet par fichier sur le texte en dur, un cliquet sur les clés wolof manquantes, et un
      plafond dur à 0 sur les clés anglaises manquantes.
- [x] AC2 — la garde est **prouvée par mutation**, trois fois, code de sortie à l'appui : un
      libellé français en dur → 1, une clé anglaise supprimée → 1, une clé wolof supprimée → 1 ;
      chaque violation retirée → 0. Doublé d'un test de fixtures : `src/i18n/__tests__/i18n-scan.test.ts`
      (21 cas), qui épingle aussi ce que la garde NE voit PAS.
- [x] AC3 — **reformulé, parce qu'il visait à côté.** Il nommait `Navbar` et `Footer` : ceux de
      `components/home/` étaient **déjà internationalisés** (il n'y restait que le mot
      « Takussan »), et ceux de `components/layout/` sont du **code mort sans aucun importeur**.
      La navigation réellement montée est `AppShell → AppSidebar + AppTopbar`,
      `AdminShell → AdminSidebar`, `SuperAdminShell → SuperAdminSidebar + SuperAdminTopbar`.
      Les neuf fichiers vivants (`AppSidebar`, `AdminSidebar`, `SuperAdminSidebar`, `AppTopbar`,
      `SuperAdminTopbar`, `UserMenu`, `NotificationBell`, `ProUpgradeCard`, `src/data/navigation.ts`)
      sont à **zéro** libellé en dur.

## Hors périmètre

- ~~La traduction elle-même du wolof~~ — **révoqué par décision produit du 2026-08-15** : les trois
  langues partent ensemble sur le lot livré. Laisser une clé sans anglais ni wolof, c'est troquer
  un anglais complet contre un anglais troué **en silence**, puisque le deep-merge de
  `src/i18n/request.ts:95-101` sert du français sans le moindre signal. Ce qui reste hors périmètre,
  c'est le RESTE du parc — il a son ticket, TCK-292.
- Le texte produit par `takussan-api/` (validation Laravel, enums, notifications, e-mails, PDF) :
  non mesuré, et probablement un chantier backend distinct.

## Notes d'implémentation

Ardoise D-24. Livré : **la garde, plus un premier lot de surfaces**. Le reste est TCK-292.

### La décision qui n'était écrite nulle part : les trois langues partent ensemble

`src/i18n/request.ts:95-101` deep-merge `fr` sous TOUTE locale ≠ `fr`. Une clé branchée en français
seulement s'affiche **en français** à un utilisateur anglophone : pas d'erreur, pas d'avertissement,
pas de test rouge. **Ne rien décider revenait donc à choisir** — à transformer un anglais complet à
100 % en anglais troué, et personne ne l'aurait vu sauf l'utilisateur anglophone. Le lot livre donc
`fr` + `en` + `wo` ensemble, et la garde interdit désormais toute clé `fr` sans `en` (plafond dur
à 0). Le wolof est du vrai wolof, écrit dans le registre des entrées existantes (`Denc`, `Bàyyi`,
`Kër yu Senegaal`) et non du français recopié — un calque se voit moins qu'un trou, ce qui le rend
pire.

### Les 96 clés wolof manquantes, et pourquoi un cliquet plutôt qu'un zéro

Mesuré le 2026-08-15 : `wo.json` avait **96 clés de retard** sur `fr.json`, préexistantes, jamais
vues de personne parce que le repli les masquait. `en` n'en avait aucune. Exiger zéro tout de suite
aurait fait rougir la CI sur une dette qu'on n'a pas créée ; le plafond `PLAFONDS_PARITE.wo` démarre
donc à 96 et **ne peut que descendre** — motif emprunté à `scripts/check-feedback-states.mjs`. Le
lot en a résorbé 8 au passage (elles tombaient dans les sous-arbres `auth.login`/`auth.register`
qu'il réécrivait) : **le plafond est descendu à 88**, et un compte qui baisse sans qu'on resserre le
plafond fait rougir aussi, sinon le cliquet redevient un plafond mort.

### Pourquoi la baseline est PAR FICHIER et non un total

Un cliquet global se contourne sans effort : on baisse un fichier pendant qu'un autre monte, le
total ne bouge pas. `scripts/i18n-baseline.json` est donc une carte `chemin → compte`, et un fichier
**absent** de la baseline qui porte du texte fait échouer — sans quoi un écran neuf entrerait sous
le radar, ce qui est exactement le mode de dégradation que ce ticket décrit. Quatre conditions
d'échec : le compte monte, un fichier neuf porte du texte, un compte descend sans `--update`, une
ligne de baseline n'a plus d'objet.

### La garde est dans `web-ci.yml`, pas dans `repo-ci.yml`

Le Delta demandait `repo-ci.yml`. **Infaisable tel quel** : ce workflow n'exécute aucun `npm ci` —
c'est délibéré, il est documentaire et léger — et ses sept gardes n'importent que des modules
`node:` natifs. Or celle-ci parse le TypeScript avec le compilateur `typescript`. Les deux issues
étaient d'installer les dépendances dans un workflow qui existe pour ne pas en avoir, ou de
retomber sur une analyse par regex — moins précise sur exactement le point qui compte : distinguer
un libellé affiché d'une chaîne technique. Elle est donc dans `takussan-web/scripts/`, exposée par
`npm run check:i18n`, et branchée dans `web-ci.yml` où `npm ci` a déjà tourné. La raison est écrite
dans l'étape du workflow, pas seulement ici.

### Ce que la garde ne mesure pas, et qui est écrit dans sa propre sortie

Dette D-23 : *une garde qui cherche un JETON ne mesure pas la PROPRIÉTÉ*. Compter les fichiers
important `useTranslations` mentirait comme l'INDEX maintenu à la main — **18 fichiers du parc
importent next-intl ET portent du texte en dur**, jusqu'à 34 occurrences dans un seul. Le contrôle
de parité (A) est EXACT sur la présence des clés et muet sur leur qualité ; le cliquet (B) est
HEURISTIQUE et ne voit ni les gabarits interpolés (`` `Bonjour ${nom}` ``), ni les props de
composants maison hors `ATTRS_AFFICHAGE`. **Son total est un plancher, jamais un inventaire**, et le
script le dit lui-même quand il est vert plutôt que de laisser croire l'inverse.

### Le patron « la donnée transporte la clé, le rendu la résout »

`buildNavItems`, `buildAdminItems` et `NAV_GROUPS` naissent **hors composant** : `useTranslations`
n'y est pas appelable, et les transformer en hooks les rendrait intestables. Les entrées portent
donc un `labelKey` et le rendu appelle `t(labelKey)`. Même chose pour `src/data/navigation.ts`
(`nameKey`). C'est le patron que TCK-292 devra reprendre pour les schémas zod.

### Le harnais de test, fait une fois pour tous les lots

`vitest.setup.ts` ne monte aucun `NextIntlClientProvider`, et les rendus existants passaient souvent
`messages={{}}` — un composant converti y rend la CLÉ, donc tout `getByText('…')` casse. **8 tests
de 4 fichiers sont tombés, tous pour cette seule raison**, et la correction a été strictement de la
plomberie : `src/test/intl.tsx` expose `withIntl(ui)` (provider alimenté par le VRAI `fr.json`) et
`mockTraductionsServeur()` (pour les composants serveur, dont `getTranslations` résout la locale via
`next/headers`, absent sous jsdom). **Aucune assertion n'a été modifiée** — c'était la condition
pour que le lot prouve qu'il ne change rien à l'écran.

### Deux écarts conservés délibérément

- `nav.categories.*` **duplique** `property.types.*` (même enum backend) et **diverge** sur deux
  entrées : `shop` vaut « Commerce » ici et « Boutique » là, `resort` vaut « Complexe » et
  « Resort ». Les unifier aurait changé deux libellés à l'écran ; ce ticket déplace le texte sans le
  changer. Trancher est une décision produit → TCK-292.
- `src/components/layout/{Footer,Header,Navigation,Sidebar}.tsx` — **aucun importeur**, 13
  occurrences dont 7 doublons d'`AppSidebar`. Les traduire aurait créé deux tables de navigation
  dont une invisible ; les supprimer dépasse un ticket i18n → TCK-292.

### Chiffres corrigés dans la documentation

Le ticket, l'ardoise D-24 et `takussan-web/CLAUDE.md` annonçaient tous « 1376 clés fr/en, 1265 wo »
et « 82 fichiers sur 875 ». Le premier compte est celui des **nœuds** de l'arbre JSON, pas des clés
traduisibles ; le second mêlait les fichiers de test. Les trois documents portent désormais la
mesure, et le renvoi vers la commande qui la reprend.

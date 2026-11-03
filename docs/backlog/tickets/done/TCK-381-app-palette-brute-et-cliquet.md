---
id: TCK-381
title: "Tableau de bord /app — éteindre la palette Tailwind brute, et étendre le cliquet à ce qu'il ne couvre pas"
status: done
phase: P2
family: front
estimate: M
wave: 48
created: 2026-08-27
updated: 2026-08-27
depends_on: [TCK-380]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#28-internationalisation--préférences
tags: [front, dashboard, design-system, tokens, garde-ci]
---

## Objectif utilisateur

Le tableau de bord parle **une** langue de couleur — celle du produit — et le dépôt refuse
mécaniquement d'en réintroduire une deuxième.

## Contexte

Le dépôt a déjà éteint un vocabulaire de couleur parallèle : TCK-372 a supprimé le dialecte
`--app-*` et posé `scripts/check-app-tokens.mjs`, qui prouve son absence par lecture de texte.
Cette garde est exacte pour ce qu'elle mesure. Elle ne mesure **qu'une** chaîne : `app-<jeton>`.

La palette Tailwind brute, elle, n'est couverte nulle part pour `/app`. Relevé du 2026-08-26,
sur la **clôture d'import réelle** des 46 pages de `/app` (259 fichiers, imports suivis — pas le
répertoire, cf. l'en-tête de `check-app-tokens.mjs`) :

| | |
|---|---|
| Fichiers de la clôture portant au moins une couleur brute | **45** |
| Occurrences | **393** |

Les douze plus chargés : `calendar/CalendarPage` (44), `bookings/BookingDetail` (35),
`leases/LeaseDetail` (28), `visits/VisitDetail` (27), `customer-dashboard/CustomerTagPicker` (25),
`profile/ProfileReviewsList` (22), `property-dashboard/PropertyList` (18),
`customer-dashboard/CustomerList` (15), `ui/toast` (12),
`property-dashboard/PropertyStatusBadge` (12), `profile/ProfileContactSection` (12),
`leases/CreateLeaseForm` (12). Trois pages de `/app` en portent aussi directement : 11 occurrences
(`account/privacy`, `overview/owner`, `payments/return`).

Deux conséquences, dont la seconde ne se voit pas :

1. **`docs/design-guidelines.md` autorise lui-même le doublon**, à la ligne 93 : *« skeleton
   loaders avec `bg-stone-200` **ou** `bg-muted` »*. C'est exactement l'échappatoire que
   `check-app-tokens.mjs` nomme dans son propre en-tête — *« Le « ou ». Une AC alternative ne
   nomme pas un objectif, elle nomme la sortie de secours et l'autorise. »* Le document qui pose
   la règle porte la brèche.
2. **`src/app/globals.css` déclare un bloc `.dark` complet** (l. 172) — et pas une des 393
   occurrences ne bascule avec lui. Un thème sombre existe dans la feuille de style et aucune
   surface du tableau de bord ne le suivrait. *Un thème qu'aucun écran ne peut suivre n'est pas
   un thème, c'est une déclaration.*

Ce ticket est le pendant, pour `/app`, de ce que TCK-358 fait pour la console super-admin — dont
le hors-périmètre dit explicitement : *« Le reste du dépôt : ce ticket ne touche que la console
super-admin. »*

## Contrat de données

Ticket purement frontend. Aucun changement d'API, aucun changement de comportement.

## Direction UX / Artistique

- **Direction retenue : les jetons Lin existants**, ceux que `docs/design-guidelines.md` impose
  déjà. Aucune couleur n'est inventée ; l'écran doit être visuellement indiscernable après la
  substitution, à l'exception des endroits où la palette brute produisait aujourd'hui un écart
  de charte — ceux-là s'alignent.
- La couleur d'**état** (succès, avertissement, danger, information) est le seul cas où la
  substitution n'est pas mécanique : un vert et un rouge y portent du sens. Ils obtiennent leurs
  jetons plutôt que de rester en `emerald-600` / `red-600`.
- La ligne 93 des guidelines se corrige dans le sens de la règle, pas dans celui de l'exception.

## Contraintes strictes (métier)

- Substitutions : `bg-white` → `bg-card` · `border-stone-200|300` / `ring-stone-200` →
  `border-border` / `ring-border` · `bg-stone-50|100` → `bg-muted` · `text-stone-500|600|700` →
  `text-muted-foreground` · `text-stone-900|950` → `text-foreground`. Les couleurs d'état passent
  par des jetons, jamais par une classe brute conservée « parce qu'elle porte du sens ».
- **Le jeton `--warning` est celui de TCK-358** s'il a été livré, et il se crée ici sinon — dans
  `:root` **et** `.dark`. Deux tickets ne créent pas deux jetons du même nom.
- La substitution ne change **aucune** structure : pas de balise déplacée, pas de classe de
  disposition touchée.
- **Un cliquet, sinon rien.** Le motif est déjà revenu deux fois faute de garde — sur les jetons
  `app-*` (TCK-244 → TCK-372) et sur la palette du super-admin (TCK-245 → TCK-358). La garde doit
  mesurer la **clôture d'import**, pas un répertoire, et couvrir la liste complète des préfixes
  d'utilitaires de couleur de Tailwind (`fill`, `stroke`, `placeholder`, `caret`, `from`, `via`,
  `to`, `divide`, `outline`, `decoration` compris) et des variantes (`hover:`, `md:`, `/40`…).

## Delta à produire

- [x] Jetons d'état dans `src/app/globals.css` (`:root` + `.dark`) et exposition `@theme inline`,
      pour ce que la palette brute portait de sémantique
- [x] Substitution sur les 45 fichiers de la clôture (393 occurrences) et sur les 3 pages de
      `/app` (11 occurrences)
- [x] Correction de `docs/design-guidelines.md:93` : la brèche `bg-stone-200` **ou** `bg-muted`
      devient une règle sans alternative
- [x] Garde `scripts/check-dashboard-tokens.mjs` : calcule la clôture d'import de
      `src/app/(dashboard)/app` et refuse toute classe de palette brute dedans. En-tête portant
      le motif, le relevé chiffré du 2026-08-26, et pourquoi elle suit les imports
      — **le nom est sans objet** : c'est `scripts/check-super-admin-tokens.mjs` qui est étendu,
      sur consigne explicite (plusieurs branches et une PR le désignent par son nom)
- [x] Branchement de la garde dans `.github/workflows/repo-ci.yml`

## Critères d'acceptation

- [x] AC1 — sur la **clôture d'import** de `src/app/(dashboard)/app`, hors `__tests__`, aucune
      classe `(text|bg|border|ring|divide|from|via|to|fill|stroke|placeholder|caret|outline|decoration)-(stone|amber|emerald|red|green|blue|slate|gray|zinc|neutral|orange|yellow|rose|sky|indigo|violet|teal|lime|cyan|fuchsia|pink|purple)-[0-9]{2,3}`
      ne subsiste, ni aucun `bg-white`
- [x] AC2 — `node scripts/check-dashboard-tokens.mjs` sort en 0 sur le dépôt propre et **sort en
      échec** quand on réintroduit volontairement `bg-stone-200` dans
      `src/components/calendar/CalendarPage.tsx` (vérification par ablation : la garde doit être
      prouvée capable d'échouer, pas seulement de passer)
      *Cochée sur la substance, pas sur le nom : la garde est `check-super-admin-tokens.mjs`
      (cf. delta ci-dessus). L'ablation demandée a bien été jouée sur `CalendarPage.tsx` : rouge,
      fichier et ligne nommés. Vert sur le dépôt propre re-vérifié le 2026-08-27 après le
      correctif final (`rc=0`, super-admin 0/93, /app 0/266, `globals.css` 0).*
- [x] AC3 — la garde échoue aussi sur une couleur brute introduite dans un fichier **atteint par
      import** depuis `/app` mais situé hors du répertoire — un fichier de `src/components/ui/`
      fait l'épreuve. C'est le faux négatif qui a coûté TCK-245
- [x] AC4 — la garde est rejouée par `repo-ci.yml` et son en-tête porte le motif + le relevé du
      2026-08-26
- [x] AC5 — `docs/design-guidelines.md` ne contient plus d'alternative autorisant la palette brute
- [x] AC6 — les jetons d'état existent dans `:root` **et** `.dark`
- [ ] AC7 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent
      *Non cochée : `npm run lint` (0 erreur, 36 avertissements préexistants), `npx tsc --noEmit`
      (rc=0), `npx vitest run src/components src/app` (202 fichiers, 1292 tests, 0 échec) et les
      gardes du dépôt (`for g in scripts/check-*.mjs`) sont verts sur l'arbre fusionné le
      2026-08-27. `npm run test` **en entier** n'a pas tourné : il appartient à la session
      déléguante (CLAUDE.md, « qui lance quoi »).*

## Hors périmètre

- **Livrer un thème sombre utilisable** : ce ticket rend les surfaces de `/app` capables de le
  suivre, il n'ajoute ni sélecteur de thème, ni persistance, ni audit de contraste en sombre. Le
  dépôt n'a aujourd'hui aucun basculeur (`grep -rn "setTheme\|next-themes" src` → aucun
  résultat) ; en poser un est une décision qui demande son propre ticket.
- Les espaces publics `(public)` et `(auth)`, et les consoles `/admin` et `/super-admin`
  (TCK-358).
- Les primitives de rendu : TCK-380, dont ce ticket dépend — substituer une fois sur une
  primitive coûte moins que quarante-cinq fois sur ses appelants.

## Notes d'implémentation

### Ce que la re-mesure a contredit (2026-08-27, avant d'écrire une ligne)

| Le ticket écrivait | Mesuré, même définition de clôture |
|---|---|
| clôture de `/app` = **259 fichiers** | **403** |
| **45** fichiers porteurs | **119** |
| **393** occurrences | **1070** — facteur **2,7**, dans le sens qui rassure |
| « 3 pages de `/app` en portent 11 » | **5 pages, 13 occurrences** |
| jeton `--warning` « s'il a été livré » | livré par TCK-358 — **repris VERBATIM**, valeur et docblock, pour que deux tickets ne créent pas deux jetons du même nom |
| garde à créer : `scripts/check-dashboard-tokens.mjs` | **non** — c'est `check-super-admin-tokens.mjs` qui est étendu, sur consigne : plusieurs branches et une PR le désignent par son nom |

### La garde : deux espaces, quatre crans, six trous déclarés

`check-super-admin-tokens.mjs` porte désormais un tableau `ESPACES` — la console super-admin
(TCK-358) et `/app` (celui-ci) — chacun avec son périmètre exigé à zéro et son cliquet propre.
Le reste d'un espace se calcule contre **tout** ce qui est gardé, tous espaces confondus : sans
ça le chiffre aurait dépendu de l'ordre de fusion des tickets.

Un **quatrième type de périmètre** est né d'un besoin mesuré : `cloture`, l'intersection d'un
répertoire et de ce que l'écran monte. Six répertoires (`search`, `compare`, `bookings`,
`favorites`, `maintenance`, et `chat-widget` qui en est finalement sorti) servent `/app` **et** le
site public ; les mettre en `dir` aurait fait rougir la garde sur 137 occurrences d'écrans que ce
ticket met explicitement hors périmètre.

### Ce que les mutations ont trouvé — et ce qui a été corrigé pour elles

La garde a été mutée **quatorze fois**. Trois trous réels en sont sortis, tous corrigés :

1. **Six préfixes de couleur manquaient** — `border-t|r|b|l|x|y|s|e-*`, `divide-x|y-*`,
   `ring-offset-*`. `border-t-stone-300` sortait au vert. Même trou d'un caractère que l'AC2 de
   TCK-244.
2. **Retirer un répertoire du périmètre** sortait en 0 en silence → les `TEMOINS`, repris de
   `check-locale-figee.mjs`.
3. **Retirer le répertoire ET son témoin** sortait encore en 0 → un `plancherFichiers` par espace,
   qui compte au lieu de nommer.

Deux mutations à un geste sur la configuration (**vider `TEMOINS`**, **retirer un espace
d'`ESPACES`**) passaient aussi : deux contrôles de forme les ferment.

**Ce qui passe encore, et qui est écrit dans le fichier** : le style inline (T1), la classe
calculée (qui ne compile pas), et la manœuvre à **trois** gestes — répertoire + témoin + plancher.
*Un contrôle qui nomme ce qu'il surveille se désarme en retirant le nom* : les trois crans
n'empêchent pas la manœuvre, ils l'obligent à être visible dans le diff (T6).

### Là où la substitution mécanique avait tort

Trois familles de fichiers ont dû être reprises à la main, et **deux d'entre elles ont été
dénoncées par des tests existants**, pas par la relecture :

- **`ProfileBadge`** — cinq types de profil renvoyés sur succès / info / danger : `agent` et
  `broker` devenaient identiques, et un administrateur d'agence s'affichait en rouge.
  `ProfileBadge.test.tsx` exige une couleur DISTINCTE par type et a rougi sur les cinq. Un type de
  profil est une CATÉGORIE, pas un état : `--chart-1..5`.
- **`charts/LineChart` et `BarChart`** — une série de graphique n'est pas un statut, même
  correction.
- **`calendar/event-colors`** — réservation et visite devenaient indiscernables **dans la grille du
  mois**, là où la bulle est trop étroite pour son libellé. La couleur y est le seul canal
  d'information : quatre jetons distincts, et le docblock dit pourquoi.

À l'inverse, `maintenance/labels.ts` passe bien de **onze teintes à cinq jetons**, délibérément :
`fuchsia`, `purple` et `violet` y voisinaient pour trois statuts consécutifs, et le libellé est
toujours à côté de la pastille.

### AC non tenus, et pourquoi

- **AC2 nomme `scripts/check-dashboard-tokens.mjs`** ; la garde est
  `scripts/check-super-admin-tokens.mjs`, sur consigne explicite. L'ablation demandée par l'AC a
  bien été jouée sur `calendar/CalendarPage.tsx` : rouge.
- Le cliquet du reste de `/app` vaut **58** et non 56 : mon propre relevé préalable ne jouait que
  les contrôles A et B, la garde y ajoute le contrôle D. *Un compte pris avec un sous-ensemble des
  contrôles n'est pas le compte de la garde.*

### Revue adverse et correctif final (2026-08-27)

**Verdict de la revue : REFUSÉ.** La substitution livrée est saine — 0 classe brute sur les
fichiers gardés, ablations rejouées, jetons d'état mesurés — et AC1, AC3, AC5, AC6, AC7 tiennent.
C'est la **garde** qui a été refusée, c'est-à-dire l'objet même du ticket, *dont l'AC dit « un
cliquet, sinon rien »* : elle portait **deux désarmements à un seul geste**, non déclarés, prouvés
par exécution. Le § « quatorze mutations, trois trous » ci-dessus était donc vrai pour les quatorze
formes choisies, et ne se lisait pas comme « la garde est étanche ».

| Désarmement mesuré | Ce qui le ferme |
|---|---|
| **13 des 22 familles Tailwind n'étaient éprouvées par aucune forme d'`EPREUVE`.** Retirer `'indigo'` de `FAMILLES` puis injecter `bg-indigo-500 text-indigo-900` dans un fichier **témoin** du périmètre : la garde imprime « ✓ 0 classe de couleur hors jetons sur 266 fichiers gardés » et sort en **0**. | ⚠ **Pas** la dérivation depuis `FAMILLES` que la revue suggérait — *une forme dérivée disparaît AVEC l'entrée qu'elle est censée éprouver*, l'auto-épreuve serait restée verte. Deux mécanismes : 22 + 11 formes **littérales** (blocs F/G), et `ablationDeConfiguration()`, qui à chaque exécution reconstruit les cinq contrôles sans chaque entrée et exige qu'une épreuve cesse d'être vue. |
| **Le même trou portait sur 15 des 27 PRÉFIXES** — `stroke`, `placeholder`, `outline`, `via`, `caret`, `accent`, `divide`, `border-r|l|y|e`… Trou **neuf**, trouvé par aucun des trois vérificateurs successifs. | idem. Balayage systématique après correctif : **56 entrées** (22 familles + 27 préfixes + 7 attributs) retirées une à une → **aucune n'est désarmable d'un seul geste**, contre 22 avant. |
| **`RESTE_PLAFOND` de la console super-admin n'était pas bilatéral** : `= 200` sort en 0, et la garde **imprime elle-même** « RESTE NON GARDÉ : 46 défaut(s) (cliquet 200) ». Le docblock justifiait la non-bilatéralité contre une DESCENTE ; le désarmement est une HAUSSE. | `resteBilateral: true`, **aucune marge tolérée** — et c'est argumenté : une marge attrape la manœuvre grossière et laisse la manœuvre patiente. Mutation `= 47`, le desserrage d'**un seul cran**, jouée et rouge. C'est celle qu'une marge aurait laissé passer. |
| **`globals.css` n'appartenait à aucun périmètre et n'entrait dans aucune clôture** : `@apply bg-stone-200 text-red-600` en fin de fichier → garde verte. *La garde affirmait qu'aucune couleur n'est décidée en dehors de `globals.css`, et c'était le seul fichier qu'elle ne lisait pas.* | Contrôle dédié du fichier de jetons, sur les contrôles **A/B/C seulement** — un hexadécimal y est la DÉFINITION d'un jeton ; refuser D en ferait une interdiction de définir un jeton, donc une garde qu'on contourne. Plus un contrôle d'existence du chemin. Les 4 occurrences que le fichier portait, toutes en docblock, sont réécrites en toutes lettres. |
| **Une couleur littérale en attribut de présentation JSX/SVG** (`<rect fill="#a85332" stroke="#f5f5f4" />`) échappait aux quatre contrôles. | Contrôle E, sur 7 attributs. Coût **mesuré avant** de l'ajouter : 7 occurrences dans tout `src`, toutes hors des deux périmètres et des deux clôtures — zéro correctif, zéro mouvement de cliquet. Témoin négatif vert sur `fill="none"`, `stroke="currentColor"`, `fill="url(#…)"`, `stroke="var(--chart-1)"`. |
| **`plancherFichiers` de /app resté à 225 pour 266 fichiers analysés** — 41 de mou, et non 2 : exactement le jeu dont la manœuvre à trois gestes du trou T6 a besoin. | 225 → **266**, 92 → **93**, chacun daté. Mesuré : `'reviews'` retiré du périmètre sortait en 0 à 225, sort en 1 à 266. |
| `EPREUVE` ne portait **aucune** forme d'échelle à deux chiffres : amputer `[0-9]{2,3}` en `[0-9]{3}` passait l'auto-épreuve — ce qui rougissait était le cliquet bilatéral de /app, protection **incidente** qui disparaîtra le jour où TCK-384 ramènera ce reste à 0. | Formes des deux longueurs dans F/G. La mutation est maintenant attrapée par l'auto-épreuve elle-même. |

**Deux trous neufs trouvés par le correcteur, hors de tout rapport de revue** : `EXTENSIONS`
amputée de `.css` (coût nul aujourd'hui — c'est ce qui rendait la mutation invisible), et trois
entrées de sa propre liste d'attributs (`stop-color`, `flood-color`, `lighting-color`) **refusées
par `ablationDeConfiguration()` comme n'éprouvant rien** : le `\b` initial coupe après le trait
d'union. *La garde de la garde a mordu sur son auteur, et a nommé trois entrées inutiles avant
qu'un lecteur les croie utiles.*

**L'en-tête du fichier a été réécrit** : il déclarait six trous, dont aucun n'était l'un des deux
bloquants, pendant que le docblock d'`autoEpreuve` affirmait couvrir précisément ce mode d'échec.
Il porte maintenant les quatre désarmements mesurés et **huit** trous (T1-T8), chacun avec sa
mesure.

### Ce qui reste ouvert, et ce qui va rougir

- **T6 — deux gestes restent à un seul geste** : supprimer le bloc du fichier de jetons, ou l'appel
  à `ablationDeConfiguration()`. Ce sont des blocs de trente lignes avec leur docblock, pas un
  chiffre : la manœuvre est *grosse* faute de pouvoir être refusée. *Aucune garde ne se défend
  contre sa propre réécriture délibérée.* Partout ailleurs le compte de gestes est monté de 1 à 2.
- **T1** (style inline, expression JSX en attribut), **T7** (substitution d'un nom dans
  `COULEURS_CSS` — le retrait et l'amputation, eux, sont rouges) et **T8** (`.svg`, trou réel et
  **vide** : zéro `.svg` sous `takussan-web/src`) : déclarés avec leur mesure, figés `false` dans
  l'épreuve pour que la prochaine revue les trouve écrits au lieu de croire les découvrir.
- ⚠ **Les deux `plancherFichiers` sont désormais sans mou (93 et 266).** Une suppression légitime
  de composant dans un périmètre gardé fera rougir la garde : c'est le contrat écrit dans son
  docblock, mais celui qui supprime devra corriger le chiffre avec sa date.
- ⚠ **`AppSidebar.tsx:434` porte l'une des 60 occurrences du reste /app (`text-white`) et est
  édité par le correctif de TCK-377.** Si cette occurrence disparaît, le cliquet **bilatéral**
  dira « le reste vaut 59, alors que le cliquet dit 60 » — comportement voulu, à corriger en
  changeant `plafondReste` avec sa date, pas en le désarmant. Même chose côté super-admin pour
  `ui/toast` (12), `files/PdfViewer` (11), `ui/sheet` (4), `layout/UserMenu` (4),
  `ui/warning-banner` (3), `ui/dropdown-menu` (3), `forms/Form{Error,Success}` (3+3),
  `shared/LanguageSwitcher` (2), `ui/dialog` (1).

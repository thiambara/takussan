---
id: TCK-381
title: "Tableau de bord /app — éteindre la palette Tailwind brute, et étendre le cliquet à ce qu'il ne couvre pas"
status: todo
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

- [ ] Jetons d'état dans `src/app/globals.css` (`:root` + `.dark`) et exposition `@theme inline`,
      pour ce que la palette brute portait de sémantique
- [ ] Substitution sur les 45 fichiers de la clôture (393 occurrences) et sur les 3 pages de
      `/app` (11 occurrences)
- [ ] Correction de `docs/design-guidelines.md:93` : la brèche `bg-stone-200` **ou** `bg-muted`
      devient une règle sans alternative
- [ ] Garde `scripts/check-dashboard-tokens.mjs` : calcule la clôture d'import de
      `src/app/(dashboard)/app` et refuse toute classe de palette brute dedans. En-tête portant
      le motif, le relevé chiffré du 2026-08-26, et pourquoi elle suit les imports
- [ ] Branchement de la garde dans `.github/workflows/repo-ci.yml`

## Critères d'acceptation

- [ ] AC1 — sur la **clôture d'import** de `src/app/(dashboard)/app`, hors `__tests__`, aucune
      classe `(text|bg|border|ring|divide|from|via|to|fill|stroke|placeholder|caret|outline|decoration)-(stone|amber|emerald|red|green|blue|slate|gray|zinc|neutral|orange|yellow|rose|sky|indigo|violet|teal|lime|cyan|fuchsia|pink|purple)-[0-9]{2,3}`
      ne subsiste, ni aucun `bg-white`
- [ ] AC2 — `node scripts/check-dashboard-tokens.mjs` sort en 0 sur le dépôt propre et **sort en
      échec** quand on réintroduit volontairement `bg-stone-200` dans
      `src/components/calendar/CalendarPage.tsx` (vérification par ablation : la garde doit être
      prouvée capable d'échouer, pas seulement de passer)
- [ ] AC3 — la garde échoue aussi sur une couleur brute introduite dans un fichier **atteint par
      import** depuis `/app` mais situé hors du répertoire — un fichier de `src/components/ui/`
      fait l'épreuve. C'est le faux négatif qui a coûté TCK-245
- [ ] AC4 — la garde est rejouée par `repo-ci.yml` et son en-tête porte le motif + le relevé du
      2026-08-26
- [ ] AC5 — `docs/design-guidelines.md` ne contient plus d'alternative autorisant la palette brute
- [ ] AC6 — les jetons d'état existent dans `:root` **et** `.dark`
- [ ] AC7 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

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

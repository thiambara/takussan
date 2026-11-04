---
id: TCK-484
title: "Cinq tables de tons décident encore une couleur hors de `StatusBadge`, figées au cliquet faute de vocabulaire commun"
status: done
phase: P3
family: front
estimate: M
wave: 53
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-472]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, design-system, dette]
---

## Objectif utilisateur

Un même état doit avoir la même couleur d'un écran à l'autre. Cinq familles y échappent encore,
délibérément et par écrit — ce ticket est là pour que « délibérément » ne devienne pas « oublié ».

## Le défaut

TCK-472 a fait de `console/StatusBadge.tsx` le décideur unique de la couleur d'un statut. Cinq
fichiers décident encore depuis une table à eux, sous un vocabulaire que les cinq tons du DS ne
savent pas dire :

| fichier | vocabulaire | pourquoi il n'a pas été absorbé |
|---|---|---|
| `inventory/labels.ts` | états des lieux, types et états d'élément | trois tables, vocabulaire propre |
| `maintenance/labels.ts` | statuts et priorités de maintenance | onze statuts, dont aucun ne se plie aux cinq tons |
| `maintenance/MaintenancePriorityBadge.tsx` | priorités, pas statuts | porte une variante `dark:` explicite que `StatusBadge` n'a pas |
| `calendar/event-colors.ts` | types d'événement | une couleur par TYPE, jamais par statut |
| `calendar/CalendarPage.tsx` | la légende du calendrier | recopie les pastilles d'`event-colors.ts` |

Les absorber est **un vrai travail de design**, pas un refactor : il faut décider si le DS gagne
des tons, ou si ces familles ont droit à un vocabulaire séparé et assumé.

## Ce qui tient la dette en attendant

`scripts/check-status-badge-unique.mjs`, contrôle **C** : la liste `TABLES_DE_TONS_CONNUES` est un
cliquet **à deux sens** — un fichier de plus est un doublon neuf, un fichier de moins est une
entrée périmée.

⚠ **C'est le sens « de moins » qui compte le plus ici**, et il n'est pas intuitif : *une liste
périmée est précisément ce dont TCK-472 est né* — une affirmation d'unicité qui n'était plus vraie
et que personne ne remesurait. Un cliquet à un seul sens serait une tolérance, pas une garde.

## Contrat de données

Aucun.

## Delta à produire

- [x] Trancher, **famille par famille** : le DS gagne des tons, ou la famille garde son vocabulaire
      et le déclare. Les cinq n'ont pas forcément la même réponse.
- [x] Retirer du cliquet chaque entrée absorbée, **dans le même diff** que son absorption.
- [x] `calendar/CalendarPage.tsx` est un cas à part : il **recopie** `event-colors.ts`. Cette
      duplication-là se ferme sans aucune décision de design.

## Critères d'acceptation

- [x] **AC1** — chaque famille conservée porte, dans son propre fichier, **la phrase qui dit ce que
      `StatusBadge` ne sait pas faire pour elle**. *« C'est historique » n'est pas cette phrase*
      (AC2 de TCK-472, repris).
- [x] **AC2** — le contraste des tons de chaque famille conservée est mesuré **sur ses propres
      surfaces**, dans les deux thèmes, par calcul.
- [x] **AC3** — `node scripts/check-status-badge-unique.mjs` reste vert, avec un cliquet dont le
      compte **a changé** : une absorption qui laisserait la liste intacte serait invisible.
- [x] **AC4** — ablation dans les **deux** sens : réintroduire une entrée absorbée rougit, et
      retirer une entrée encore vivante rougit aussi.

## Hors périmètre

- Le jeton `--destructive`, qui a son propre ticket (TCK-480).
- Les bandeaux et encarts qui emploient une couleur pour un **message** et non pour un statut :
  hors-périmètre écrit de TCK-450 et TCK-472.

## Notes d'implémentation

Ouvert par la session à la clôture du lot de la vague 52, sur la liste que TCK-472 a figée. Le
ticket existe pour que le cliquet ait une adresse : *une tolérance sans ticket est une décision que
personne ne reprendra.*

---

## Implémentation — 2026-08-30

*(Notes écrites au fur et à mesure, sur disque. Une mesure qui ne vit que dans une fenêtre de
contexte est une mesure perdue.)*

### Relevé de départ — le cliquet au 2026-08-30, avant tout changement

```
$ node scripts/check-status-badge-unique.mjs --report
  tables de tons en dur (C)    5 fichier(s)
      takussan-web/src/components/calendar/CalendarPage.tsx:55,61,67
      takussan-web/src/components/calendar/event-colors.ts:38,45,52,59
      takussan-web/src/components/inventory/labels.ts:20,21,22,23,36,37,45,46,49,50
      takussan-web/src/components/maintenance/MaintenancePriorityBadge.tsx:14,18,22,26
      takussan-web/src/components/maintenance/labels.ts:35,…,56
✓ … 5 table(s) d'un autre vocabulaire déclarée(s)
```

### AC2, premier passage — le relevé AVANT tout changement, et ce qu'il rend

Mesure par calcul (WCAG 2.1 §1.4.3, aplat composé sur la surface AVANT le ratio, seuil 4,5:1 —
toutes ces pastilles portent du `text-xs`), jetons lus dans `globals.css` par
`scripts/lib/contraste.mjs`, surfaces relevées **au site de rendu** de chaque famille :

| famille | surfaces réelles |
|---|---|
| calendrier | `bg-card`, `bg-muted/60·card` (hors-mois), `bg-warning/10·card` (jour sélectionné), `bg-muted/50·card` (Week/Day/List), `bg-muted·card` (survol de `EventDetailSheet`) |
| inventaire | `bg-card`, **`bg-muted` PLEIN** (`InventoryList:146` au survol, `InventoryDetail:190` sur chaque élément) |
| maintenance | `bg-card`, **`bg-muted` PLEIN** (`MaintenanceList:140` au survol) |

**33 couples (ton × surface × thème) sortent sous 4,5:1 avant correction.** Le relevé complet est
recopié plus bas ; trois causes le résument, et elles ne se corrigent pas au même endroit :

1. **`/15` est l'alpha que TCK-450 a écarté sur mesure — et il n'a jamais quitté ces trois
   fichiers.** `bg-success/15 text-success` rend **4,30:1** sur `bg-muted` plein en clair : c'est,
   au centième près, le 4,29:1 pour lequel la console est passée à `/10`. Idem
   `bg-warning/15` (4,33:1) et `bg-info/15` (4,44:1 en sombre). *Sur un aplat de la couleur du
   texte, moins d'opacité = plus de contraste* — le correctif est un alignement sur le DS, pas une
   invention.
2. **`bg-warning/30` (`endommagé`) échoue sur les QUATRE surfaces des deux thèmes** (3,36 à
   3,98:1). C'est le « second cran d'avertissement par l'intensité » que le fichier documente : il
   ne tient pas.
3. ⚠⚠ **`text-primary` n'est pas une encre — c'est un défaut de JETON, pas d'écran.**
   `bg-primary/12 text-primary` rend **3,39 à 4,51:1**, et il échoue jusque sur `bg-card` NU en
   thème sombre (4,07:1), c'est-à-dire là où aucun aplat ne l'assombrit. C'est la signature exacte
   de TCK-480 : *aucun alpha d'aplat ne rattrape une encre trop claire.* **Hors périmètre, ticket
   à ouvrir** (cf. § Collisions).

### La tranche, famille par famille — et elles ne sont PAS les mêmes

| # | famille | décision | cliquet |
|---|---|---|---|
| 1 | `calendar/CalendarPage.tsx` | **ABSORBÉE** — la légende DÉRIVE d'`event-colors.ts` au lieu de la recopier | **retirée** |
| 2 | `calendar/event-colors.ts` | **CONSERVÉE** + phrase | reste |
| 3 | `inventory/labels.ts` | **CONSERVÉE** (type, état d'élément) + phrase ; sa table de **STATUTS** est absorbée par `StatusBadge` | reste |
| 4 | `maintenance/labels.ts` | **CONSERVÉE** (onze statuts) + phrase ; sa table de **PRIORITÉS**, morte et contradictoire, est supprimée | reste |
| 5 | `maintenance/MaintenancePriorityBadge.tsx` | **ABSORBÉE** — traduit `priorité → ton` et délègue, forme de `kyc-components.tsx` | **retirée** |

**5 → 3.**

### Ce que chaque tranche a réellement fermé

**1 — `calendar/CalendarPage.tsx`, ABSORBÉE. Et la copie avait déjà divergé.**
Sa légende recopiait trois pastilles d'`event-colors.ts` ; elle peignait **`visit` en `--info`,
c'est-à-dire de la couleur d'une réservation**, quand la grille juste en dessous le peint en
`--primary` depuis TCK-381. *Une légende qui ment sur la grille qu'elle légende est pire que pas
de légende* — et rien ne pouvait le dire : les deux tables étaient justes chacune de son côté.
Deux défauts de plus, trouvés dans le même fichier en tirant le même fil :

- le bouton de filtre par type portait `opt.value === 'booking' ? 'bg-info/15 …' : 'bg-info/15 …'`
  — **deux branches identiques**, une distinction écrite et jamais rendue ;
- le panneau du jour sélectionné prenait sa pastille dans `LEGEND_ITEMS`, qui ne connaît que le
  TYPE : un événement `pending` y était peint comme un confirmé, alors que la grille deux colonnes
  à gauche le peignait en gris. Il appelle `paletteFor()`, comme la grille.

**2 — `calendar/event-colors.ts`, CONSERVÉE.** La phrase est dans son en-tête : *dans la grille du
mois, la bulle tronque son titre et il y en a souvent trois par case — la teinte est le seul canal
d'information disponible ; `StatusBadge` publie cinq tons qui disent ce qu'un statut VEUT DIRE, et
aucun qui dise « réservation » plutôt que « visite ».*

**3 — `inventory/labels.ts`, CONSERVÉE, moins ses STATUTS.** `draft`/`pending_signature`/`signed`/
`disputed` tombent un par un sur quatre des cinq tons : la table est devenue
`INVENTORY_STATUS_TONE: Record<InventoryStatus, StatusTone>` et `InventoryStatusBadge` délègue
(forme de `kyc-components.tsx`). Ce qui reste n'est pas un statut, et c'est la phrase :
*`move_in`/`move_out` sont deux TYPES opposés qui ne se rangent nulle part sur l'axe des cinq tons
(rien à signaler → en cours → réussi → à traiter → échoué) ; les quatre crans de dégradation d'un
élément n'ont qu'UN jeton d'avertissement pour deux d'entre eux, et `StatusBadge` ne publie aucun
moyen de dire « le même avertissement, un cran plus haut ».*

**4 — `maintenance/labels.ts`, CONSERVÉE, moins sa table de PRIORITÉS — morte ET fausse.**
`PRIORITY_TONE` / `maintenancePriorityBadgeClass()` n'avaient **aucun appelant** (`grep -rn
maintenancePriorityBadgeClass src` → la définition, rien d'autre) pendant que
`MaintenancePriorityBadge.tsx` peignait les priorités depuis une table à lui. Les deux se
**contredisaient, inversées** : ici `low` gris et `normal` bleu, là `low` bleu et `normal` gris.
*Un doublon mort ne se contente pas d'être inutile : il rend faux le premier endroit où l'on va
lire.* La phrase du fichier porte sur les statuts : *`quote_requested`/`quote_submitted` sont une
SUSPENSION du cycle — ni « en cours » (personne ne travaille) ni « à traiter » par le demandeur —
un aiguillage vers un second cycle qui a ses propres statuts ; aucun des cinq tons ne le dit.*

**5 — `maintenance/MaintenancePriorityBadge.tsx`, ABSORBÉE. Son motif de séjour était sa panne.**
Le cliquet le retenait pour *« une variante `dark:` explicite que `StatusBadge` n'a pas »*. C'était
le motif le plus faible des cinq, et la mesure l'a retourné :

```
normal: 'bg-muted text-foreground … dark:bg-foreground dark:text-muted-foreground'
        → sombre : #b8aa97 sur #fcf9f3 = 2,16:1     ← taupe sur crème
```

Les trois autres `dark:` étaient soit des recopies exactes de leur valeur claire (`urgent`, `low` :
sans effet), soit un ajustement d'alpha (`high`). **La seule justification de l'exception était
l'inversion qui la cassait.** Les quatre priorités tombent sur quatre des cinq tons
(`urgent`→`danger`, `high`→`attention`, `normal`→`neutral`, `low`→`info`) ; le fichier traduit et
délègue. Perdue et assumée : la bordure teintée — `StatusBadge` pose `border-transparent`, et
l'icône porte déjà la distinction non chromatique.

### AC2, second passage — après changement

`node scratchpad/mesure.mjs`, mêmes surfaces, mêmes jetons lus dans `globals.css` :
**33 couples sous 4,5:1 → 15, et les 15 sont le MÊME défaut.**

| ce qui a fermé | comment |
|---|---|
| 17 couples `--success` / `--warning` / `--info` | `/15` → `/10` : **alignement sur le DS**, pas invention. `/15` est l'alpha que TCK-450 avait écarté sur mesure (4,29:1) et qui n'avait jamais quitté ces trois fichiers. |
| 4 couples `endommagé` (`bg-warning/30`, 3,36–3,98:1) | **changement de canal** : le « cran par l'intensité » ne tient à aucun alpha ; il passe sur une BORDURE pleine, qui ne porte pas de texte — seuil 3:1 (WCAG 1.4.11), mesurée à **4,65:1** contre son propre aplat, davantage contre la surface. |
| 8 couples des deux familles absorbées | elles héritent des alphas du DS (`success/10`, `warning/12`, `destructive/10`, `info/10`), et le 2,16:1 disparaît par construction. |

Pires cas après changement, sur les surfaces réelles des deux thèmes :

```
calendar   booking bg-info/10       4,90 – 6,30:1  ✓     lease  bg-success/10   4,59 – 6,26:1  ✓
           en attente bg-muted      4,85 – 5,79:1  ✓
inventaire move_in bg-info/10       4,90 – 6,30:1  ✓     bon    bg-success/10   4,59 – 6,26:1  ✓
           usé/endommagé bg-warning/10 4,65 – 6,07:1 ✓   manquant bg-destructive/10 4,55 – 5,77:1 ✓
           (absorbés) neutral 4,85 · attention 4,52 · success 4,59 · danger 4,55   ✓
maintenance info/10 4,90 · warning/10 4,65 · success/10 4,59 · destructive/10 4,55 · muted 4,85  ✓
           (priorités absorbées) danger 4,55 · attention 4,52 · neutral 4,85 · info 4,90         ✓
```

### ⚠⚠ AC2 — CE QUI RESTE SOUS AA, ET QUI N'EST PAS DE CE TICKET

**Les 15 couples restants sont `text-primary`, sur les trois familles à la fois** — la visite du
calendrier, `move_out` de l'inventaire, `quote_requested`/`quote_submitted` de la maintenance.
**Ce n'est pas un défaut d'écran, c'est un défaut de JETON**, et le balayage le dit sans ambiguïté :

```
text-primary sur bg-primary/  0   pire = 3,99:1 (sombre, bg-muted)   ✗
             sur bg-primary/ 10   pire = 3,47:1                       ✗
             sur bg-primary/ 12   pire = 3,39:1                       ✗
             sur bg-primary/ 15   pire = 3,24:1                       ✗
```

Il échoue **jusque sur `bg-card` NU en thème sombre (4,07:1)**, là où aucun aplat ne l'assombrit.
*Aucun alpha d'aplat ne rattrape une encre trop claire* — c'est mot pour mot la conclusion de
TCK-480 sur `--destructive`, et c'est la même forme de défaut. **Non corrigé ici, délibérément :**
`--primary` est le terracotta de MARQUE, il tient `Button` par défaut, les liens, les onglets ;
le corriger est une décision de palette, pas un réglage de pastille. Ticket à ouvrir (cf.
§ Collisions).

*Ce chiffre a été écrit plutôt que contourné.* Substituer un autre jeton à la visite du calendrier
aurait fait passer AC2 au vert en effaçant la contrainte des quatre teintes distinctes que TCK-381
avait posée sur mesure — un vert obtenu en supprimant ce qu'on mesurait.

### La garde — AC3

```
avant : 5 table(s) d'un autre vocabulaire déclarée(s)
après : 3 table(s) d'un autre vocabulaire déclarée(s)
```

Les deux entrées absorbées sont retirées **dans le même diff** que leur absorption, et les trois
raisons restantes ont été réécrites : elles étaient des étiquettes (*« trois tables, vocabulaire
propre »*), elles disent maintenant ce que `StatusBadge` ne sait pas faire. Le docblock de
`console/StatusBadge.tsx` est corrigé du même mouvement (« cinq fichiers » → trois), avec la
limite du cliquet écrite : **il est par FICHIER**, il ne voit donc pas que deux des trois familles
restantes ont rendu une table chacune — *le compte baisse moins vite que la dette*.

### AC4 — ablation dans les DEUX sens

Chaque greffe est prouvée par `md5` relevé **avant** de lire le verdict ; restauration par `cp`
depuis le scratchpad, prouvée par `md5` (jamais `git checkout` : plusieurs agents dans l'arbre).

| # | sens | ce qu'on greffe | forme | obtenu |
|---|---|---|---|---|
| 1 | **de plus** | la table recopiée, remise dans `CalendarPage.tsx` | connue | ✅ rouge C, `code=1`, `CalendarPage.tsx:66` |
| 2 | **de plus** | `NUANCIER_DES_URGENCES`, nom inédit, clés accentuées (`'très haute'`, `'moyenne'`), dans `MaintenancePriorityBadge.tsx` | **inventée** | ✅ rouge C, `:50,51` — *le nom ne compte pas, la forme oui* |
| 3 | **de moins** | retirer `maintenance/labels.ts`, entrée ENCORE VIVANTE, de la liste | connue | ✅ rouge C sur ses 11 lignes |
| 4 | **de moins** | garder `CalendarPage.tsx` dans la liste après son absorption | connue | ✅ rouge **« CLIQUET PÉRIMÉ »** |

**L'ablation 4 est celle qui compte.** C'est elle qui établit que ce ticket n'aurait pas pu passer
en silence : sans le sens « de moins », une absorption qui laisse la liste intacte ne fait rougir
personne, et la liste redevient ce dont TCK-472 est né.

**Et le test d'AC2 a été éprouvé lui aussi**, parce qu'un test de contraste qui passe peut n'avoir
rien mesuré : `in_progress` remis à `bg-warning/15` (md5 `ce1bac…` → `f859bf…`) le fait rougir sur
*« un ton NON DÉCLARÉ passe sous 4,5:1 : bg-warning/15 text-warning »*. Restauré, md5 revenu à
`ce1bac…`.

⚠ Le cliquet du test est **à deux sens lui aussi** : `TONS_SOUS_AA_DECLARES` fait rougir un ton
non déclaré qui échoue, **et** un ton déclaré qui n'échoue plus. Le jour où le ticket `--primary`
aboutit, ce test rougit pour qu'on vienne retirer la déclaration au lieu de la laisser mentir dans
le sens qui rassure.

### Vérifications

```
node scripts/check-status-badge-unique.mjs --report   → ✓ 3 table(s) déclarée(s)
node scripts/check-destructive-contrast.mjs           → ✓ 18 couples ≥ 4,5:1, minimum 4,55:1
for g in scripts/check-*.mjs; do node "$g"; done      → toutes vertes
node docs/backlog/gen-index.mjs --check               → ✓
node docs/gen-features-by-actor.mjs --check           → ✓
npx vitest run src/components/calendar src/components/inventory src/components/maintenance \
               src/components/console src/lib/__tests__   → 49 fichiers, 551 tests, 0 échec
npx tsc --noEmit                                      → aucune sortie
npm run lint                                          → 0 erreur (38 avertissements préexistants)
```

⚠ La suite entière n'a pas été lancée : règle du lot (`CLAUDE.md`, « qui lance quoi »).
`src/lib/__tests__` est joué nommément parce que `agent-fr-regressions.test.ts` garde les libellés
de priorité de maintenance, dont le badge a changé de rendu.

### Collisions — hors du périmètre de fichiers de ce ticket

1. **Ticket à ouvrir — `--primary` n'est pas une encre.** `text-primary` échoue AA à tous les
   alphas d'aplat, `/0` compris (3,99:1 au mieux ; 4,07:1 sur `bg-card` nu en sombre). Trois
   porteurs mesurés dans ce ticket — `calendar/event-colors.ts` (la visite), `inventory/labels.ts`
   (`move_out`), `maintenance/labels.ts` (`quote_*`) — mais le jeton tient aussi `Button` par
   défaut, `Badge` par défaut, `badge`/`link`, les onglets et les liens : **le relevé de ce ticket
   n'est pas l'inventaire.** Même forme que TCK-480, et la même leçon : *deux relevés indépendants
   qui tombent sur le même chiffre décrivent un jeton, pas un écran.*
2. `takussan-web/src/components/calendar/MonthView.tsx:104` — `bg-warning/20 text-warning` sur le
   numéro du jour sélectionné : hors du périmètre de fichiers (ce n'est pas une table de tons, le
   contrôle C ne le voit pas), non mesuré ici, à vérifier avec le ticket ci-dessus.
3. Une pastille `neutral` posée sur `bg-muted` PLEIN est **invisible sur sa surface** (mêmes
   couleurs) : son texte tient 4,85:1, mais son aplat ne se détache pas. Concerne
   `maintenance` `closed`, `inventory` `draft` et l'événement calendrier en attente. Préexistant,
   non introduit ici ; c'est une question de forme (bordure) plus que de contraste de texte.

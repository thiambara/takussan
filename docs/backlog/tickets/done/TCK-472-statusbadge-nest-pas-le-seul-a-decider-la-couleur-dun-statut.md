---
id: TCK-472
title: "`StatusBadge` affirme être le seul à décider la couleur d'un statut ; ils sont quatre"
status: done
phase: P2
family: technique
estimate: M
wave: 52
created: 2026-08-29
updated: 2026-08-30
depends_on: [TCK-450]
blocks: []
spec_refs:
  features:
    - docs/features.md#console
tags: [front, design-system, contraste, dette]
---

## Objectif utilisateur

Un même statut doit avoir la même couleur partout dans le produit. Aujourd'hui « disponible » est
vert dans la console et vert *d'une autre façon* dans le tableau de bord des biens, sans qu'aucune
décision ne l'ait voulu.

## Le défaut — une affirmation fausse, et ce qu'elle a coûté

Le docblock de `console/StatusBadge.tsx` ouvre sur :

> *« Les classes de chaque ton — **le seul endroit du dépôt où la couleur d'un statut est
> décidée**. »*

Relevé le 2026-08-29 : **ils sont quatre à en décider**, plus une enveloppe légitime.

| fichier | rôle | décide la couleur ? |
|---|---|---|
| `console/StatusBadge.tsx:80` | la table des cinq tons | ✓ **le vrai** |
| `kyc/kyc-components.tsx:268` | homonyme, mappe `KycDossierStatus` → ton et **délègue** | ✗ — **la forme juste** |
| `customer-dashboard/CustomerList.tsx:171` | homonyme LOCAL | ✓ en double |
| `property-dashboard/PropertyList.tsx:534` | homonyme LOCAL | ✓ en double |
| `property-dashboard/PropertyStatusBadge.tsx` | composant à part | ✓ en double |

⚠ **Trois composants portent le NOM `StatusBadge` sans être celui-là.** Dans un fichier qui définit
son propre `StatusBadge`, `<StatusBadge …>` résout vers le local — et rien, ni au typage ni au
lint, ne le signale. `kyc-components.tsx` montre la seule façon d'écrire un homonyme sans dupliquer
la décision : il importe le vrai sous alias (`ConsoleStatusBadge`) et ne fait que traduire un
statut métier en ton.

## Pourquoi c'est plus qu'un doublon : un des quatre porte un contraste que TCK-450 a mesuré sous AA

`property-dashboard/PropertyList.tsx:544` :

```tsx
status === 'sold' && 'bg-success/15 text-success',
```

`success/15` est exactement l'aplat que **TCK-450 a écarté sur mesure** : 4,29:1 en thème clair sur
`bg-muted` plein, sous le seuil AA de 4,5:1. La console est passée à `/10` pour cette raison ; ce
fichier-ci ne l'a pas suivie, puisqu'il ne lit pas la table.

⚠ **Ne pas conclure que ce site échoue** : ses propres surfaces sont `hover:bg-muted/30` et
`bg-primary/5` (l. 208-209), **pas** `bg-muted` plein, et elles n'ont PAS été mesurées à `/15`.
C'est le travail de ce ticket, pas une conclusion à recopier. *Le défaut établi est la
DUPLICATION ; le contraste est une hypothèse à éprouver.*

## Pourquoi l'AC3 de TCK-450 ne pouvait pas les voir

Sa commande de relevé part des fichiers qui **importent** `StatusBadge` du barrel `console`, puis
y cherche les formes qui résolvent un ton. Un homonyme local n'importe rien : il est invisible par
construction.

> *Un relevé qui part des importateurs ne voit jamais les doublons — il ne voit que les usages
> corrects.*

## Contrat de données

Aucun.

## Delta à produire

- [x] Décider, pour chacun des trois doublons : **absorbé** par `StatusBadge` (avec un ton neuf si
      son vocabulaire l'exige), ou **conservé et justifié** par écrit.
- [x] Corriger l'affirmation du docblock de `console/StatusBadge.tsx` — quelle que soit la décision.
      Une affirmation fausse en tête du fichier canonique est ce qui a permis aux doublons de vivre.
- [x] Mesurer les surfaces réelles de `PropertyList` avant de toucher son `/15`.

## Critères d'acceptation

- [x] **AC1** — le relevé des composants qui décident une couleur de statut est pris par une
      commande qui **ne part pas des importateurs** (chercher les définitions, ou les littéraux de
      classe de statut), et il est écrit dans le ticket avec sa date.
- [x] **AC2** — chaque doublon est soit supprimé, soit accompagné d'une phrase disant ce que
      `StatusBadge` ne sait pas faire pour lui. *« C'est historique » n'est pas cette phrase.*
- [x] **AC3** — le contraste des tons de chaque composant conservé est mesuré **sur ses propres
      surfaces**, dans les deux thèmes, par calcul.
- [x] **AC4** — une garde refuse qu'un composant neuf redéfinisse un `StatusBadge` local, ou à
      défaut le déclare comme non gardé, nommément, dans l'en-tête du fichier canonique.
- [x] **AC5** — ablation : rétablir l'un des doublons supprimé fait rougir AC1 ou AC4 — et le
      vérifier, car une garde qui ne cherche que les trois noms connus ne garde rien.

## Hors périmètre

- Les bannières et encarts qui emploient `bg-warning/10` ou `bg-destructive/10` pour un **message**
  et non pour un statut : ce n'est pas le même vocabulaire.
- `GlobalAnnouncementBanner.tsx`, déjà nommé dans le hors-périmètre de TCK-450, qui rend la même
  donnée en palette Tailwind brute et mérite son propre ticket.

## Notes d'implémentation

Relevé par la session pendant la vérification indépendante de TCK-450, en cherchant un écran qui
porterait à la fois le sage `--accent` et le vert `--success`.

---

## Implémentation — 2026-08-30

### AC1 — le relevé, pris SANS partir des importateurs ✅

Deux commandes, aucune ne lit un `import`. La première cherche les **définitions**, la seconde les
**littéraux** de classe pilotés par une valeur de statut :

```bash
cd takussan-web
# (a) toute définition d'un identifiant dont le nom finit par `StatusBadge`
grep -rnE '^[[:space:]]*(export[[:space:]]+)?(async[[:space:]]+)?(function|const)[[:space:]]+[A-Za-z]*StatusBadge\b' \
  src --include='*.tsx' --include='*.ts'
# (b) une VALEUR de statut choisit une classe, sur la même ligne
grep -rnE "(status|stage|state|etat|statut)[A-Za-z]*[[:space:]]*===[[:space:]]*'[a-z_]+'.*(bg-|text-)" \
  src --include='*.tsx' | grep -v __tests__
```

**Résultat de (a) — SEPT définitions, pas quatre.** Le ticket en nommait cinq ; le relevé en a
rendu deux de plus, qu'aucune des cinq lignes de son tableau ne laissait deviner :

| fichier | décide la couleur ? | décision |
|---|---|---|
| `console/StatusBadge.tsx:80` | ✓ **le canonique** | conservé, docblock corrigé |
| `kyc/kyc-components.tsx:268` | ✗ — traduit et délègue | conservé tel quel, **c'est la forme de référence** |
| `customer-dashboard/CustomerList.tsx:171` | ✓ homonyme LOCAL | **absorbé** |
| `property-dashboard/PropertyList.tsx:534` | ✓ homonyme LOCAL | **absorbé** |
| `property-dashboard/PropertyStatusBadge.tsx:66` | ✓ table de `variant` + classes | **conservé, ne décide plus** |
| `inventory/InventoryBadges.tsx:19` | ✓ via `inventory/labels.ts` | ⚠ **hors périmètre** — déclaré au cliquet C |
| `maintenance/MaintenanceStatusBadge.tsx:9` | ✓ via `maintenance/labels.ts` | ⚠ **hors périmètre** — déclaré au cliquet C |

**Résultat de (b) — un décideur de plus, que (a) ne pouvait pas voir** : `CustomerList.tsx:160-163`
définit aussi `PipelineBadge`, qui colorie quatre étapes de pipeline à la main. Il n'a pas
« StatusBadge » dans son nom, donc (a) l'ignore ; il est pourtant le même défaut. *Deux angles
valent mieux qu'un : le relevé par les définitions ne voit pas ce qui se nomme autrement, le relevé
par les littéraux ne voit pas ce qui délègue mal.* Absorbé lui aussi.

Et un **cinquième décideur de tons pour le même vocabulaire**, trouvé en cherchant qui d'autre
mappait un statut de bien : `admin/super/SuperAdminPropertiesTable.tsx:41` porte sa propre table
`PROPERTY_STATUS_TONES`. Elle a la bonne FORME (elle délègue) mais duplique la table — et elle
**contredisait** `PropertyList` sur deux valeurs (`sold`, `unavailable`). Hors périmètre de fichiers
de ce lot ; **l'arbitrage retenu ici est le sien**, donc les deux écrans s'accordent désormais sans
qu'aucun n'ait à changer d'avis deux fois. Reste à lui faire importer la table (collision notée).

### AC2 — la décision pour chaque doublon ✅

| doublon | décision | la phrase |
|---|---|---|
| `CustomerList.StatusBadge` | **absorbé, supprimé** | rien. `StatusBadge` savait tout faire : quatre statuts, cinq tons. L'homonyme était monté quatre lignes sous un `DataTable` importé du même barrel. |
| `CustomerList.PipelineBadge` | **conservé, ne décide plus** | il traduit un vocabulaire (`lead`…`lost`) que `StatusBadge` ne doit pas connaître — c'est la propriété voulue de son docblock. Il ne porte plus que `PIPELINE_STAGE_TONE`. |
| `PropertyList.StatusBadge` | **absorbé, supprimé** | rien. Le fichier appelle désormais `PropertyStatusBadge`, comme la fiche du bien. |
| `PropertyStatusBadge.tsx` | **conservé, ne décide plus** | `StatusBadge` ne connaît aucun statut métier ; quelqu'un doit traduire `property.status` en ton, et ce fichier est cet endroit — **pour les deux écrans**. Il porte `PROPERTY_STATUS_TONE` et délègue le rendu. |
| `kyc-components.StatusBadge` | **conservé, inchangé** | il était déjà la forme juste : garder le nom, importer le canonique sous alias, ne traduire que le sens. |

⚠ **Un changement de nature, à noter en revue** : `PropertyStatusBadge` était un composant
**serveur** (`async` + `getTranslations`) et devient **client**. Ce n'est pas cosmétique — c'est le
mur qui avait fait naître le second badge : `PropertyList.tsx` est `'use client'` et ne pouvait pas
importer un module qui tire `next-intl/server`. Tant que ce fichier était serveur, la liste ne
POUVAIT pas s'en servir ; elle a donc recopié la décision. Le seul appelant serveur ne passe que
des props sérialisables, et `property` est déjà dans le dictionnaire client de la frontière
`(dashboard)/app` (`src/i18n/namespaces.json`) : `node scripts/check-i18n-namespaces.mjs` reste vert
et le fichier n'a pas bougé.

⚠ **Un écart de comportement, assumé** : l'ancien badge de `PropertyList` faisait
`status ?? 'available'` et peignait « Disponible » sur un bien dont l'API ne servait PAS le statut.
Il ne rend plus rien. *Une pastille absente est une donnée absente ; une pastille verte est une
affirmation.*

### AC3 — le contraste, mesuré sur les surfaces RÉELLES, par calcul, dans les deux thèmes ✅

Le ticket demandait de ne pas recopier le 4,29:1. **Bien lui en a pris — l'hypothèse est fausse
pour `PropertyList`.** Formule WCAG 2.1 §1.4.3, aplat composé sur la surface avant mesure, seuil
4,5:1 (la pastille porte `text-xs`, c'est du texte normal) :

```
`bg-success/15 text-success` — l'aplat que le ticket soupçonnait, thème clair
  --card (DataTable) ......................................... 4,99:1  ✓
  bg-muted/30 sur --card (PropertyList:209, ligne survolée) ... 4,77:1  ✓
  bg-primary/5 sur --card (PropertyList:210, sélectionnée) .... 4,69:1  ✓
  bg-card (PropertyList:224, carte mobile) ................... 4,99:1  ✓
  bg-muted PLEIN ............................................. 4,29:1  ✗ ← que PropertyList NE POSE PAS
```

`bg-muted` plein est la surface qui fait tomber `/15`, et **`PropertyList` ne la pose nulle part**.
*Le défaut établi était la DUPLICATION ; le contraste était une hypothèse, et elle ne tenait pas.*

**Le défaut de contraste réel était dans l'autre doublon, celui que le ticket ne soupçonnait pas.**
`CustomerList.tsx:112` pose `hover:bg-muted` PLEIN sur sa carte mobile, et y peignait
`qualified` en `bg-primary/5 text-primary` : **4,24:1 en clair, 3,73:1 en sombre** — sous AA des
deux côtés. Absorbé vers le ton `info`, qui mesure 5,36:1 / 4,90:1 au pire cas.

Après absorption, les quatre tons mesurables tiennent 4,5:1 sur les **7 surfaces × 2 thèmes** —
recalculés à chaque exécution depuis le badge RENDU, pas comparés à une constante recopiée :
`takussan-web/src/components/console/__tests__/StatusBadge.tons-absorbes-tck-472.test.tsx`.

**Deux résultats qui débordent le ticket, écrits parce qu'ils ont été mesurés :**

- ⚠ **Le ton `info` a changé de jeton** (`bg-secondary text-secondary-foreground` →
  `bg-info/10 text-info`). `--info` existe depuis TCK-381 pour « une pastille *en cours* » ; le ton
  qui porte ce nom ne s'en servait pas. Le laisser aurait rendu `sold`/`rented` en `--secondary`
  (#f3ead8), à **trois points par canal** de `--muted` (#f1ece0) : indiscernable de `neutral`.
  C'est le troisième épisode du même motif après `attention`/`--primary` (TCK-358) et
  `success`/`--accent` (TCK-450). Le ratio **descend** (14,67 → 5,36 au pire cas) et reste au-dessus
  d'AA ; écrit ici parce qu'un chiffre qui baisse est celui qu'on doit pouvoir défendre.
- ⚠⚠ **Le ton `danger` est SOUS AA, sur les sept surfaces en clair.** `bg-destructive/10
  text-destructive` mesure **3,41 à 3,99:1** en clair et 3,96 à 5,30:1 en sombre.
  `src/test/contraste-wcag.ts` déclare `--destructive` « hors jetons » (seul jeton en `oklch()`), il
  a donc été **relevé au moteur de rendu** le 2026-08-30 — canvas 1×1 en CDP direct, Chrome
  headless sur le port 9342, témoins `#ffffff` et `#fcf9f3` rendus à l'identique :

  ```
  clair  oklch(0.577 0.245 27.325) → #e7000b        sombre  oklch(0.704 0.191 22.216) → #ff6467
  ```

  #e7000b sur blanc plafonne à 3,99:1 : **aucun alpha d'aplat ne rattrape une encre trop claire.**
  La correction est au niveau du JETON et touche `Badge`, `Button`, `toast` et les bandeaux —
  hors périmètre, **à ouvrir en ticket**. TCK-450 ne l'avait pas vu parce qu'il n'avait mesuré que
  `success` ; c'est en mesurant les cinq tons que ça sort.

### AC4 — la garde ✅

`scripts/check-status-badge-unique.mjs`, trois contrôles, **aucune liste de noms connus** dans les
deux premiers :

- **A — l'homonyme.** Toute définition d'un identifiant nommé exactement `StatusBadge` hors du
  canonique doit importer le canonique. C'est une FORME, donc un fichier neuf est couvert le jour
  où il est écrit.
- **B — la valeur qui choisit une classe.** `status === 'sold' && 'bg-success/15 …'`, sous
  n'importe quel nom de composant.
- **C — la table de tons en dur.** Cliquet à **deux sens** sur cinq fichiers d'un autre
  vocabulaire (`inventory/labels.ts`, `maintenance/labels.ts`,
  `maintenance/MaintenancePriorityBadge.tsx`, `calendar/event-colors.ts`,
  `calendar/CalendarPage.tsx`). C'est la « déclaration nommée » que l'AC autorise à défaut de
  garde — sauf qu'elle est **exécutable** : un fichier de plus est un doublon neuf, un fichier de
  moins est une entrée périmée. Les cinq sont aussi nommés dans l'en-tête du fichier canonique,
  comme l'AC le demande.

```
$ node scripts/check-status-badge-unique.mjs --report
✓ Couleur de statut : 1 décideur canonique, 1 homonyme(s) qui délèguent,
  5 table(s) d'un autre vocabulaire déclarée(s), 1 ligne(s) de message déclarée(s).
```

⚠ **Elle n'est PAS branchée en CI**, et c'est une limite de périmètre, pas un oubli :
`.github/workflows/repo-ci.yml` énumère ses gardes une par une et les workflows étaient interdits
à ce lot. **La ligne à ajouter**, dans le job `guards` de `repo-ci.yml` :

```yaml
      - name: Un seul décideur de couleur de statut (TCK-472)
        run: node scripts/check-status-badge-unique.mjs --report
```

### AC5 — ablation, avec au moins une forme d'invention ✅

Cinq ablations, chacune prouvée par `md5` **avant de lire le verdict** ; restauration par `cp`
depuis le scratchpad, prouvée par `md5` (jamais `git checkout` : sept autres agents travaillaient
dans l'arbre).

| # | ce qu'on rétablit | forme | attendu | obtenu |
|---|---|---|---|---|
| 1 | le doublon CONNU de `PropertyList` (`cp` du fichier d'origine) | connue | rouge A + B | ✅ rouge, `code=1`, A:534 et B:544-549 |
| 2 | `LeaseStateChip.tsx` — **invention**, nom inédit, `leaseState === 'active' && 'bg-success/10 …'` | **inventée** | rouge B | ✅ rouge B — *le nom ne compte pas, la forme oui* |
| 3 | `visit-tones.ts` — **invention**, `Record` de classes, fichier absent du cliquet | **inventée** | rouge C | ✅ rouge C |
| 4 | une entrée BIDON dans `TABLES_DE_TONS_CONNUES` | **inventée** | rouge « CLIQUET PÉRIMÉ » | ✅ — le cliquet échoue **dans les deux sens** |
| 5 | `const StatusBadge = (…) =>` (forme fléchée) **et** un homonyme qui délègue correctement | **inventée** | rouge sur la 1ʳᵉ, VERT sur la 2ᵈᵉ | ✅ A sur la fléchée, aucun faux positif sur celle qui délègue |

L'ablation 2 est celle que l'AC réclame en toutes lettres : *« une garde qui ne cherche que les
trois noms connus ne garde rien »*. Elle ne cherche aucun nom.

### Vérifications

```
node scripts/check-status-badge-unique.mjs --report          → ✓
for g in scripts/check-*.mjs; do node "$g"; done             → toutes vertes
npx vitest run src/components/console src/components/property-dashboard \
  src/components/customer-dashboard src/components/kyc                  → 19 fichiers, 115 tests, 0 échec
npx vitest run "src/app/(dashboard)/app/properties" src/components/admin/super \
  src/components/billing src/components/dashboard                       → 34 fichiers, 144 tests, 0 échec
npx tsc --noEmit                                             → aucune sortie
npm run lint                                                 → 0 erreur
```

⚠ La suite entière n'a pas été lancée : règle du lot (`CLAUDE.md`, « qui lance quoi »). Les
consommateurs du ton `info` ont été joués nommément parce que ce ton change de jeton.

### Collisions — hors du périmètre de fichiers de ce lot

1. `.github/workflows/repo-ci.yml` — brancher la garde (bloc YAML ci-dessus). **Sans ça, la garde
   existe et ne garde rien en CI.**
2. `takussan-web/src/components/admin/super/SuperAdminPropertiesTable.tsx:41` — sa table
   `PROPERTY_STATUS_TONES` fait doublon avec `PROPERTY_STATUS_TONE` (mêmes valeurs désormais) ;
   elle devrait l'importer.
3. **Ticket à ouvrir — `--destructive` sous AA** : le ton `danger` échoue 4,5:1 sur les sept
   surfaces en clair, et la correction est au niveau du jeton (`Badge`, `Button`, `toast`,
   bandeaux). Mesures ci-dessus.
4. **Ticket à ouvrir — les cinq tables de tons figées au cliquet C** (inventaire, maintenance,
   calendrier) : quatre à cinq vocabulaires à absorber ou à justifier un par un.

## Vérification indépendante de la session — 2026-08-30

L'AC5 exigeait « au moins une forme de TON invention », et la session a rejoué l'épreuve avec
quatre formes écrites APRÈS coup, sans lire celles de l'implémenteur.

| forme greffée | garde |
|---|---|
| homonyme `StatusBadge` sous `memo()`, fichier neuf | ✓ rouge |
| table de classes par statut, nom sans rapport (`Pastille`) | ✓ rouge |
| `row.status === 'rejected' && 'bg-destructive/15 …'` | ✓ rouge |
| `item.etat === 'rejected' && …` (nom de propriété inventé) | ✓ rouge |
| **`s === 'rejected' && 'bg-destructive/15 …'`** (variable locale nue) | **✗ VERT** |

**Ce que ça établit, et ce que ça ne dit pas.** La garde n'est PAS une liste de noms connus —
c'est ce que l'AC réclamait, et `item.etat` le prouve : un nom de propriété jamais vu rougit.
Son discriminant est **l'accès de propriété OU l'identifiant `status`** ; une variable locale
d'une lettre n'a ni l'un ni l'autre, et passe.

Le faux vert est donc **possible et étroit**. Il est désormais **déclaré dans l'en-tête de
`scripts/check-status-badge-unique.mjs`** plutôt que laissé à découvrir : élargir le contrôle à
tout identifiant comparé à un littéral rendrait des faux rouges en masse, le choix est assumé.
*Une garde dont on ignore l'angle mort est une garde à laquelle on fait plus confiance qu'elle
n'en mérite.*

Annexe de [la synthèse](../fidelite-au-pixel.md) — relevé du 2026-11-10 ; les chemins `/private/tmp/…` désignent les relevés bruts de la session, non versionnés.

# B — Composants : les primitives des maquettes retenues face à celles du produit

*Relevé du 2026-11-10, par l'agent `fid-composants`. Lecture seule : aucun fichier du dépôt, des
maquettes ni de git n'a été touché. Les fichiers de travail (scripts, relevés JSON, synthèses) sont
dans `…/scratchpad/fidelite/composants/` (liste en § 8).*

---

## 0. L'essentiel en dix lignes

1. **Aucune primitive des maquettes n'a son équivalent exact dans le produit.** Les 82 fichiers de
   `pages/app/` n'importent **aucun** composant de `src/components/ui` : tout est dessiné à la main
   (`chrome-app.tsx`, `kit.tsx`, et des dizaines de pièces locales). Sur les 24 chantiers du § 6,
   **un seul est (i)** (le squelette), 17 sont (ii) « variante/taille de plus », 7 sont (iii)
   « composant neuf », et **8 décisions (iv)** reviennent au porteur (§ 7), dont trois qui
   **contredisent une décision déjà prise** (TCK-753, TCK-450, TCK-2460).
2. **Les maquettes et le produit n'ont pas la même échelle de hauteurs.** Maquettes : téléphone
   **44 / 48 px** (boutons, champs), bureau **36 / 32 px** CSS. Produit : **40 px partout** (`h-10`,
   défaut de `Button`, `Input`, `SelectTrigger`). Écart **±4 px** sur chaque bouton et chaque champ
   des 33 pages — c'est l'écart le plus visible de tout le relevé.
3. **Les contours des champs des maquettes (`border-border`, 1,26:1) sont exactement ce que le
   porteur a fait retirer par TCK-753** (`--input` passé à `#918672`, 3,59:1). Idem pour l'anneau de
   focus (maquette : halo `primary/15` ; produit : anneau plein `ring-ring`, 3 px).
4. **Les pastilles de statut des maquettes violent la règle des aplats de TCK-450** (aplats 15-20 %
   au lieu de 10 %, ton « info » en `--accent`, ton « attention » à l'encre `foreground`).
5. **Les maquettes ne sont pas cohérentes entre elles** : 4 interrupteurs (20, 24, 28 px de haut),
   7 cases à cocher (16 / 18 / 20 px, rayons 4 / 5 / 6 / 8 px), 5 contrôles segmentés, 4 champs de
   recherche, 12 tailles d'avatar. La primitive devra **choisir** — le porteur tranche.
6. **Artefact de la visionneuse (catégorie 3), à connaître avant toute comparaison à l'œil** : à
   ≥ 1024 px de fenêtre, les écrans *téléphone* sont rendus à `rem = 14,4 px` (règle `html{font-size:90%}`
   de TCK-635). Tout ce qui est en rem y est 10 % plus petit qu'au vrai téléphone, tout ce qui est en
   px littéral (2 059 tailles de texte sur 3 815) ne l'est pas.
7. **Sept composants neufs** sont à créer avant les tickets : Puce de filtre (27 pages, 53 tickets),
   Contrôle segmenté (13 p., 30 t.), Feuille du bas (15 p., 33 t.), Case à cocher (10 p., 26 t.),
   Jauge (10 p., 26 t.), Interrupteur (9 p., 16 t.), Ligne de liste mobile, + la barre d'action
   collante (20 p., 38 t.). Dix-sept extensions, dont
   `Button`, `Input`/`Select`/`Textarea`, `StatusBadge`, `Card`, `Avatar`, `Tabs`, `Sheet` (droite),
   `EmptyState`, `DataTable`, `PageHeader`, `WarningBanner`.

---

## 1. Méthode et périmètre

**Ce qui a été mesuré, et comment.**

| Côté | Outil | Couverture |
|---|---|---|
| Maquettes, bureau | `recolte-maquette.js` évalué par `capture.mjs --device desktop` dans la visionneuse : pour **chaque écran** de l'approche **retenue**, `getComputedStyle` (jamais `getBoundingClientRect`, faussé par le `scale()` du cadre) de tout élément qui a un fond, une bordure, un rayon, une ombre, un rôle interactif, ou qui est un titre ; **+ la chaîne de classes** (la source exacte). | **33 pages, 204 écrans**, approches `a` sauf modération `b` et rapprochement `c`. |
| Maquettes, téléphone | même récolte en `--device mobile` : sous 768 px la visionneuse bascule sur `VueTelephoneReel` (écran plein, `rem = 16`). | 7 pages (entrée-connexion, entrée-orientation, etc.) — échantillon de contrôle : il confirme que **calcul = classes × 16** (h-11 → 44, rayon 10, text-sm → 14). Les autres valeurs téléphone sont donc **déduites des classes**, ce qui est exact pour Tailwind. |
| Produit | `recolte-produit.js` (même signature + `data-slot`) sur `/app`, `/app/properties`, `leases`, `customers`, `payments`, `maintenance`, `documents`, `visits`, `bookings`, `agency/team`, `profile`, `notifications`, `messages`, `crm/pipeline`, `commissions` — persona `admin`, 390×844 et 1440×900. | 15 pages × 2 formats. + `/app/customers/new` (champs). |
| Produit, code | lecture des `cva` et des classes : `ui/button.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx`, `badge.tsx`, `card.tsx`, `tabs.tsx`, `avatar.tsx`, `sheet.tsx`, `dialog.tsx`, `toast.tsx`, `choice-card.tsx`, `field-density.ts`, `warning-banner.tsx`, `console/StatusBadge.tsx`, `PageHeader.tsx`, `DataTable.tsx`, `StatCard.tsx`, `feedback/EmptyState.tsx`. | — |
| Tickets | `docs/backlog/tickets/todo/TCK-2578…2683` : 68 tickets `front`/`full`, dont **61** citent leur page de maquette (`?p=app-…`). Le nombre de tickets dépendants d'un composant = tickets front/full qui citent au moins une page où le composant apparaît (récolte, approche retenue). | — |

**Conventions de ce rapport.** « CSS » = la valeur écrite (classe × 16 px). Le bureau du produit
**et** des maquettes est rendu à 90 % (TCK-635) : une valeur en rem y vaut ×0,9 (`h-9` → 32,4 px
rendus), une valeur en px littéral ne bouge pas. Je donne la valeur CSS, et le rendu bureau quand il
compte. « p. » = pages de maquette retenues, « t. » = tickets front/full dépendants.

**Limites.** Les maquettes sont statiques : ni survol, ni focus réel, ni désactivé (sauf rares
dessins, cf. § 5). Une ligne sans fond ni bordure (enfant d'un `divide-y`) n'est pas récoltée : les
lignes de liste sont donc sous-comptées. Le focus du produit n'a pas pu être relevé au navigateur
(page headless sans focus de document) : il est lu dans les classes.

---

## 2. Quatre constats transverses, avant les primitives

### 2.1 L'artefact 90 % de la visionneuse (catégorie 3 — n'existera pas en vrai, mais fausse l'œil)

`globals.css:805-809` (TCK-635) pose `html { font-size: 90% }` dès 64rem **de fenêtre**. Le cadre
téléphone de la visionneuse vit dans ce document : à 1440 px, **un écran téléphone est rendu à
rem = 14,4 px**. Mesuré dans le cadre : `h-11` → 39,6 px, `text-sm` → 12,6 px, `Statut h-6` →
21,6 px. Mais `text-[15px]`, `text-[13px]`, `size-[18px]`, les avatars (`style={{width}}`) restent
à leur valeur : **2 059 des 3 815 tailles de texte de `pages/app/` sont en px littéral**.

Conséquences :

- **Ce que le porteur a validé à l'œil sur son écran de bureau n'est pas ce que le téléphone rendra.**
  Au vrai téléphone, boutons, champs, pastilles, espacements et rayons sont **11 % plus grands**
  qu'au cadre, et les textes en px ne bougent pas : le rapport texte/contenant change.
- **Toute mesure d'écran téléphone prise dans la visionneuse à ≥ 1024 px est fausse de −10 %** sur
  les valeurs en rem (alerte envoyée à la session le 2026-11-10).
- Le **bureau** est juste : produit et maquette y sont tous deux à 90 %.
- Le produit change de coque à **`md` (768 px)** (`AppShell.tsx:192`, `EnTeteMobile.tsx:33`), et de
  rem à **`lg` (1024 px)** : entre 768 et 1023 px, coque de bureau à rem 16. Les maquettes ne
  dessinent ni l'un ni l'autre palier.

**Fermeture proposée** (préparation, effort S) : faire juger la fidélité téléphone sur la vue
« téléphone réel » de la visionneuse (fenêtre < 768 px, ou capture `--device mobile`), jamais sur le
cadre du bureau ; ou faire neutraliser la règle 90 % par la visionneuse quand elle montre un cadre
téléphone (fichier non versionné, hors produit).

**Corollaire pour l'implémentation** : une classe px de maquette (`text-[13px]`) et sa voisine rem
(`text-xs` = 12 px) **ne se remplacent pas l'une l'autre** — au bureau, `text-[13px]` rend 13 px et
`text-sm` 12,6 px : la hiérarchie s'inverse. La spécification d'un composant doit garder l'unité.

### 2.2 Deux échelles de hauteurs (l'écart le plus visible)

| Rôle | Maquette, téléphone | Maquette, bureau (CSS / rendu) | Produit, partout (CSS) | Rendu produit tél. / bureau |
|---|---|---|---|---|
| Bouton courant | **h-11 = 44** (101 pages-cumul, 461 occ.) | **h-9 = 36 / 32,4** (82 p.-cumul, 403 occ.) | `default` h-10 = 40 | 40 / 36 |
| Petit bouton | h-8 = 32 (rare) | **h-8 = 32 / 28,8**, `text-[13px]` | `sm` h-8, `text-[0.8rem]`, plancher 36 au tél. | **36** / 28,8 |
| Bouton d'action principale (barre collante, formulaire) | **h-12 = 48**, `text-[15px]`, `px-5` (67 p.-cumul) | h-11 / h-12 dans les formulaires | `lg` h-11 = 44 ; **pas de 48** | 44 / 39,6 |
| Champ de formulaire | **h-11 = 44**, `text-[15px]` | **h-11** (formulaires, 11 p.) et **h-9** (filtres, 16 p.) | `Input` h-10, plancher 40 ; 44 seulement sous `fieldDensityScope()` | 40 / 36 |
| Puce de filtre | **h-9 = 36** (20 p.) | h-9 / h-8 | — (aucune primitive) | — |
| Bouton icône rond | **size-10 / size-11** | size-9 / size-8 | `icon` size-10, `icon-lg` size-11 | 40 / 36 |

La charte (TCK-2460, `design-guidelines.md:432-443`) fixe **une** hauteur : console `h-10`,
assistants `h-11`, filtres `h-8`, et `scripts/check-champs-uniformes.mjs` **interdit** d'écrire une
hauteur chez l'appelant. **La maquette ne peut donc pas être atteinte sans toucher les primitives ou
la charte.** C'est la décision **D1** (§ 7). Le mécanisme existe déjà : `field-density.ts` (une
portée posée par un ancêtre relève la hauteur sans que l'appelant n'écrive rien) — il suffit de
l'étendre au `Button` et de poser la portée sur la coque `/app`.

### 2.3 Les maquettes contredisent trois décisions déjà prises

| Décision existante | Ce que fait la maquette | Mesure |
|---|---|---|
| **TCK-753** (2026-10-17, « décision du porteur : anneau de focus plein ; `--input` assombri à 3:1 ») | Champs, sélecteurs, recherches en `border-border` (#ebe5d5) : **1,26:1** sur `--card`, 1,20:1 sur `--background` ; entrée : `border-input/45` (1,65:1), `/60` (2,01:1). Champ au focus : `border-primary ring-[3px] ring-primary/15`. | Produit : `border-input` #918672 **3,59:1**, focus `focus-visible:border-ring ring-3 ring-ring` (anneau plein terracotta 3 px). |
| **TCK-450** (charte l. 66-101 : aplat ≤ 10 % — attention 12 % —, `--accent` réservé aux badges *featured*) | `Statut` : `success/15`, `warning/20` + encre **foreground**, `destructive/12`, ton « info » = `accent/15 text-accent`, ton « primaire » = `secondary` + `primary-deep`. | Produit `StatusBadge` : `success/10`, `warning/12 text-warning`, `destructive/10`, `info/10 text-info`. |
| **TCK-2460** (une seule hauteur de contrôle, gardée par `check-champs-uniformes.mjs`) | Contrôles à 44/48 au tél., 36/32 au bureau. | Produit : 40 partout. |

Ces trois écarts ne se ferment **pas** dans les tickets : ou le porteur maintient ses décisions
(et l'écran réel aura des contours de champ plus sombres, un anneau plein, des aplats plus pâles que
la maquette), ou il les révise par un ticket (et une ADR pour TCK-2460). Décisions **D2-D4**.

S'y ajoutent deux contraintes de comportement que la maquette ignore : **le texte d'un champ au
téléphone doit rester ≥ 16 px** (Safari iOS zoome sinon — `input.tsx:15-18`) alors que la maquette
écrit `text-[15px]` dans 20 pages ; et les **éléments de contrôle non textuels** (case non cochée,
interrupteur éteint) sont dessinés sous 3:1 (§ 5).

### 2.4 Les maquettes ne sont pas cohérentes entre elles

*(La § 2.5, qui suit cette section, répond à la demande de la session du 2026-11-10 : composants
dont l'aspect change entre 90 % et 100 %, et les cibles tactiles mesurées à rem 16.)*

Chaque page a redessiné ses pièces localement (`kit.tsx` en tête le dit : « la maquette retenue
sera réécrite avec les vrais composants »). Résultat, dans les seules approches retenues :

| Pièce | Variantes distinctes | Détail |
|---|---|---|
| Interrupteur | **4 gabarits** | 20×36 (biens), 24×40 (agenda, aujourd'hui, réservations, documents), 28×48 (orientation, messagerie, profil, identité) ; éteint en `foreground/20` **ou** `border`. |
| Case à cocher | **7** | 16 px `rounded` (visites), 18 px `rounded-[5px]` (argent, équipe, commissions, biens), 20 px `rounded-md` (profil, entrée, fil commercial), 20 px `rounded-[6px]` (modération) ; bord vide en `border-input`, `foreground/30`, `foreground/25`, `border-border`, `input/60`. |
| Bouton radio | **4** | 16, 18, 20 px ; bord `input`, `input/60`, `foreground/30`. |
| Contrôle segmenté | **5** | `p-1` + items `h-9 px-4` (biens), `p-0.5 h-9` (argent, commissions), `p-0.5` + `h-8`/`h-10` `text-[13px]` (rapports), `h-13 p-1 text-[15px]` (pipeline tél.), `rounded-full p-1 h-10` (entrée). |
| Champ de recherche | **4** | `h-11 rounded-lg` `text-[15px]` (argent, biens, documents, équipe), `h-9 w-64 text-sm` (fil commercial, visites), `rounded-full` h-11/h-9 (messagerie). |
| Jauge | **4** | `h-1`, `h-1.5`, `h-2` ; rail `muted` ou `border`. |
| Avatar | **12 tailles** | 36 (15 p.), 40 (12), 44 (12), 32 (8), 48 (6), 28 (5), 52, 34, 64, 20, 72, 56. |

Il faut une spécification **une** par primitive, choisie par le porteur (D5). Je donne en § 6 la
valeur majoritaire comme recommandation.

### 2.5 Ce qui change d'aspect entre 90 % et 100 %, et les cibles tactiles à rem 16

**Base de mesure.** Toutes les valeurs téléphone de ce rapport sont à **rem = 16** : relevées au
navigateur dans la vue « téléphone réel » de la visionneuse (`--device mobile`, 390 px, contrôlé
`getComputedStyle(html).fontSize = 16px`, largeur d'écran 390) sur 7 pages, et déduites des
classes (× 16) pour les autres — la concordance calcul/classes est exacte sur les 7 pages
(`h-11` → 44, `rounded-lg` → 10, `text-sm` → 14, `Statut h-6` → 24). Le produit au téléphone est
relevé à 390 px réels. Les valeurs « bureau » sont à 90 % des deux côtés.

**Composants à unités mêlées** — leur *proportion* change entre le cadre du bureau (90 %) et le vrai
téléphone (100 %) ; un composant tout-rem ne fait que rétrécir uniformément.

| Composant (maquette) | Parties en rem (×0,9 dans le cadre) | Parties en px (inchangées) | Effet dans le cadre à 90 % |
|---|---|---|---|
| Bouton petit | `h-8`, `px-3`, rayon | `text-[13px]` | texte trop gros pour sa boîte (13 px dans 28,8) |
| Bouton grand / CTA | `h-12`, `px-5` | `text-[15px]` (`[16px]` à l'entrée) | idem (15 px dans 43,2) |
| Champ, recherche, zone de texte | `h-11`, `px-3`, `min-h-*` en rem | `text-[15px]`, icône `size-[18px]`, `min-h-[76px]` | texte et icône plus gros que la boîte ; les `min-h-[Npx]` ne rétrécissent pas, les `h-11` si |
| Case à cocher, radio | icône `size-3.5`, point `size-2.5` | boîte `size-[18px]`, rayon `rounded-[5px]` / `[6px]` | coche rétrécie dans une boîte fixe |
| Avatar | — | tout (`style={{width,height,fontSize}}`) | ne rétrécit pas, ses voisins si : avatars **11 % trop gros** dans le cadre |
| Pastille de compte | `h-4 min-w-4 px-1` | `text-[10px]`, `ring-2` | chiffre déborde presque |
| Feuille du bas | poignée `h-1 w-8`, fermer `size-11`, `px-4` | titre `text-[17px]` | titre plus gros que la croix |
| Panneau droit (bureau seul) | `h-14`, `p-5` | `w-[480px]`, titre `text-[17px]` | sans objet au téléphone |
| Carte (en-tête) | `px-4 py-3`, rayon | titre `text-[15px]` | titre plus gros |
| Chiffre clé | `p-4`, valeur `text-2xl` | libellé `text-[13px]` | libellé presque aussi gros que la valeur réduite |
| Ligne de liste | `min-h-14`, `px-4`, `gap-3` | titre `text-[15px]`, détail `text-[13px]` | ligne plus tassée |
| Puce de filtre `sm`, segmenté « rapports » | `h-8`, `px-3` | `text-[13px]` | texte trop gros |
| Toutes | — | bordures `1px`, anneaux `ring-2` | bordures proportionnellement plus épaisses |

**Tout-rem (rétrécissent uniformément, proportions justes)** : Statut (`h-6 px-2 text-xs`), Puce de
filtre normale (`h-9 px-3.5 text-sm`), Bouton normal (`h-9`/`h-11`, `text-sm`), Onglets soulignés,
Contrôle segmenté majoritaire, Interrupteur, Jauge, État vide.

Côté produit, l'inverse existe aussi : `Button size="sm"` écrit `text-[0.8rem]` (rem) là où la
maquette écrit `text-[13px]` (px) : au téléphone 12,8 contre 13, **au bureau 11,52 contre 13**.

**Cibles tactiles, à rem 16.** ⚠ La charte n'écrit **aucune** règle générale de 44 px (seule
mention : la pastille « Comparer » du site public, `design-guidelines.md:247`). La règle du produit
est celle des **planchers** de `button.tsx:17-26` / `globals.css:759-764` : **40 px** (`default`,
`lg`, `icon`, `Input`, `SelectTrigger`), **36 px** (`sm`, `icon-sm`, `SelectTrigger size="sm"`),
**34 px** (déclencheur d'onglet), `xs` sans plancher. Mesuré au téléphone : bouton 40, `sm` 36,
champ 40, onglet 34, menu « ⋯ » 32-36, et **sélecteur `size="sm"` « 20 / page » à 32 px** sur `/app/customers`, `/app/payments`, `/app/properties` alors qu'il porte `plancher-tactile-9` (36) — le plancher n'y tient pas ; cause non établie (classe relevée tronquée), à vérifier.

| Cible (maquette, rem 16) | Taille | ≥ 44 ? | Produit (plancher) |
|---|---|---|---|
| Bouton courant, champ | 44 | oui | 40 |
| CTA de barre collante | 48 | oui | 44 (`lg`) |
| Bouton icône d'en-tête | 40 (`size-10`), cible 44 pour ← / ✕ / ⋯ (`size-11`) | non / oui | 40 |
| Bouton icône rond (appeler, filtres) | 44 (`size-11`) | oui | 40-44 |
| Puce de filtre | **36** | **non** | — (D6) |
| Petit bouton | **32** | **non** | 36 |
| Item de contrôle segmenté | 36 dans une piste de 44 | non (la piste oui) | 34 dans 40 |
| Case, radio, interrupteur | 18-28 visibles ; la ligne qui les porte fait 44-56 | oui par la ligne | natif 16 |
| Onglet souligné | ≈ 32 (texte 20 + `pb-3`) | **non** | 34 |
| Ligne de liste | 56 (`min-h-14`) | oui | — |

Si le porteur veut une règle de 44 px, elle n'existe pas encore dans le produit : c'est à écrire
(charte + planchers à 44) et ce serait plus strict que les maquettes elles-mêmes (puces, petits
boutons, onglets). À joindre à D1/D6.

---

## 3. Primitives, par visibilité — tableau d'écart

Légende des verdicts : **(i)** équivalent exact · **(ii)** variante ou taille de plus ·
**(iii)** composant neuf · **(iv)** la maquette dévie de la charte → porteur. Effort : S/M/L.

### 3.1 Au premier coup d'œil (toutes les pages)

#### Bouton — 33 p., 61 t.

Maquette : `chrome-app.tsx:347` (`Bouton`, 710 occurrences dans les fichiers, toutes approches confondues) + boutons écrits à la main. Produit :
`ui/button.tsx:31-63`.

| Propriété | Maquette | Produit | Écart | Verdict |
|---|---|---|---|---|
| Hauteur courante, tél. | **44** (`h-11`, `px-3.5`, `text-sm` 500) | 40 (`default`) | **−4 px** | (ii) + D1 |
| Hauteur courante, bureau | **36 CSS / 32,4 rendu** (`h-9 px-3.5 text-sm`) | 40 / 36 | **+3,6 px rendu** | (ii) + D1 |
| Petit (bureau) | `h-8 px-3 text-[13px]` 500, `rounded-lg` (10 px) | `sm` : `h-8 px-2.5 text-[0.8rem]` (12,8 → **11,52 px** rendu), rayon **8 px** | texte **−1,5 px**, padding −2 px, rayon −2 px | (ii) |
| Petit (tél.) | `h-8` = 32 (rare) | plancher **36** (`plancher-tactile-9`) | +4 | conserver le plancher |
| Grand / action principale | `h-12 px-5 text-[15px]` 500 (CTA de barre collante, formulaires) | `lg` `h-11 px-4 text-sm` | **−4 px**, texte −1 px | (ii) taille `xl` |
| Rayon | `rounded-lg` 10 px (9 rendu bureau) | `rounded-lg` | 0 | (i) |
| Contour (« contour ») | `border-border bg-card` (#fff) | `outline` : `border-border bg-background` (#fcf9f3) | fond blanc vs lin | (ii) |
| Discret | `text-foreground/80`, sans fond | `ghost` : `text-foreground` | encre 80 % | (i) à un détail près |
| Doux (« Confirmer », « Modérer ») | `bg-secondary text-primary-deep font-semibold` | `secondary` : `bg-secondary text-secondary-foreground` (#1f1812) 500 | encre terracotta foncé vs noire, 600 vs 500 | (ii) |
| Sombre (« Faire », « Réessayer ») — 16 p. bureau, 7 p. tél. | `bg-foreground text-background` | **absent** | — | **(iv)** : la charte dit « un seul style de bouton principal » (`design-guidelines.md:13,261`) |
| Danger | `border border-destructive/30 bg-destructive/10 text-destructive` | `destructive` : sans bordure (`border-transparent`) | bordure 1 px `/30` en plus | (ii) |
| Entrée : CTA `rounded-full h-12 text-[16px] font-semibold px-6` (3 p.), `h-12 rounded-xl` (4 p.) | — | — | rayon pilule | **(iv)** : charte « `rounded-lg` pour les boutons » (l. 259) |
| Focus | aucun dessiné | anneau plein 3 px `ring-ring` + bord `ring` | — | garder (TCK-753) |
| Pression | — | `active:scale-[0.96]` | — | garder |

#### Champ de saisie, sélecteur, zone de texte — 32 p., 60 t.

Maquette : `chrome-app.tsx:734` (`Champ`), `ListeDeroulante` / `Selecteur` locaux (biens:203,
baux:177, argent-pieces:164, rapports-pieces:448, équipe:357…), `ZoneTexte` (réservations-pièces:305).
Produit : `ui/input.tsx:20`, `ui/select.tsx:55`, `ui/textarea.tsx:10`, `field-density.ts`.

| Propriété | Maquette | Produit (mesuré) | Écart | Verdict |
|---|---|---|---|---|
| Hauteur tél. | **44** (`h-11`) | **40** (`/app/customers/new` : aucune portée `data-field-density`) | −4 | (ii) + D1 |
| Hauteur bureau | formulaires **h-11** (39,6 rendu) ; filtres **h-9** (32,4) | h-10 (36) | +3,6 / −3,6 | (ii) + D1 |
| Contour | `border-border` #ebe5d5 (1,26:1) | `border-input` #918672 (3,59:1) | **contour nettement plus sombre** | **(iv)** — TCK-753 |
| Fond | `bg-card` (#fff) | `bg-transparent` (laisse voir #fcf9f3) | blanc vs lin | (ii) |
| Texte tél. | `text-[15px]` (16 px sur l'entrée) | `text-base` 16 px (anti-zoom iOS) | +1 px | garder 16 (comportement) |
| Texte bureau | `text-sm` / `text-[15px]` | `md:text-sm` | 0 / −2,4 | (ii) selon D1 |
| Padding x | `px-3` (12) ; entrée `px-3.5` | `px-3` | 0 | (i) |
| Sélecteur : graisse | `font-medium` (filtres) | `font-normal` | 500 vs 400 | (ii) |
| Sélecteur : chevron | `ChevronDown size-4 text-muted-foreground` | idem | 0 | (i) |
| Zone de texte | `min-h-[76px]` / `[88px]` / `[112px]`, `py-2.5`, `text-[15px]` `leading-snug` | `min-h-16` (64), `py-2` | +12 à +48 px de haut | (ii) (le `min-h` d'appelant est permis) |
| Focus | `border-primary ring-[3px] ring-primary/15` (entrée-connexion) | `border-ring ring-3 ring-ring` | halo pâle vs anneau plein | **(iv)** — TCK-753 |
| Erreur | `border-destructive`, texte `text-xs text-destructive` dessous | `aria-invalid:border-destructive ring-3 ring-destructive/20` | anneau en plus | (i) acceptable |
| Préfixe téléphone (`+221` séparé par `border-r`) | `clients-fiche.tsx:544`, entrée-connexion | `ui/phone-input.tsx` existe | à mesurer au cas par cas | (ii) |
| Code OTP (6 cases `h-14 rounded-lg text-[26px] font-semibold`, `border-input/60`) | entrée-connexion, entrée-invitation | `auth/TotpEnrollment` local | — | (iii) petit, 2 p. |

#### Pastille de statut — 26 p., 54 t.

Maquette : `chrome-app.tsx:626` (`Statut`). Produit : `console/StatusBadge.tsx:132-167` sur
`ui/badge.tsx:8`.

| Propriété | Maquette | Produit (mesuré) | Écart | Verdict |
|---|---|---|---|---|
| Hauteur | **24** (`h-6`) — 21,6 rendu bureau | **22** au tél. (16 + 2×2 + bord transparent 2×1), 20 au bureau | **−2 px** | (ii) |
| Padding x, texte | `px-2`, `text-xs` 500 | `px-2`, `text-xs` 500 | 0 | (i) |
| Rayon | `rounded-full` | `rounded-4xl` (26 px) → pilule | 0 visuel | (i) |
| Ton succès | `bg-success/15 text-success` | `bg-success/10` | aplat +5 pts | **(iv)** TCK-450 |
| Ton attention | `bg-warning/20 text-foreground` | `bg-warning/12 text-warning` | **encre noire vs ocre** — très visible | **(iv)** |
| Ton danger | `bg-destructive/12` | `/10` | +2 pts | (iv) |
| Ton info | `bg-accent/15 text-accent` (sauge) | `bg-info/10 text-info` (bleu ardoise) | **teinte différente** | **(iv)** — « `--accent` … rien d'autre » |
| Ton neutre | `bg-muted text-foreground/75` | `bg-muted text-muted-foreground` | encre 7,05:1 vs 4,85:1 | (ii) |
| Ton « primaire » (« Nouvelle », « Aujourd'hui ») | `bg-secondary text-primary-deep` (6,72:1) | **absent** | — | (ii) |
| Petite pastille h-5 `text-[11px]` (identité, documents) | 1-2 p. | — | — | rabattre sur h-6 (D5) |

#### Carte — 33 p., 61 t.

Maquette : `chrome-app.tsx:695` (`Carte` : `rounded-xl border border-border bg-card`, en-tête
`px-4 py-3 border-b`, titre `text-[15px] font-semibold`, action `text-sm font-medium text-primary`).
Produit : `ui/card.tsx:15` + 80 fichiers qui écrivent `border border-border` à la main et 42 qui
écrivent `ring-1 ring-border`.

| Propriété | Maquette | Produit | Écart | Verdict |
|---|---|---|---|---|
| Trait | `border` 1 px **#ebe5d5** (dans la boîte) | `<Card>` : `ring-1 ring-foreground/10` (≈ #e9e8e7, gris froid, **hors** boîte) | teinte chaude vs grise ; +1 px de chaque côté | (ii) |
| Rayon | `rounded-xl` 14 (12,6 rendu) ; `rounded-2xl` sur 5 p. | `rounded-xl` | 0 | (i) |
| Padding | `p-4` (16 p.), `p-3.5`, `p-5`, `p-3` ; en-tête `px-4 py-3` | `py-4` + `px-4` sur les enfants, `gap-4` | selon cas | (ii) slot d'en-tête à bordure |
| Titre | `text-[15px] font-semibold` (DM Sans) | `CardTitle` : `font-heading text-base font-medium` (Bricolage) | police, 15 vs 16, 600 vs 500 | (ii) |
| Chiffre clé (`Chiffre`, 10 p.) | libellé `text-[13px] text-muted-foreground`, valeur `font-display text-2xl semibold` | `StatCard` : libellé **`text-xs uppercase tracking-[0.12em]`**, valeur `text-lg→2xl` selon conteneur | capitales vs bas-de-casse | (ii) variante de `StatCard` |

#### Onglets soulignés — 15 p., 31 t.

Maquette : `chrome-app.tsx:377` (`gap-6`, `pb-3`, `text-sm` 500, actif `text-foreground` +
soulignement **2 px `bg-primary`** à `-bottom-px` sur le `border-b border-border` du conteneur,
inactif `text-muted-foreground`, compte `ml-1.5 text-xs`). Produit : `ui/tabs.tsx:33,93-96`,
`variant="line"`.

| Propriété | Maquette | Produit | Écart | Verdict |
|---|---|---|---|---|
| Couleur du soulignement | **terracotta** (`primary`) | **noir** (`after:bg-foreground`) | très visible | (ii) |
| Position | sur le filet du conteneur (`-bottom-px`) | `bottom-[-5px]`, aucun filet de conteneur | 4 px plus bas, pas de filet | (ii) |
| Inactif | `text-muted-foreground` (4,85:1 sur muted) | `text-foreground/70` (mesures TCK-359) | plus pâle | (ii) — mesure de contraste à refaire |
| Espacement | `gap-6`, aucun padding x | `gap-1`, `px-1.5`, `flex-1` | — | (ii) |
| Hauteur tél. | ≈ 20 + 12 de `pb-3` = 32 | plancher 40/34 | — | garder le plancher (cible) |

#### Puce de filtre — 27 p., 53 t. — **(iii) composant neuf**

Maquette : `chrome-app.tsx:646` (`PucesFiltres`), `kit.tsx:144` (`Pastille`), `Choix` locaux.
Produit : **aucune primitive** (`ChoiceChips` du parcours de publication, puces locales du site
public). Mesuré produit `/app/properties` : puces de comptage `min-h-10 rounded-full px-4` locales.

| Propriété | Maquette (dominant) |
|---|---|
| Hauteur | **h-9 = 36** (20 p., tél.), h-8 `text-[13px] px-3` (bureau, 5 p.), h-11 `px-4` (choix de formulaire, 4 p.) |
| Forme | `rounded-full border px-3.5 text-sm font-medium gap-1.5 whitespace-nowrap` |
| Repos | `border-border bg-card text-foreground` ; compte `tabular-nums text-muted-foreground` |
| Actif | **`border-foreground bg-foreground text-background`** ; compte `text-background/70` |
| Rangée | `flex gap-2 overflow-x-auto px-4 py-2.5`, sans barre |
| Variante « ajouter » | `border-dashed` |

⚠ Cible tactile : 36 px au téléphone, sous les 40 des planchers du produit et les 44 de la règle
annoncée. À trancher (D6).

### 3.2 Très visibles, sur une partie des pages

#### Avatar — 22 p., 43 t.

Maquette : `chrome-app.tsx:721` (`Avatar` : `rounded-full bg-secondary font-semibold
text-primary-deep`, taille en `style`, police = 0,36 × taille). Produit : `ui/avatar.tsx:20,49`
(`size-8`, `sm` 24, `lg` 40 ; repli `bg-muted text-sm text-muted-foreground` 400 ; anneau
`after:border-border`). Mesuré `/app/agency/team` : 36 px tél. (surcharge d'appelant), repli
`bg-muted`, 14 px, 400.

| Écart | Verdict |
|---|---|
| Couleur du repli : `secondary` + `primary-deep` 600 (maquette) vs `muted` + `muted-foreground` 400 | (ii) |
| Tailles : 12 dans la maquette (36, 40, 44, 32, 48, 28 = 97 % des usages) ; 3 dans le produit (24/32/40) | (ii) + D5 |
| Variante `accent/15 text-accent` (l'utilisateur lui-même, 18 usages) | **(iv)** — `--accent` réservé aux *featured* |
| Taille de police proportionnelle (0,36 ×) vs `text-sm` fixe | (ii) |

#### Feuille du bas — 15 p., 33 t. — **(iii) composant neuf** (sur `ui/sheet` `side="bottom"`)

Maquette : `chrome-app.tsx:575`. Produit : `ui/sheet.tsx:99-110` ne fournit qu'un panneau nu
(`inset-x-0 max-h-[90dvh] bg-card`, **rayon 0**, ni poignée, ni en-tête, ni bouton fermer) ; les
7 feuilles existantes le complètent chacune à leur façon (`rounded-t-2xl` ×3, `rounded-t-3xl` ×3).

| Partie | Maquette | Produit |
|---|---|---|
| Voile | `bg-foreground/35` (#1f1812 à 35 %) | `bg-scrim/30` (noir 30 %) |
| Panneau | `rounded-t-2xl` (18 px), `bg-card`, `shadow-2xl`, `max-h-[90%]` | rayon 0, ombre `0 0 40px foreground/4%` |
| Poignée | `mx-auto mt-2 h-1 w-8 rounded-full bg-border` (32 × 4) | absente |
| En-tête | `py-1 pl-4 pr-1`, titre `text-[17px] font-semibold truncate`, fermer `size-11` + `X size-5` | `SheetTitle` `text-base font-semibold`, rien d'autre |
| Corps | `px-4 pb-4`, défile | — |
| Pied | `border-t border-border px-4 py-3` (action collante) | — |

`shadow-2xl` : la charte l'exclut « sur un élément courant » (l. 260) — (iv) mineur, garder l'ombre
du produit.

#### Barre d'action collante (bas d'écran) — 20 p., 38 t. — (iii) petit

`chrome-app.tsx:433` : `flex-none border-t border-border bg-card px-4 py-3`
`shadow-[0_-6px_16px_-12px_color-mix(in_oklab,var(--shadow-color)_40%,transparent)]`, contenant
le bouton `h-12`. Pas de primitive produit (barres locales, ex. `WizardShell`). À créer avec la
taille `xl` du bouton et la zone sûre (`env(safe-area-inset-bottom)`, absente de la maquette).

#### Panneau latéral droit (bureau) — 10 p., 21 t. — (ii) sur `ui/sheet` `side="right"`

Maquette `chrome-app.tsx:594` : **480 px**, sans voile, `border-l border-border`, ombre
`-24px 0 48px -32px shadow-color/45`, en-tête `h-14 border-b pl-5 pr-2` titre `text-[17px]
font-semibold` + fermer `size-9` ; corps `p-5` ; pied `flex justify-end gap-2 border-t px-5 py-3`.
Produit : `w-72` (288 px), voile `scrim/30`, ni en-tête ni pied. Écart de largeur **+192 px**.

#### Contrôle segmenté — 13 p., 30 t. — (ii) sur `ui/tabs` (variante `default`) ou (iii)

Produit mesuré (`/app/agency/team`, `bookings`, `payments`, `visits`) : liste `p-[3px] bg-muted
rounded-lg`, **h 28,8 rendu bureau / 40 tél.** (plancher), déclencheur `px-1.5 py-0.5 rounded-md
text-sm` 500, actif `bg-background` (#fcf9f3) `shadow-sm`, inactif `text-foreground/70`.
Maquette (majoritaire, 4 p.) : `rounded-lg bg-muted p-1`, items `h-9 px-4 rounded-md text-sm`
500, actif **`bg-card`** (#fff) + `shadow-[0_1px_2px_shadow-color/18%]`, inactif
`text-muted-foreground`. Écarts : hauteur tél. 44 vs 40, padding 4 vs 3, `px-4` vs `px-1.5`,
fond actif blanc vs lin. Cinq variantes dans les maquettes (§ 2.4) → D5.

#### Tableau (bureau) — 12 p., 24 t. — (ii) sur `console/DataTable`

| | Maquette (16 fichiers `<table>`) | Produit (`DataTable.tsx:262`, mesuré) |
|---|---|---|
| En-tête | `text-xs font-medium text-muted-foreground`, **bas-de-casse**, `bg-muted/40`, `px-3 py-2.5`, `border-b` | **`uppercase tracking-wide font-semibold`**, `bg-muted/70` collant + flou |
| Ligne | `border-b border-border`, cellules `px-3 py-3` | `border-b`, hauteur mesurée 39-55 px |
| Conteneur | carte `rounded-xl border` | `rounded-xl bg-card ring-1 ring-border` |

Capitales vs bas-de-casse : très visible sur chaque tableau.

### 3.3 Contrôles de formulaire et de réglage

| Primitive | Pages / tickets | Maquette (valeur majoritaire) | Produit | Verdict |
|---|---|---|---|---|
| **Case à cocher** | 10 p. / 26 t. | 18 px `rounded-[5px] border`, cochée `border-primary bg-primary` + `Check size-3.5 strokeWidth 2.5` ; 20 px `rounded-md` en formulaire ; état « mixte » (`Minus`) dans les listes à sélection | **`<input type=checkbox>` natif** `size-4 accent-primary` (44 fichiers) — dessin du navigateur | **(iii)** (`@base-ui/react/checkbox`) |
| **Bouton radio** | 8 p. / 16 t. | 18 ou 20 px `rounded-full border`, point `size-2.5 bg-primary` | `ChoiceCard` : 18 px **`border-2`**, point `size-2` ; ailleurs natif | (ii) |
| **Carte de choix** (radio en carte) | entrée-orientation, crédits, équipe… | `min-h-[64px] rounded-xl border bg-card px-3.5 py-3 items-center`, actif **`border-primary ring-[3px] ring-primary/12`** (fond blanc), titre `text-[15px] font-semibold`, sous-titre `text-[13px]` | `choice-card.tsx:64,84` : `p-4 items-start`, actif **`bg-primary/[0.06]`** sans halo, titre 500 | (ii) |
| **Interrupteur** | 9 p. / 16 t. | 24 × 40 (`h-6 w-10 p-0.5`, pouce `size-5 bg-card shadow-sm`) **ou** 28 × 48 ; allumé `bg-primary`, éteint `foreground/20` (1,52:1) ou `border` (1,26:1) | **aucun** : 6 `<input type=checkbox role=switch>` natifs (16 px) | **(iii)** + D5 |
| **Jauge** | 10 p. / 26 t. | rail `h-1.5` ou `h-2` `rounded-full bg-muted`, remplissage `bg-primary` / `success` / `warning` ; segments d'étapes `h-1 gap-1.5` | 3 barres locales (`WizardShell:191`, `WizardReprenable:402`, `MiseEnService:105` : `h-1.5 bg-muted` + `bg-primary`) | **(iii)** |
| **Champ de recherche** | 6+ p. | `h-11` (tél.) / `h-9` (bureau) `rounded-lg border-border bg-card px-3 gap-2`, icône `Search size-[18px] strokeWidth 1.75`, effacer `X size-4` | `DebouncedSearchInput` : `Input` + icône `size-4` à `left-3`, `pl-9` | (ii) |

### 3.4 Retours d'état

| Primitive | Pages / tickets | Maquette | Produit | Verdict |
|---|---|---|---|---|
| **État vide** | 6 p. / 9 t. | `chrome-app.tsx:666` : **sans carte**, `px-6 py-12`, disque **`size-12` (48) `bg-muted text-muted-foreground`**, titre `text-base font-semibold` (DM Sans), texte `text-sm max-w-xs`, action `mt-5` | `EmptyState.tsx:55,61` : **carte pointillée** `rounded-xl border-dashed bg-card p-10`, disque `p-4` (≈ 56) **`text-accent`**, titre `font-display` | (ii) variante « nue » — un état vide local est interdit (`check-feedback-states.mjs`) |
| **Bandeau d'avertissement** | 10 p. / 17 t. | `rounded-xl border border-warning/30 bg-warning/10 p-4`, **encre `foreground`**, titre semibold + texte | `warning-banner.tsx:53` : `ring-1 ring-warning/20 px-4 py-3 text-sm` **encre `text-warning`** | (ii) |
| **Toast** | 2 p. / 3 t. | **sombre** `bg-foreground text-background rounded-xl h-12 px-4 shadow-lg`, **en bas** (au-dessus de la barre d'onglets : `bottom-20` ; bureau `bottom-6 right-6 w-[360px]`), action « Annuler » | `toast.tsx:124,134` : **clair** (`bg-popover` ou aplat sémantique), **en haut à droite**, `p-4 pr-10 border` | **(iv)** — changement de comportement global |
| **Squelette** | 6 p. / 11 t. | `animate-pulse bg-muted`, lignes `h-3 rounded` (4 px), vignettes `size-11 rounded-lg` | `skeleton.tsx` : `animate-pulse rounded-md bg-muted` | (i) — rayon passé en `className` |
| **Pastille de compte** (sur une icône) | 28 p. / 50 t. | `h-4 min-w-4 px-1 rounded-full bg-primary text-[10px] font-semibold ring-2 ring-card` ; compteur de menu `h-5 min-w-5 text-[11px]` | locales à la coque (`pastille-onglet`) | relève de la coque (rapport voisin) |

### 3.5 En-tête de page (console)

`console/PageHeader.tsx:60` : `h1 font-display text-2xl **font-bold tracking-tight**` (700,
−0,025 em) — mesuré sur 14 pages. Maquette (`chrome-app.tsx:300`, 33 p. au bureau) :
`text-2xl **font-semibold** tracking-[-0.02em]` (600). Sous-titre `mt-1 text-sm
text-muted-foreground` identique ; fil d'Ariane `text-[13px]` absent du produit ; `px-8 pt-8`,
onglets/filtres `mt-5`. **Écart de graisse visible sur chaque page de bureau** → (ii), S.
(L'en-tête téléphone, 56 px, relève de la coque.)

---

## 4. Ce que la maquette ne dessine pas et qui changera le rendu (pièges de comportement)

| Piège | Effet sur l'écran réel | Décision |
|---|---|---|
| **Anneau de focus** : le produit pose `ring-3 ring-ring` plein sur `:focus-visible`. Un `<input>` y répond **même au toucher**. | Au téléphone, taper dans un champ l'entoure d'un anneau terracotta de 3 px que la maquette ne montre pas (elle dessine `ring-primary/15`). | D2 (TCK-753) |
| **Planchers tactiles** (`plancher-tactile-9/10`, `globals.css:748-767`) sous `sm` : `sm` → 36, `default`/`lg`/`icon` → 40. | Un bouton `h-8` ou une puce `h-9` de la maquette rendra 36/40 au téléphone. | D1 / D6 |
| **`field-density`** : 44 px seulement sous `fieldDensityScope()`. Aucune page `/app` ne la pose (mesuré : `/app/customers/new` → 0 portée, champs à 40). | Tous les formulaires `/app` seront à 40, la maquette à 44. | D1 |
| **Texte de champ ≥ 16 px au téléphone** (`input.tsx:15-18`, anti-zoom iOS). | La maquette (15 px) ne peut pas être suivie au pixel. | non négociable |
| **`active:scale-[0.96]`** du bouton | aucun effet statique | — |
| **Désactivé** : produit `opacity-50` ; maquette n'en dessine quasi aucun (1 cas `bg-primary/10`). | À spécifier, sinon l'implémenteur garde 50 %. | à écrire dans la spec |
| **Troncature** : la maquette tronque (`truncate`) titres d'en-tête, libellés de feuille, puces (`whitespace-nowrap`) ; `PageHeader` du produit fait `text-balance` (retour à la ligne). | Titres longs sur 2 lignes en vrai, 1 ligne tronquée en maquette. | à aligner |
| **Contrastes des contrôles non textuels** (WCAG 1.4.11, 3:1) | case vide `foreground/30` 1,93:1, `border` 1,26:1, `input/60` 2,01:1 ; interrupteur éteint `foreground/20` 1,52:1. Tout passe sous 3:1. | D2 |
| **Bord vs anneau** : la maquette trace des `border` (dans la boîte), le produit souvent des `ring-1` (hors boîte, `DataTable`, `FilterBar`, `Card`). | ±1 px par côté, et teinte différente pour `ring-foreground/10`. | (ii) Carte |
| **Épaisseur des icônes** : 462 icônes à `strokeWidth={1.75}` et 152 à `1.5` dans les maquettes ; le produit garde le défaut 2 presque partout. | Icônes plus grasses dans le produit (champ de recherche, en-têtes, listes). | à fixer par primitive (§ 6) |

---

## 5. Où la maquette sort de la charte (catégorie 2, au porteur)

| # | Écart | Pages | Référence charte |
|---|---|---|---|
| a | Contours de champ et de case en `border-border` (1,26:1) | 32 | TCK-753, WCAG 1.4.11 |
| b | Halo de focus `ring-primary/15` au lieu de l'anneau plein | entrée | TCK-753 |
| c | Aplats de statut 15-20 %, ton info en `--accent`, encre `foreground` sur l'avertissement | 26 | TCK-450, charte l. 66-101 |
| d | Bouton sombre `bg-foreground` comme 2ᵉ bouton plein | 16 (bureau) | charte l. 13, 261 |
| e | Boutons pilule `rounded-full` / `rounded-xl` dans l'entrée | 3-4 | charte l. 259 |
| f | Avatar en `accent/15 text-accent` | 18 usages | charte l. 68-69 |
| g | `shadow-2xl` sur la feuille du bas | 15 | charte l. 260 |
| h | Toast sombre en bas d'écran (le produit : clair, en haut à droite) | 2 | comportement global |
| i | Texte de champ à 15 px au téléphone | 20 | anti-zoom iOS |

---

## 6. Synthèse — composants à créer ou étendre AVANT les tickets

Ordre = dépendance × visibilité. Chaque spécification reprend la **valeur majoritaire** des
maquettes retenues ; une case « D » renvoie à une décision du § 7 qui peut la changer.

| # | Composant | Nature | Spécification (CSS, tél. → bureau) | Pages | Tickets | Effort |
|---|---|---|---|---|---|---|
| 1 | **Échelle de densité `/app`** (étendre `field-density.ts` au `Button`, poser la portée sur la coque `/app`) | (ii) + ADR (révise TCK-2460) — D1 | Contrôle courant **h-11 → md:h-9**, `px-3.5`, `text-sm` (bouton) / `text-base → md:text-sm` (champ) ; action principale **h-12**, `px-5`, `text-[15px]` ; petit **h-8 px-3 text-[13px] rounded-lg** ; icône **size-11 → md:size-9** | 33 | 61 | M |
| 2 | **Button** : variantes | (ii) | `outline` → `bg-card` ; `secondary` → `text-primary-deep font-semibold` ; `destructive` → `border-destructive/30` ; taille `xl` (h-12) ; `sm` → `px-3 text-[13px] rounded-lg gap-1.5` ; (D4) variante `sombre` | 33 | 61 | S |
| 3 | **Input / SelectTrigger / Textarea / DatePicker** | (ii) | fond `bg-card` ; `SelectTrigger` « filtre » `font-medium` ; `Textarea` `py-2.5 leading-snug` ; contour et focus selon **D2** | 32 | 60 | S |
| 4 | **StatusBadge** | (ii) + D3 | `h-6` (24), `px-2`, `text-xs` 500, `gap-1`, pilule ; tons : `neutral` `text-foreground/75` ; + ton `primary` (`bg-secondary text-primary-deep`) ; aplats selon D3 | 26 | 54 | S |
| 5 | **Card** | (ii) | `rounded-xl border border-border bg-card` (au lieu de `ring-1 ring-foreground/10`), `CardHeader` à filet `px-4 py-3 border-b`, `CardTitle` `text-[15px] font-semibold` (sans), action `text-sm font-medium text-primary` | 33 | 61 | S |
| 6 | **Puce de filtre** (`FilterChip` + rangée défilante) | **(iii)** | `h-9 rounded-full border px-3.5 text-sm font-medium gap-1.5` ; repos `border-border bg-card` ; actif `border-foreground bg-foreground text-background`, compte `/70` ; taille `sm` `h-8 px-3 text-[13px]` ; `aria-pressed` ; rangée `gap-2 px-4 py-2.5 overflow-x-auto` sans barre ; cible selon D6 | 27 | 53 | M |
| 7 | **Avatar** | (ii) + D5 | repli `bg-secondary text-primary-deep font-semibold`, police 0,36 × taille ; tailles 28 / 32 / 36 / 40 / 44 / 48 | 22 | 43 | S |
| 8 | **Tabs `variant="line"`** | (ii) | `gap-6`, sans `px`, `pb-3`, `text-sm` 500 ; actif `text-foreground` + trait **2 px `bg-primary`** à `-bottom-px` ; filet de liste `border-b border-border` ; inactif `text-muted-foreground` (re-mesurer TCK-359) ; compte `ml-1.5 text-xs text-muted-foreground` | 15 | 31 | S |
| 9 | **Feuille du bas** (`FeuilleDuBas` sur `Sheet side="bottom"`) | **(iii)** | voile `foreground/35` (ou garder `scrim/30`, D7) ; `rounded-t-2xl bg-card max-h-[90dvh]` ; poignée 32 × 4 `bg-border mt-2` ; en-tête `py-1 pl-4 pr-1`, titre `text-[17px] font-semibold truncate`, fermer 44 px `X size-5` ; corps `px-4 pb-4` ; pied `border-t px-4 py-3` + zone sûre | 15 | 33 | M |
| 10 | **Barre d'action collante** | **(iii)** | `border-t border-border bg-card px-4 py-3`, ombre `0 -6px 16px -12px shadow-color/40`, bouton `xl` plein largeur, `pb-[env(safe-area-inset-bottom)]` | 20 | 38 | S |
| 11 | **Contrôle segmenté** (`Tabs` `variant="segmented"` ou `ToggleGroup`) | (ii)/(iii) + D5 | `rounded-lg bg-muted p-1` ; item `h-9 px-4 rounded-md text-sm` 500 ; actif `bg-card shadow-[0_1px_2px_shadow-color/18%]`, inactif `text-muted-foreground` ; `plein` = `flex-1` ; `sm` = `p-0.5 h-8 px-3 text-[13px]` | 13 | 30 | S |
| 12 | **Case à cocher** (`@base-ui/react/checkbox`) | **(iii)** + D5 | 18 px, `rounded-[5px]`, bord `border-input` (D2), cochée `border-primary bg-primary text-primary-foreground`, `Check size-3.5 strokeWidth 2.5`, état `indeterminate` (`Minus`) ; cible 44 par le parent | 10 | 26 | S |
| 13 | **Jauge** (`Progress`) | **(iii)** | rail `h-1.5 rounded-full bg-muted overflow-hidden`, taille `lg` `h-2` ; remplissage `rounded-full` tons `primary`/`success`/`warning`/`neutral` (`foreground/50`) ; `role=progressbar` ; variante « segments » `h-1 gap-1.5` | 10 | 26 | S |
| 14 | **Panneau latéral** (`Sheet side="right"` taille `lg`) | (ii) | `w-[480px] border-l`, ombre `-24px 0 48px -32px shadow-color/45`, en-tête `h-14 border-b pl-5 pr-2` titre `text-[17px] font-semibold`, corps `p-5`, pied `flex justify-end gap-2 border-t px-5 py-3` ; voile : à trancher (maquette sans voile) | 10 | 21 | S |
| 15 | **DataTable** | (ii) | en-tête `text-xs font-medium text-muted-foreground` **sans capitales**, `bg-muted/40`, `px-3 py-2.5` ; cellules `px-3 py-3` | 12 | 24 | S |
| 16 | **WarningBanner** | (ii) | `rounded-xl border border-warning/30 bg-warning/10 p-4`, encre `foreground`, titre `font-semibold` (vérifier 4,5:1 — `foreground` sur `warning/10` > 13:1) | 10 | 17 | S |
| 17 | **Interrupteur** (`@base-ui/react/switch`) | **(iii)** + D5 | recommandé **24 × 40** (`h-6 w-10 p-0.5`, pouce `size-5 bg-card shadow-sm`), allumé `bg-primary`, éteint `bg-input` (3:1, D2) ; cible 44 par la ligne | 9 | 16 | S |
| 18 | **Bouton radio / ChoiceCard** | (ii) | radio 20 px `border` (1 px), point `size-2.5` ; carte : `min-h-16 rounded-xl border px-3.5 py-3 items-center`, actif `border-primary ring-[3px] ring-primary/12` fond blanc, titre `text-[15px] font-semibold`, sous-titre `text-[13px]` | 8 | 16 | S |
| 19 | **EmptyState** variante « nue » | (ii) | sans carte ni pointillé, `px-6 py-12`, disque `size-12 bg-muted text-muted-foreground`, titre `text-base font-semibold` (sans), texte `text-sm max-w-xs`, action `mt-5` | 6 | 9 | S |
| 20 | **StatCard** variante « chiffre » | (ii) | `rounded-xl border p-4` ; libellé `text-[13px] text-muted-foreground` (pas de capitales) ; valeur `font-display text-2xl font-semibold tabular-nums tracking-[-0.02em]` ; contexte `mt-1 text-xs` | 10 | — | S |
| 21 | **PageHeader** | (ii) | `h1` `font-semibold tracking-[-0.02em]` (au lieu de `font-bold tracking-tight`) ; fil d'Ariane `text-[13px] text-muted-foreground` séparateur `›` | 33 (bureau) | 61 | S |
| 22 | **Ligne de liste mobile** | **(iii)** | `flex min-h-14 items-center gap-3 px-4 py-2.5` (11 p.), filets `border-b border-border`, début = avatar 40 ou icône dans disque `size-9`, titre `text-[15px] font-medium`, détail `text-[13px] text-muted-foreground`, fin = statut / montant / chevron `size-4` | ≥ 11 | — | M |
| 23 | **Champ de recherche** | (ii) | icône `Search size-[18px] strokeWidth 1.75 text-muted-foreground`, `gap-2`, bouton effacer `X size-4` | 6+ | — | S |
| 24 | **Toast** variante sombre en bas | (ii) + D8 | `bg-foreground text-background rounded-xl min-h-12 px-4 shadow-lg`, position tél. au-dessus de la barre d'onglets, bureau `bottom-6`, action texte | 2 | 3 | S |

**Total** : ≈ 24 chantiers, dont 1 M structurant (n° 1, l'échelle), 4 M, le reste S. Ils
tiennent dans **2 à 3 tickets de préparation** : (A) échelle de densité + `Button`/champs + ADR
(n° 1-3) ; (B) primitives neuves (n° 6, 9-13, 17, 22) ; (C) alignement des existantes (n° 4, 5,
7, 8, 14-16, 18-21, 23-24). A d'abord : il conditionne l'écart le plus visible des 61 tickets.

**Garde à prévoir** : une page `playground` du produit qui rend chaque primitive à côté de sa
maquette, et un test de rendu qui lit les styles calculés (le même `getComputedStyle` que ce relevé)
— sans elle, la fidélité se re-perdra à la première primitive qui bouge.

---

## 7. Décisions à poser au porteur

1. **D1 — Échelle des hauteurs.** a) adopter l'échelle des maquettes dans `/app` par une portée de
   densité posée sur la coque (44/48 au téléphone, 36/32 au bureau), ADR qui amende TCK-2460 ;
   b) garder 40 partout et accepter ±4 px sur chaque bouton et champ ; c) changer le défaut global
   (site public compris). **Reco : a** — le mécanisme existe (`field-density.ts`), le site public ne
   bouge pas, la garde `check-champs-uniformes` reste vraie.
2. **D2 — Contours et focus des champs (TCK-753).** a) maintenir `border-input` (3,59:1) et l'anneau
   plein — l'écran réel aura des champs plus marqués que la maquette ; b) revenir au contour clair et
   au halo de la maquette (contre WCAG 1.4.11). **Reco : a**, et le dire dans chaque ticket.
3. **D3 — Aplats des pastilles (TCK-450).** a) garder 10/12 % et l'encre de son ton (`text-warning`),
   info en `--info` ; b) suivre la maquette. **Reco : a** ; ajouter seulement le ton `primary`
   (`secondary` + `primary-deep`, 6,72:1) et la hauteur 24.
4. **D4 — Bouton sombre** (`bg-foreground`, 16 pages). a) l'ajouter comme variante ; b) le rabattre
   sur `secondary` ou `outline`. **Reco : b** sauf usage précis (geste « Faire » des tâches ?) à
   nommer.
5. **D5 — Un gabarit par pièce** (interrupteur, case, radio, segmenté, recherche, jauge, avatar).
   **Reco** : interrupteur 24 × 40 ; case 18 px `rounded-[5px]` ; radio 20 px ; segmenté `p-1 h-9
   px-4` ; recherche `h-11`/`md:h-9` `rounded-lg` ; jauge `h-1.5` (`h-2` en grand) ; avatars
   28/32/36/40/44/48.
6. **D6 — Cible des puces de filtre** : a) 36 px (maquette) ; b) 40 (plancher du produit) ; c) 44
   (règle tactile). **Reco : b** (+4 px, visible mais faible) ou a avec zone tactile étendue par
   pseudo-élément (rendu 36, cible 44).
7. **D7 — Voile des feuilles** : `foreground/35` (brun, maquette) ou `scrim/30` (noir, produit).
   **Reco** : `scrim/30` (un seul voile au produit) — écart de teinte faible.
8. **D8 — Toast** : sombre en bas (maquette) ou clair en haut à droite (produit, partout).
   **Reco** : décider pour tout le produit, pas pour deux pages.
9. **D9 — Visionneuse** : juger la fidélité téléphone sur la vue « téléphone réel » (< 768 px) et
   non sur le cadre du bureau (§ 2.1).

---

## 8. Fichiers de travail

Dans `/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/3de0dbe2-6577-4dfc-90f8-6e771de7f201/scratchpad/fidelite/composants/` :

- `recolte-maquette.js`, `recolte-maquette-tel.js`, `recolte-produit.js` — scripts `--eval` de
  `capture.mjs` ; `focus.js` (tentative de focus, sans effet en headless).
- `maq/*.json` (33 pages, 204 écrans, bureau + téléphone à rem 14,4), `maqtel/*.json` (7 pages,
  téléphone réel à rem 16), `prod/*.json` (15 pages × 2 formats).
- `agreger.mjs`, `classes.mjs` (`node classes.mjs b|t bouton|champ|statut|puce|carte|icone`),
  `agreger-produit.mjs`, `dependances.mjs` (pages et tickets par composant).
- `synthese-maq-b.txt`, `synthese-prod.txt`, `pieces-locales.txt` (toutes les pièces redessinées
  localement : interrupteurs, cases, segmentés, jauges, recherches, sélecteurs, avec fichier:ligne),
  `tickets-pages.txt`, `dependances.txt`.

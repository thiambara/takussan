---
id: TCK-2685
title: "Fidélité au pixel : les jetons de la partie connectée (échelle de texte en rem calculés, icônes, ombres, encre douce, formats), la vitrine et la garde des valeurs arbitraires"
status: todo
phase: P1
family: front
estimate: M
wave: 91
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2692]
blocks: [TCK-2686, TCK-2687, TCK-2688, TCK-2689, TCK-2690, TCK-2691]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#15-transactions--paiements"
  models: []
tags: [front, design-system, jetons, audit-ux, app, fidelite]
---

## Objectif utilisateur

Dans `/app`, un texte, une icône, une ombre, un montant ou une date rendent la même taille, la même épaisseur, la même teinte et la même largeur que dans la maquette retenue — sans qu'aucune page n'écrive une valeur arbitraire pour y parvenir.

## Contrat de données

Aucun changement d'API.

- **Lit** : `src/app/globals.css` (jetons « Lin », `@theme`), `src/lib/format/useFormatteurs.ts` et `src/lib/format/currency.ts`, `src/components/layout/styles-de-la-barre.ts` (`ICONE_DE_LIGNE`, `TRAIT_D_ICONE`).
- **Produit** : des jetons nommés (classes sans crochets), des préréglages de format, une **portée `/app`**, une **vitrine** des primitives, une **garde** de dépôt.

## Direction UX / Artistique

> **Principe d'arbitrage (décidé par le porteur le 2026-11-10, [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md))** : la maquette retenue fait foi au pixel, sauf (1) une règle d'accessibilité mesurée, (2) une contrainte technique, (3) une incohérence interne des maquettes, tranchée par la valeur majoritaire. Mesure : téléphone 390 × 844 à `rem` 16, bureau 1440 × 900 à racine 16 et densité ×0,9 ([ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)) ; jamais une capture de la visionneuse. Valeurs : [annexe A](../../../qa/audit-ux-2026-11/fidelite/A-jetons.md) (§ 2, § 6, § 7, § 8).

**Ses propres exceptions** :

| Valeur de la maquette | Retenu | Motif |
|---|---|---|
| Encres `foreground/70`, `/75`, `/80`, `/85` (385 occ.) | une seule encre douce, **opaque**, équivalente à `foreground` 80 % | (3) incohérence, valeur majoritaire (`/80` : 137 occ.) ; et la règle TCK-658 (aucune encre de texte translucide neuve, cliquet de `encre-sans-alpha.contraste.test.ts`) |
| `tracking-[-0.01em]` (34), `[-0.03em]` (12) | rabattus sur le jeton −0,02 em | (3), écart ≤ 0,15 px par glyphe |
| `text-[30px]` (8), `text-[34px]` (8) | rabattus sur 28 et 32 | (3) |
| « 9 h 00 » (42 occ.) | « 09:00 » (431) | (3) |
| « 87% » collé (168) | « 87 % » à espace insécable | (2) le format sort d'`Intl` (`style: percent`, `fr`) |
| Montants écrits en dur avec des espaces ordinaires (274) | groupes en U+202F, insécables | (2) un montant ne se coupe jamais en fin de ligne |

### 1. L'échelle de texte en `rem` calculés

**L'unité est la décision** (amendé le 2026-11-10 par [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md), « voie 2 »). Depuis TCK-2692, la racine reste à 16 px à toute largeur, et la densité du bureau passe par les échelles du thème (`--spacing`, `--text-*`…), à ×0,9 dès `lg`. La maquette écrit ses tailles intermédiaires en px (59 % de son texte au téléphone, 35 % au bureau, A § 1b) et ne les réduit pas au bureau : **les jetons sont en `rem` calculés, hors de l'échelle ×0,9** (13 px = 0,8125rem, 15 px = 0,9375rem). Ils rendent la valeur de la maquette à toute largeur au réglage par défaut, et suivent le réglage de police de l'utilisateur. *La première forme de ce ticket les voulait en px, pour échapper à `html { font-size: 90% }`, que TCK-2692 retire.*

| Jeton (taille) | Occurrences dans les maquettes | Rôle typique (source) |
|---|---|---|
| 10 px | 15 (le produit en a 17) | chiffre d'une pastille de compte (`chrome-app.tsx`, B § 3.4) |
| 11 px | 115 | légende, libellé d'onglet du bas (`?p=app-coque&a=a`) |
| **13 px** | **1 125** | méta, détail de ligne, fil d'Ariane, libellé de chiffre clé (`?p=app-demandes&a=a`) |
| **15 px** | **621** | titre de ligne et de carte, texte de bouton d'action principale (`?p=app-biens&a=a`) |
| 16 px | 26 | action principale des écrans d'entrée (`?p=app-entree-connexion&a=a`) ; `text-base` ne convient pas : 14,4 px au bureau (échelle ×0,9) |
| 17 px | 48 | titre court d'en-tête de détail, titre de feuille et de panneau (`chrome-app.tsx`) |
| 22 px | 30 | titres d'écrans d'entrée, chiffres |
| 26 px | 17 | code à six chiffres, chiffres |
| 28 px | 20 (+ 8 en 30 px) | titres d'écrans d'entrée |
| 32 px | 9 (+ 8 en 34 px) | grands chiffres |
| 40 px | 9 | grands chiffres |

Rendu attendu, des deux côtés de 1024 px : **la même valeur** (13 px à 390 comme à 1440), écrite `0.8125rem`.

⚠ **L'interligne.** Un jeton `--text-*` de Tailwind 4 pose aussi un interligne (`--text-*--line-height`), là où `text-[13px]` n'en pose aucun et **hérite** celui du parent. Mesuré : 13 px → 19,5 px (1,5) quand le parent ne pose rien. Le jeton doit rendre l'interligne que la maquette rend, **y compris** sous un parent qui pose `leading-snug` ou `leading-tight` (332 et 279 occurrences) : à relever sur les références gelées avant de choisir.

### 2. L'espacement des lettres

| Jeton | Valeur | Remplace |
|---|---|---|
| titres | −0,02 em | `tracking-[-0.02em]` (144), et les rabattus ci-dessus |
| `tracking-tight` (existant) | −0,025 em | `tracking-[-0.025em]` (13), identique |
| sur-titre | 0,08 em | `tracking-[0.08em]` (14) |

### 3. Icônes

| | Téléphone (sous `md`) | Bureau (dès `md`) | Source |
|---|---|---|---|
| Trait par défaut des icônes lucide dans `/app` | **1,75** | **1,5** | A § 7 : 52 % des icônes du téléphone à 1,75 ; 49 % du bureau à 1,5 |
| Jeton de taille 18 px (1,125rem, hors de l'échelle ×0,9 : ne rétrécit pas au bureau) | 18 px | 18 px | `size-[18px]`, 234 occ. ; le produit l'écrit déjà (`ICONE_DE_LIGNE`) |

Le seuil est `md`, celui où la coque change (décision de la session, la maquette distinguant l'appareil et non une largeur). Un `strokeWidth` explicite (case cochée à 2,5) garde le sien. Le produit trace aujourd'hui 100 % de ses icônes de contenu à 2 (défaut lucide).

### 4. Ombres nommées (`in_srgb`, sur `--shadow-color`, charte)

| Ombre | Valeur | Usage (source) |
|---|---|---|
| barre collante | `0 -6px 16px -12px` à 40 % | barre d'action du bas (`chrome-app.tsx:433`) |
| filet bas | `0 1px 0` à 22 % | A § 8.2 (forme la plus rendue) |
| bouton sur photo | `0 2px 8px -2px` à 35 % | `BoutonSurPhoto` (`kit.tsx`) |
| item actif | `0 1px 2px` à 18 % | contrôle segmenté (B § 3.2) |
| panneau | `-24px 0 48px -32px` à 45 % | panneau latéral droit (`chrome-app.tsx:594`) |
| feuille | la valeur de `shadow-2xl` de Tailwind, nommée | feuille du bas (`chrome-app.tsx:575`) — la classe `shadow-2xl` reste interdite, la valeur ne l'est pas |

La maquette écrit 85 de ses 90 ombres en `in_oklab` : la couleur rendue en `in_srgb` doit rester dans ±3/255.

### 5. Encres

| Jeton | Valeur | Contraste à tenir |
|---|---|---|
| encre douce | équivalent **opaque** de `foreground` à 80 % sur `--card` | ≥ 4,5:1 sur `--card`, `--background`, `--muted` (A § 4 : 6,3 à 11:1) |
| encre douce inverse | équivalent opaque de `background` à 70 % sur `foreground` | ≥ 4,5:1 sur `--foreground` (compte d'une puce active, B § 3.1) |

### 6. Formats (`useFormatteurs`)

| Préréglage | Sortie attendue (`fr`) | Remplace (maquettes) |
|---|---|---|
| montant court | « 1 355 000 F » (groupes U+202F, « F » collé par une espace insécable) | 430 `fcfa()` + 274 en dur |
| montant abrégé | « 3,9 M F », « 350 k F » | 64 + 15 |
| jour et mois | « 4 nov. » pour une date de l'année en cours, « 4 déc. 2025 » sinon — décidé par le porteur le 2026-11-10 | 785 « 4 nov. », 140 « 4 déc. 2026 » |
| heure | « 09:00 » | 431 |
| pourcentage | « 87 % » (U+00A0) | 277 |

« F » plutôt que « F CFA » : la maquette fait foi (+40 % de largeur sinon, A § 6) — décidé par le porteur le 2026-11-10 (décision 2 a ; « F CFA » reste sur l'offre et l'abonnement, décision n° 14). Le montant long existant (« F CFA ») reste disponible.

### 7. La vitrine

Une page de `/‹langue›/playground` (versionnée, `noindex`, à côté du POC — **jamais** sous `playground/maquettes/`, exclu de git) qui rend, sous la portée `/app`, chaque jeton de ce ticket (échelle de texte, interlignes, icônes aux deux traits, ombres, encres, formats) puis, au fil des tickets TCK-2686 à TCK-2691, chaque primitive dans chacun de ses états. C'est l'écran que l'outil de TCK-2684 relève pour éprouver une primitive hors de toute donnée.

## Contraintes strictes (métier)

**Pas de régression.** Ce qui existe et doit rester :

- **Le site public ne change pas d'un pixel** : jetons ajoutés, jamais redéfinis (`text-sm`, `text-base`, `tracking-tight`, les ombres existantes gardent leur valeur) ; le trait d'icône ne change que sous la portée `/app`. `/super-admin` ne change pas non plus.
- **`useFormatteurs`** (99 fichiers appelants, dont 2 sous `(dashboard)`) : `montant()`, `date()`, `DATE_COURTE` et `VALEUR_ABSENTE` gardent leur sortie ; les préréglages s'ajoutent.
- **La densité ×0,9 dès `lg`** (ADR-0107, par les jetons de TCK-2692, qui remplacent la règle de 90 % de TCK-635) et l'anti-zoom iOS (texte de champ ≥ 16 px sous 64rem) restent.
- **`check-classes-emises.mjs`** : chaque jeton neuf compile (classe émise).

**La portée `/app`.** Un seul marqueur, posé par la coque de `/app`, qui atteint aussi le contenu rendu **en portail** (feuilles, dialogues, menus, popovers, toasts : Base UI les rend hors de l'arbre de la coque). Les tickets TCK-2686 à TCK-2691 s'y accrochent ; la vitrine le pose aussi.

**La garde des valeurs arbitraires** (`scripts/check-*.mjs`, nom au choix, branchée dans `.github/workflows/repo-ci.yml` : `check-gardes-branchees.mjs` l'exige) :

- **Périmètre** : la **clôture transitive des imports** de `src/app/(dashboard)`, primitives comprises — pas une liste de dossiers.
- **Interdit** : taille de texte arbitraire (`text-[<longueur>]`), `tracking-[…]`, `size-[18px]`, opacité entre crochets (`/[0.07]` : écrire `/7`), `shadow-[…]`, `shadow-2xl`, `text-muted-foreground/70` (3,03:1), `bg-accent/<n>` (l'accent est réservé aux badges *featured*).
- **Cliquet bilatéral, fichier par fichier** : l'existant est consigné (A § 2.3 : 69 `text-[13px]`, 125 `text-[15px]`, 23 `size-[18px]`… côté produit ; après TCK-2692, ce texte est écrit `text-[0.8125rem]`, `text-[0.9375rem]` : la consigne se prend sur l'arbre qui suit la bascule, et `text-[<longueur>]` couvre les deux unités) ; un compte qui monte rougit, un compte qui descend sans que la consigne suive rougit aussi. Chaque exception porte son motif.
- **Elle s'éprouve à chaque invocation** : au moins cinq formes fautives de son invention, dérivées de sa table d'interdits (dont une dans un `cva`, une dans une constante de classes, une dans un ternaire), doivent la faire rougir ; un périmètre vide ou rétréci la fait parler.

i18n : les libellés neufs de la vitrine passent par next-intl en `fr`/`en`/`wo` (`wo` = le texte français tel quel), ou par l'exception existante du playground (`R_POC_PLAYGROUND`, `i18n-exceptions.mjs`) si c'est celle qui s'applique. Vouvoiement ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md)).

## Delta à produire

- [ ] Jetons de texte en `rem` calculés, hors de l'échelle ×0,9 (§ 1), avec leur interligne, et d'espacement des lettres (§ 2).
- [ ] Point de rupture nommé à `90rem` (1440 px) dans `@theme` (`--breakpoint-*`), distinct de `2xl` (1536 px, employé par le site public) : il traduit le `min-[1440px]:` des maquettes « bureau 1280 » (ADR-0106 § 4, trois bandes). Le nom est choisi par l'implémenteur, et écrit dans `design-guidelines.md`.
- [ ] Jeton de taille d'icône 18 px ; trait par défaut des icônes lucide sous la portée `/app`, 1,75 puis 1,5 (§ 3).
- [ ] Ombres nommées (§ 4), encre douce et encre douce inverse (§ 5).
- [ ] Préréglages de `useFormatteurs` (§ 6), et leurs tests.
- [ ] La portée `/app`, portails compris.
- [ ] La vitrine (§ 7).
- [ ] La garde, son cliquet consigné, son auto-épreuve, son branchement en CI.
- [ ] `docs/design-guidelines.md` : l'échelle en `rem` calculés de la partie connectée et pourquoi elle reste hors de l'échelle ×0,9 (ADR-0107), les ombres nommées, l'encre douce, les préréglages de format ; la correction de « `tracking-tight` (≈ −0.01em) » (il vaut −0,025 em, A § 8.4).

## Critères d'acceptation

- [ ] AC1 — Sur la vitrine, le texte du jeton 13 px rend `font-size: 13px` à 390 **et** à 1440 (`getComputedStyle`) ; `text-sm` voisin rend 14 puis 12,6 px. Même épreuve pour 11, 15 et 17 px. Un jeton qui suivrait l'échelle ×0,9 ferait rougir l'épreuve à 1440 (11,7 px) ; un jeton écrit en px la ferait rougir au réglage « police 20 px » du navigateur, où le jeton 13 px doit rendre 16,25 px (TCK-2692, AC5).
- [ ] AC2 — Sur une référence gelée choisie parce que son parent pose `leading-snug`, l'interligne calculé d'un texte réécrit avec le jeton est égal à celui de la maquette (±0,5 px).
- [ ] AC3 — Sur la vitrine, sous la portée `/app`, une icône lucide sans `strokeWidth` rend `stroke-width` 1,75 à 390 et 1,5 à 1440 ; une icône de la page d'accueil publique rend 2 aux deux largeurs ; une icône à `strokeWidth={2.5}` garde 2,5.
- [ ] AC4 — Un bouton rendu **dans un dialogue ouvert** de la vitrine (portail) porte le trait de la portée `/app` : la portée atteint les portails.
- [ ] AC5 — Chaque ombre nommée rend, au relevé, une couleur à ±3/255 de la maquette ; l'encre douce et l'encre douce inverse sont opaques (alpha 1) et tiennent ≥ 4,5:1 sur leurs surfaces (test de contraste).
- [ ] AC6 — Les préréglages rendent exactement « 1 355 000 F » (U+202F, U+202F, U+00A0), « 3,9 M F », « 4 nov. » (date de l'année en cours, horloge figée), « 4 déc. 2025 » (année précédente), « 09:00 », « 87 % » (U+00A0) en `fr` ; `montant()` sans préréglage rend toujours « 1 355 000 F CFA ».
- [ ] AC7 — La garde rougit sur chacune de ses formes d'épreuve, sur un `text-[13px]` ajouté dans un composant importé **deux maillons** sous une page de `(dashboard)`, et sur un compte consigné abaissé sans correction (ablations, une par une) ; elle est verte sur `dev` avec le cliquet consigné.
- [ ] AC8 — Relevé avant/après de `/fr` (accueil public) et d'une fiche de bien publique, au téléphone et au bureau (outil de TCK-2684 s'il est livré, sinon `getComputedStyle` sur les mêmes éléments) : zéro écart.

- [ ] AC-BP — Une classe `<nom>:flex` posée sur un élément de la vitrine est appliquée à 1440 px de fenêtre et pas à 1439 ; `2xl:` garde son seuil de 1536 px (une page publique qui l'emploie rend à l'identique avant et après).

## Hors périmètre

- Les pages (vagues 86 à 90), la réécriture des valeurs arbitraires existantes de `/app` (le cliquet les consigne, chaque ticket de page les fait baisser), et les maquettes elles-mêmes.
- Les primitives (TCK-2686 → TCK-2690) et la coque (TCK-2691) : la vitrine les accueille, elle ne les dessine pas.
- Une garde contre les montants, dates et pourcentages écrits en dur dans les pages.
- Le mode sombre (absent de `/app` et des maquettes, A § 0).

## Notes d'implémentation

2026-11-11 — relevés sur l'arbre de travail de `feat/audit-ux-app-lot-1`, Chrome par l'outil de fidélité, au réglage par défaut du navigateur sauf mention.

**Noms retenus.** Texte : `text-pastille` 10 · `text-legende` 11 · `text-ui` 13 · `text-corps` 15 · `text-action` 16 · `text-titre-court` 17 · `text-affiche-22/26/28/32/40`, en `rem` calculés (÷16), **sans interligne propre** (le texte hérite celui de son parent, comme `text-[13px]` dans la maquette). Lettres : `tracking-titre` (−0,02 em), `tracking-surtitre` (0,08 em). Icône : `size-icone` (1,125 rem). Ombres : `shadow-barre-collante`, `-filet`, `-bouton-photo`, `-actif`, `-panneau`, `-feuille`. Encres : `text-encre-douce` (#4c4641), `text-encre-douce-inverse` (#bab6b0). Point de rupture : `w1440:` (90 rem). Portée : attribut `data-portee-app` sur la racine d'`AppShell`, variante `portee-app:`. Les noms vivent aussi dans `src/lib/jetons-de-l-app.ts`, que `cn()` passe à `extendTailwindMerge` : sans cela, **mesuré**, `cn('text-ui', 'text-foreground')` rendait `text-foreground` seul (le jeton, inconnu, était pris pour une couleur).

**Relevés.**

- AC1 — vitrine : `text-ui` 13 px à 390 et à 1440, `text-sm` voisin 14 puis 12,6 px ; 10/11/15/16/17/22…40 exacts aux deux largeurs. À 20 px de police par défaut, `text-ui` rend 16,25 px : le jeton suit la police de qui lit.
- AC2 — référence gelée `app-agenda/a-0-bureau-1440`, « 2 biens libres ce soir » (source `app-agenda-pieces.tsx:203-205`, parent `text-sm leading-snug`) : interligne 17,9 px dans la maquette (17,9 aussi en `a-3-telephone`) ; réécrit avec `text-ui` dans la vitrine, 17,875 px aux deux largeurs.
- AC3 — vitrine : lucide sans `strokeWidth` 1,75 à 390, 1,5 à 1440, `strokeWidth={2.5}` garde 2,5. `/fr` et une fiche publique : 2 px aux deux largeurs. `/app/leases` réel : 1,75 × 9 au téléphone, 1,5 × 4 au bureau (les 21 autres portent un 1,75 explicite, antérieur).
- AC4 — icône d'un bouton dans un dialogue ouvert (portail hors du sous-arbre de la vitrine) et croix de fermeture : 1,75 / 1,5. La portée s'écrit `:root:has([data-portee-app])`, donc elle atteint les portails ; la réécrire en `[data-portee-app] svg…` (le portail la perdrait) fait rougir `jetons-de-l-app.test.ts`. `AppShell` n'est monté que par `(dashboard)/app/layout.tsx` : la portée ne déborde pas sur `/super-admin`, `/onboarding` ni `/publish`.
- AC5 — les six ombres, rendues sur canvas contre la forme `in_oklab` de la maquette : 0/255 d'écart sur chaque canal, 0 sur l'alpha. Encres opaques ; contrastes 9,29:1 (carte), 8,84:1 (fond), 7,88:1 (`muted`), 8,69:1 pour l'inverse sur `foreground`.
- AC6 — Node et Chrome : `1 355 000 F`, `3,9 M F`, `350 k F`, `4 nov.`, `4 déc. 2025`, `09:00`, `87 %` ; `montant()` inchangé (`… F CFA`).
- AC7 — `scripts/check-valeurs-arbitraires-app.mjs`, consigne de 85 valeurs dans 50 fichiers, périmètre de 891 fichiers. Ablations une par une, toutes rouges, md5 restauré : chacun des huit prédicats neutralisé tour à tour (l'auto-épreuve nomme la forme manquée) ; `text-[13px]` ajouté dans `styles-de-la-barre.ts` (`(dashboard)/app/layout.tsx` → `AppShell` → `AppSidebar` → `styles-de-la-barre`, trois maillons) ; compte consigné abaissé ; compte réel baissé sans `--consigner` ; fermeture des imports coupée (témoin perdu, périmètre 360/891) ; step retiré de `repo-ci.yml` (rouge de `check-gardes-branchees`).
- AC8 — aller-retour sur le même serveur, `globals.css` et `utils.ts` d'origine remis puis l'état neuf restauré (md5 vérifié) : `/fr` et une fiche, à 390 et 1440, **0 écart, 0 % de pixels**.
- AC-BP — `w1440:flex` absent à 1439, présent à 1440 ; colonnes de `/fr/properties` identiques avant/après à 1439/1440/1535/1536/1800 (4, 4, 4, 5, 6).

**Prémisses qui différaient.**

- Le compte des valeurs de texte arbitraires de la clôture de `(dashboard)` est de 55 après TCK-2692, pas 69 + 125 : le relevé A § 2.3 portait sur un autre périmètre. La consigne porte le compte mesuré.
- L'outil de fidélité relevait l'**attribut** `stroke-width` de l'icône, pas la valeur calculée : la portée aurait été invisible pour lui. `inventaire.mjs` relève désormais la valeur calculée, et `comparer.mjs` normalise `1.5px`/`1.5` (test ajouté).
- Un `strokeWidth={2}` explicite ne se distingue pas du défaut de lucide : la règle le ramène aussi à 1,75/1,5. Aucun dans `/app` ; dix ailleurs (public, recharts, playground), hors de la portée.
- `shadow-feuille` garde le noir à 25 % de `shadow-2xl` (ce que rend la maquette), pas `--shadow-color`.
- Le nouveau seuil ajoute un palier de 90 rem à `container` ; la classe n'est employée nulle part dans `src/`.
- À 20 px de police, la requête de 90 rem bascule à 1800 px de fenêtre : c'est voulu (le seuil suit la police, comme les autres).
- `contraste-wcag.ts` range les tailles de texte nommées parmi les non-couleurs : sans cela, `text-legende` et les autres étaient comptés comme des couleurs illisibles par l'épreuve de surface publique.

**Garde locale.** Dans l'arbre de travail, `polices-du-layout-racine`, `encre-sans-alpha` et `surface-publique` rougissent à cause des maquettes locales (`playground/maquettes`, non versionnées). Elles sont vertes dans un arbre sans maquettes.

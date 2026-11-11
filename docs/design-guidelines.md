# Design & UI Guidelines — Takussan

Ces directives s'appliquent à **toutes les interfaces** de Takussan. Elles priment sur les choix par défaut des composants tiers.

> Design system officiel : **Ancrage Local Contemporain** — palette **Lin** + typographie **Contemporain** (Bricolage Grotesque + DM Sans). Foundation site-wide posée par **TCK-129**, déployée dans `src/app/globals.css`.

## Philosophie visuelle

- **Moderne et épuré** : chaque écran ne montre que ce dont l'utilisateur a besoin à cet instant. Pas de surcharge d'information.
- **Accueillant et chaleureux** : l'immobilier est un acte de vie fort — l'interface doit inspirer confiance et sérénité, pas anxiété. La palette Lin (sable clair + terracotta atténué) ancre l'identité dans un imaginaire local sans tomber dans le folklore.
- **Professionnel sans être froid** : l'esthétique vise les meilleures apps PropTech (Airbnb, Houzz) — pas un back-office générique.
- **Pas de hero marketing sur les surfaces de découverte** : l'utilisateur qui arrive a déjà une intention (louer/acheter). Modèle de référence : Airbnb. Toute proposition de hero illustratif / value prop / slogan est à rejeter sur la homepage publique.
- **Cohérence avant tout** : un seul style de bouton principal, une seule façon d'afficher un état vide, une seule famille d'icônes. *Amendé le 2026-11-10 (décision 2 a du porteur, [ADR-0106](adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), TCK-2686) : le bouton **sombre** (`variant="sombre"`, `bg-foreground text-background`) des maquettes retenues s'y ajoute — « Faire », « Réessayer » — à côté du plein terracotta ; il reste un seul CTA principal par écran.*

## Typographie

Deux familles, versionnées dans le dépôt, chargées via `next/font/local` dans `src/app/layout.tsx` ([ADR-0074](adr/0074-les-polices-sont-versionnees-dans-le-depot.md)) et exposées comme tokens Tailwind :

| Token | Famille | Usage |
|---|---|---|
| `font-display` / `font-heading` / `font-headline` | **Bricolage Grotesque** | Titres de page, titres de section, eyebrows accentués, titres de carte (overlay) |
| `font-sans` (défaut) | **DM Sans** | Corps, labels, méta, prix, descriptions |

Règles :
- **Toujours `font-display` pour les titres** (`h1` à `h3`) et les noms de marque ; `font-sans` partout ailleurs.
- Hiérarchie stricte : `h1` → titre de page, `h2` → section, `h3` → sous-section, `p` → contenu courant.
- Taille minimale de corps : **14px** (16px préféré). Jamais de texte en dessous de 12px (sauf eyebrow uppercase 11px tracking).
- Interligne confortable : `leading-relaxed` (1.625) pour le texte courant.
- Poids : 400 (corps), 500 (labels), 600 (titres de section, prix), 700 (titres de page). Éviter 800/900.
  *Amendé le 2026-11-11 (TCK-2687, [ADR-0106](adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) : dans `/app`, le titre de
  page (`PageHeader`) est en **600**, à −0,02 em (`tracking-titre`), 20 px au téléphone ; 700 reste au site public et à
  `/super-admin`.*
- Letter-spacing : titres display en `tracking-tight` (−0,025 em en Tailwind 4 ; cette ligne disait
  « ≈ −0.01em », corrigé par TCK-2685, A § 8.4) ; eyebrows en `tracking-[0.12em] uppercase`. Dans
  `/app`, `tracking-titre` (−0,02 em) et `tracking-surtitre` (0,08 em) : cf. la section suivante.

> Les fontes alternatives (Geist, Manrope, Inter, Fraunces) restent chargées pour le `/playground` mais ne doivent **jamais** apparaître en prod.

### La densité du bureau — des jetons, pas une racine ([ADR-0107](adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md), TCK-2692)

Le bureau (dès `lg`, 1024 px) est **à ×0,9** du téléphone : décision du porteur depuis TCK-635. Il
n'est plus porté par `html { font-size: 90% }`. **La racine vaut la taille de police du navigateur à
toute largeur** (16 px par défaut). Ce sont les échelles qui passent à ×0,9 dès `lg`, dans le bloc
`densite-du-bureau` de `globals.css` : `--spacing` (0,225rem), chaque `--text-*`, `--radius`, les
`--container-*` et le texte du `body` (0,9rem).

- **Une classe du thème suit seule** (`p-4`, `text-sm`, `rounded-lg`, `max-w-md`). À 1440, `text-sm` rend
  12,6 px et `p-4` 14,4 px ; sous `lg`, 14 et 16 px.
- **Une valeur arbitraire en `rem` ne lit aucun jeton.** Elle s'écrit sur l'échelle,
  `w-[calc(var(--spacing)*22)]` et non `w-[5.5rem]`, ou par la classe nommée quand elle existe (`max-w-88`).
  **Toutes les valeurs suivent cette règle, y compris celles qui ne valent que sous `lg`** (barre
  mobile `md:hidden`, valeur remplacée par `sm:`). Sous `lg`, `var(--spacing)` vaut exactement
  0,25rem et le rendu ne change pas. Une seule règle se garde ; un tri par visibilité devient faux
  le jour où quelqu'un retire le `md:hidden`.
- **Une taille fixe s'écrit en `rem` calculés** (`text-[0.8125rem]` pour 13 px), jamais en px : elle
  garde sa taille au réglage par défaut, et elle grandit quand la personne agrandit la police de son
  navigateur. Le texte en px y restait sourd.
- **Un seuil de requête de CONTENEUR en `rem` se lit contre la racine.** Il s'écrit donc de chaque
  côté de `lg` pour garder son seuil en px : `max-lg:@max-[11rem]:hidden lg:@max-[9.9rem]:hidden`.
  Une requête MÉDIA en `rem` se lit contre la taille initiale du navigateur : elle ne bouge pas.
- **Les feuilles tierces en `rem`** (Leaflet, react-day-picker) sont ramenées dans l'échelle par
  `globals.css`. Une feuille neuve s'y ajoute.
- `src/app/__tests__/echelle-du-bureau.test.ts` lit le thème de Tailwind et refuse une échelle oubliée,
  ou une racine qui reprend une taille.

### Les jetons de la partie connectée ([ADR-0106](adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), TCK-2685)

La maquette retenue fait foi au pixel, et elle écrit ses tailles fixes en px (13 et 15 px surtout),
qu'elle **ne réduit pas** au bureau. Ces valeurs sont des **jetons nommés**, déclarés dans le bloc
`jetons-de-l-app` de `globals.css`, en **`rem` calculés et hors de l'échelle ×0,9** : ils rendent la
valeur de la maquette à toute largeur au réglage par défaut (13 px à 390 comme à 1440, quand
`text-sm` passe de 14 à 12,6 px), et suivent le réglage de police de l'utilisateur (16,25 px sous une
police de 20 px). Une page de `/app` n'écrit **aucune valeur arbitraire** pour y parvenir :
`scripts/check-valeurs-arbitraires-app.mjs` le garde (ci-dessous).

| Maquette | Jeton | Rôle |
|---|---|---|
| `text-[10px]` | `text-pastille` | chiffre d'une pastille de compte |
| `text-[11px]` | `text-legende` | légende, libellé d'onglet du bas |
| `text-[13px]` | `text-ui` | méta, détail de ligne, fil d'Ariane, libellé de chiffre clé |
| `text-[15px]` | `text-corps` | titre de ligne et de carte, bouton d'action principale |
| `text-[16px]` | `text-action` | action principale des écrans d'entrée (`text-base` rend 14,4 px au bureau) |
| `text-[17px]` | `text-titre-court` | titre d'en-tête de détail, de feuille, de panneau |
| `text-[22px]` à `text-[40px]` | `text-affiche-22`, `-26`, `-28`, `-32`, `-40` | titres d'écrans d'entrée, chiffres ; 30 → 28 et 34 → 32 (valeur majoritaire) |
| `tracking-[-0.02em]` (et −0,01, −0,03) | `tracking-titre` | titres |
| `tracking-[0.08em]` | `tracking-surtitre` | sur-titres |
| `size-[18px]` | `size-icone` | icône de ligne, 18 px à toute largeur |

- **Pas d'interligne propre.** `text-[13px]` ne pose que la taille et hérite l'interligne du parent
  (19,5 px sous la racine, 17,875 px sous un `leading-snug`) ; les jetons font de même. Un interligne
  se pose par `leading-*`, comme dans la maquette.
- **`cn()` les connaît** (`src/lib/jetons-de-l-app.ts`) : sans cette table, `tailwind-merge` prenait
  `text-ui` pour une couleur et le jetait devant un `text-foreground`.
- **Les ombres nommées** composent `--shadow-color` en `in_srgb` (la maquette écrit `in_oklab` : même
  couleur rendue, mesurée à 0/255 d'écart) : `shadow-barre-collante` (barre d'action du bas),
  `shadow-filet` (filet bas), `shadow-bouton-photo`, `shadow-actif` (item actif d'un contrôle
  segmenté), `shadow-panneau` (panneau latéral droit), `shadow-feuille` (feuille du bas : la valeur de
  `shadow-2xl`, noir à 25 %, que la maquette rend ; la **classe** `shadow-2xl` reste interdite).
- **L'encre douce** `text-encre-douce` remplace les `foreground/70` à `/85` des maquettes : une seule
  encre, **opaque** (`foreground` à 80 % composé sur `--card`, `#4c4641` : 9,3:1 sur `card`, 8,8:1 sur
  `background`, 7,9:1 sur `muted`), parce qu'une encre de texte ne s'atténue pas par l'opacité (TCK-658).
  `text-encre-douce-inverse` (`background` à 70 % sur `foreground`) sert au compte d'une puce active.
- **Les formats** viennent de `useFormatteurs`, jamais écrits en dur : `montantCourt` « 1 355 000 F »
  (groupes U+202F, symbole collé par U+00A0), `montantAbrege` « 3,9 M F », `jourMois` « 4 nov. »
  (« 4 déc. 2025 » hors de l'année en cours), `heure` « 09:00 », `pourcentage` « 87 % » (U+00A0).
  « F » dans `/app`, « F CFA » sur l'offre et l'abonnement (`montant()`, inchangé).
- **Le point de rupture `w1440:`** (90rem) traduit le `min-[1440px]:` des maquettes « bureau 1280 »
  (ADR-0106 § 4, trois bandes), distinct de `2xl` (1536 px) que le site public emploie. C'est une
  requête média : elle se lit contre la taille initiale du navigateur (à une police de 20 px, elle
  bascule à 1800 px).
- **La portée `/app`.** La coque (`AppShell`) pose `data-portee-app`, lu par `:root:has(…)` : il atteint
  tout le document, donc aussi les portails de Base UI (dialogues, feuilles, menus, toasts). Elle
  porte le trait des icônes lucide (1,75 sous `md`, 1,5 dès `md`, à la place du 2 par défaut ; un
  `strokeWidth` explicite garde le sien, sauf `2`, indiscernable du défaut). Les primitives de `/app`
  s'y accrochent par la variante **`portee-app:`** — jamais par une classe posée à l'appelant.
- **La vitrine** `/‹langue›/playground/vitrine` (versionnée, `noindex`, 404 en production) rend chaque
  jeton puis chaque primitive sous la portée : c'est l'écran que l'outil de fidélité relève.

**La garde `check-valeurs-arbitraires-app.mjs`** refuse, dans la clôture des imports de
`src/app/(dashboard)` : `text-[<longueur>]`, `tracking-[…]`, `size-[18px]`, une opacité entre
crochets (`/[0.07]` : écrire `/7`), `shadow-[…]`, `shadow-2xl`, `text-muted-foreground/70` (3,03:1)
et `bg-accent/<n>` (l'accent est réservé aux badges *featured*). L'existant est consigné par fichier ;
un compte qui monte rougit, un compte qui descend aussi tant que la consigne ne suit pas
(`node scripts/check-valeurs-arbitraires-app.mjs --consigner`, qui refuse toute hausse).

## Palette de couleurs

Palette officielle : **Lin** — fond clair quasi-blanc, terracotta atténué, sage discret.

| Rôle | Hex | Token CSS | Token Tailwind |
|---|---|---|---|
| Fond de page | `#fcf9f3` | `--background`, `--surface` | `bg-background`, `bg-surface` |
| Texte principal | `#1f1812` | `--foreground` | `text-foreground` |
| Texte muted | `#6e655a` | `--muted-foreground` | `text-muted-foreground` |
| Accent primaire (terracotta) | `#a85332` | `--primary` | `bg-primary`, `text-primary`, `border-primary` |
| Texte sur primaire | `#fcf9f3` | `--primary-foreground` | `text-primary-foreground` |
| Accent profond (hover) | `#823c20` | `--primary-deep` | — |
| Accent secondaire (sage) | `#5d6e4f` | `--accent` | `bg-accent`, `text-accent` |
| Surface carte | `#ffffff` | `--card` | `bg-card` |
| Surface secondaire | `#f1ece0` | `--muted` | `bg-muted` |
| Hairline / bordure | `#ebe5d5` | `--border` | `border-border` |
| Focus ring | `#a85332` | `--ring` | `ring-ring` |
| Voile de dialogue / panneau | `#000000` | `--scrim` | `bg-scrim/10`, `bg-scrim/30` |
| Couleur d'ombre | `#1f1812` | `--shadow-color` | `shadow-[…_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]` |

### Couleurs sémantiques

Elles ont chacune leur jeton depuis TCK-358 (avertissement) et TCK-381 (succès, info). **Aucune
n'emprunte plus un accent de marque**, et le tableau ci-dessous remplace une liste qui renvoyait
encore à l'échelle Tailwind pour l'avertissement — c'est-à-dire à la couleur que ces jetons
existent pour ne plus employer.

| Rôle | Clair | Sombre | Token CSS |
|---|---|---|---|
| Erreur | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | `--destructive` |
| Avertissement (ocre profond) | `#8a5410` | `#e0a458` | `--warning` / `--warning-foreground` |
| Succès / confirmation | `#3f6b45` | `#8fbf87` | `--success` / `--success-foreground` |
| Information | `#3f5a6b` | `#8fb2c8` | `--info` / `--info-foreground` |

- **Succès n'est pas l'accent de marque — décidé le 2026-08-29 (TCK-450).** `--accent` (sage
  `#5d6e4f`) est l'accent des badges *featured*, et **rien d'autre** ; « ça a marché » se dit
  `--success`. **Un statut positif et une mise en avant ne partagent plus la même teinte.** Le ton
  `success` de `console/StatusBadge` empruntait `--accent` jusqu'à cette date : il rend désormais
  `bg-success/10 text-success`, en un point, pour les 21 pastilles de la console à la fois.
- **Info** reste déconseillée sur les surfaces publiques — préférer les eyebrows et le contenu
  textuel.

#### L'aplat d'une pastille sémantique — la règle, et pourquoi elle n'est pas 15 %

Une pastille de statut est un **aplat de sa propre encre**, à faible opacité, sur une surface que
le composant ne choisit pas. Trois choses en découlent, et la troisième est contre-intuitive :

1. **Le seuil est 4,5:1**, pas 3:1 — `Badge` porte `text-xs`, c'est du texte normal (WCAG 2.2
   §1.4.3), jamais un objet graphique.
2. **La mesure se prend sur la surface la plus SOMBRE que l'appelant pose**, pas sur `--card`.
   Mesurer sur la plus claire, c'est mesurer le meilleur cas. Sept surfaces réelles portent
   aujourd'hui une pastille de console — de `--card` à `bg-muted` PLEIN, que `kyc-queue.tsx` et
   `admin/super/moderation.tsx` posent sur la ligne sélectionnée.
3. ⚠ **Moins d'opacité = PLUS de contraste.** L'aplat rapproche le fond de la couleur du texte :
   l'épaissir noie l'encre. Mesuré le 2026-08-29 sur les 14 couples (7 surfaces × 2 thèmes), pire
   cas de chacun :

   | aplat | pire cas | verdict |
   |---|---|---|
   | `accent/15` (l'ancien ton) | **3,05:1** | ✗ sur 13 des 14 couples |
   | `success/20` | 4,00:1 | ✗ |
   | `success/15` | 4,29:1 | ✗ — la seule ligne sélectionnée, en thème clair |
   | **`success/10`** | **4,60:1** | **✓ sur les 14** |
   | `success/5` | 4,91:1 | ✓, mais l'aplat cesse de se voir |

   **10 % est donc le plafond, pas un réglage** — et c'est l'alpha que le docblock de `--success`
   avait déjà mesuré dans `globals.css` en posant le jeton (TCK-381). `danger` s'écrit `/10`,
   `attention` `/12` : une pastille neuve part à 10 % et ne monte qu'avec une mesure.

⚠ **La valeur ne s'écrit jamais ici en hexadécimal.** Cette charte a PRESCRIT un défaut de cette
façon — elle donnait `shadow-[0_8px_24px_rgba(27,40,69,0.08)]` en exemple, un bleu marine hors
palette, corrigé par TCK-460. *Une charte qui donne un hexadécimal en exemple enseigne
l'hexadécimal.* Un jeton et un alpha, jamais une couleur.

**Sous la portée `/app` (TCK-2687, maquettes retenues)**, la pastille mesure 24 px (`h-6`, 21,6 au bureau) et
porte un sixième ton, **`primary`** — beige de chrome et encre profonde (`bg-secondary text-primary-deep`, 6,72:1) —
pour ce qui demande l'attention sans rien signaler d'anormal (« Nouvelle », « Aujourd'hui »). Trois tons y changent,
mesurés sur les sept surfaces dans les deux thèmes : `neutral` prend l'encre douce (opaque) ; `success` monte à **`/11`**,
l'aplat le plus fort qui tienne (4,54:1 au pire, `/12` rend 4,49:1) ; `attention` écrit l'encre **principale** sur
`warning/20` (11,3:1). `danger` reste à `/10` (plafond de `check-destructive-contrast.mjs`), `info` reste `--info`
(la maquette écrit l'accent de marque). Le site public et `/super-admin` gardent la table ci-dessus.

La garde de cette décision est
`takussan-web/src/components/console/__tests__/StatusBadge.contraste-tck-450.test.tsx` (et, sous la portée,
`StatusBadge.portee-app-tck-2687.test.tsx`) : elle lit
l'encre et l'aplat **sur le badge rendu** et recalcule les 14 ratios à chaque exécution. Le tableau
ci-dessus est donc un relevé daté, pas une entrée de test — s'il diverge un jour, c'est lui qui est
périmé.

### Le VOILE — la couleur qui ne suit pas le thème (TCK-384)

Un voile de dialogue ou de panneau latéral **assombrit dans les deux thèmes**. Aucun jeton de
surface ne peut le porter : `--foreground` devient clair sous `.dark` (un voile clair remonterait
le fond au-dessus de la surface du panneau, qui vaut `#2a2018` — le panneau se lirait comme un
trou), et `--background` est déjà clair en thème clair.

`--scrim` est donc déclaré OPAQUE dans `globals.css`, et ce sont les appelants qui posent l'alpha
(`bg-scrim/10` pour un dialogue, `bg-scrim/30` pour un panneau). C'est le même raisonnement que
`.qr-surface` — le blanc d'un QR code, qu'un téléphone doit lire quel que soit le thème — appliqué
à l'autre bout de l'échelle.

### L'OMBRE — la troisième couleur qui ne suit pas le thème (TCK-460)

**Une ombre assombrit dans les deux thèmes, exactement comme un voile.** Deux cartes de bien
écrivaient pourtant la leur en `rgba(31, 24, 18, …)` — c'est-à-dire `--foreground` recopié à la
main en décimal. Le remède évident (lire `--foreground`) est un piège : sous `.dark` le jeton vaut
`#fcf9f3`, et l'ombre devient **claire**. Mesuré au navigateur le 2026-08-29, sur la feuille
compilée, `getComputedStyle().boxShadow` :

| forme | `:root` | `.dark` |
|---|---|---|
| `color-mix(…, var(--shadow-color) 8%, …)` | `srgb .1216 .0941 .0706 / .08` | **identique** |
| `color-mix(…, var(--foreground) 8%, …)` | `srgb .1216 .0941 .0706 / .08` | `srgb .9882 .9765 .9529 / .08` |

`--shadow-color` est donc déclaré dans `:root` et **redéclaré nulle part** : cette absence EST la
propriété. Il ne réemploie pas `--scrim`, dont la valeur est un noir pur — le confondre avec le
brun de la charte aurait changé le rendu sous couvert de factoriser.

⚠ **Le jeton porte la couleur, pas l'alpha.** `shadow-[…_var(--shadow-color)]` compile, passe les
gardes, et peint une ombre **opaque** : c'est le correctif vert et invisible. L'opacité se compose
par `color-mix`, et non par `rgb(var(--…-rgb)/0.08)` — cette seconde forme rend le même pixel mais
`scripts/check-super-admin-tokens.mjs` la refuse, son motif ne pouvant distinguer un `rgb(` qui
lit un jeton d'un `rgb(` qui décide une couleur.

**Ce sont les trois seules couleurs fonctionnelles du produit ; toute quatrième candidate doit
s'écrire ici avant d'exister.**

### Couleurs de série des graphiques

Cinq jetons, `--chart-1` à `--chart-5`, attribués **dans cet ordre** par
`takussan-web/src/components/charts/palette.ts` — jamais écrits à la main dans un graphique.
Le seuil applicable est celui de **WCAG 2.2 §1.4.11 (3:1)** : une couleur de série est un objet
graphique porteur de sens. Mesures par `node scripts/check-chart-contrast.mjs --report`,
2026-08-27 — **sur les DEUX surfaces où un graphique se pose**, la carte et le fond de page :

| Jeton | Clair | `--card` #ffffff | `--background` #fcf9f3 | Sombre | `--card` #2a2018 | `--background` #1f1812 |
|---|---|---|---|---|---|---|
| `--chart-1` | `#a85332` | 5,32:1 | 5,06:1 | `#c87a52` | 4,83:1 | 5,31:1 |
| `--chart-2` | `#5d6e4f` | 5,51:1 | 5,25:1 | `#7d8d6e` | 4,48:1 | 4,93:1 |
| `--chart-3` | `#ad8034` | 3,55:1 | **3,38:1** | `#d6b66c` | 8,17:1 | 8,99:1 |
| `--chart-4` | `#6e655a` | 5,72:1 | 5,44:1 | `#b8aa97` | 7,01:1 | 7,71:1 |
| `--chart-5` | `#1f1812` | 17,53:1 | 16,69:1 | `#fcf9f3` | 15,16:1 | 16,69:1 |

> **La garde ne mesurait que `--card` jusqu'au 2026-08-27**, et son titre le disait. C'était un
> trou et non un cadrage : les deux surfaces se trompent en sens OPPOSÉS selon le thème — en clair
> `--background` est plus sombre que `--card` (donc plus favorable), en sombre il l'est aussi
> (donc moins favorable, la série étant claire). N'en mesurer qu'une laisse toujours une moitié
> dehors. Le minimum du dépôt est désormais **3,38:1**, `--chart-3` sur `--background` clair.

> **DÉCISION TCK-404 (2026-08-27) — `--chart-3` EST une couleur de série, et sa valeur claire a
> été corrigée pour que ce soit vrai.**
>
> Le jeton valait `#c89a4a` et rendait **2,57:1** sur `--card` clair — sous le seuil, et moins bien
> que la couleur hors charte qu'il était censé remplacer. TCK-374 l'avait **écarté** de l'ordre des
> séries plutôt que corrigé, laissant une charte de cinq jetons dont un ne servait à rien.
>
> Les deux voies possibles étaient « corriger la valeur » et « acter qu'il n'est pas une couleur de
> série ». **La première est retenue**, sur trois mesures :
>
> 1. L'obstacle que le ticket citait est PÉRIMÉ. Il bloquait la correction sur « l'ambre sert aussi
>    de fond, le ton `warning` de `StatCard` le porte à 15 % ». Mesuré : depuis TCK-381 cette tuile
>    rend `bg-warning/10`, et `--chart-3` n'a plus **aucun** usage de fond. Il n'y avait plus deux
>    rôles à arbitrer ensemble, il n'en restait qu'un.
> 2. Rétrograder le rôle n'aurait rien corrigé, et aurait *entériné* le seul usage restant :
>    `components/profile/ProfileBadge.tsx` rend `bg-chart-3/20 text-chart-3`, soit du TEXTE sur un
>    aplat de lui-même — 2,17:1 avant la correction, 2,90:1 après. Toujours sous AA ; amélioré
>    gratuitement par la correction, ce que la rétrogradation n'aurait pas fait.
> 3. En thème SOMBRE le jeton était irréprochable (8,17:1) — le défaut n'existait qu'en clair.
>    C'est la valeur claire qui était fausse, pas le rôle.
>
> La valeur retenue, `#ad8034`, ne fait descendre que la **clarté** HSL ; teinte et saturation
> bougent de moins d'un demi-point. Mesuré, et non arrondi :
>
> | | `#c89a4a` | `#ad8034` | écart |
> |---|---|---|---|
> | teinte | 38,10° | 37,69° | −0,41° |
> | saturation | 53,39 % | 53,78 % | +0,39 pt |
> | clarté | 53,73 % | 44,12 % | **−9,61 pt** |
>
> Ce n'est pas une couleur nouvelle, c'est la même assez foncée pour se voir sur du blanc. La
> valeur sombre (`#d6b66c`) ne bouge pas.
>
> ⚠ **Conséquence à connaître** : un graphique à trois séries voit sa troisième passer de taupe
> (`--chart-4`) à ocre (`--chart-3`). C'est la restauration de l'ordre de la charte, pas un effet
> de bord.

### Règle fondamentale — design tokens

> **Zéro valeur hex arbitraire dans le code.** Toute couleur passe par une variable CSS définie dans `src/app/globals.css` et exposée via `@theme inline`. Changer la palette demain = modifier `globals.css`, rien d'autre.

Interdits :
- `#0050cb` ou tout autre hex hardcodé pour la marque (ancien bleu Takussan retiré avec TCK-129).
- `text-blue-*`, `bg-blue-*` pour la marque.
- Dupliquer un hex Lin dans un composant — toujours via le token.

## Espacement & Layout

- **Espace blanc généreux** : toujours pencher en faveur de plus d'espace, pas moins. Le DS Lin laisse respirer les photos — c'est un choix produit.
- Utiliser les **espacements Tailwind standard** (multiples de 4px). Pas de valeurs arbitraires (`p-[13px]`) sauf cas exceptionnel documenté.
- Grille : 12 colonnes sur desktop, 4 sur mobile. Conteneur principal `max-w-7xl` (1280px) ; surfaces playground/showcase peuvent monter à `max-w-[1440px]`.
- Sections de page : padding vertical minimum `py-8` (desktop `py-12` à `py-20`).
- Spacer Navbar fixe : **`<NavbarSpacer />`** après `<Navbar />`, jamais une hauteur écrite à la main — il suit la barre à chaque palier et selon la page (TCK-2494 : la rangée de catégories ne reste que sur les pages de découverte). ⚠ Cette ligne prescrivait `h-[133px]` : la barre n'a jamais mesuré cela sous `lg`.

## Navigation du site public — une seule couche d'action en bas ([ADR-0091](adr/0091-la-navigation-mobile-du-site-public-suit-le-profil.md))

> **Écart de charte, accepté par ADR-0091** : la charte ne prévoyait aucune navigation basse sur le
> site public. Elle en a une sous `lg`, et la règle qui suit en est le prix.

**Au téléphone, une seule couche d'action tient le bas de l'écran à la fois** : la barre d'onglets
publique, **ou** la barre d'actions d'une page (la fiche d'un bien), **ou** un tunnel (visite,
paiement, revendication, publication). Jamais deux. Relevé avant la règle : trois couches flottaient
sans arbitrage (dock du comparateur ≈ 190 px, bouton « Messagerie », barre collante de la fiche),
jusqu'à 45 % de l'écran recouvert.

- **La barre d'onglets** (`BarreDOngletsPublique`, sous `lg`) : cinq cases égales, icône et libellé
  toujours visibles, la case active lue par un trait, un poids et `aria-current` — jamais la seule
  teinte. Ses cases 2 et 3 suivent le persona actif et ne s'écrivent nulle part ailleurs que dans
  `DISPOSITIONS` (`src/lib/navigation/dispositions.ts`).
- **Elle se retire** là où une autre couche tient le bas : fiche, tunnels, pages ouvertes par un lien
  (`porteLaBarrePublique`, `src/lib/navigation/barre-publique.ts`), carte plein écran (par CSS). Une
  page neuve qui pose sa propre barre d'actions en bas **s'ajoute à ce prédicat**, elle ne s'empile pas.
- **Ce qui flotte se replie au-dessus d'elle** : le comparateur devient une pastille « Comparer N » de
  44 px, posée par le dock flottant au-dessus de la barre (`--floating-dock-base`), et s'efface avec
  elle. Pas de bouton flottant « Messagerie » sur le site public : c'est l'onglet Messages.
- **Rien sous la barre** : `body` réserve sa hauteur (`--barre-publique-hauteur`, zone sûre comprise)
  tant qu'elle est montée — un contenu neuf n'a rien à prévoir.
- **Pas de menu hamburger public.** Langue, annuaires, légal, connexion et déconnexion vivent sur
  l'écran « Compte » / « Moi » (`/account`), case 5 de la barre.
- **En bureau** (`lg` et au-delà), l'en-tête tient sur une ligne — Louer · Acheter · Agences,
  recherche, favoris, compte, « Publier un bien » ; la rangée de catégories ne reste que sur
  l'accueil et la liste ; le connecté y trouve « Mon espace », les lignes et compteurs de son persona.

## Composants

- **Arrondis** : `rounded-xl` pour les cartes et modales, `rounded-lg` pour les boutons et inputs, `rounded-full` pour les avatars/badges/pills.
- **Ombres** : légères et subtiles (`shadow-sm`, `shadow-md`, ou customs `shadow-[0_8px_24px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]`). Jamais de `shadow-2xl` sur un élément courant. ⚠ Cette ligne prescrivait `rgba(27, 40, 69, 0.08)` — un bleu marine qui n'est dans AUCUN jeton de la charte Lin, hérité du `/playground` — et c'est de là que venaient les ombres littérales corrigées par TCK-460. *Une charte qui donne un hexadécimal en exemple enseigne l'hexadécimal.*
- **Bouton principal** : plein (filled), `bg-primary text-primary-foreground`, label court et actionnable (verbe + objet). Un seul CTA principal par écran.
- **Bouton secondaire** : outline ou ghost, jamais aussi saillant que le primaire.
- **États interactifs** : tous les éléments cliquables ont un état `hover` visible et un état `focus-visible` accessible (`ring-2 ring-ring`).
- **Transitions** : `transition-all duration-150 ease-in-out` pour hover/focus rapides. `duration-300` à `duration-500` pour ouvertures de panneaux/modales et zooms photo (`cubic-bezier(0.16, 1, 0.3, 1)`).
- **États vides** : illustrés avec un court message d'encouragement + un CTA. Jamais un simple "Aucun résultat."
  **Un seul composant les rend tous** : `<EmptyState>` (`@/components/feedback`), props `{icon, title, description, action}`.
  Ne jamais en écrire un local — `scripts/check-feedback-states.mjs` casse la CI sur toute redéfinition
  de `*EmptyState` / `*ErrorState` hors de `src/components/feedback/`. *Cette règle a été violée onze
  fois avant d'être gardée (TCK-246).*
- **États d'erreur inline** : `<ErrorState message onRetry? retryLabel?>` (`@/components/feedback`),
  bâti sur `DestructiveBanner` — tokens `--destructive`, `role="alert"` posé une seule fois.
  Jamais `bg-red-50` / `text-red-700` : la palette Tailwind brute n'est pas la palette du produit.
  Il n'y a **pas** de `<Alert>` shadcn dans ce dépôt — c'est un composant Radix, et il n'y a aucune
  dépendance Radix ici.
- **Loading** : squelettes par `<Skeleton>` (`@/components/ui/skeleton`), qui pose `bg-muted` —
  jamais de spinner centré sur page entière sauf première charge.
- **Un geste qui relance une recherche se voit dès le clic, et jusqu'à l'arrivée des biens**
  (TCK-580). Trois signaux, chacun à sa place : l'élément cliqué (puce : `AttenteDePuce` au coin,
  hors du flux ; puce active retirée : barrée, ✕ remplacé par le chargement ; catégorie : le
  pictogramme cède sa place) ; la grille estompée (`aria-busy`) ; et la pastille
  `ActualisationDesResultats`, accrochée sous la barre de navigation. Aucun de ces signaux ne
  change la largeur ni la hauteur de ce qu'il signale : un indicateur qui décale ses voisins
  déplace la cible suivante sous le doigt.

  > ⚠️ **Cette ligne autorisait la brèche qu'elle prétendait fermer.** Elle offrait le fond de
  > squelette au choix entre la pierre 200 de l'échelle Tailwind **ou** le jeton `--muted`. Le
  > « ou » est exactement ce que l'en-tête de `scripts/check-app-tokens.mjs` nomme depuis TCK-372 —
  > *une AC alternative ne nomme pas un objectif, elle nomme la sortie de secours et l'autorise* —
  > et c'est le document qui pose la règle qui la portait.
  >
  > Corrigée par TCK-381 **dans le sens de la règle**, jamais dans celui de l'exception : il n'y a
  > plus d'alternative, et `scripts/check-super-admin-tokens.mjs` refuse désormais mécaniquement
  > toute échelle brute dans la clôture d'import de `/app` comme dans celle des deux consoles.
  >
  > La faute n'est pas recopiée ici en classe : un document qui montre la classe fautive est
  > exactement la documentation périmée qui la fait repousser — même raison que le refus de
  > dépouiller les commentaires dans les gardes de jetons.

### Bibliothèque de composants — shadcn/ui

Le projet utilise **shadcn/ui** avec le runtime **`@base-ui/react`** (à la place de Radix UI). Les composants sont copiés dans `src/components/ui/` — ils appartiennent au projet et peuvent être modifiés.

**Règles d'usage :**

1. **Toujours préférer un composant `ui/` à un élément HTML natif** pour tout ce qui est interactif : bouton → `<Button>`, champ texte → `<Input>`, liste déroulante → `<Select>`, etc.
2. **Jamais de `<select>` natif** visible dans l'UI — utiliser `<Select>` de shadcn (wrappé sur `@base-ui/react/select`).
3. **Jamais de `<button>` natif** pour une action principale — utiliser `<Button variant="...">` avec le variant adapté.
4. **Surcharger via `className`** en utilisant `cn()` — ne pas modifier les fichiers `ui/` pour un cas ponctuel.
5. **Ajouter un composant** via `npx shadcn@latest add <composant>` puis vérifier qu'il utilise `@base-ui/react` (et non Radix) dans le fichier généré.

Primitives `ui/` (20) : `Avatar`, `Badge`, `Button`, `Calendar`, `Card`, `DatePicker`, `DateTimePicker`,
`DestructiveBanner`, `Dialog`, `DropdownMenu`, `Input`, `Label`, `Popover`, `Select`, `Separator`,
`Sheet`, `Skeleton`, `Tabs`, `Textarea`, `Toast`.

Composants de feedback (`src/components/feedback/`) : `EmptyState`, `ErrorState` — cf. la règle
« États vides » plus haut. Ils sont **présentationnels** : ni `'use client'`, ni `useTranslations`,
pour rester importables depuis un server component. C'est l'appelant qui traduit.

> Cette liste ne comptait que huit entrées et n'avait jamais été tenue à jour : elle omettait
> `destructive-banner`, `toast`, `tabs`, `sheet`, `popover`… Le compte se reprend à la source —
> `ls takussan-web/src/components/ui/`.

## Cartes propriété — variantes

Le DS définit **4 variantes de carte**, **une par section** sur les surfaces de découverte. La forme communique le rôle de la rangée — c'est un *contrat de système*, pas une décoration.

| Variante | Format | Quand l'utiliser | Exemple section |
|---|---|---|---|
| **Standard** | 1:1 rounded-2xl, titre → lieu → détails → prix, prix en `text-foreground` (TCK-628) | Découverte générique près de l'utilisateur | « Près de toi », « À vendre » |
| **Listing** (Wide) | Image carrée 1:1 à gauche + méta à droite, format dense liste | Rangées géolocalisées ou listes orientées scan vertical | « À louer » |
| **Cover** (Overlay) | 3:4 façon couverture magazine, gradient bas, titre + prix superposés en blanc | Sections signature / éditoriales | « Coup de cœur » |
| **Compact** | 1:1 carrée, dense, scan rapide | Rangées orientées fraîcheur / nouveauté | « Tout juste publié » |

**Naming canonique** : `PropertyCardStandard / Listing / Cover / Compact` sous `src/components/property/cards/`. Un composant `PropertyRow` générique dispatche via prop `variant`.

**Carte de liste — `PropertyCard`** (résultats de `/properties`, favoris, biens similaires) :
silhouette verticale, photo 4:3, prix → titre → lieu → détails — la Standard de l'accueil est
carrée et met le prix en dernier depuis TCK-628. Règles tenues par TCK-555 :

- **Une colonne pleine largeur sous `md`** sur `/properties` (photo de 328 × 246 px à 360 px, contre
  156 × 117 en deux colonnes) ; les paliers de bureau ne bougent pas. Décision réversible : la ligne
  horizontale (photo à gauche) reste l'alternative si la longueur de liste se révèle coûteuse.
- **Sous `md`, au plus deux éléments sur la photo** : une pastille (transaction, ou « Neuf / Sur
  plan » quand la transaction est masquée) et le favori. Le comparateur est dans la rangée du prix,
  à l'opposé du favori ; l'ancienneté et, le cas échéant, l'état « Neuf » sont du texte dans la
  ligne de détails.
- **À partir de `md`, la carte de bureau est celle d'avant** : comparateur sous le favori,
  ancienneté en bas à gauche de la photo, « Neuf » à côté de la transaction. Sur les emplacements de
  192 px du bureau, la disposition mobile faisait passer le prix à la ligne et laissait une puce
  pendante dans les détails. Chaque élément qui change de place est rendu aux deux endroits et
  masqué par la largeur (`md:hidden` / `hidden md:…`).
- **La pastille de transaction se retire quand la liste est filtrée sur cette transaction** — c'est la
  grille qui le dit à la carte (`transactionFiltree`), jamais la carte qui lit l'URL.
- **Deux lignes réservées au titre à partir de `sm` seulement**, là où des cartes voisines s'alignent
  — et à toutes les largeurs dans le carrousel des biens similaires, où la diapositive suivante
  dépasse à côté de la courante (`titreSurDeuxLignes="toujours"`).
- **Un loyer sans période ne s'affiche jamais comme un prix nu** (« 950 000 F CFA · loyer »).

Cartes prévues, ticket dédié à ouvrir si besoin sort :
- `PropertyCardProject` (projets de construction : avancement, prix « à partir de », lots restants)
- `PropertyCardShortStay` (location courte durée : calendrier dispo, prix/nuit)
- `PropertyCardAuction` (enchères : timer, dernière offre)

> Si une nouvelle section/contenu type apparaît, **créer une nouvelle variante** plutôt que recycler une existante par défaut.

## Élément signature — pattern bogolan

Pattern stylisé (losanges + traits + points, **jamais figuratif**) à **4-5 % d'opacité maximum**, **réservé à 1 ou 2 sections signature** par page (typiquement la rangée « Coup de cœur »). Composant : `BogolanPattern.tsx`. Surcharger avec `text-[var(--pg-ink)]` ou `text-foreground` pour l'ancrer dans la palette active.

Ne pas répandre le pattern sur toutes les surfaces : l'identité tient justement à sa rareté.

## Images & Médias

- Toujours utiliser le composant `next/image` avec `sizes` appropriés — jamais de `<img>` brut.
- Images de biens : ratio **3:2**, **4:3**, **1:1** ou **3:4** selon la variante de carte. Jamais portrait libre. Fond de remplacement `bg-muted` (`#f1ece0`) pendant le chargement.
- Pas de stock photos génériques (maison parfaite + famille souriante). Préférer des visuels minimalistes ou des illustrations vectorielles cohérentes.
- Icônes : **Lucide React** uniquement. Tailles standard `size-4` (16px) inline, `size-5` (20px) dans les boutons, `size-6` (24px) standalone.

### Couverture d'une fiche d'agence — écart de charte accepté (TCK-2522)

Décision 2a du porteur, 2026-11-09 : la fiche publique d'une agence s'ouvre sur une **couverture plein
cadre composée de trois de ses biens** (`cover` de l'API, TCK-2518 : la sélection d'abord, puis les biens
les plus récents) — et non sur une photo que l'agence fournirait. Composant : `CouvertureDeFiche.tsx`.

- Grille `2fr 1fr` sur deux rangées (une grande photo, deux petites), `h-[168px]` au téléphone, `220px`
  dès `sm`, `260px` dès `lg`, coins bas arrondis en bureau. Deux photos : deux colonnes ; une : plein cadre.
- Photos **décoratives** (`alt=""`) : chaque bien est présenté plus bas avec son titre.
- **Sans photo servable**, la couverture garde sa hauteur sur le motif bogolan (5 % d'opacité, la règle
  ci-dessus) : la fiche ne change pas de forme, et aucun cadre vide n'apparaît.
- Au téléphone, retour et partager sont posés sur la couverture (`EnTeteDeFiche`, TCK-2568) : pas de
  barre du site au-dessus.

## Animations standard

Définies dans `globals.css` :

| Classe | Durée | Usage |
|---|---|---|
| `animate-fade-in-up` | 0.5s | Apparition d'un bloc principal après chargement |
| `animate-card-enter` | 540ms | Entrée d'une carte dans une rangée (avec `animationDelay` indexé) |
| `animate-section-enter` | 640ms | Entrée d'une section au scroll |
| `animate-compare-dock-in` | 320ms | Arrivée d'un panneau flottant depuis le bord bas (barre du comparateur) |
| `animate-apparition-attente` | 220ms (+60ms) | Pastille d'attente posée sur la puce cliquée (TCK-580) |
| `animate-pastille-actualisation` | 320ms (+140ms) | « Mise à jour des biens » qui descend sous la barre (TCK-580) |

Easing standard : `cubic-bezier(0.16, 1, 0.3, 1)` (out-expo doux).

⚠ **Les six sont listées dans la garde de mouvement réduit de `globals.css`, et c'est la seule
chose qui rende cette table vérifiable.** Une animation neuve qui n'y entre pas ne fait rougir
rien du tout — elle continue simplement de bouger pour qui a demandé qu'on arrête. Ajouter la
classe au sélecteur `@media (prefers-reduced-motion: reduce)` fait partie de sa livraison, pas de
sa finition.

## Ton & Micro-copy

- **Accueillant** : s'adresser à l'utilisateur directement ("Vos propriétés", "Ajoutez votre premier bien"). Vouvoyer partout, site public compris, connecté ou non ([ADR-0095](adr/0095-le-ton-suit-la-session.md)). Les maquettes ne sont pas une référence de ton. La garde `npm run check:vouvoiement` (`takussan-web/scripts/check-vouvoiement.mjs`) rougit sur tout retour du tutoiement.
- **Clair et direct** : pas de jargon technique, pas de termes métier obscurs sans définition contextuelle.
- **Labels d'action** : verbe à l'infinitif ("Ajouter un bien", "Envoyer le quittancement") — jamais "OK", "Valider", "Submit".
- **Messages d'erreur** : expliquer ce qui s'est passé + comment corriger. Jamais "Une erreur est survenue."
- **Confirmations destructives** : toujours demander une confirmation explicite avec description de la conséquence.

## Outils de dev — `/playground`

La page `src/app/(public)/playground/page.tsx` permet de switcher au runtime entre 7 palettes (Sahel, Lin, Coton, Calcaire, Côtier, Casamance, Saly) et 3 typographies (Contemporain, Éditorial, Humaniste) via `data-palette` et `data-typo`.

**Règles** :
- Le palette switcher et le typo switcher sont des **outils de dev** — ne jamais les promouvoir en prod.
- Les autres palettes (Sahel, Côtier, Casamance, Saly, Coton, Calcaire) restent dispo dans le playground uniquement.
- Les typos Éditorial (Fraunces) et Humaniste (Manrope) idem.
- En production, utiliser exclusivement les tokens Tailwind héritant de `--primary`, `--background`, etc. — ne pas référencer `--pg-*` (réservés au playground).

## Champs de formulaire — une seule hauteur (TCK-2460), deux échelles depuis TCK-2686

La hauteur d'un contrôle ne s'écrit jamais chez l'appelant : `scripts/check-champs-uniformes.mjs` casse sur `h-*` posé sur
`Input`, `SelectTrigger` ou `Textarea`, et sur `<select>`, `<textarea>` ou `<input>` de saisie natifs hors de `components/ui/`.

| Contexte | Comment | Hauteur |
|---|---|---|
| Console, tableaux de bord, dialogues | primitive nue | `h-10` |
| Site public, assistants, connexion | `{...fieldDensityScope()}` sur un élément déjà présent | `h-11` |
| Pagination, filtre de ligne | `SelectTrigger size="sm"`, `Button size="sm"` | `h-8` |

`Button` s'aligne sur la même échelle : défaut `h-10`, `sm` `h-8`, `lg` `h-11`. `min-h-*` reste permis sur `Textarea`.

### L'échelle de densité de `/app` — amendement de TCK-2460 ([ADR-0106](adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), TCK-2686)

Décidé par le porteur le 2026-11-10 : dans la partie connectée, boutons et champs ont la hauteur des maquettes retenues.
Le tableau ci-dessus reste celui du **site public**, de `/super-admin` et des écrans d'entrée, qui ne bougent pas d'un pixel.

| Rôle (portée `/app`) | Pouce : sous `md`, et au pointeur grossier à toute largeur | Bureau : dès `md`, pointeur fin (rendu dès `lg`) |
|---|---|---|
| Bouton courant, bouton icône, `Input`, `SelectTrigger`, `DatePicker` | **44 px**, texte de champ 16 px | `h-9` (36 → 32,4), texte `text-sm` (12,6) |
| Petit bouton (`size="sm"`) | 36 px (plancher tactile) | `h-8` (32 → 28,8) ; `px-3`, `rounded-lg`, texte **13 px** aux deux |
| Action principale (`size="xl"`, neuve) | **48 px**, `px-5`, texte 15 px | `h-12` (48 → 43,2) |
| Portée confortable sous `/app` (`fieldDensityScope()`) | 44 px | `h-11` (44 → 39,6) — elle gagne sur la portée `/app` |

Aspect, au thème clair : contour (`outline`) et champs sur `bg-card` ; doux (`secondary`) à l'encre `primary-deep` en 600 ;
discret (`ghost`) à l'encre douce ; danger bordé de `destructive/30`. Le contour de champ reste `border-input` (3,59:1)
et le focus l'anneau plein (TCK-753) — exceptions d'accessibilité d'ADR-0106 § 2 a. Le sélecteur d'une barre de filtres
s'écrit `<SelectTrigger variante="filtre">` (graisse 500).

**Pourquoi deux échelles.** Le site public est un catalogue lu au doigt et à la souris, réglé une fois (TCK-2460) ;
la partie connectée est un outil de travail dense dont le porteur a choisi les maquettes au pixel. **Pourquoi le
pointeur et pas seulement la largeur** : un iPad à l'horizontale fait 1024 px, et la largeur seule lui donnerait des
cibles de 32 px ; au pointeur grossier, la portée rend le régime du pouce en `rem` fixes (44 px même dès `lg`).

**La mécanique** : chaque primitive lit sa hauteur dans un jeton (`h-controle`, `text-champ`, `bg-fond-champ`… — bloc
`densite-de-l-app` de `globals.css`), dont la valeur par défaut est la classe d'avant ; la portée `/app`
(`data-portee-app`, posée par la coque) le redéfinit, portails compris. Une hauteur ou une teinte écrite par un
appelant **remplace** le jeton (`tailwind-merge` le connaît) : l'appelant garde la main — une classe
`portee-app:h-9` l'aurait raboté. Les pages des vagues 86 à 90 adoptent l'échelle **en retirant** leurs hauteurs
d'appelant, jamais en en écrivant.

### Les primitives existantes sous la portée `/app` ([ADR-0106](adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), TCK-2687)

Sous la portée, sept primitives prennent l'aspect des maquettes retenues ; hors portée (site public, `/super-admin`)
leurs classes sont celles d'avant, au caractère près (`src/components/__tests__/primitives-de-l-app.test.tsx`).

| Primitive | Sous la portée `/app` | Opt-in, partout |
|---|---|---|
| `StatusBadge` | 24 px, tons ci-dessus (§ L'aplat d'une pastille) | ton `primary` |
| `Card` | **trait** sable `border border-border` (1 px, dans la boîte) au lieu de l'anneau gris ; `CardTitle` DM Sans 15 px (`text-corps`) en 600 ; `CardAction` `text-sm font-medium text-primary` | `<CardHeader filet>` : `px-4 py-3`, filet `border-b` |
| `Avatar` | repli `bg-secondary text-primary-deep` en 600 (jetons `fond-avatar` / `encre-avatar` : la teinte d'un appelant les remplace) | `size="28"` à `"48"` : px fixes, police 0,36 × la taille |
| `Tabs` `variant="line"` | pleine largeur sur un filet `border-b`, `gap-6`, onglet de 32 px visibles (`pb-3`), inactif `text-muted-foreground`, trait actif 2 px `--primary` sur le filet ; **cible de 44 px** par un `before:` | `<TabsCount>` |
| `PageHeader` | H1 600, −0,02 em, 20 px / 28 au téléphone | `fil` (fil d'Ariane, 13 px, « › »), `bandeau` (`mb-5`), `dessous` (`mt-5`) |
| `StatCard` | — | `variant="chiffre"` : trait sable, libellé 13 px en casse normale, valeur à −0,02 em |
| `EmptyState` | — | `variant="nue"` : sans carte, `px-6 py-12`, disque de 48 px `bg-muted`, titre DM Sans |

**La mécanique** : une variante `portee-app:` quand aucun appelant ne règle la propriété (couleur d'une pastille, trait
d'une carte, police d'un titre) — la classe reste littérale, lisible par les gardes de contraste ; un **jeton** quand des
appelants la règlent (le repli de l'avatar, que `MenuDuCompte` repeint) ; un **prop** pour ce qui est neuf. L'avatar
« soi » de la maquette (`accent/15`) n'est pas repris : 4,31:1 sur `--background`, 3,68:1 sur `--card` en sombre, et
l'accent reste réservé aux badges *featured*.

### Les primitives existantes, lot 2 ([ADR-0106](adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), TCK-2688)

Même mécanique que TCK-2687 (variante `portee-app:`, classes d'avant au caractère près hors portée,
`src/components/ui/__tests__/primitives-existantes-tck-2688.test.tsx`), sauf le toast, qui change partout.

| Primitive | Sous la portée `/app` |
|---|---|
| `PanneauDroit` (`ui/panneau-droit.tsx`, neuf) | **480 px fixes dès `xl`** (`w-panneau`, 30rem, hors de l'échelle ×0,9), `border-l`, ombre `panneau`, **sans voile ni modalité** (décision 2 a du porteur, 2026-11-10 : la page reste lisible et cliquable à côté ; `Échap` ferme, le focus revient au déclencheur ; un clic à côté ne ferme pas). **Sous `xl`, plein écran et modal** (ADR-0106 § 4 ; `aria-modal`, verrou TCK-551). En-tête `h-14 border-b pl-5 pr-2`, titre 17 px 600, fermer `size="icon"` ; corps `p-5` ; pied `flex justify-end gap-2 border-t px-5 py-3`. `SheetContent side="right"` est inchangé |
| `DataTable` | en-tête `text-xs font-medium` en **casse normale**, sans interlettrage, sur `muted/40` (opaque quand il est collant) ; cellules `px-3 py-3` (densité `compact` inchangée) ; conteneur `border border-border` au lieu de l'anneau |
| `WarningBanner` | `border border-warning/30 bg-warning/10 p-4`, **encre principale** (> 13:1), icône ocre de 20 px ; prop `titre` (600) au-dessus du texte, partout |
| `ChoiceCard` | `min-h-16 px-3.5 py-3` centrée ; radio 20 px au bord 1 px `controle-vide` ; active : `border-primary`, anneau 3 px `primary/12`, fond de carte ; titre 15 px 600, sous-titre 13 px |
| `RadioGroup`, `Radio` (`ui/radio-group.tsx`, neufs) | rond peint de 20 px (`size-5`), bord 1 px `controle-vide`, point `size-2.5 bg-primary` ; base-ui (flèches, arrêt de tabulation unique) ; la ligne est un `<label>` (`eslint.config.mjs` déclare `Radio`) |
| `DebouncedSearchInput` | loupe au jeton de 18 px (`size-icone`, trait de la portée), texte à 12 + 18 + 8 px du bord, bouton « Effacer la recherche » (16 px dessinés, 44 d'appui) à la place de la croix native ; hauteur de l'échelle (44 / 36), contour `border-input` (ADR-0106 § 2 a) |
| **Toast, partout** (décision D8) | **surface sombre** (`.dark` posé sur le toast : `#1f1812`, encre `#fcf9f3`, dans les deux thèmes), `rounded-xl min-h-12 px-4 shadow-lg`, ton dit par l'icône (succès : coche à l'encre du toast, comme la maquette ; attention, danger, info en couleur, ≥ 3:1) ; **en bas** : pleine largeur à 16 px au téléphone, 360 px (`w-toast`) à droite dès `sm` ; `--toast-bas` le pose 16 px au-dessus de la barre d'onglets de `/app` (sous `md`) et du site public (sous `lg`) — la barre d'action collante (TCK-2689) le relève de sa hauteur, par `--barre-d-action-hauteur` ; action texte `ActionDuToast` |

### Les primitives neuves, lot 1 ([ADR-0106](adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), TCK-2689)

Puce de filtre, contrôle segmenté, barre d'action collante, ligne de liste mobile. La puce, la barre et la ligne
sont neuves (leur défaut EST la maquette) ; le segmenté est la variante par défaut de `Tabs` sous la portée `/app`.
Tests : `src/components/ui/__tests__/primitives-neuves-tck-2689.test.tsx` ; vitrine : `/fr/playground/vitrine`.

| Primitive | Dessin |
|---|---|
| `PuceDeFiltre`, `RangeeDePuces` (`ui/puce-de-filtre.tsx`) | **36 px rendus** (`h-9`, 32,4 au bureau), `rounded-full border px-3.5 text-sm` 500 ; taille `sm` `h-8 px-3` 13 px. Repos `border-border bg-card` ; active (`aria-pressed`) `bg-foreground text-background` ; compte `tabular-nums`, à l'**encre douce inverse opaque** sur la puce active (TCK-658, pas de `/70`). Variante `ajouter` : tirets, `+`, « Ajouter un filtre », une action (aucun `aria-pressed`). Rangée `role="group"` nommée, `flex gap-2 overflow-x-auto px-4 py-2.5`, sans barre, bord à bord de son conteneur : elle défile dans sa boîte, jamais le document |
| Contrôle segmenté (`Tabs` par défaut, `ui/tabs.tsx`) | sous la portée : piste `rounded-lg bg-muted p-1` (**44 px** au téléphone, 39,6 au bureau), items `h-9 px-4 rounded-md text-sm` 500 ; actif `bg-card` + ombre `actif` ; inactif `text-muted-foreground` (4,85:1 sur `--muted`). `size="sm"` : `p-0.5`, items `h-8 px-3` 13 px. Pleine largeur : `className="w-full"`. Comportement de base-ui inchangé (la flèche déplace le focus, Entrée choisit). Hors portée, rien ne change |
| `BarreDAction` (`ui/barre-d-action.tsx`) | **73 px** = filet + `py-3` + une action `size="xl"` (48) ; `border-t bg-card px-4 py-3`, ombre `barre-collante` ; une action pleine largeur ou deux à 50/50. **Sous `md` seulement** — `md:hidden` cache sans démonter : la page pose son action de bureau ailleurs. Dans `/app`, elle est rendue en portail dans l'emplacement de la coque (`#emplacement-barre-d-action`, entre le contenu et la barre d'onglets) : en flux, le `<main>` rétrécit, rien ne passe dessous. Zone sûre en plus quand elle est le bas de l'écran (sans barre d'onglets, ou `zoneSure` hors coque). Elle relève le toast (`--barre-d-action-hauteur`) ; le dock flottant garde son calcul. ⚠ **Formulaire** : en portail, la barre est hors du `<form>` ; le bouton d'envoi le nomme (`<Button type="submit" form="…">`) |
| `LigneDeListe`, `IconeDeLigne`, `MontantDeLigne` (`ui/ligne-de-liste.tsx`) | `flex min-h-14 items-center gap-3 px-4 py-2.5`, filet bas, bord à bord ; début : avatar 40 ou icône dans un disque `size-9` (encre douce opaque) ; titre 15 px 500 et détail 13 px discret, tronqués ; fin : pastille, montant tabulaire ou chevron `size-4`. La **ligne entière** est la cible : `href` → lien, `onClick` → bouton |

**La zone tactile élargie par pseudo-élément** (exception (1) d'ADR-0106) : quand la maquette dessine une cible plus
petite que 44 px (puce de 36, onglet souligné de 32), le rendu garde sa taille et un `before:` centré, `absolute
inset-x-0 top-1/2 -translate-y-1/2 h-controle`, porte la cible : 44 px sous le pouce et au pointeur grossier, la hauteur
d'un contrôle du bureau ailleurs. Un pseudo-élément appartient à son élément pour le pointeur. Le conteneur doit laisser
la place au débord (le `py-2.5` de la rangée de puces) : `overflow` le rognerait.

### Les primitives neuves de la partie connectée ([ADR-0106](adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), TCK-2690)

Quatre primitives que le produit n'avait pas, dessinées comme la maquette retenue. Elles n'ont aucun appelant d'avant :
leur défaut EST la maquette, sans portée. Les cases, interrupteurs et jauges natifs ou locaux existants ne changent pas ;
leur migration relève des pages.

| Primitive | Dessin | Contraste (WCAG 1.4.11, 3:1) |
|---|---|---|
| `FeuilleDuBas` (`ui/feuille-du-bas.tsx`) | voile `foreground/35` ; panneau `rounded-t-2xl bg-card`, 90 % de la hauteur au plus, `shadow-feuille` ; poignée 32 × 4 ; titre 17 px tronqué ; fermer 44 px ; corps `px-4 pb-4` ; pied `border-t px-4 py-3` ; zone sûre au pied, sinon au corps. **Dès `md`, le panneau latéral droit** de `PanneauDroit` (480 px fixes, pleine hauteur, `border-l`, ombre `panneau`, en-tête `h-14`, corps `p-5`, pied à droite), **modal, voile compris** — décision du porteur du 2026-11-11 (TCK-2688), qui remplace le dialogue centré de TCK-2690 | — |
| `Checkbox` (`ui/checkbox.tsx`) | **18 px**, rayon 5 px (`size-icone`, `rounded-case`, fixes) ; cochée `bg-primary` + coche 14 px au trait 2,5 ; mixte : la barre 10 × 2 de la maquette | bord vide `controle-vide` : `--input` en clair (3,59:1 sur `--card`, 3,04:1 sur `--muted`), `--muted-foreground` en sombre |
| `Switch` (`ui/switch.tsx`) | piste **24 × 40** (`h-6 w-10 p-0.5`), pouce `size-5 bg-card shadow-sm` | allumé `--primary` (5,32:1) ; éteint `controle-vide` |
| `Progress`, `ProgressSegments` (`ui/progress.tsx`) | rail `h-1.5 bg-muted` (`h-2` en grand), remplissage arrondi ; segments `h-1 gap-1.5` ; nom accessible exigé par le type | chaque ton contre le rail `--muted`, clair / sombre : `primary` 4,51 / 3,99, `success` 5,24 / 6,25, `warning` 5,31 / 6,03, `neutral` (`foreground/50` composé sur le rail) 3,23 / 4,37 |

**Ce que la maquette écrivait et qui ne passe pas** : bord de case `foreground/30` (1,93:1), `border` (1,26:1) ou
`input/60` (2,01:1) ; interrupteur éteint `foreground/20` (1,52:1) ou `border` (1,26:1). `--input` tient en clair mais
rend 1,44:1 sur `--card` sombre, d'où le jeton `controle-vide`, redéclaré sur `.dark`.

**La cible est la ligne, pas le contrôle** : une case de 18 px ou une piste de 24 px ne font pas une cible tactile. La
ligne qui les porte (44 à 56 px) est un `<label>` qui les enveloppe ; son clic les bascule (`eslint.config.mjs` déclare
`Checkbox` et `Switch` comme contrôles de `label-has-associated-control`).

**Le verrou de défilement de la feuille** : hors du régime du bureau (téléphone, et tablette à pointeur grossier),
`useVerrouDeDefilement` (TCK-551 — `overflow: hidden` seul ne tient pas sur iOS, et `scrollBy` le traverse : mesuré à
1024 px tactile), avec `modal="trap-focus"` ; au régime du bureau (`md` et pointeur non grossier), celui de base-ui, qui
compense une barre de défilement classique (le premier sortirait `body` du flux — saut déduit, non mesuré).

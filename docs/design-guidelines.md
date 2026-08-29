# Design & UI Guidelines — Takussan

Ces directives s'appliquent à **toutes les interfaces** de Takussan. Elles priment sur les choix par défaut des composants tiers.

> Design system officiel : **Ancrage Local Contemporain** — palette **Lin** + typographie **Contemporain** (Bricolage Grotesque + DM Sans). Foundation site-wide posée par **TCK-129**, déployée dans `src/app/globals.css`.

## Philosophie visuelle

- **Moderne et épuré** : chaque écran ne montre que ce dont l'utilisateur a besoin à cet instant. Pas de surcharge d'information.
- **Accueillant et chaleureux** : l'immobilier est un acte de vie fort — l'interface doit inspirer confiance et sérénité, pas anxiété. La palette Lin (sable clair + terracotta atténué) ancre l'identité dans un imaginaire local sans tomber dans le folklore.
- **Professionnel sans être froid** : l'esthétique vise les meilleures apps PropTech (Airbnb, Houzz) — pas un back-office générique.
- **Pas de hero marketing sur les surfaces de découverte** : l'utilisateur qui arrive a déjà une intention (louer/acheter). Modèle de référence : Airbnb. Toute proposition de hero illustratif / value prop / slogan est à rejeter sur la homepage publique.
- **Cohérence avant tout** : un seul style de bouton principal, une seule façon d'afficher un état vide, une seule famille d'icônes.

## Typographie

Deux familles, chargées via `next/font` dans `src/app/layout.tsx` et exposées comme tokens Tailwind :

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
- Letter-spacing : titres display en `tracking-tight` (≈ −0.01em) ; eyebrows en `tracking-[0.12em] uppercase`.

> Les fontes alternatives (Geist, Manrope, Inter, Fraunces) restent chargées pour le `/playground` mais ne doivent **jamais** apparaître en prod.

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

La garde de cette décision est
`takussan-web/src/components/console/__tests__/StatusBadge.contraste-tck-450.test.tsx` : elle lit
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
- Spacer Navbar fixe : `h-[133px]` après `<Navbar />` (≈ 65px barre principale + 68px ligne catégories).

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
| **Standard** | 4:3 rounded-xl, prix → titre → location → méta | Découverte générique près de l'utilisateur | « Près de toi » |
| **Listing** (Wide) | Image carrée 1:1 à gauche + méta à droite, format dense liste | Rangées géolocalisées ou listes orientées scan vertical | « À louer » |
| **Cover** (Overlay) | 3:4 façon couverture magazine, gradient bas, titre + prix superposés en blanc | Sections signature / éditoriales | « Coup de cœur » |
| **Compact** | 1:1 carrée, dense, scan rapide | Rangées orientées fraîcheur / nouveauté | « Tout juste publié » |

**Naming canonique** : `PropertyCardStandard / Listing / Cover / Compact` sous `src/components/property/cards/`. Un composant `PropertyRow` générique dispatche via prop `variant`.

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

## Animations standard

Définies dans `globals.css` :

| Classe | Durée | Usage |
|---|---|---|
| `animate-fade-in-up` | 0.5s | Apparition d'un bloc principal après chargement |
| `animate-card-enter` | 540ms | Entrée d'une carte dans une rangée (avec `animationDelay` indexé) |
| `animate-section-enter` | 640ms | Entrée d'une section au scroll |

Easing standard : `cubic-bezier(0.16, 1, 0.3, 1)` (out-expo doux).

## Ton & Micro-copy

- **Accueillant** : s'adresser à l'utilisateur directement ("Vos propriétés", "Ajoutez votre premier bien"). Tutoyer sur les surfaces publiques de découverte (« Près de toi », « Pour ton prochain logement »).
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

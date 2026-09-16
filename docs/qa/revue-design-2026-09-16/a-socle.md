# Revue design — A · socle, coques, primitives (2026-09-16)

**Verdict : Needs changes** — tous les HIGH et MEDIUM relevés dans le périmètre sont corrigés et
vérifiés au banc. Deux gardes racine restent rouges à cause de ces corrections. Leur remède est
dans `scripts/`, hors périmètre (voir « Collisions »).

Pages couvertes : 8/8 (coques `/app` pour agent, tenant et provider · `/admin` · `/super-admin` ·
`/maintenance` · `/verification-indisponible` · `/fr/nexiste-pas` · `/app/nexiste-pas`), plus
3 pages consommatrices pour vérifier les primitives.
Corrections : 46 fichiers (+ 4 tests) · Collisions : 6 · Non mesuré : le bandeau d'annonce (aucune
annonce active, et en créer une demande d'écrire en base) ; `ProUpgradeCard` (seulement pour un
admin d'agence `individual`, le compte de mesure est `standard`) ; le thème sombre (aucune bascule
exposée).

Banc : `probe.mjs --port 9341`. Captures dans `scratchpad/shots/a/avant` et `…/apres`, états ouverts
par `scratchpad/a-evals/*.js`. Mode impeccable : **Operate** pour les coques et les primitives,
**Read** pour les pages d'erreur.

## Pages

### Coque `/app` — agent (3), tenant (104), provider (17)
Relevé avant : 360 ✓ (docOverflow 0) · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓, pour les trois rôles.
États ouverts (agent) : tiroir à 360/390, menu utilisateur à 390/1366, langue à 390/1366, cloche à
360/390/768/1366, messagerie à 768/1366. Le tiroir a aussi été ouvert pour tenant et provider.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/layout/NotificationBell.tsx` (panneau) | `absolute right-0 top-11 w-[min(24rem,calc(100vw-2rem))]`, ancré à la cloche. **Mesuré : x = −40 à 360 et à 390** (titre, dates et corps coupés hors de l'écran) | Sous `sm` : `absolute inset-x-2 top-full`, ancré à la barre (`header` passe `relative`, le conteneur de la cloche seulement `sm:relative`). À partir de `sm` : `right-0 top-11 w-96`, sans changement | La cloche n'est pas au bord droit (l'avatar la suit). Le panneau sortait donc à gauche **sans faire défiler le document** : `docOverflow` ne pouvait pas le voir |
| HIGH | `components/ui/dropdown-menu.tsx:82` | `data-highlighted:bg-card` sur un popup `bg-popover`. **Mesuré : `rgb(255,255,255)` sur `rgb(255,255,255)`** | `data-highlighted:bg-muted` (mesuré `rgb(241,236,224)`) | Dans **tous** les menus (utilisateur, langue, actions de ligne…), l'élément surligné au clavier ou au survol était invisible : `--card` et `--popover` ont la même valeur dans les deux thèmes |
| HIGH | `components/chat-widget/ChatWidget.tsx` (conteneur) | `fixed right-4 hidden md:block`. **À l'ouverture, le lanceur passait de x = 1294 à x = 991** | `md:flex md:flex-col md:items-end`. Mesuré après : x = 1295, panneau ouvert | Le bouton qui ferme le panneau n'était plus sous le pointeur qui venait de l'ouvrir |
| MEDIUM | `NotificationBell.tsx` | Aucune fermeture au clic extérieur ni sur Échap | Un `pointerdown` à l'extérieur ou `Escape` ferme le panneau | Les autres menus de la barre (base-ui) se ferment ainsi ; celui-ci restait ouvert par-dessus la page |
| MEDIUM | `NotificationBell.tsx` | Pastille `bg-red-500 text-white` (3,76:1) ; `bg-white`, `text-red-600`, `bg-amber-50/70` | `bg-destructive` (7,3:1), `bg-card`, `text-destructive`, `bg-muted/60` | Palette Tailwind brute, hors charte ; la pastille est sous 4,5:1 |
| MEDIUM | `NotificationBell.tsx` | « Marquer lu » : cible de **16 px** de haut ; dates en `text-[11px]` | `px-2 py-1.5` (**28 px mesurés**, marges négatives donc alignement inchangé), survol `bg-primary/10`, anneau de focus ; dates en `text-xs tabular-nums` | Cible minuscule ; texte courant sous 12 px |
| MEDIUM | `ChatWidget.tsx` (panneau) | `h-[520px]`, `shadow-2xl`, `ring-black/5` | `h-[min(520px,calc(100dvh-7rem))]`, `shadow-xl`, `ring-foreground/10` | Le panneau dépassait le haut d'un viewport bas ; `shadow-2xl` et le noir littéral sont proscrits par la charte |
| LOW | `ChatWidget.tsx` | Bouton de fermeture `size-8` sans anneau de focus ; lanceur et FAB sans retour de pression ; compteur en `text-[11px]` | `size-9` + anneau ; `active:scale-[0.96]` (neutralisé en mouvement réduit) ; `text-xs tabular-nums` | Cible et focus ; principe 12 |
| MEDIUM | `components/layout/AppTopbar.tsx` | Hamburger 36×36 ; sélecteur de langue 54×28 | Zone tactile étendue par pseudo-élément (`after:`) : 44×44 et 54×44, visuel inchangé | Sous `md`, le hamburger est la **seule** commande qui ouvre le tiroir |
| MEDIUM | `components/layout/UserMenu.tsx` | Déclencheur de 40 px de haut | Pseudo-élément : 44 px | Même raison. Composant partagé avec la Navbar publique : aucun changement visuel |
| MEDIUM | `components/layout/AppShell.tsx` | Tiroir `role=dialog` sans nom accessible | `aria-label` = « Navigation du tableau de bord » (mesuré dans le DOM) | Un lecteur d'écran annonçait « boîte de dialogue » sans rien de plus |
| MEDIUM | `components/layout/AppSidebar.tsx` | Entrées de 36 px dans le tiroir | `max-md:py-2.5` → **40 px mesurés** ; la barre fixe (`md+`) reste à 36 px | Cible tactile. `max-md:` ne touche que le tiroir, la barre fixe n'existant qu'à partir de `md` |
| LOW | `AppSidebar.tsx` (en-tête) | À partir de `md`, le logo « Takussan » se répète 60 px sous celui de la barre haute ; à l'ouverture du tiroir, l'anneau de focus rase les glyphes | `md:hidden` (le tiroir garde le logo) + `md:pt-5` sur la nav ; `px-1` sur le lien | Doublon de marque ; anneau lisible |

Contre-relevé : 360/390/768/1024/1366, docOverflow 0 pour les trois rôles. Panneau de la cloche
dans l'écran : x = 8 → 352 à 360, x = 8 → 382 à 390 ; à 768 et 1366, mêmes coordonnées qu'avant
(312 et 840). Le rendu à 1366 ne régresse pas : même grille, seul le doublon de logo a disparu.
**Preuve de version** : `header.relative` présent, `sheet-content[aria-label="Navigation du tableau
de bord"]`, `transition-property` d'un `[data-slot=button]` = `color, background-color, border-color,
box-shadow, scale`.

### Coque `/admin` — agency_admin (2)
Relevé avant : 360 ✓ · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ (docOverflow 0). Le tiroir a été ouvert à 390.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/layout/AdminShell.tsx` | Tiroir sans nom accessible | `aria-label` = « Administration » (mesuré) | Comme `/app` |
| MEDIUM | `components/layout/AdminSidebar.tsx` | Pastille `bg-red-500/80` ; entrées de 36 px dans le tiroir | `bg-destructive` ; `max-md:py-2.5` (**40 px mesurés**) | Palette brute ; cible tactile |
| LOW | `AdminSidebar.tsx` (marque) | Anneau de focus collé aux glyphes à l'ouverture du tiroir | `px-1` sur le lien et le libellé, `px-5` sur le bloc (le texte reste à la même abscisse) | Anneau lisible |

La barre haute est `AppTopbar` : les correctifs de `/app` s'appliquent aussi ici.
Contre-relevé : 5 largeurs, docOverflow 0 ; tiroir 288 px, entrées de 40 px.

### Coque `/super-admin` — super_admin (1)
Relevé avant : 5 largeurs ✓. Le seul `lt24` est le lien d'évitement `sr-only`, attendu. Le tiroir a
été ouvert à 390.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/layout/SuperAdminShell.tsx` | Tiroir sans nom accessible | `aria-label` = « Navigation super-admin » (mesuré) | Comme `/app` |
| MEDIUM | `components/layout/SuperAdminTopbar.tsx` | Hamburger 36×36 ; langue 28 px de haut | Pseudo-éléments : 44×44 et 44 px de haut | Cible tactile de la seule commande du tiroir |

Contre-relevé : 5 largeurs, docOverflow 0.

### `/maintenance` — anon
Relevé avant : 5 largeurs ✓.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `app/maintenance/page.tsx` | Affiche toujours `window.messages.fr`, même pour un visiteur `en` ou `wo` | Message de la locale s'il est rédigé, sinon `fr`, sinon le libellé traduit | Le type prévoit `en`/`wo` ; un anglophone lisait le français |
| LOW | idem | `bg-white`, `min-h-screen`, `p-8` à 360 | `bg-card`, `min-h-dvh`, `p-6 sm:p-8`, `w-full` ; h1 `text-balance tracking-tight`, corps `text-pretty`, date `tabular-nums` | Jeton ; hauteur du viewport mobile ; rythme |

Contre-relevé : 5 largeurs, docOverflow 0.

### `/verification-indisponible` — agent
Relevé avant : 5 largeurs ✓.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| LOW | `app/(dashboard)/verification-indisponible/page.tsx` | h1 sans `font-display` ; icône d'alerte en `text-primary` | `font-display tracking-tight text-balance` ; icône `text-warning` ; corps `text-pretty` | Charte (titres en Bricolage) ; une alerte se dit en `--warning`, pas en couleur de marque |

Contre-relevé : 5 largeurs, docOverflow 0. Capture à 390 vérifiée.

### `/fr/nexiste-pas` et `/app/nexiste-pas` — anon, agent
Relevé avant : 5 largeurs ✓ pour les deux. **Les deux URL rendent le not-found RACINE** (sans coque) :
Next ne sert `app/(dashboard)/app/not-found.tsx` que sur un appel à `notFound()`, jamais pour une
URL qui ne correspond à aucune route. Voir « Collisions ».

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| LOW | `app/not-found.tsx` | Boutons `rounded-md` sans focus ni retour de pression ; survol `primary/90` ; titre non équilibré | `rounded-lg` (charte), anneau `ring-3 ring-ring/50`, `active:scale-[0.96]`, survol `--primary-deep` ; h1 `text-balance`, corps `text-pretty` | Charte (boutons `rounded-lg`) ; états interactifs |

Contre-relevé : 5 largeurs, docOverflow 0.

### Primitives partagées — revue de code, puis mesure sur des pages consommatrices
Pages de vérification : `/admin/team` (agency_admin), `/super-admin/users` et `/super-admin/agencies`
(super_admin), à 390 et 1366, plus toutes les coques ci-dessus. Aucun changement de dimension de
mise en page, sauf ceux notés (tiroirs, titre de dialogue).

| Sévérité | Emplacement | Avant | Après | Pourquoi | Vérifié sur |
|---|---|---|---|---|---|
| HIGH | `ui/dropdown-menu.tsx` | voir `/app` | — | — | `/app` (menu utilisateur), 390/1366 |
| MEDIUM | `ui/select.tsx` (SelectItem) | `focus:bg-accent focus:text-accent-foreground` : l'option surlignée devenait **vert sauge** | `focus:` + `data-highlighted:` → `bg-muted text-foreground` (mesuré `rgb(241,236,224)` / `rgb(31,24,18)`) | TCK-450 réserve `--accent` aux mises en avant ; un surlignage n'en est pas une | `/admin/team` 390/1366, `/super-admin/users` 1366, `/super-admin/agencies` |
| MEDIUM | `ui/button.tsx` | `transition-all` ; pression par `translate-y-px` ; le bouton plein n'avait de survol **qu'en `<a>`** (`[a]:hover:bg-primary/80`) | `transition-[color,background-color,border-color,box-shadow,scale]` ; `active:scale-[0.96]` (neutralisé en mouvement réduit, sauf `aria-haspopup`) ; `hover:bg-[var(--primary-deep)]` | Principes 12 et 14 ; un `<button>` principal ne réagissait pas au survol. `--primary-deep` est le « hover » de la charte : plus sombre, donc l'encre claire y **gagne** du contraste, là où `/80` en perdait | `transition-property` lu sur `/super-admin/users` et `/admin/team` ; captures à 1366 sans décalage |
| MEDIUM | `forms/FormCheckbox.tsx` (collision signalée par C) | Le libellé, qui est la cible (`htmlFor`), mesurait 20 px de haut autour d'une case de 16×16 : c'était la seule cible sous 24 px de `/auth/register` | Libellé `-mx-2 -my-3 px-2 py-3 rounded-lg`, anneau `has-[:focus-visible]:ring-3 ring-ring/50` (forme de `HostIndividualWizard`) ; case inchangée (`size-4`, `focus-visible:outline-none` puisque l'anneau est sur la ligne) ; libellé `text-pretty` | La zone cliquable monte à **44 px** (une ligne) ou **64 px** (deux lignes). Les marges négatives rendent l'espace : **la case reste à la même ordonnée**, mesurée avant et après (y = 779 à 390, 567 à 1366). La sonde signale toujours `input 16x16`, mais c'est l'élément natif ; la cible réelle est la ligne | `/auth/register` à 390/1366 (libellé 358×64 et 464×64, docOverflow 0) ; `/app/properties/47`, onglet « Édition » (`field-furnished`), à 390/1366 : libellé de 44 px, l'élément suivant commence 4 px sous lui, sans chevauchement, docOverflow 0 |
| MEDIUM | `charts/LineChart.tsx` (collision signalée par D) | Marge gauche fixe (`PADDING.left`) : à 1366, les graduations à 11 chiffres étaient rognées à gauche (« ¦00 342 ») | Marge **calculée** sur la graduation la plus longue (6 px par caractère + 6 px d'écart), avec `PADDING.left` comme plancher ; graduations en `tabular-nums` | Le **format compact** proposé n'est pas appliqué : `palette-et-locale.test.tsx` fige les libellés exacts de l'axe (`'1,000,000'`…), et un montant exact est plus sûr qu'un arrondi dans un tableau de bord financier. Mesuré : graduation la plus à gauche à x = 24 px dans le SVG (avant : rognée) | `/app/overview/agency` (agency_admin) à 360/1366 et `/app/overview/owner` (owner) à 1366 : « 221 600 342 » et « 69 587 696 » entiers, docOverflow 0 |
| MEDIUM | `charts/StatCard.tsx` (collision signalée par D) | Valeur en `text-2xl` à toutes les largeurs : « 132 693 386 F CFA » frôlait le débordement d'une tuile `grid-cols-2` à 360 | Valeur `text-xl sm:text-2xl`, `flex-wrap gap-x-2 break-words` ; tuile `min-w-0` | Une tuile de 2 colonnes à 360 ne laisse qu'environ 110 px au texte ; `break-words` sert de dernier recours | `/app` (agency_admin) à 360 : valeurs en `text-xl`, docOverflow 0 ; `/app/overview/agency` à 360/1366, docOverflow 0 |
| MEDIUM | `console/PageHeader.tsx` (collision signalée par D) | Côte à côte dès `md` : à 768, la coque ne laisse que 464 px, et le bloc d'actions passait à la ligne en séparant un bouton de son menu « ⋯ » | Empilé sous **`lg`** (`lg:flex-row lg:items-start lg:justify-between`, règle TCK-505) ; actions `shrink-0` : côte à côte, c'est le titre (`min-w-0`) qui passe à la ligne | `shrink-0` seul, dès `md`, aurait écrasé le titre d'une page à trois boutons dans ces 464 px. Le passage à `lg` est plus sûr : empilé, rien ne peut déborder | `/app/properties/47` (agent) : à 768, titre et actions empilés sur 464 px (actions à y = 174) ; à 1024 et 1366, côte à côte comme avant (actions à x = 790 et x = 1132), docOverflow 0 aux trois largeurs. 78 pages l'importent |
| LOW | `ui/badge.tsx`, `ui/tabs.tsx`, `welcome/WelcomeModal.tsx` | `transition-all` | Liste explicite (couleurs + anneau ; `width,background-color` pour les points du tour de bienvenue) | Principe 14 | `/admin/team` (onglets) 390 |
| LOW | `ui/dialog.tsx` (DialogTitle) | `leading-none` : un titre sur deux lignes collait ses lignes | `leading-snug text-balance` (+4 px sur un titre d'une ligne, dans le dialogue seulement) | Lisibilité d'un titre qui se replie | revue de code (aucune page de mon périmètre n'ouvre de dialogue sans écriture) |
| LOW | `ui/table.tsx` | Chiffres proportionnels | `tabular-nums` sur `<table>` | Principe 9 ; colonnes de montants et de dates alignées | `font-variant-numeric` lu sur `/super-admin/users`, `/admin/team` |
| LOW | `console/PageHeader.tsx` | Titre et description sans règle de coupure | h1 `text-balance`, description `text-pretty` | Principe 10 | `/super-admin/users`, `/admin/team` |
| MEDIUM | `console/StatCard.tsx` | Delta « up » en `text-accent` (sauge) | `text-success` | TCK-450 : « ça va bien » se dit `--success` | test mis à jour (intention inchangée) |
| LOW | `console/DataTable.tsx` | Bouton de tri : cible = le texte seul (≈ 16 px) | `-m-1 p-1 rounded-sm` : cible agrandie, alignement inchangé | Cible | revue de code |
| LOW | `charts/StatCard.tsx` | Valeur en chiffres proportionnels | `tabular-nums` | Principe 9 (tuiles de `/app`) | `/app` 390/768/1366 |
| LOW | `feedback/EmptyState.tsx` | — | titre `text-balance`, description `text-pretty` | Principe 10 | revue de code |
| MEDIUM | `announcements/GlobalAnnouncementBanner.tsx` | `stone-900` / `emerald-900` / `amber-800` / `red-900` bruts | `bg-foreground text-background` / `bg-success text-success-foreground` / `bg-warning text-warning-foreground` / `bg-destructive text-background` ; survol du bouton de fermeture `bg-background/15` | Palette brute hors charte. Les couples de jetons valent ≥ 4,5:1 dans les deux thèmes (valeurs de la charte) | **non mesuré au rendu** (aucune annonce active) — **fait rougir une garde, voir « Collisions »** |
| LOW | `layout/ProUpgradeCard.tsx` | Corps en `text-[0.7rem]` (11,2 px) ; flèche en glyphe « → » | Corps `text-xs text-pretty` ; CTA eyebrow `text-[11px]` ; icône `ArrowRight` | Charte : pas de texte courant sous 12 px ; pas de glyphe Unicode en guise d'icône | **non mesuré** (affiché seulement pour une agence `individual`) |
| LOW | `shared/NoAgencyState.tsx`, `shared/StubPlaceholder.tsx` | h1 sans `font-display` ; icône sans `aria-hidden` | `font-display tracking-tight text-balance` ; `aria-hidden` | Charte ; a11y | revue de code |
| LOW | `app/globals.css` (`@layer base`) | Titres sans équilibrage ; sélection de texte au bleu du système | `h1,h2,h3 { text-wrap: balance }` ; `::selection` en `color-mix(--primary 20%)` | Principe 10 ; la sélection est une « surface du navigateur » à habiller aux couleurs de la charte (craft floor). Posé en `base` : un utilitaire le remplace | toutes les pages mesurées ; `antialiased` était **déjà** présent sur `<body>` (`app/layout.tsx`) |

### Cibles tactiles des primitives sous `sm` (lot du lead, signalé par E, F et C)

Changement de géométrie **mobile uniquement**, appliqué comme un **plancher** et non comme une
hauteur :

- `ui/button.tsx` : `default`, `lg` et `icon` reçoivent `max-sm:min-h-10` (et `max-sm:min-w-10`
  pour `icon`) ; `sm` et `icon-sm` reçoivent `max-sm:min-h-9` (et `max-sm:min-w-9` pour
  `icon-sm`). `xs` et `icon-xs` ne changent pas.
- `ui/input.tsx` : `max-sm:min-h-10`.
- `ui/select.tsx` : `max-sm:data-[size=default]:min-h-10` et `max-sm:data-[size=sm]:min-h-9`.
- `ui/tabs.tsx` : la liste horizontale reçoit `max-sm:…:min-h-10`, et chaque déclencheur `max-sm:…:min-h-8.5`.

**Pourquoi un plancher plutôt que la forme proposée (`h-10 sm:h-8`).**
- Environ 26 appelants de `Button` écrivent déjà leur hauteur (`h-10`, `h-11`, `h-12`).
- `twMerge` ne voit pas de conflit entre `h-11` et `sm:h-8` : avec la forme proposée, ces boutons auraient pris 32 px **en bureau**.
- Avec `max-sm:h-10`, les boutons en `h-11` seraient **descendus** à 40 px sur mobile.
- Un plancher ne réduit jamais une hauteur. Il ne bat pas la portée `data-field-density="comfortable"` (44 px, TCK-468). Et il ne s'applique pas à partir de `sm`.

**Texte des champs.** Il reste à 16 px sous `md` (`text-base md:text-sm`, déjà en place), donc iOS ne zoome pas au focus.

**Résultat mesuré (sonde + `--eval` qui compte les hauteurs par `data-slot`).** Mesuré à 360 et 390, avant et après, sur 10 pages :

| Page (rôle) | Avant | Après | docOverflow / `over[]` après |
|---|---|---|---|
| `/app/customers` (agent) | boutons 28 · champ 32 · listes 32 | 36 · 40 · 40 | 0 / 0 |
| `/app/customers/new` (agent) | boutons 32 · champs 32 · listes 32 | 40 · 40 · 40 | 0 / 0 |
| `/app/visits` (agent) | onglets 25 | 34 (liste de 40) | 0 / 0 |
| `/app/bookings` (agent) | onglets 25 | 34 | 0 / 0 |
| `/app/payments` (tenant) | champ 32 · listes 32 · onglets 25 | 40 · 40 · 34 | 0 / 0 |
| `/app/properties` (agent) | boutons 28/32 · champ 32 · liste 32 | 36/40 · 40 · 40 | 0 / 0 |
| `/admin/team` (agency_admin) | boutons 28 · liste 32 · onglets 25 | 36 · 40 · 34 | 0 / 0 |
| `/super-admin/users` (super_admin) | 23 boutons de 28 | 36 | 0 / 0 |
| `/auth/login` (anon) | boutons et champs 44 (portée confortable) | 44, inchangé | 0 / 0 |
| `/fr/properties` (anon) | listes 32 | 40 | 0 / 0 |

**Bureau strictement identique**, mesuré sur `/app/customers` et `/app/visits` :
- à 639 px, nouvelles hauteurs ;
- à 640 et 1366 px, hauteurs d'avant (28/32/25).

La coupure tombe donc exactement à `sm`.

**Captures relues** (`shots/a/tactile-{avant,apres}/*_360.png`) : aucune barre d'outils ne
déborde. La liste d'onglets de `/app/visits`, coupée à droite (« An… »), l'était **déjà avant** :
c'est une liste qui défile, pas une régression.

Le compte `lt44` de la sonde ne bouge pas, et c'est attendu : 36 et 40 px restent sous 44. En revanche, le
nombre de cibles de 24 à 32 px a disparu sur ces pages.

### Lot du groupe H sur les primitives (C6 à C11)

| Id | Emplacement | Avant | Après | Mesure |
|---|---|---|---|---|
| C6 | `console/StatCard.tsx` | `text-2xl` fixe : « 6 176 568 203 F CFA » **débordait** de sa tuile sur `/super-admin` à 768 (226 px) et à 1366 (257 px). « 181 623 872 F CFA » passait sur **2 lignes** sur `/super-admin/agencies/1` à 768 et 1024 | La tuile devient conteneur (`@container/stat`). Une valeur **longue** (texte ou nombre de plus de 12 caractères) prend `text-lg`, puis `text-xl` à partir de 14rem et `text-2xl` à partir de 16rem de tuile. Les valeurs courtes gardent `text-2xl` : les « 4 », « 302 » de la même rangée ne rétrécissent pas | `/super-admin` : 24 px à 360 et 1024, 18 px à 768, 20 px à 1366 ; **une ligne, sans débordement**, à chaque largeur. `/super-admin/agencies/1` : 18 px et une ligne à 768/1024 (avant : 2 lignes), 24 px à 360/1366. Capture 1366 relue. docOverflow 0 |
| C8 | `console/FilterBar.tsx` | Défaut `md:grid-cols-3 xl:grid-cols-4` | `lg:grid-cols-3 xl:grid-cols-4` (TCK-505) | Les 8 appelants passent tous `controlsClassName`. **À 768, rien ne change pour aucun d'eux** : ils écrasent tous `md:`. Deux passent en `flex`, ce qui neutralise la grille. ⚠ Trois appelants **gagnent 3 colonnes entre 1024 et 1279** (avant : 2), parce que leur surcharge n'a pas de `lg:` : `super-admin/agencies` (`md:2 xl:3`), `SuperAdminPropertiesFilters` (`md:2 xl:5`) et `super/moderation` (`md:2 xl:4`). Mesuré à 1024 : 3 colonnes sur 720 px, docOverflow 0 sur les trois. C'est un palier intermédiaire cohérent avec leur `xl`. S'il ne convient pas, ils peuvent ajouter `lg:grid-cols-2`. À 360/768/1366, les colonnes sont inchangées (1/2/3, 1/2/5, 1/2/4) |
| C9 | `ui/select.tsx` | Hauteur de base sous `data-[size=default]:h-8` (0,2,0) : un `className="h-9"` d'appelant, moins spécifique, restait **sans effet** | Base **nue** `h-8`. Twmerge remplace désormais la hauteur d'un appelant. `data-[size=sm]:h-7`, la portée confortable empilée (0,2,0) et les surcharges `data-[size=default]:h-10` gagnent toujours. `field-density.ts` (docblock) et `field-density.test.tsx` sont mis à jour | **Sans surcharge, rien ne change en bureau** : `/app/customers` à 1366 reste à 32 px (×3). **Les 9 appelants en `h-9`/`h-8` nus** (ModerationWorkspace ×2, InventoryList ×2, MaintenanceList ×2, AdminPayoutsClient, PropertyList, PropertyPagination) prennent enfin leur hauteur : `/app/inventories` et `/app/maintenance` passent de 32 à **36** en bureau, ce qui est leur intention écrite. PropertyPagination (`h-8`) ne change pas. Les 14 appelants en `data-[size=default]:h-10` (super-admin) gardent leurs 40 px : `/super-admin/agencies`, `/properties` et `/moderation` mesurés à 40 |
| C10 | `ui/button.tsx` (`sm`) | — | Rien de plus : le plancher de 36 px sous `sm` est déjà posé | — |
| C11 | `ui/date-picker.tsx` | La prop `placeholder` **existe déjà** (ligne 30). Le défaut « Choisir une date » est neutre, mais il est identique pour les deux bornes quand l'appelant ne passe rien | Rien dans la primitive : elle ne peut pas savoir de quelle borne il s'agit. Une prop `bound` ferait doublon avec `placeholder`. Les appelants à corriger sont listés dans « Collisions ». J'ai aussi ajouté au bouton le plancher mobile `max-sm:min-h-10`, par cohérence avec `Input` et `Select` (lot des cibles tactiles) | `field-density.test.tsx` (DatePicker `h-8`) reste vert |

### Lot du groupe G sur les primitives

| Point | Emplacement | Avant | Après | Mesure |
|---|---|---|---|---|
| G1 | `charts/BarChart.tsx` | Marge gauche fixe (40) : sur `/admin`, les graduations sortaient du SVG, « 221 600 342 F » commençant à x = −14 à 390 et x = −21 à 1366. Étiquettes en 10 unités de `viewBox` | Marge **calculée** sur la graduation la plus longue (6,8 unités par caractère + 6, plancher 40, comme `LineChart`) ; étiquettes en **12 unités** (`text-xs`) + `tabular-nums` sur l'axe Y | Graduations **entières dans le SVG** : x ≥ 6 à 360/390/768/1366. Taille rendue : environ 8,8 px à 1366 (avant 7,4) et environ 5,7 px à 390 (avant 4,8). AC3 de TCK-405 (coordonnées d'avant pour les étiquettes courtes) reste vert. **Les 12 px après mise à l'échelle ne sont PAS atteints, et ne peuvent pas l'être dans cette forme.** Le SVG a un `viewBox` fixe de 640×260 dans une boîte `h-64`, donc son échelle vaut 0,48 à 390 et 0,74 à 1366. Rendre 12 px à 390 demanderait 25 unités, soit 34 px à 1366, et des mois qui se chevauchent. La seule vraie solution est de sortir les étiquettes du SVG, en HTML positionné en pourcentage. Cela change la structure, et les tests (`etiquettesAxe`, AC3) lisent les `<text>` : ce serait un ticket à part |
| G2 | `console/DataTable.tsx` | État vide : en-têtes, puis un `EmptyState` à bordure pointillée et fond carte, soit une carte dans la carte | Les en-têtes **restent** : c'est une décision écrite dans la doc de la prop `emptyState`, et `DataTable.test` l'asserte. Le **cadre** de l'état vide est retiré par la cellule (`*:border-0 *:rounded-none *:bg-transparent`) | `/admin/audit` (agency_admin), recherche « zzzzqqqxx » saisie par `--eval` : bordure 0 px, fond transparent, rayon 0, 5 en-têtes, à 390 et 1366 ; capture 1366 relue. docOverflow 0. Les listes vides de `/super-admin/users`, `/kyc`, `/alerts` et `/admin/team` passent par `DataState` sans table : elles ne sont pas concernées |
| G2' | `console/DataTable.tsx` (`align-top`) | — | **Écarté.** Les cellules sont `whitespace-normal`, et plusieurs tables ont des cellules sur deux lignes (nom + e-mail dans `users` et `team`, description dans l'audit). Aligner en haut garde les premières lignes alignées entre colonnes. Pour passer au milieu, il faudrait d'abord mesurer les 16 tables, dont plusieurs vides en démo | — |
| G3 | `console/DebouncedSearchInput.tsx` | `h-10` | **Écarté, prémisse non reproduite.** Mesuré à 390 et 1366 : sur `/super-admin/users`, recherche 40 px et selects 40 px (×4). Sur `/admin/audit`, recherche, selects et date pickers font tous 40 px (capture 1366). Les voisins de ces barres ne sont **pas** à 32 px : leurs appelants posent `data-[size=default]:h-10`. Ramener la recherche à 32 px **créerait** le désalignement signalé. Le plancher mobile est déjà de 40 px | — |

### Relecture adverse (F1, F2, F3, P1) : corrections

Rapport de la relecture : `$S/verif/socle.md`. Les quatre points sont corrigés. Les appelants modifiés l'ont été avec l'accord du lead.

| Point | Défaut confirmé | Correction | Preuve |
|---|---|---|---|
| **F1** | Le plancher `max-sm:min-h-*` **rabotait** le `min-h-*` plus grand d'un appelant sous 640 px : même spécificité, variante émise plus tard, et twMerge ne détecte pas de conflit. `ContactSheet` passait de 56 à 40 px, `StepLieu` de 44 à 36/40, `PropertyHeader` de 40 à 36. Le docblock promettait l'inverse | Les planchers sortent des utilitaires. Ce sont maintenant des classes `.plancher-tactile-{10,9}`, `.plancher-tactile-carre-{10,9}` et `.plancher-onglets-{liste,declencheur}`, définies dans **`@layer components`** de `globals.css` (bloc balisé `plancher-tactile:début/fin`), sous `@media (width < 40rem)`. Une couche inférieure perd contre **tout** utilitaire d'appelant. Même mécanisme pour Button, Input, Select (plancher choisi par `size`), DatePicker et Tabs : pour les onglets, `[data-orientation=horizontal]` est posé par base-ui sur la liste et sur chaque onglet. Docblocks corrigés | **Tailwind compilé** (`plancher-tactile.test.tsx`) : ordre déclaré `theme, base, components, utilities` ; plancher dans `components` ; `min-h-14` dans `utilities`. Non-vacuité : l'ancienne forme était bien dans `utilities`, et après l'appelant. **Navigateur** (feuille réelle de `next dev`, éléments injectés sur `/auth/login`, `a-evals/plancher.js`) : à 390 et 639 px, ContactSheet (lg + `min-h-14`) **56**, StepLieu (sm + `min-h-11`) **44**, PropertyHeader (sm + `min-h-10`) **40**, feature-flags (`h-auto min-h-9`) **36** (avant : gonflé à 40). Default nu 40, sm nu 36, icône 40×40, portée confortable 44, onglets 40/34. **À 640 et 1366 : 32/28/32×32/25**, bureau inchangé |
| **F2** | Survol du bouton plein en `--primary-deep`, que `.dark` ne redéfinissait pas : 2,18:1 sous la portée sombre d'`agency-detail`. **C'est moi qui avais introduit ce survol** (`git diff` : `[a]:hover:bg-primary/80` → `hover:bg-[var(--primary-deep)]`) | `globals.css`, bloc `.dark` : `--primary-deep: #d6916b`, **plus clair** que `--primary` puisque l'encre est sombre, soit **6,78:1** avec #1f1812. Ajout à `JETONS_SOMBRE` (`src/test/contraste-wcag.ts`), dont `jetons-compiles.test.ts` garde la parité avec `globals.css` | `button-survol.contraste.test.ts` : clair 7,64:1 et sombre 6,78:1 ≥ 4,5. Non-vacuité : la valeur claire sous l'encre sombre échoue. `check-destructive-contrast` et toutes les gardes `scripts/check-*.mjs` sont vertes |
| **F3** | `lg:grid-cols-3` (défaut) survivait au `md:grid-cols-2` de trois appelants, qui prenaient 3 colonnes entre 1024 et 1279 px | `lg:grid-cols-2` ajouté chez les trois appelants : `super-admin/agencies/page.tsx:134`, `admin/super/moderation.tsx:110`, `SuperAdminPropertiesFilters.tsx:98`. Le défaut `lg:` reste pour les futurs appelants | Sortie `twMerge` : les trois donnent `md:2 lg:2 xl:{3,5,4}`, soit **les mêmes colonnes qu'avant la revue à chaque palier**. Les autres appelants sont identiques (déjà un `lg:`, ou en `flex`). ⚠ **Contre-relevé navigateur impossible** : PostgreSQL (port 5433) ne répond plus depuis la fin de soirée (`connection refused` sur l'API, `/super-admin/*` redirige en 307). Je n'ai rien redémarré, conformément au brief |
| **P1** | Plausible, **confirmé à la mesure** : les `SelectTrigger` en `h-auto` ont bien changé de hauteur quand j'ai sorti la hauteur par défaut du sélecteur `data-[size=default]`. Sur `/fr/properties` (1366) : pilules de tri 32 → 34 px, sélecteur Acheter/Louer de la Navbar 32 → 20 px | `h-auto` → `h-8` chez les appelants : `SearchToolbar.tsx:123/142` et `Navbar.tsx:275`. Cela rend exactement la hauteur d'avant | `/fr/properties` : 32/32/32 à 1366, 40/40 à 390 (plancher, comme avant). docOverflow 0 |

## Collisions (hors périmètre — NON appliquées)
| Fichier:ligne | Avant | Après | Pourquoi | Pages touchées |
|---|---|---|---|---|
| `app/(super-admin)/super-admin/agency-upgrade-requests/page.tsx:251,264` (H) | Deux `<DatePicker>` sans `placeholder` → « Choisir une date » ×2 | `placeholder={…from}` / `placeholder={…to}` (clés « Du » / « Au », trois langues), comme `super-admin/agencies/page.tsx:191,202` | C11 : les deux bornes d'une plage ne se distinguent pas | `/super-admin/agency-upgrade-requests` |
| `components/payments/PaymentsHistoryFilters.tsx:122,133`, `app/(dashboard)/app/overview/exports/ExportForm.tsx:98,102`, `components/admin/AuditTrail.tsx:219,229` | Même défaut | Même remède (modèle : `reporting/ReportWindowControls.tsx:73,83`, `placeholder` + `aria-label`) | C11 | `/app/payments`, `/app/overview/exports`, `/admin/audit` |
| `scripts/check-super-admin-tokens.mjs` (cliquet « tableau de bord /app », `RESTE_PLAFOND`) | 25 | **19**, avec une note datée du 2026-09-16 | **Garde ROUGE à cause de mes correctifs** : `NotificationBell` n'utilise plus `bg-red-500`, `bg-white`, `text-red-600`, `bg-amber-50`. La garde est bilatérale et exige que le cliquet descende. À re-mesurer à la fusion (d'autres groupes le font bouger). Signalé au lead | CI dépôt |
| `scripts/check-status-badge-unique.mjs` (`TABLES_DE_TONS_CONNUES`) | — | Ajouter `takussan-web/src/components/announcements/GlobalAnnouncementBanner.tsx` avec la raison « bandeau d'annonce plein, quatre sévérités : un message, pas une pastille » | **Garde ROUGE (contrôle C)** : la table était en palette brute, que la garde ne voyait pas ; en jetons, elle la voit. Si l'inscription est refusée, revenir sur ce fichier (et garder la palette brute) plutôt que de contourner la garde. Signalé au lead | CI dépôt |
| `app/(dashboard)/app/[...introuvable]/page.tsx` (fichier à créer) | — | `export default function Page() { notFound(); }` | `/app/<faute de frappe>` sort de la coque et tombe sur le 404 **public** (« Voir les annonces ») : `app/not-found.tsx` du segment n'est servi que sur `notFound()`. Décision de routage, pas un affinage | tout `/app/*` inexistant |
| `components/profile/ProfileSwitcher.tsx` (pastille « ● Agent · Dakar Immo ») | Point sombre sur la barre sombre, quasi invisible à 1366 | Point en `bg-success` (ou `bg-white/60`) | Le point ne se voit pas (capture `avant/agent_app_1366.png`) | barre haute de `/app` et `/admin` |

Les deux gardes ci-dessus : **le lead a validé les deux correctifs** et ajustera lui-même les gardes
à l'intégration (cliquet re-mesuré après tous les agents, table du bandeau inscrite avec la raison
ci-dessus).

Signalements sans fichier à moi : « 6 176 568 203 F / CFA » coupé dans la console (groupe H) ;
`/super-admin/users` affiche le code brut `active` dans la pastille de statut (H). La grille de
`/admin` qui coupait « 132 693 386 F CFA » est déjà corrigée par le groupe G (3 colonnes, capture
`apres2/agency_admin_admin_1366.png`).

## Écartés
| Emplacement | Candidat | Écarté parce que |
|---|---|---|
| `ui/sheet.tsx`, `ui/dropdown-menu.tsx` (ombre) | Passer de `--foreground` à `--shadow-color` (TCK-460) | Le docblock de `dropdown-menu` justifie cette lueur ambiante, qui s'éclaircit en thème sombre : c'est une décision documentée, pas un oubli |
| `ui/button.tsx` (tailles `h-8`, `size-8`) | Monter les boutons à 40/44 px | Change la géométrie de 117 pages et les captures de 7 agents en cours ; seules les commandes de coque ont reçu une zone tactile étendue par pseudo-élément |
| `feedback/EmptyState.tsx` | Icône `text-accent` → neutre | Identité visuelle de tous les états vides ; décision de charte à prendre en dehors d'un affinage |
| `app/not-found.tsx`, `app/maintenance` | Retirer l'eyebrow au-dessus du titre (interdit du craft floor) | La charte du dépôt prescrit les eyebrows (`tracking-[0.12em] uppercase`) : c'est la consigne du dépôt qui l'emporte |
| `components/layout/AppSidebar.tsx:221` (collision signalée par F) | Réserver « Carnet prestataires » aux comptes qui ont la capacité d'invitation, parce que « tout agent » le verrait | **Prémisse non reproduite.** L'entrée est conditionnée à `agency_admin` / `isAdmin` / `super_admin`, et `isAdmin` **exclut** `agent` (`lib/roles.ts`). Mesuré au banc sur `/app` à 1366 : l'agent 3 n'a pas `/app/maintenance/providers` dans sa barre ; l'agency_admin 2 l'a. Sur `/app/maintenance`, l'agent n'a **aucun** lien vers le carnet (`a[href="/app/maintenance/providers"]` → `[]`). `AppSidebar.test.tsx` et `AppSidebar.audience.test.tsx` figent déjà ce jeu (agent sans l'entrée). Le seul cas restant est un **agency_admin sans délégation**, qui n'existe pas (l'admin a toujours la capacité). La page gère de toute façon un 403 par un `EmptyState` (« accès refusé »). Aucun changement |
| Tiroirs | Ajouter un bouton « Fermer » | Le voile reste visible et cliquable (102 px à 390), et Échap ferme le tiroir : ce serait un ajout de comportement, pas un correctif |
| `console/Pagination.tsx` | Boutons `sm` (28 px) à 40 px sur mobile | Pas de page consommatrice de mon périmètre pour le mesurer sans risque de décaler les listes des autres groupes |

## Vérification
- **Banc corrigé (CORS), puis re-relevé.** Les relevés « avant » ont été faits sur
  `127.0.0.1:3000`, où l'API refusait les appels côté client. Après la correction du banc
  (`localhost:3000`), j'ai refait : `/app` (agent) aux 5 largeurs, messagerie ouverte à 768/1366,
  `/admin` aux 5 largeurs, et `/super-admin/users` et `/admin/team` à 390/1366 (option de liste
  surlignée). Tous en docOverflow 0 ; l'option surlignée mesure toujours `rgb(241,236,224)`.
  **Seule conclusion invalidée** : l'erreur « Impossible de charger les conversations » du widget
  venait du CORS ; la liste s'affiche désormais (capture `apres2/chat/agent_app_1366.png`), et le
  lanceur reste au bord droit (x = 1295). Le panneau de la cloche passe par des server actions : il
  n'était pas touché. Les relevés de `/maintenance`, `/verification-indisponible` et des 404 ne
  dépendent d'aucun appel client.
- Banc : `a-run.sh` (enveloppe de `probe.mjs --port 9341`). Avant et après aux 5 largeurs sur les 8
  pages, états ouverts par `--eval`. Captures relues : `/app` 390/768/1366, cloche 390/1366,
  messagerie 1366, tiroirs `/app` et `/admin` 390, `/super-admin` 390/1366, `/super-admin/users`
  1366, `/admin/team` 390, `/verification-indisponible` 390/1366, 404 390/768, `/maintenance` 390.
  Pendant un premier contre-relevé, l'overlay de Next accusait
  `app/(super-admin)/super-admin/enums/page.tsx` (groupe H en cours d'édition) : j'ai attendu, puis
  remesuré.
- `npx vitest run src/components/{layout,ui,console,chat-widget,feedback,charts,shared,forms,floating-dock,providers} 'src/app/(dashboard)/app/__tests__'`
  → **45 fichiers, 414 tests verts**. Un test a été adapté :
  `console/__tests__/StatCard.test.tsx` (`text-accent` → `text-success`, même intention).
- `npx eslint <31 fichiers modifiés>` → 0 erreur ; `npx eslint src/components/forms/FormCheckbox.tsx` → 0.
- `npx vitest run src/components/forms src/components/property-form 'src/app/(auth)'` → **17 fichiers,
  191 tests verts** (après la correction de `FormCheckbox`). Détecteur sur ce fichier : `[]`. Classes
  émises : ✓ (1686).
- Collisions du groupe D (`LineChart`, `charts/StatCard`, `PageHeader`) :
  `npx vitest run src/components/charts src/components/console` → **15 fichiers, 106 tests verts** ;
  `npx eslint` sur les trois fichiers → 0 ; `check-classes-emises` → ✓ (1723) ; détecteur → `[]`.
  Banc : `/app/properties/47` à 768/1024/1366, `/app/overview/agency` à 360/1366,
  `/app/overview/owner` à 1366, `/app` à 360. Captures relues dans `shots/a/d-coll/`. Preuve de
  version : la classe `flex shrink-0 flex-wrap` est lue dans le DOM. Une première passe à 768 avait
  mesuré l'ancienne version ; je l'ai refaite.
- Lot « cibles tactiles » :
  `npx vitest run src/components/ui src/components/property-form src/components/forms` → **19
  fichiers, 208 tests verts** (dont `field-density.test.tsx` et `cibles-tactiles.test.tsx`) ;
  `npx eslint` sur `button`, `input`, `select` et `tabs` → 0 ; classes émises ✓ (1732) ; détecteur → `[]`.
  Banc : `t-run.sh` (`probe.mjs --port 9341 --widths 360,390 --eval a-evals/tact.js`), JSON avant et
  après dans `shots/a/tactile-{avant,apres}.*.json`.
- Lot H (C6 à C11) :
  - `npx vitest run src/components/ui src/components/console src/components/forms` → **18 fichiers, 100 tests verts** ;
  - `npx vitest run src/components/admin src/components/reporting src/components/inventory src/components/maintenance`
    (consommateurs de `Select` et de `FilterBar`) → **61 fichiers, 378 tests verts** ;
  - eslint sur les 6 fichiers → 0 ; classes émises ✓ (1736, `@container/stat` et `@min-[14rem]/stat:` compris) ; détecteur → `[]` ;
  - banc (`a-evals/h.js`) : `/super-admin`, `/super-admin/agencies/1`, `/super-admin/agencies`, `/super-admin/properties` et `/super-admin/moderation` à 360/768/1024/1366 ; `/app/inventories`, `/app/maintenance` et `/app/customers` à 390/1366. docOverflow 0 et `over[]` vide partout. Avant : `shots/a/h-avant`, après : `shots/a/h-apres`.
- Lot G :
  - `npx vitest run src/components/console src/components/charts src/components/feedback` → **17 fichiers, 112 tests verts** ;
  - eslint sur `DataTable` et `BarChart` → 0 ; classes émises ✓ (1727) ; détecteur → `[]` ;
  - banc (`a-evals/g.js`, `e2.js`) : `/admin` à 360/390/768/1366, `/admin/audit` et `/super-admin/users` à 390/1366. Avant : `shots/a/g-avant`, après : `shots/a/g-apres`.
- Relecture adverse :
  - `npx vitest run src/components/{ui,console,charts,layout,search,home,public/profile,property-form,admin/super} src/test` → **88 fichiers, 686 tests verts** (nouveaux : `plancher-tactile.test.tsx` et `button-survol.contraste.test.ts`) ;
  - eslint sur les 13 fichiers touchés → 0 ; classes émises ✓ (1724) ;
  - `for g in scripts/check-*.mjs` → **toutes vertes**, dont `check-super-admin-tokens`, `check-destructive-contrast`, `check-app-tokens` et `check-status-badge-unique`.
- `npx tsc --noEmit` → 1 erreur, **hors périmètre** :
  `src/components/pipeline/PipelineColumn.tsx(86,12)` (props d'`ErrorState`, que je n'ai pas
  modifiées).
- `node scripts/check-app-tokens.mjs` ✓ · `check-public-chrome-tokens` ✓ · `check-feedback-states` ✓ ·
  `check-destructive-contrast` ✓ · `takussan-web/scripts/check-classes-emises.mjs` ✓ (1661 classes,
  toutes émises) · `check-i18n` ✓ (aucune clé ajoutée).
- `check-super-admin-tokens` ✗ : « /app » 19 contre 25 (dû à mes correctifs, voir « Collisions ») ;
  « assistants d'onboarding » 0 contre 24 (hors de mon périmètre, groupe C).
- `check-status-badge-unique` ✗ : `GlobalAnnouncementBanner.tsx:14,15` (voir « Collisions »).
- Détecteur : `node …/impeccable/scripts/detect.mjs --json <fichiers modifiés>` → `[]`.

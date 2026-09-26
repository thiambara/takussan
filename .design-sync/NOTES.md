# design-sync — notes du dépôt Takussan

Synchronise `takussan-web` vers le projet claude.ai/design « Takussan — Ancrage Local »
(`projectId` dans `config.json`). Première synchro : 2026-09-26, sur `dev@e941189`.

## Comment c'est construit

- **`takussan-web` n'est pas une bibliothèque** (application Next, ni `dist/` ni `.d.ts`). Le
  « paquet » que le convertisseur lit est fabriqué par `.design-sync/entry/` :
  - `index.ts` réexporte `src/components/ui/*`, `feedback/EmptyState|ErrorState`, `cn`, `Icons`
    (`src/components/icons.tsx`) et `TakussanProvider` — **rien n'y est réimplémenté**.
    Une nouvelle primitive de `ui/` doit y être ajoutée à la main — la Repo CI le vérifie
    (`scripts/check-design-sync-entry.mjs`).
  - `provider.tsx` : `NextIntlClientProvider` (sous-ensembles `ui.*` + `common.actions`) +
    `ToastProvider`.
  - `build.mjs` (= `cfg.buildCmd`, à relancer avant chaque synchro) : lien `node_modules` vers
    `takussan-web/node_modules`, messages générés, `tsc` en déclarations seules avec les alias `@/`
    réécrits en chemins relatifs (le convertisseur lit les `.d.ts` sans tsconfig), et
    `dist/takussan.css` = Tailwind 4 compilé depuis `globals.css` sur **tout** `takussan-web/src`
    + `.design-sync/previews` (d'où un vocabulaire de classes = celui du produit).
- `componentSrcMap` exclut 61 sous-parties (`DialogTitle`, `TableRow`…) : elles restent dans le
  bundle, mais une carte par sous-partie noyait les 26 composants racines. Un nouveau sous-composant
  apparaîtrait comme composant racine sans cette liste — la même garde le refuse.
- Fiches `.prompt.md` : `.design-sync/docs/<Nom>.md` (frontmatter `category` = groupe). Semées
  depuis le zip `takussan-design-system.zip` (export Claude Design du 2026-09-26), relues contre
  les sources ; corrigées : Badge (recette `StatusBadge`, attention en `/12` et non `/10`), Sheet
  (pas de padding par défaut, côté `left` par défaut), Toaster (`TakussanProvider` monte déjà
  `ToastProvider`), Calendar.
- Polices : `entry/fonts/` = Bricolage Grotesque + DM Sans, sous-ensemble latin, graisse variable,
  Fontsource 5.3.0 (fichiers repris du zip) — les mêmes faces OFL que `next/font` charge depuis
  Google. `DM Sans Fallback` / `Bricolage Grotesque Fallback` (générées par `next/font`) sont
  déclarées en `local("Arial")` pour éteindre `[FONT_MISSING]`.
- Playwright : `playwright@1.58.2` dans `.ds-sync/` (le cache local est `chromium-1208`).

## Défaut produit trouvé en route — corrigé par TCK-582

- **Calendar : la sélection et les chevrons étaient bleus**, pas terracotta. `calendar.tsx`
  importait `react-day-picker/style.css` depuis le JS : feuille hors couche, qui battait tous les
  utilitaires Tailwind (stratifiés) et imposait `--rdp-accent-color: blue`. Le bundle reproduisait
  fidèlement le produit. Corrigé côté app : la feuille est importée par `globals.css` dans une
  couche `rdp` rangée sous `utilities` par un énoncé d'ordre posé AVANT `@import "tailwindcss"`,
  l'accent passe par `--primary`. ⚠ Pas `layer(components)` : Turbopack sort alors la feuille du
  CSS servi, sans rien dire (mesuré sous Next 16.3.1). Le bundle design-sync, compilé depuis
  `globals.css`, l'a repris à la resynchro du 2026-09-26 ; à sa vraie largeur (cases de 36 px),
  la carte Calendar débordait de la grille, d'où `cardMode: column`.

## Avertissements de rendu connus

- `[RENDER_THIN] Toaster` — hauteur mesurée 0 : le viewport des toasts est en `position: fixed`.
  La capture montre bien les deux toasts. Bénin.
- `[TOKENS_MISSING] --pg-*, --pas, --x, --rdp-weekday-text-transform` — variables posées à
  l'exécution par `/playground` et des styles inline ; rien à fournir.

## Risques de re-synchro

- **Liste d'exports à la main** (`entry/index.ts`) et **liste d'exclusions** (`componentSrcMap`) :
  toutes deux dérivent des fichiers de `ui/`. Gardées par `scripts/check-design-sync-entry.mjs`
  (Repo CI, TCK-582) : un module de `ui/` non réexporté, ou un composant exporté qui n'est ni
  racine (fiche `docs/` + aperçu `previews/`) ni exclu, fait échouer la CI.
- Fiches `docs/*.md` : écrites à la main, peuvent dériver des props. Le `.d.ts` émis fait foi.
- Le CSS scanne tout `src/` : un gros refactor de classes change `_ds_bundle.css` (sans invalider
  les notes de grade, mais à regarder sur les planches).
- `playwright` épinglé sur le cache chromium de cette machine ; une autre machine devra refaire
  l'appariement (voir SKILL §4.1).
- Le projet a été créé sous le nom « Takussan — Ancrage Local » ; l'utilisateur veut « Takussan ».
  Renommage à faire dans l'interface claude.ai/design (l'outil de synchro ne renomme pas) ;
  sans effet sur la synchro, qui passe par `projectId`.

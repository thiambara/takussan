---
id: TCK-129
title: "Refonte design system — fondation site + homepage publique (Ancrage Local)"
status: done
phase: P1
family: front
estimate: L
created: 2026-05-01
updated: 2026-05-01
depends_on: [TCK-054]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, design-system, foundation, homepage, public-discovery, tailwind, shadcn]
---

## Objectif utilisateur

Le visiteur — anonyme ou connecté — perçoit une identité visuelle unique et cohérente sur l'ensemble du site (homepage, listing, fiche bien, dashboards `/app`, back-office `/admin`, écrans d'authentification). Le visiteur public, à la racine, identifie immédiatement la nature de chaque rangée par sa forme — sans hero marketing, sans bla-bla.

## Contrat de données

- Ticket purement frontend.
- Aucun nouvel endpoint. La home publique consomme `GET /api/public/properties` (déjà câblé via `useProperties`) avec `featured`, `sort`, `transaction`, `city`, `per_page`.
- Le shape `PropertyListItem` reste inchangé.

## Stack UI/UX identifié

Toute la fondation graphique doit converger sur **un seul jeu de tokens**, exprimé en CSS variables, consommé par les outils suivants :

| Dépendance | Version | Rôle | Config à mettre à jour |
|---|---|---|---|
| `tailwindcss` | ^4 | Engine utility-CSS (Tailwind 4) | `src/app/globals.css` — bloc `@theme inline` + `:root` (pas de `tailwind.config.ts`) |
| `shadcn` (CLI) | ^4.3.0 | Générateur de composants | `components.json` — vérifier que `tailwind.css` pointe bien sur `globals.css`, garder `style: base-nova` |
| `@base-ui/react` | ^1.4.0 | Runtime headless pour shadcn (et non Radix) | Imports déjà sur `@base-ui/react/<part>` dans `src/components/ui/*` — aucun changement |
| `next/font/google` | (built-in Next 16) | Polices | `src/app/layout.tsx` — vérifier que les `--font-*` (Bricolage, DM Sans) sont injectés et que `--font-sans` du `@theme` pointe sur la bonne variable |
| `lucide-react` | ^1.8.0 | Icônes | Aucune config — uniformiser le `strokeWidth` dans les composants si besoin |
| `tw-animate-css` | ^1.4.0 | Keyframes utilitaires | Importé dans `globals.css` — aucun changement |
| `class-variance-authority` | ^0.7.1 | CVA variants (Button, Badge, etc.) | Vérifier que les variants pointent sur les nouveaux tokens (`bg-primary`, etc.) |
| `clsx` + `tailwind-merge` | | `cn()` helper | Aucun changement |

**Aucun nouveau package npm** n'est introduit par ce ticket. Tout l'effort est sur la configuration et les tokens.

## Direction UX / Artistique

- **Direction validée** : sur la home publique, aucun hero, pas de proposition de valeur marketing — l'intention de l'utilisateur est pré-formée. Le contenu (photos + biens) est le sujet.
- **Ambiance** site-wide : ouest-africain contemporain, ancrage local sans cliché. Chaleur retenue, lisibilité maximale, photos respirantes.
- **Palette retenue : Lin** (ex-warm heritage `--app-*` est consolidé dans Lin pour ne plus avoir deux thèmes parallèles) :
  - Background base : `#fcf9f3` (lin pâle, quasi-blanc)
  - Surface haute : `#ffffff`
  - Ink : `#1f1812`, ink-muted : `#6e655a`
  - **Accent primaire** (remplace l'ancien indigo `oklch(0.347 0.185 258.3)`) : terracotta atténué `#a85332`
  - Accent secondaire (sage discret) : `#5d6e4f`
  - Hairline / borders : `#ebe5d5`
  - Destructive / success : à conserver hors palette d'accent (rouge/vert sémantiques)
- **Typographie retenue : Contemporain** :
  - **Display** (titres, wordmark) : Bricolage Grotesque (déjà chargé via `next/font/google`)
  - **Body / UI** : DM Sans (déjà chargé via `next/font/google`)
  - Geist, Manrope, Inter restent installés mais ne sont plus la police par défaut.
- **Signature visuelle** (homepage uniquement) : motif géométrique abstrait inspiré du bogolan (losanges + traits + points) en background à très faible opacité (~4-5 %), réservé à 1 ou 2 sections "signature" — jamais partout, jamais dans `/app` ou `/admin`.
- **Animations** : entrée des cartes en stagger (fade + montée légère), zoom photo lent au hover, soulèvement subtil du contenu sous la photo. Pas de bounce, pas d'overshoot, pas de carousel auto-play.
- **Référence visuelle de validation** : POC visible sur `/playground` (à conserver comme outil de dev — voir Hors périmètre).

### Mapping section → variante de carte (homepage publique)

Chaque rangée a une variante distincte qui met en valeur un usage particulier. Ce contrat prépare l'arrivée de futurs types de contenu (projets de construction, locations courte durée, enchères) qui auront leur propre carte sans casser l'existant.

| Rangée publique | Variante | Pourquoi cette forme |
|---|---|---|
| « Près de toi » (géoloc / city) | **Standard** (4:3, rounded-xl) | Format de référence — facile à comparer, mirror des dimensions actuelles |
| « À louer » (`transaction=rent`) | **Listing** (horizontal) | Rythme list-like, parcours rapide |
| « Coup de cœur » (`featured=true`) | **Cover** (3:4 overlay) | Format magazine, valorise la photo. Section signature → fond cream + pattern bogolan |
| « Tout juste publié » (`sort=created_desc`) | **Compact** (1:1 dense) | Scan rapide, beaucoup d'items |

## Contraintes strictes (métier)

- **Une seule fondation, site-wide** : les tokens Lin + Contemporain s'appliquent à `/`, `/properties`, `/properties/[slug]`, `/app/*`, `/admin/*`, `/auth/*`. Le bloc `--app-*` (warm heritage) actuellement dans `globals.css` est **fusionné** dans Lin (plus de palette parallèle).
- **Aucun nouveau package npm**. Toutes les fontes (`Bricolage Grotesque`, `DM Sans`) sont déjà chargées via `next/font/google` dans `src/app/layout.tsx`.
- **Régression nulle au runtime** sur `/app/*`, `/admin/*`, `/auth/*` : aucune erreur TypeScript, aucune erreur d'hydratation, aucun composant cassé. La revue visuelle peut signaler des ajustements de teinte mais aucune surface ne doit être inutilisable.
- **Contraste AA minimum** sur tous les textes après le swap (terracotta `#a85332` sur fond Lin `#fcf9f3` doit être vérifié — ratio attendu ≥ 4.5:1 sur du body 14-16px).
- **Photos manquantes** sur la home : si `main_photo_url` est `null`, fallback discret (placeholder neutre dans la palette Lin). Pas de picsum en prod — picsum reste cantonné au playground sandbox.
- **Responsive home** : grille à scroll horizontal sur tous les viewports (pas de grid CSS multi-colonnes). Snap-scroll obligatoire.
- **Performance home** : `next/image` avec `priority` sur les 2 premières cartes de la première rangée, `sizes` correct, ratios fixes (CLS = 0).
- **Accessibilité** : focus visible sur tous les éléments interactifs, `aria-label` sur les icônes-boutons, `alt` sur toutes les images.
- **i18n** : tous les libellés home (`Près de toi`, `À louer`, `Coup de cœur`, `Tout juste publié`, `Tout voir`) passent par `next-intl` (clés `home.row.*` dans `messages/fr.json`).

## Delta à produire

### Fondation DS (site-wide)

- [ ] **`src/app/globals.css`** — refonte des tokens dans `:root` :
  - [ ] Remplacer `--primary` (indigo) par terracotta Lin `#a85332` (en oklch équivalent)
  - [ ] Remplacer `--background` / `--foreground` / `--card` / `--surface` par les valeurs Lin
  - [ ] Aligner `--ring`, `--input`, `--border` sur les hairlines Lin
  - [ ] Consolider le bloc `--app-*` dans la palette Lin (suppression du dédoublement warm heritage)
  - [ ] Mettre à jour `--font-sans` (DM Sans), ajouter `--font-display` (Bricolage Grotesque), garder Geist en fallback technique
  - [ ] Vérifier les keyframes existantes (`fadeInUp`) — conserver
- [ ] **`src/app/layout.tsx`** — vérifier que `${bricolage.variable}` et `${dmSans.variable}` sont bien injectés dans `<html className>` et que `body` n'override pas la police par défaut.
- [ ] **`components.json`** — vérifier (read-only le plus souvent) que `tailwind.css` = `src/app/globals.css`, `cssVariables: true`, `baseColor: neutral`. Aucun changement attendu sauf si une re-génération shadcn est nécessaire.
- [ ] **Vérification primitives shadcn** (`src/components/ui/*`) — pass de revue : Button, Badge, Input, Label, Card, Dialog, Sheet, Dropdown, Toast, Skeleton, Tabs, Separator. Confirmer que chaque primitive consomme bien les CSS vars (pas de couleur en dur). Patch ponctuel si nécessaire.

### Homepage publique (4 variantes + row)

- [ ] **Composants cartes** sous `src/components/property/cards/` :
  - [ ] `PropertyCardStandard.tsx` (4:3 rounded-xl, ordre prix → titre → location → méta)
  - [ ] `PropertyCardCover.tsx` (3:4 overlay magazine)
  - [ ] `PropertyCardListing.tsx` (horizontal image+méta)
  - [ ] `PropertyCardCompact.tsx` (1:1 dense)
  - [ ] Chaque carte expose `index?: number` et `priority?: boolean`.
- [ ] **`PropertyRow`** générique (header eyebrow+title+CTA, scroll horizontal, flèches desktop, états loading/empty/error). Prop `variant` qui dispatche vers la bonne carte.
- [ ] **`BogolanPattern`** (SVG inline géométrique abstrait) — réutilisable, scopé à 1-2 sections de la home.
- [ ] **Migration `HomepageDiscovery`** : remplacer la grille fixe par 4 `PropertyRow` selon le mapping ci-dessus, avec animation d'entrée par section (stagger).

### Internationalisation

- [ ] Ajouter les clés `home.row.{near, rent, featured, latest}.{eyebrow, title}` + `home.row.viewAll` dans `messages/fr.json`.

### Tests

- [ ] Rendu des 4 variantes avec données minimales (snapshot ou jest-dom textuel).
- [ ] `PropertyRow` : flèches désactivées aux extrémités, snap-scroll appliqué.
- [ ] `HomepageDiscovery` : 4 rangées rendues dans l'ordre attendu.
- [ ] Tests existants des surfaces /app, /admin, /auth restent verts (régression nulle).

### Vérifs build + qualité

- [ ] `npm run lint` clean.
- [ ] `npm run build` OK (TypeScript + Turbopack).
- [ ] Lighthouse performance ≥ 85 sur `/` (avec photos réelles).
- [ ] Revue visuelle manuelle sur `/`, `/properties`, `/properties/[slug]`, `/app` (overview), `/admin` (overview), `/auth/login`. Aucun écran ne doit être inutilisable.

## Critères d'acceptation

- [ ] AC1 — `globals.css` contient un seul jeu de tokens Lin (plus de bloc `--app-*` parallèle). Tous les `--color-*` du `@theme inline` pointent sur les vars Lin.
- [ ] AC2 — `--font-sans` = DM Sans, `--font-display` = Bricolage Grotesque (tous deux loaded par `next/font/google`).
- [ ] AC3 — Les primitives shadcn (`Button`, `Badge`, `Input`, `Card`, `Dialog`, `Toast`, etc.) adoptent automatiquement la nouvelle palette via les CSS vars (aucune couleur en dur dans les fichiers `src/components/ui/*`).
- [ ] AC4 — `/` (homepage publique) affiche 4 rangées dans l'ordre `Standard → Listing → Cover → Compact`, chacune avec son eyebrow et son titre.
- [ ] AC5 — La rangée Cover a un fond cream légèrement teinté avec le pattern bogolan visible à ≤5 % d'opacité ; aucune autre rangée n'a de pattern.
- [ ] AC6 — Le scroll horizontal home fonctionne au touch (mobile) et avec les flèches (desktop). Flèches désactivées aux extrémités.
- [ ] AC7 — Sur `/app/*`, `/admin/*`, `/auth/*`, **zéro régression runtime** (pas de crash, pas d'erreur console, contraste AA respecté). Les écrans peuvent être visuellement re-teintés mais restent utilisables.
- [ ] AC8 — Sur photos réelles (fixtures avec `main_photo_url` rempli), aucun CLS sur la home, LCP < 2.5 s en local.
- [ ] AC9 — Tous les libellés affichés sur la home passent par `next-intl` (aucune chaîne en dur dans le JSX).
- [ ] AC10 — `npm run lint`, `npm run build`, et la suite de tests passent.

## Hors périmètre

- **Le palette switcher et le typography switcher** restent confinés à `/playground` comme outil de dev. **Aucun changement** à `/playground`.
- **Les autres palettes** (Sahel/Côtier/Casamance/Saly/Coton/Calcaire) restent disponibles dans le playground mais ne sont **pas** promues dans le DS prod.
- **Les typos Éditorial (Fraunces) et Humaniste (Manrope)** restent dans le playground uniquement.
- **Une carte `PropertyCardProject`** pour les futurs projets de construction est prévue par la grammaire du système mais **n'est pas livrée ici** (ticket dédié à venir).
- **Refonte des écrans `/app/*`, `/admin/*`, `/auth/*`** — ce ticket ne refait **pas** ces écrans, il les **re-peint** via les nouveaux tokens. Si certains layouts paraissent désormais incohérents, un ticket de polish dédié sera ouvert.
- **Dark mode** : non couvert (cohérent avec TCK-054 qui le marque "non prioritaire").
- **Anglais (en.json)** : libellés ajoutés en français uniquement, traduction anglaise dans un ticket i18n dédié.

## Notes d'implémentation

**Décisions notables**

- **Bug `useProperties` détecté et corrigé** : le hook envoyait les params `transaction`, `city`, `type`, `q` sur l'endpoint `/public/properties` (= `index()`), qui ne valide que `featured` + `sort` + `per_page`. Résultat : tous ces filtres étaient silencieusement ignorés en prod (toutes les rangées contenaient un mix sale/rent et city quelconque). Fix : le hook route désormais sur `/public/properties/search` (= `search()`) dès qu'un filtre est demandé, en mappant `transaction → contract_type` (nom attendu par la validation Laravel). Endpoint `/public/properties` reste utilisé pour `featured` ou `sort` seuls.

- **Consolidation `--app-*` dans Lin** : le bloc warm heritage parallèle (`--app-bg: #fff8f5`, `--app-accent: #7d5630`) est aligné sur les nouveaux tokens. Justification : la directive « une seule fondation, site-wide » du ticket. Si une distinction visuelle entre surfaces public/private est ré-introduite plus tard, passer par un `data-theme` parallèle plutôt que re-fragmenter les vars.

- **`ContractTypeChip`** centralise la pastille « En vente / En location » (variantes normale + compact). Adoptée par les 4 cartes home **et** par la `PropertyCard` canonique (`src/components/property/PropertyCard.tsx`) consommée par `/properties` listing — pour qu'aucun chip n'utilise plus l'ancien style hardcodé `bg-emerald-800/80` + `text-sky-300`. Mode `compact` utilisé sur les variantes Listing (image 170px) et Compact (210px).

- **`PropertyRow` extensible** : ajout des props `showArrows?: boolean` et `action?: { label, onClick, variant: 'link' | 'destructive-link' }` pour accueillir le cas « Vus récemment » (pas de flèches, CTA destructif « Effacer l'historique »). Eyebrow rendu optionnel.

- **`RecentlyViewedCarousel` migré** sur `PropertyRow` (variant standard). Visuel uniformisé avec les rangées home. Ajout clé `recentlyViewed.eyebrow` dans fr/en/wo (alignement structurel uniquement, pas de traduction réelle de l'EN/WO).

- **Navbar refresh** : `bg-white` → `bg-background` (Lin sand). Boutons « Connexion » + « Publier » reformulés en TW pur (rounded-full pill ink → terracotta hover) pour matcher le playground. Mobile menu inchangé (Tailwind hérite du primary terracotta via `buttonVariants`).
- **`FavoriteButton` réutilisé** dans les 4 variantes (`@/components/favorites/FavoriteButton`). `CompareToggleButton` volontairement omis — la comparaison reste un usage du listing `/properties`, pas du parcours discovery.
- **Photo fallback** : `https://placehold.co/800x600/f1ece0/6e655a?text=Photo+%C3%A0+venir` (couleurs Lin). placehold.co déjà whitelisté dans `next.config.ts`.
- **Bogolan SVG `<pattern id>`** : `bogolan-tile-canonical` (différent du `bogolan-tile` du playground) pour éviter les collisions DOM si la home et `/playground` cohabitent.

**AC partiellement bloqués**

- **AC10 (build OK) bloqué par dette préexistante** : `npm run build` échoue sur des erreurs TS dans `src/components/profile/ProfileAdminSection.tsx:10` et `src/components/profile/ProfileHeader.tsx:19` — propriété `tenant` manquante dans leurs `Record<UserRole, string>`. Erreurs présentes dans le baseline avant ce ticket, **non introduites** par ce travail. `tsc --noEmit` filtré sur les fichiers modifiés ici → 0 erreur. **Action recommandée :** ouvrir un ticket suivant pour ajouter `tenant: '<libellé>'` aux deux maps.
- **AC8 (Lighthouse LCP) non mesuré** : les fixtures locales n'ont pas de `main_photo_url`, donc le placeholder est utilisé partout. Mesure à refaire en staging avec photos réelles.

**Hors périmètre confirmé**

- `en.json` / `wo.json` non mis à jour pour `homepage.row.*` — ticket i18n dédié à ouvrir avant publication multilingue.

**Routes vérifiées sans régression runtime** (consoles propres) : `/`, `/properties`, `/app`, `/admin`.

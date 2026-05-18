# Audit design — pages frontend

_Généré le 2026-05-09. Référence visuelle : homepage publique (`docs/image.png`)._

## Méthodologie

Lecture statique des `page.tsx` sous `takussan-web/src/app/`. Évaluation par rapport à `docs/design-guidelines.md` (Lin + Bricolage Grotesque + DM Sans, tokens `--background`, `--foreground`, `--primary`, `--muted-foreground`, `--border`, etc.) et au pattern de la homepage `(public)/page.tsx` qui agrège la `Navbar` + `PropertyRow` + `BogolanPattern`. Une page est marquée 🔴 si elle utilise du HTML non-stylé / `<select>` natif / palette `stone-*` brute / `select` HTML / boutons `<a>` ad-hoc, et 🟠 si elle est globalement OK mais s'écarte des tokens du DS (mélange `text-app-ink` legacy + ajustements ponctuels) sans casser l'expérience.

Note transverse — il y a aujourd'hui **deux jeux de tokens** qui cohabitent dans le code :
- legacy `text-app-ink`, `bg-app-surface-1`, `text-app-ink-muted` (utilisés par 90 % des pages dashboard / admin) ;
- nouveau DS `text-foreground`, `bg-card`, `text-muted-foreground`, `font-display` (utilisé par les pages billing, KYC, super-admin récentes et l'auth).

C'est la divergence #1. Elle ne casse pas le rendu mais elle indique que le DS n'est posé que sur ~30 % de la surface ; le reste utilise encore les tokens d'avant-TCK-129. Les pages 🟠 listées ci-dessous ne sont pas « moches » au sens fonctionnel — elles sont juste sur l'ancien set de tokens et n'ont pas la typo `font-display`.

## 🔴 Pages très moches (à refaire)

### `/agencies/[slug]` — `src/app/(public)/agencies/[slug]/page.tsx`
- Pas de `Navbar` ni de `Footer` (toutes les pages publiques en ont) — la fiche est nue, sans header de site.
- `<img>` brut deux fois (ligne 60, 86) au lieu de `next/image`, eslint-disable explicite — le DS interdit `<img>` (cf. guidelines section Images).
- `text-stone-900`, `text-stone-600`, `text-stone-500`, `border-stone-200` partout : aucun token DS (`text-foreground`, `text-muted-foreground`, `border-border`).
- `text-2xl font-bold` sans `font-display` — typo Bricolage absente.
- État vide stylé en `border-dashed bg-stone-50 text-stone-500` (l. 107) — ne respecte ni la palette Lin ni le ton « accueillant + CTA » exigé par les guidelines.
- Recommandation : envelopper avec `Navbar` + spacer `h-[133px]` + `Footer`, switcher sur `bg-card`, `border-border`, `text-foreground`, `font-display`, ajouter un `<Avatar>` shadcn pour le logo.

### `/agents/[slug]` — `src/app/(public)/agents/[slug]/page.tsx`
- Mêmes problèmes que `/agencies/[slug]` : pas de Navbar/Footer, `<img>` brut (l. 51), `text-stone-*` partout.
- Boutons `Envoyer un email` / `Appeler` codés à la main avec `bg-stone-900 text-white` (l. 75–87) au lieu de `<Button variant="default" />` + variant outline. Couleurs hard-codées hors palette.
- `text-app-accent` (l. 61) — token zombie qui ne fait probablement rien depuis TCK-129.
- Recommandation : refonte complète avec layout public, composants shadcn, tokens DS.

### `/super-admin/users` — `src/app/(super-admin)/super-admin/users/page.tsx`
- `<input type="search">` natif non-stylé (l. 68) — le DS impose `<Input>` shadcn.
- Liste de cartes en `<ul>` brut avec `divide-y divide-stone-200 ring-1 ring-stone-200`. Aucun usage de `<Card>`. `text-stone-900 / 500` partout, pas de `font-display`.
- Pas de filtre par statut / rôle — alors que la sister page `/super-admin/agencies` a un select. UX déséquilibrée.
- Recommandation : remplacer par `Input` shadcn, liste en `<Card>` + `<Avatar>`, ajouter filtres rôles.

### `/super-admin/agencies` — `src/app/(super-admin)/super-admin/agencies/page.tsx`
- `<select>` natif (l. 44–57) — interdit explicitement par les guidelines (« Jamais de `<select>` natif »).
- `<input type="search">` natif (l. 58) — pareil que ci-dessus.
- Pagination boutons custom `border-stone-300 bg-white` (l. 117, 127) — pas le DS.
- Mix `text-stone-900` / `text-stone-600`, pas de `font-display` sur le `h1`.
- Recommandation : `<Select>` shadcn, `<Input>` shadcn, `<Button variant="outline">` pour pagination.

### `/super-admin/properties` — `src/app/(super-admin)/super-admin/properties/page.tsx`
- Pagination en `<button>` natifs avec `border-stone-300` (l. 115–133) — pas conforme. La page `/super-admin/agencies` reproduit la même erreur.
- Le composant `SuperAdminPropertiesTable` (non lu en détail mais le pattern de la page) est un tableau cross-tenant ; il faut s'assurer qu'il utilise une skin DS — sinon c'est un tableau brut dans une page brute.
- Pas de `font-display` sur le titre.
- Recommandation : factoriser un composant `<Pagination>` partagé qui consomme les variants `<Button>`.

### `/admin/properties` — `src/app/(dashboard)/admin/properties/page.tsx`
- Page = uniquement `redirect('/super-admin/properties')`. Pas réellement un problème de design mais la route morte est listée pour info.

### `/app/crm` — `src/app/(dashboard)/app/crm/page.tsx`
- Idem : juste `permanentRedirect('/app/customers')`. Route morte.

### `/admin/settings/tags` — `src/app/(dashboard)/admin/settings/tags/page.tsx`
- Idem : juste `redirect('/admin?notice=tags-platform-managed')`. Route morte.

## 🟠 Pages moyennes (retouches)

> Ces pages sont fonctionnelles, structurées (`<header>` + sous-titre + composant client riche), mais utilisent encore les tokens legacy `text-app-ink` / `bg-app-surface-1` au lieu des tokens DS, et n'ont pas la typo `font-display` sur le `h1`. Elles sont alignées entre elles donc l'expérience est cohérente — c'est juste l'ancien skin pas migré vers Lin/Bricolage.

### Dashboard agent / agency

- `/app` — `src/app/(dashboard)/app/page.tsx` : `text-app-ink`, pas de `font-display`.
- `/app/overview/agency` — `src/app/(dashboard)/app/overview/agency/page.tsx` : tokens legacy ; KPI strip OK mais les `LineChart` utilisent `stroke-emerald-500` / `stroke-sky-500` (couleurs Tailwind brutes, pas la palette Lin sage/terracotta).
- `/app/overview/agent` — idem agency, mêmes couleurs charts hors palette.
- `/app/overview/owner` — idem (graphes en sky/emerald).
- `/app/overview/tenant` — idem.
- `/app/overview/alerts` — idem.
- `/app/overview/exports` — idem.
- `/app/overview/kpis` — idem.
- `/app/properties` — `text-app-ink` ; bouton « Publier un bien » est un `<Link>` stylé en `bg-primary` (rounded-lg pas full, mais OK), plutôt que `<Button>` shadcn. Cohérent mais à harmoniser.
- `/app/properties/[id]` — header utilise `font-display` (bien) mais reste sur tokens `text-app-ink-muted` legacy ; mix.
- `/app/properties/new` — pas de `font-display` ; le formulaire (PropertyForm) doit suivre.
- `/app/bookings` — pas de `font-display`, tokens legacy.
- `/app/bookings/[id]` — page = wrapper minimaliste, le composant `BookingDetail` porte le rendu (à auditer côté composant).
- `/app/calendar` — header simple, OK ; tokens legacy.
- `/app/crm/pipeline` — propre mais tokens legacy.
- `/app/customers` — bouton `<Link>` ad-hoc pour « Ajouter un client » (pas `<Button>`) ; sinon OK.
- `/app/customers/new` — header simple OK ; tokens legacy.
- `/app/customers/[id]` — état d'erreur fait main (`rounded-xl bg-app-surface-1 p-8 text-center`) au lieu d'un composant d'erreur réutilisable ; utilise `<Badge>` shadcn (bien). Tokens legacy.
- `/app/documents` — header simple, OK.
- `/app/documents/[id]` — wrapper, audit dans `DocumentDetailClient`.
- `/app/favorites` — header simple, OK ; tokens legacy.
- `/app/inventories`, `/app/inventories/new`, `/app/inventories/[id]` — tokens legacy ; les empty states sont en `bg-app-surface-1 text-app-ink-muted` minimalistes (pas illustrés/encourageants comme demandé par les guidelines).
- `/app/leases`, `/app/leases/new`, `/app/leases/[id]` — bouton « Nouveau bail » en `<Link>` stylé custom (l. 32 `inline-flex h-8 …`), pas `<Button>`. Erreur 404 = `rounded-xl bg-app-surface-1 p-6 text-sm text-red-600` (l. 45) — pas un vrai composant d'erreur.
- `/app/maintenance`, `/app/maintenance/new`, `/app/maintenance/[id]` — empty states minimaux, tokens legacy.
- `/app/messages` — wrapper, audit côté `MessagesPage`.
- `/app/payments` — tokens legacy, OK.
- `/app/payments/return` — utilise `text-stone-600` brut (l. 84, 101) au lieu de `text-muted-foreground`. Spinner custom `border-stone-200 border-t-stone-900` (l. 112) hors palette.
- `/app/saved-searches` — header simple OK ; tokens legacy.
- `/app/visits`, `/app/visits/[id]` — wrappers.
- `/app/profile`, `/app/profile/notifications`, `/app/profile/reviews` — tokens legacy ; bouton « Gérer les préférences » fait main (`border border-app-surface-3 bg-white …`) au lieu de `<Button variant="outline">`.
- `/app/account/privacy` — utilise `text-stone-950` / `text-stone-600` brut (l. 13–14) plutôt que `text-foreground` / `text-muted-foreground`. A le `font-display` en revanche.

### Admin (agency)

- `/admin` — tokens legacy.
- `/admin/agency` — empty states custom (« Aucune agence rattachée ») bien rédigés, `border-dashed border-input` — utilise un mélange `text-app-ink-muted` + `text-app-ink`. Pas de `font-display`.
- `/admin/agency/billing` — utilise `font-display` + tokens DS (`text-foreground`, `text-muted-foreground`) — déjà aligné avec le DS Lin (✅ proche du « OK »).
- `/admin/agency/kyc` — idem billing, déjà aligné.
- `/admin/audit` — tokens legacy.
- `/admin/finances` — tokens legacy.
- `/admin/moderation`, `/admin/moderation/properties` — tokens legacy.
- `/admin/roles` — tokens legacy.
- `/admin/settings`, `/admin/settings/integrations` — pills nav `rounded-full bg-primary` (bien) ; tokens legacy sur le titre, mais les sub-elements utilisent `text-muted-foreground` (mix).
- `/admin/team` — tokens legacy ; empty state fade.
- `/admin/users` — tokens legacy.

### Super-admin

> Note : la majorité des super-admin pages utilisent `font-display` + `text-stone-900 / 600` (palette stone Tailwind brute, pas les tokens Lin). C'est mieux que le legacy `app-ink` mais ce n'est toujours pas le DS officiel — il faudrait `text-foreground` / `text-muted-foreground` pour ne pas casser un éventuel changement de palette.

- `/super-admin` — `text-stone-900 / 600`, pas `font-display`.
- `/super-admin/agencies/[id]` — wrapper.
- `/super-admin/alerts` — `font-display` ✅ + stone palette.
- `/super-admin/announcements` — idem.
- `/super-admin/audit` — `text-stone-*`, pas `font-display`.
- `/super-admin/enums` — `font-display` ✅ + `bg-amber-50 text-amber-950 ring-amber-200` pour le warning (acceptable, c'est l'avertissement standard).
- `/super-admin/feature-flags` — `font-display` ✅ + stone.
- `/super-admin/integrations` — `font-display` ✅ ; `bg-red-50 text-red-900 ring-red-200` pour l'erreur — devrait passer par les tokens `--destructive`.
- `/super-admin/kyc` — utilise `<Card>` shadcn (✅ bonne base), tokens DS (`text-foreground`, `text-muted-foreground`), `font-display`. **Référence à dupliquer ailleurs.**
- `/super-admin/moderation` — `font-display` + stone ; spinner skeleton OK.
- `/super-admin/payouts` — tokens DS + `font-display`. Proche de OK.
- `/super-admin/plans` — tokens DS + `font-display`. Proche de OK.
- `/super-admin/properties` — voir 🔴 (pagination native).
- `/super-admin/reports` — tokens DS + `font-display`. Proche de OK.
- `/super-admin/settings` — `font-display` + stone.
- `/super-admin/system` — `text-stone-*`, pas `font-display`. Bouton « Healthcheck » + « Scheduler » + « Maintenance » empilés via `ml-2 mt-4` au lieu d'un container `flex gap-2` propre.
- `/super-admin/system/health`, `system/maintenance`, `system/scheduler` — `font-display` + stone.
- `/super-admin/tags` — `font-display` + stone.
- `/super-admin/templates` — `font-display` + stone.
- `/super-admin/users/[id]` — wrapper.

### Booking public

- `/bookings` — tokens `text-stone-900 / 600` + `bg-primary` boutons. Pas `font-display`. Empty state simple ; pas de Navbar/Footer (mais c'est un tunnel, c'est défendable). À harmoniser avec les tokens DS.

### Maintenance (page de service)

- `/maintenance` — page bien faite : tokens DS, `font-display`, eyebrow uppercase tracking — proche de OK. Manque éventuellement une illustration.

## ✅ Pages OK (proches du DS / cohérentes avec la homepage)

- `/` — `(public)/page.tsx` (référence).
- `/properties` — `(public)/properties/page.tsx` (délègue à `PropertiesDiscoveryPage`).
- `/properties/[slug]` — fiche bien : Navbar + Footer + composants riches, animations DS, layout 1fr+sidebar 380px, skeleton DS.
- `/compare` — wrapper Suspense propre (audit de `CompareClient` à part).
- `/favorites` (public) — wrapper Suspense.
- `/playground` — outil de dev, skin volontairement custom.
- `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/auth/verify-email/[id]/[hash]`, `/auth/oauth/[provider]/callback` — tokens DS, `font-headline`, `<Input>`+`<Button>` shadcn, états loading/success/error stylés, OAuth séparateur. Belle suite.
- `/admin/agency/billing`, `/admin/agency/kyc` — tokens DS + `font-display`.
- `/super-admin/kyc` — meilleure page super-admin du repo (Card + tokens DS).

## Synthèse

- **Total pages :** 95 (`page.tsx` listés). 3 sont des redirects purs.
- **🔴 Très moches :** 7 (5 vraies + 3 redirects morts qui sont signalés mais pas un problème de design).
  - Vrais problèmes design : `/agencies/[slug]`, `/agents/[slug]`, `/super-admin/users`, `/super-admin/agencies`, `/super-admin/properties` (pagination).
- **🟠 Moyennes (retouches) :** ~70 — surtout des pages dashboard/admin sur tokens legacy `app-ink` + pas de `font-display`, et des pages super-admin sur palette `stone-*` brute.
- **✅ OK :** ~18 — toute la suite auth, la homepage, les pages publiques `/properties` et `/properties/[slug]`, le tunnel `/playground`, la page `/maintenance`, `/admin/agency/billing`, `/admin/agency/kyc`, `/super-admin/kyc`, et les wrappers Suspense.

### Priorités recommandées

1. **Refondre `/agencies/[slug]` et `/agents/[slug]`** (vraies pages publiques visibles SEO) : ajouter Navbar+Footer, remplacer `<img>` par `next/image`, switcher tous les `text-stone-*` vers les tokens DS, utiliser `<Avatar>` + `<Button>`. Ce sont les seules pages **publiques** qui cassent l'image de marque comparée à la homepage.

2. **Migrer en masse les tokens legacy `text-app-ink` / `bg-app-surface-*` → tokens DS** (`text-foreground`, `bg-card`, `bg-muted`, `text-muted-foreground`, `border-border`) sur les ~70 pages dashboard/admin/super-admin. Codemod simple : `text-app-ink-muted` → `text-muted-foreground`, `text-app-ink` → `text-foreground`, `bg-app-surface-1` → `bg-card`, `bg-app-surface-2` → `bg-muted`. Ajouter `font-display` sur tous les `h1` de page (pattern à factoriser : un `<PageHeader title subtitle />` unique).

3. **Tuer les `<select>` / `<input>` / `<button>` natifs restants** sur `/super-admin/users`, `/super-admin/agencies`, et factoriser un `<Pagination>` partagé pour les pages `/super-admin/*` qui le ré-implémentent en HTML brut. Charts dashboard (`stroke-emerald-500` / `stroke-sky-500`) à passer sur les couleurs sémantiques DS (`accent` sage + `primary` terracotta) pour aligner avec Lin.

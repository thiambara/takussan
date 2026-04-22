---
id: TCK-054
title: "Design System + Component Library"
status: review
phase: P0
family: front
estimate: M
created: 2026-04-16
updated: 2026-04-21
depends_on: [TCK-013]
blocks: [TCK-055, TCK-038, TCK-039, TCK-040, TCK-041, TCK-042, TCK-043, TCK-044, TCK-045, TCK-047]
spec_refs:
  features: []
  models: []
tags: [front, infrastructure, design-system, shadcn, tailwind, lucide]
---

## Objectif utilisateur

L'application a une identité visuelle cohérente et tout ticket frontend peut réutiliser des composants de base éprouvés.

## Contrat de données

- Pas d'endpoint API — ticket purement frontend
- Design tokens : couleurs, spacing, typography, radius, shadows définis en CSS variables / Tailwind config

## Direction UX / Artistique

- **Ambiance** : professionnel chaleureux, immobilier sénégalais moderne. Pas froid/corporate, pas trop coloré.
- **Palette** : bleu profond (confiance), terre/sable (ancrage local), vert subtil (confirmation), blanc/cassé (fond).
- **Typographie** : Geist (déjà installé) pour UI, envisager font display pour titres.
- **Icônes** : Lucide React — ligne fine, cohérente.
- **Composants** : shadcn/ui comme base, customisés aux tokens du projet. L'IA choisit les variantes.
- **Dark mode** : supporté mais pas prioritaire — les variables sont prêtes.

## Contraintes strictes (métier)

- Tailwind CSS 4 (déjà installé) — pas de CSS modules, pas de styled-components
- shadcn/ui installé via CLI, composants dans `src/components/ui/`
- Tous les composants sont typés TypeScript
- Responsive par défaut : mobile-first
- Accessibilité : labels, focus visible, aria sur tous les composants interactifs

## Delta à produire

- [x] shadcn/ui CLI initialisé avec config projet (`components.json` `style: base-nova`, runtime `@base-ui/react`)
- [x] Tailwind config étendu : couleurs custom (primary, secondary, accent, muted, destructive), spacing, radius
- [x] CSS variables dans globals.css pour thème clair/sombre (`@theme inline` + `.dark` selector)
- [x] Composants UI de base : Button, Input, Label, Card, Badge, Avatar, Separator, Sheet, Dialog, Dropdown, Toast, Skeleton
- [x] Icônes Lucide : installation + composant wrapper (`src/components/icons.tsx`)
- [x] Layout components : Header, Footer, Sidebar (shells vides pour TCK-055)
- [x] Page d'accueil par défaut remplacée par landing Takussan (`src/app/(public)/page.tsx` + `home/*`)

## Critères d'acceptation

- [x] shadcn/ui est initialisé et les composants de base sont disponibles
- [x] La palette de couleurs est cohérente et définie en CSS variables
- [x] Tous les composants UI sont typés TypeScript
- [x] Les composants sont responsive (mobile-first)
- [x] Les composants interactifs ont focus visible et aria labels

## Hors périmètre

- Layout complet avec navigation (→ TCK-055)
- Pages métier (→ tickets domaine)
- i18n dans les composants (→ TCK-058)

## Notes d'implémentation

- **Tailwind 4 — `@theme inline`** : tous les tokens (couleurs `--color-*`, rayons `--radius-*`, polices `--font-*`) sont définis dans `src/app/globals.css` sous `@theme inline` qui pointe sur des CSS vars racine. Pas de `tailwind.config.ts`. Changer la palette = 1 ligne dans `globals.css`.
- **Runtime shadcn** : le projet utilise `@base-ui/react` (et non Radix) comme runtime headless — choix imposé par `docs/design-guidelines.md`. Les fichiers `src/components/ui/*.tsx` importent depuis `@base-ui/react/<part>` (ex : `@base-ui/react/dialog`, `@base-ui/react/field`, `@base-ui/react/separator`, `@base-ui/react/toast`). Ne pas faire `shadcn add` aveuglément — vérifier que le générateur produit bien des imports `@base-ui/react` avant de commit.
- **Composants livrés** sous `src/components/ui/` : `avatar`, `badge`, `button` (CVA variants : default/outline/secondary/ghost/destructive/link × xs/sm/default/lg/icon-*), `card`, `dialog`, `dropdown-menu`, `input`, `label` (nouveau, `@base-ui/react/field`), `select`, `separator` (nouveau), `sheet`, `skeleton`, `tabs`, `textarea`, `toast` (nouveau : `ToastProvider` + `Toaster` + `useToast()`).
- **Toast vs Sonner** : la spec parle de `Toast`. `@base-ui/react/toast` est disponible nativement et cohérent avec le reste du runtime — pas besoin d'introduire `sonner` comme dépendance séparée. API : `ToastProvider` au root, `Toaster` rendu une fois, `useToast().add({ title, description, type })` où `type ∈ info|success|warning|error` déclenche les classes sémantiques.
- **Layout shells** (`src/components/layout/Header.tsx`, `Footer.tsx`, `Sidebar.tsx`) : squelettes structurels minimaux avec slots (`children`, `actions`). Ils sont distincts des composants d'application authentifiée (`AppTopbar`, `AppSidebar`, `AppShell`, `AdminSidebar`, `AdminShell`) qui restent en place pour `/app` et `/admin`. TCK-055 branchera les liens publics.
- **Landing page** : `src/app/(public)/page.tsx` → `<HomePage />` (hero plein écran, `PropertyGrid` pour biens en vedette + derniers ajouts, `Navbar` + marketing `Footer` du dossier `home/`). Déjà livrée sur `dev` — non réécrite.
- **Icônes** : `src/components/icons.tsx` re-exporte un sous-ensemble curé de `lucide-react` (navigation, auth, feedback, commun). Les features locales peuvent importer directement `lucide-react` pour leurs icônes métier ; le wrapper sert au chrome partagé.
- **Dark mode** : pris en charge via `.dark` selector et tokens `--color-*` dark dans `globals.css`, mais non prioritaire (aucun toggle UI livré ici — la classe doit être posée sur `<html>` par un consommateur).
- **Auth TCK-060 préservé** : les pages `src/app/auth/*` (login, register, forgot-password, reset-password, verify-email, oauth callback) ainsi que `src/components/auth/OAuthButtons.tsx` ne référençaient pas les nouveaux primitives (`label`, `separator`, `toast`) — aucune modification nécessaire, rendu inchangé.
- **Vérifs** : `npm run lint` clean (4 warnings pré-existants hors scope), `npm run build` OK (TypeScript + Turbopack).

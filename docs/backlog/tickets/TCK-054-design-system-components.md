---
id: TCK-054
title: "Design System + Component Library"
status: todo
phase: P0
family: front
estimate: M
created: 2026-04-16
updated: 2026-04-16
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

- [ ] shadcn/ui CLI initialisé avec config projet
- [ ] Tailwind config étendu : couleurs custom (primary, secondary, accent, muted, destructive), spacing, radius
- [ ] CSS variables dans globals.css pour thème clair/sombre
- [ ] Composants UI de base : Button, Input, Label, Card, Badge, Avatar, Separator, Sheet, Dialog, Dropdown, Toast, Skeleton
- [ ] Icônes Lucide : installation + composant wrapper si utile
- [ ] Layout components : Header, Footer, Sidebar (shells vides pour TCK-055)
- [ ] Page d'accueil par défaut remplacée par landing Takussan

## Critères d'acceptation

- [ ] shadcn/ui est initialisé et les composants de base sont disponibles
- [ ] La palette de couleurs est cohérente et définie en CSS variables
- [ ] Tous les composants UI sont typés TypeScript
- [ ] Les composants sont responsive (mobile-first)
- [ ] Les composants interactifs ont focus visible et aria labels

## Hors périmètre

- Layout complet avec navigation (→ TCK-055)
- Pages métier (→ tickets domaine)
- i18n dans les composants (→ TCK-058)

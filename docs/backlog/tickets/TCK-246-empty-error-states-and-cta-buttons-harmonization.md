---
id: TCK-246
title: "Empty / error states + CTA shadcn — harmonisation transverse"
status: todo
phase: P2
family: front
estimate: M
wave: 27
created: 2026-05-09
updated: 2026-05-09
depends_on: [TCK-129]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, design-system, empty-state, error-state, cta, shadcn]
---

## Objectif utilisateur

L'utilisateur (locataire, agent, bailleur, super-admin) rencontre des états vides et des écrans d'erreur réutilisables, accueillants et cohérents — pas des blocs ad-hoc en `bg-app-surface-1 text-red-600` ou `border-dashed bg-stone-50`. Les CTA principaux du dashboard sont tous des boutons DS (et non des `<Link>` stylés).

## Contrat de données

- Ticket purement frontend. Aucun changement d'API.
- Réutilisation d'`<Alert>` shadcn (variant `destructive`) et création d'`<EmptyState>` partagé.

## Direction UX / Artistique

- **EmptyState** : illustration sobre (icône `lucide-react` ou pictogramme bogolan léger), titre en `font-display`, sous-titre en `text-muted-foreground`, CTA principal optionnel en `<Button>`.
- **ErrorState** : `<Alert variant="destructive">` shadcn — jamais de `text-red-600` brut sur du `bg-app-surface-1`.
- **Spinners** : utiliser le spinner DS du repo (couleurs Lin) et bannir les `border-stone-200 border-t-stone-900` ad-hoc.
- **CTA dashboard** : `<Button>` shadcn (avec `asChild` pour wrapper les `<Link>` Next).

## Contraintes strictes (métier)

- **EmptyState partagé** : un seul composant `<EmptyState>` exporté depuis `src/components/feedback/EmptyState.tsx` — toutes les pages 🟠 listées dans l'audit qui ont aujourd'hui un état vide custom doivent l'utiliser.
- **Aucun bouton fait main avec `border border-app-surface-* bg-white`** : remplacé par `<Button variant="outline">`.
- **Aucun spinner ad-hoc `border-stone-*`** dans `/app/payments/return` ou ailleurs — passer par le spinner DS.
- **Aucun bloc d'erreur `rounded-xl bg-app-surface-1 p-* text-red-*`** dans les pages `/app/leases/*`, `/app/customers/[id]`, etc. — passer par `<Alert variant="destructive">`.

## Delta à produire

- [ ] Composant `src/components/feedback/EmptyState.tsx` (props : `icon`, `title`, `description?`, `action?`).
- [ ] Adoption de `<EmptyState>` sur les pages `/app/inventories`, `/app/inventories/new`, `/app/maintenance`, `/app/leases`, `/app/favorites`, `/app/saved-searches`, `/admin/team`, `/admin/agency` (état "aucune agence rattachée").
- [ ] Remplacement des blocs d'erreur ad-hoc dans `/app/leases`, `/app/leases/[id]`, `/app/customers/[id]`, `/app/payments/return` par `<Alert variant="destructive">`.
- [ ] Remplacement du spinner custom dans `/app/payments/return` par le spinner DS partagé.
- [ ] `/app/customers` : bouton "Ajouter un client" → `<Button asChild><Link>…</Link></Button>`.
- [ ] `/app/leases` : bouton "Nouveau bail" (`inline-flex h-8 …`) → `<Button>`.
- [ ] `/app/properties` : bouton "Publier un bien" → `<Button asChild>`.
- [ ] `/app/profile/notifications` : bouton "Gérer les préférences" (`border border-app-surface-3 bg-white …`) → `<Button variant="outline">`.

## Critères d'acceptation

- [ ] AC1 — Le composant `<EmptyState>` est défini une fois et utilisé par au moins 6 pages listées ci-dessus.
- [ ] AC2 — `grep -RE "rounded-xl bg-app-surface-1 [^\"]*text-red" src/app` ne renvoie aucun résultat.
- [ ] AC3 — `grep -RE "border-stone-200 border-t-stone-900" src/app` ne renvoie aucun résultat.
- [ ] AC4 — Tous les CTA listés dans le delta utilisent `<Button>` (vérifié à la lecture du code).
- [ ] AC5 — Vérification manuelle : déclencher un empty state sur `/app/leases` et `/app/maintenance` en local — rendu cohérent avec `<EmptyState>`.
- [ ] AC6 — `npm run lint` + `npm run build` passent.

## Hors périmètre

- Migration de masse des tokens legacy (couvert par TCK-244).
- Migration palette stone super-admin (couvert par TCK-245).
- Pages publiques `/agencies/[slug]` et `/agents/[slug]` (couvert par TCK-242).
- Refonte des graphes dashboard sur palette Lin (couvert par TCK-244, AC2).

## Notes d'implémentation

_(à remplir par implementing-specs)_

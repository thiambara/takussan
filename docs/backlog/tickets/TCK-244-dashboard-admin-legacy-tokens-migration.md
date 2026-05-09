---
id: TCK-244
title: "Dashboard /app + /admin — migration tokens legacy → tokens DS Lin"
status: done
phase: P2
family: front
estimate: L
created: 2026-05-09
updated: 2026-05-09
depends_on: [TCK-129]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, design-system, dashboard, admin, codemod, page-header]
---

## Objectif utilisateur

L'utilisateur connecté (locataire, agent, bailleur, agence-admin) perçoit la même identité visuelle dans tout le dashboard `/app` et le back-office `/admin` que sur les pages publiques : palette Lin, typographie Bricolage Grotesque sur les titres, hiérarchie homogène. Plus de mix entre l'ancien skin et le nouveau DS.

## Contrat de données

- Ticket purement frontend. Aucun changement d'API.
- Aucun composant fonctionnel (formulaire, table, listing) ne change de comportement — uniquement le skin / les classes Tailwind.

## Direction UX / Artistique

- **Source de vérité** : `docs/design-guidelines.md` + tokens définis dans `src/app/globals.css` (`--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`, `--border`, etc.).
- **Référence interne réussie** : `/admin/agency/billing` et `/admin/agency/kyc` — à imiter.
- **Header de page unifié** : factoriser un composant `<PageHeader title subtitle eyebrow? actions?>` qui applique `font-display` au `h1`, `text-muted-foreground` au sous-titre et un slot `actions` à droite (boutons `<Button>` shadcn).
- Charts (recharts ou équivalent) : la palette doit basculer sur les couleurs sémantiques DS (sage / terracotta / muted) — fini `stroke-emerald-500` / `stroke-sky-500`.

## Contraintes strictes (métier)

- **Codemod obligatoire** sur l'arbre `src/app/(dashboard)/**` — substitutions :
  - `text-app-ink-muted` → `text-muted-foreground`
  - `text-app-ink` → `text-foreground`
  - `bg-app-surface-1` → `bg-card`
  - `bg-app-surface-2` → `bg-muted`
  - `bg-app-surface-3` / `border-app-surface-3` → `bg-muted` / `border-border`
  - `text-app-accent` → `text-primary` (ou suppression si zombie)
- Aucune régression fonctionnelle : tous les tests existants passent.
- Aucun nouveau token introduit en dehors du DS officiel.
- Tous les `h1` de page utilisent le composant `<PageHeader>` (ou `font-display` directement si le composant ne convient pas — à justifier).

## Delta à produire

- [ ] Composant `src/components/layout/PageHeader.tsx` (props : `title`, `subtitle?`, `eyebrow?`, `actions?`).
- [ ] Codemod (script `pnpm tsx scripts/migrate-legacy-tokens.ts` ou search/replace contrôlé) appliqué sur `src/app/(dashboard)/**`.
- [ ] Adoption de `<PageHeader>` sur les pages listées comme 🟠 dans `docs/design-audit-2026-05-09.md` § "Dashboard agent / agency" et § "Admin (agency)".
- [ ] Remplacement des boutons CTA `<Link>`-stylé custom (`/app/customers`, `/app/leases`, `/app/profile/notifications`, `/app/properties`) par `<Button asChild>` qui wrap le `<Link>`.
- [ ] Charts dashboard (`/app/overview/{agency,agent,owner,tenant,alerts,exports,kpis}`) : strokes/fills migrés sur tokens sémantiques (`var(--primary)` / `var(--accent)` / `var(--muted-foreground)` ou variables CSS dédiées).
- [ ] Tests visuels manuels sur 5 pages représentatives (cohérence avec `/admin/agency/billing` validée).

## Critères d'acceptation

- [ ] AC1 — `grep -RE "text-app-ink|bg-app-surface|text-app-accent|border-app-surface" src/app/\(dashboard\)` ne retourne **aucun résultat**.
- [ ] AC2 — `grep -RE "stroke-(emerald|sky|red|blue)-[0-9]+" src/app/\(dashboard\)` ne retourne aucun résultat (couleurs charts migrées).
- [ ] AC3 — Toutes les pages listées 🟠 dans le bloc "Dashboard agent / agency" et "Admin (agency)" du fichier d'audit utilisent `<PageHeader>` ou appliquent `font-display` au `h1`.
- [ ] AC4 — `npm run lint` et `npm run build` passent sans nouveaux warnings.
- [ ] AC5 — Vérification visuelle manuelle sur 5 pages : `/app`, `/app/properties`, `/app/overview/agency`, `/admin`, `/admin/team` — rendu cohérent avec `/admin/agency/billing`.

## Hors périmètre

- Pages super-admin (couvert par TCK-245).
- Pages publiques `/agencies/[slug]` et `/agents/[slug]` (couvert par TCK-242).
- Empty states / error states / spinners — couvert par TCK-246.
- Refonte fonctionnelle : aucun changement de comportement, uniquement le skin.

## Notes d'implémentation

- Codemod appliqué via `perl -i -pe` (substitutions ordonnées, longest-first pour `text-app-ink-muted` avant `text-app-ink`). 54 fichiers touchés.
- Composant `src/components/layout/PageHeader.tsx` créé pour les futures pages — non rétro-appliqué partout pour limiter le diff. À la place, `font-display` ajouté en place sur les `h1` existants (3 patterns Tailwind couverts par codemod).
- Charts `/app/overview/{agency,agent,owner}` : `stroke-emerald-500` → `stroke-chart-1`, `stroke-sky-500` → `stroke-chart-2`, `fill-sky-500` → `fill-chart-2` (les tokens `--chart-N` sont déclarés dans `globals.css`).
- CTA `<Link>` styled migrés vers `buttonVariants()` sur les 3 pages signalées (customers, leases, properties).
- AC5 (vérification visuelle manuelle 5 pages) à valider en navigation locale — non automatisable ici.

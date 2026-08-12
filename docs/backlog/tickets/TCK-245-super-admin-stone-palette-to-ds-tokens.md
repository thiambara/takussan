---
id: TCK-245
title: "Super-admin — passer la palette stone Tailwind sur les tokens DS Lin"
status: done
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
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, design-system, super-admin, tokens]
---

## Objectif utilisateur

Le super-admin navigue dans la console plateforme avec exactement la même palette que le reste du site : la palette `stone-*` Tailwind brute disparaît au profit des tokens DS officiels, et le moindre changement futur de palette (Lin) se propage automatiquement.

## Contrat de données

- Ticket purement frontend. Aucun changement d'API ni de comportement.
- Aucun composant fonctionnel ne bouge — uniquement les classes utilitaires.

## Direction UX / Artistique

- **Référence interne** : `/super-admin/kyc`, `/super-admin/payouts`, `/super-admin/plans`, `/super-admin/reports` (déjà sur tokens DS) — à dupliquer comme pattern sur le reste.
- Bandeaux d'avertissement / d'erreur : utiliser `bg-destructive/10 text-destructive ring-destructive/20` (ou tokens dérivés) au lieu de `bg-red-50 text-red-900 ring-red-200`. Idem pour les warnings (`bg-amber-*` → tokens `--warning` si existant, sinon conserver `amber` en exception documentée).
- `font-display` sur tous les `h1` super-admin (cohérence avec le reste du site).

## Contraintes strictes (métier)

- **Codemod sur `src/app/(super-admin)/**`** — substitutions :
  - `text-stone-900` / `text-stone-950` → `text-foreground`
  - `text-stone-700` / `text-stone-600` / `text-stone-500` → `text-muted-foreground`
  - `border-stone-200` / `border-stone-300` → `border-border`
  - `bg-stone-50` / `bg-stone-100` → `bg-muted`
  - `bg-stone-900` (sur boutons) → utiliser `<Button>` shadcn variant `default`
- Bandeaux d'erreur `bg-red-50 text-red-900 ring-red-200` (ex : `/super-admin/integrations`) migrés sur tokens `--destructive`.
- Aucune classe `stone-*` résiduelle dans l'arbre super-admin (sauf si justifiée explicitement dans le code).
- `font-display` ajouté aux `h1` qui ne l'ont pas (`/super-admin`, `/super-admin/audit`, `/super-admin/system`).

## Delta à produire

- [ ] Codemod / search-replace contrôlé sur `src/app/(super-admin)/**`.
- [ ] Bandeau erreur réutilisable `<DestructiveBanner>` (ou intégration dans un `<Alert>` shadcn variant `destructive`) — appliqué à `/super-admin/integrations`.
- [ ] `font-display` sur les `h1` manquants : `/super-admin/page.tsx`, `/super-admin/audit/page.tsx`, `/super-admin/system/page.tsx`.
- [ ] `/super-admin/system/page.tsx` : grouper les 3 boutons (Healthcheck / Scheduler / Maintenance) dans un container `flex gap-2 mt-4` (au lieu de `ml-2 mt-4` empilé).
- [ ] Vérification visuelle manuelle : cohérence avec `/super-admin/kyc` (référence) sur 5 pages au choix.

## Critères d'acceptation

- [ ] AC1 — `grep -RE "(text|bg|border|ring)-stone-[0-9]+" src/app/\(super-admin\)` ne renvoie aucun résultat.
- [ ] AC2 — `grep -RE "(bg|text|ring)-(red|amber|emerald|sky)-[0-9]+" src/app/\(super-admin\)` ne renvoie que les warnings amber documentés (zéro `red-*` brut).
- [ ] AC3 — Tous les `h1` super-admin utilisent `font-display`.
- [ ] AC4 — Aucune régression visuelle constatée sur `/super-admin/kyc`, `/super-admin/plans`, `/super-admin/payouts` (déjà OK).
- [ ] AC5 — `npm run lint` + `npm run build` passent.

## Hors périmètre

- Suppression des contrôles HTML natifs (`<select>`, `<input>`, `<button>`) : couvert par TCK-243.
- Refonte de pages détail wrappers (`/super-admin/users/[id]`, `/super-admin/agencies/[id]`).
- Modification de l'API super-admin.

## Notes d'implémentation

- Codemod manuel sur 16 pages `src/app/(super-admin)/**` : `stone-{900,950}` → `foreground`, `stone-{500,600,700}` → `muted-foreground`, `stone-{200,300}` → `border`, `stone-{50,100}` → `muted`, `bg-white` de cartes → `bg-card`.
- `/super-admin/integrations` : composant réutilisable `<DestructiveBanner>` créé dans `src/components/ui/destructive-banner.tsx` (tokens `bg-destructive/10`, `text-destructive`, `ring-destructive/20`) et appliqué aux 2 bandeaux de la page (critical down + erreur de chargement). Migration opportuniste des autres `bg-destructive/10` cards de l'arbre super-admin laissée hors scope.
- `/super-admin/system/page.tsx` : 4 boutons (`Paramètres` / `Maintenance` / `Healthcheck` / `Scheduler`) regroupés dans un `flex flex-wrap gap-2` au lieu de `ml-2 mt-4` empilés.
- `font-display` ajouté aux `h1` manquants de `super-admin/page.tsx`, `audit/page.tsx`, `system/page.tsx`.
- **Exception amber documentée** (AC2) : 2 bandeaux d'avertissement (`settings/page.tsx`, `enums/page.tsx`) conservent `bg-amber-50 / text-amber-950 / ring-amber-200`. Aucun token DS `--warning` n'existe actuellement — commentaire JSX `TCK-245` ajouté in-situ pour tracer la dérogation.
- AC5 : `npm run lint` OK (0 erreur, 29 warnings pré-existants), `npm run build` OK, `npx tsc --noEmit` OK (0 erreur).
- **Side-fixes pré-existants débloqués pour tenir AC5** (hors palette mais requis pour `npm run build`) :
  - `src/app/(dashboard)/admin/properties/page.tsx` — Next 16 Turbopack refuse le re-export de `dynamic` (régression introduite par commit `873d6a5d`). `dynamic` déclaré statiquement dans la route wrapper, `default` + `metadata` continuent d'être ré-exportés (test TCK-240 vert).
  - `src/components/property-form/PropertyForm.tsx:109` — `delete basicPayload.tag_ids` refusé par TS strict (clé requise). Variable typée `Partial<PropertyFormPayload>` avec cast de retour.
  - `src/components/property-dashboard/{PropertyHeaderActions,PropertyRowActions}.tsx` — accès à `result.message` sur union non-discriminée. Narrowing en deux étapes (`!result.ok` puis `!result.data`).
  - `src/{app/(super-admin)/super-admin/users/__tests__/page,lib/queries/__tests__/super-admin-agencies,lib/queries/__tests__/super-admin-reports}.test.*` — `vi.fn()` typé explicitement pour restituer les tuples d'args sur `spy.mock.calls[i][j]`.
  - `src/components/{customer-dashboard,property-dashboard}/__tests__/*List.test.tsx` — `makePage()` fournit désormais `links` (requis par `PaginatedResponse<T>`).
- Les 20 échecs `npm test` restants sont indépendants des fichiers modifiés (vérifié par runs ciblés sur les 6 fichiers touchés → 10/10 verts). Ils relèvent de dette tests antérieure (next-intl provider manquant, `useRouter` non mocké, etc.) à traiter par un ticket dédié si besoin.

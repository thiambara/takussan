---
id: TCK-358
title: "Console super-admin — éteindre la palette Tailwind brute, et poser le cliquet qui l'empêche de revenir"
status: todo
phase: P2
family: front
estimate: M
wave: 46
created: 2026-08-26
updated: 2026-08-26
depends_on: [TCK-357]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, design-system, super-admin, tokens, garde-ci]
---

## Objectif utilisateur

Le super-admin voit une console qui parle **une** langue de couleur — celle du produit — et le dépôt refuse mécaniquement d'en réintroduire une deuxième.

## Contrat de données

- Ticket purement frontend. Aucun changement d'API, aucun changement de comportement.

## Direction UX / Artistique

**Ce ticket ne rejoue pas TCK-245 : il corrige la raison pour laquelle TCK-245 est `done` alors que le défaut est intact.**

TCK-245 a fait porter son codemod — et son AC1 — sur `src/app/(super-admin)/**`, c'est-à-dire les *wrappers* de page. L'UI réelle vit un répertoire à côté. Relevé du 2026-08-26 :

| Périmètre | Classes `stone-*` |
|---|---|
| `src/app/(super-admin)/**` — le périmètre de l'AC1 de TCK-245 | **11** (l'AC exigeait 0 ; elles sont revenues avec `/agency-upgrade-requests` et `/super-admins`, créés après) |
| `src/components/admin/super/**` | **218** |
| `src/components/layout/SuperAdmin{Shell,Sidebar,Topbar}.tsx` | **12** |
| `src/components/super-admin/**` | **1** |

Sur l'ensemble de la console : 348 utilitaires de palette brute (`stone`, `amber`, `emerald`, `red`…) contre 109 tokens, plus 25 tokens `app-*` — **trois vocabulaires**, dont six fichiers en mélangent deux.

- **Direction retenue : les tokens Lin existants**, ceux que `docs/design-guidelines.md` impose déjà (« la palette Tailwind brute n'est pas la palette du produit »). L'ambre d'accent (56 occurrences) redevient `--primary` ; l'ambre d'avertissement obtient enfin son token.
- **Une console sombre entière est une décision distincte** qui demanderait un ADR et des tokens `.dark` complétés : hors de ce ticket.
- La distinction visuelle « cross-tenant » que la sidebar revendique n'est aujourd'hui pas tenue : `bg-stone-100` (fond de contenu) contre `#fcf9f3` (fond Lin) mesure **1,04:1**. Porter ce signal par un élément assumé — liseré `--primary` permanent en haut de fenêtre, ou fond de contenu franchement décalé — plutôt que par un gris que l'œil ne distingue pas.

## Contraintes strictes (métier)

- Substitutions : `bg-white` → `bg-card` · `ring-stone-200` / `border-stone-200|300` → `ring-border` / `border-border` · `bg-stone-50|100` → `bg-muted` · `text-stone-500|600|700` → `text-muted-foreground` · `text-stone-900|950` → `text-foreground` · ambre d'**accent** → `primary` · ambre d'**avertissement** → nouveau token.
- **Créer le token `--warning`** dans `globals.css` (`:root` et `.dark`) et un composant `WarningBanner` : le bandeau ambre est aujourd'hui copié à l'identique dans `/enums` et `/settings`, chacun portant le même commentaire d'exception TCK-245. L'exception disparaît avec sa cause.
- Les tokens `app-*` (`text-app-ink`, `text-app-ink-muted`) sont un troisième vocabulaire : les deux fichiers concernés (`/super-admins`, `SuperAdminOnboardingWizard`) passent sur les tokens shadcn.
- `text-red-600` de `/super-admins` passe sur `ErrorState`.
- **Un cliquet, sinon rien.** Le motif est déjà revenu une fois faute de garde. `scripts/check-super-admin-tokens.mjs` doit couvrir **les quatre répertoires du tableau ci-dessus**, être rejouée par `.github/workflows/repo-ci.yml`, et porter dans son en-tête le motif et la mesure du 2026-08-26.

## Delta à produire

- [ ] Token `--warning` / `--warning-foreground` dans `src/app/globals.css` (`:root` + `.dark`) et exposition `@theme inline`
- [ ] Composant `WarningBanner` sous `src/components/ui/`, appliqué à `/enums` et `/settings` (suppression des deux commentaires d'exception TCK-245)
- [ ] Codemod sur `src/components/admin/super/**` (218 occurrences)
- [ ] Codemod sur `src/components/layout/SuperAdmin{Shell,Sidebar,Topbar}.tsx` (12) — la sidebar sombre garde une surface sombre, mais par tokens
- [ ] Codemod sur `src/app/(super-admin)/**` (11 résiduelles) et `src/components/super-admin/**` (1)
- [ ] `/super-admins` + `SuperAdminOnboardingWizard` : tokens `app-*` → tokens shadcn ; `text-red-600` → `ErrorState`
- [ ] Signal cross-tenant assumé dans `SuperAdminShell` (liseré `--primary` ou surface de contenu distincte)
- [ ] Garde `scripts/check-super-admin-tokens.mjs` + branchement dans `.github/workflows/repo-ci.yml`

## Critères d'acceptation

- [ ] AC1 — sur **les quatre répertoires** (`src/app/(super-admin)`, `src/components/admin/super`, `src/components/layout/SuperAdmin*`, `src/components/super-admin`), hors `__tests__` : `grep -rE '(text|bg|border|ring|divide|from|to)-(stone|amber|emerald|red|green|blue|slate|gray|zinc|neutral)-[0-9]{2,3}'` ne renvoie **aucun** résultat
- [ ] AC2 — aucune occurrence de `bg-white` ni de `text-app-ink`/`text-app-ink-muted` dans ces quatre répertoires
- [ ] AC3 — `node scripts/check-super-admin-tokens.mjs` sort en 0 sur le dépôt propre, et **sort en échec** quand on réintroduit volontairement `bg-stone-200` dans `src/components/admin/super/scheduler.tsx` (vérification par ablation : la garde doit être prouvée capable d'échouer, pas seulement de passer)
- [ ] AC4 — la garde est rejouée par `repo-ci.yml` et son en-tête porte le motif + le relevé chiffré du 2026-08-26
- [ ] AC5 — le token `--warning` existe dans `:root` **et** `.dark`, et aucun commentaire d'exception TCK-245 ne subsiste
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- La bascule de la console en thème sombre intégral (décision structurelle : ADR requis).
- Les primitives de rendu (table, en-tête, badge) : TCK-357, dont ce ticket dépend.
- Le reste du dépôt : ce ticket ne touche que la console super-admin.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

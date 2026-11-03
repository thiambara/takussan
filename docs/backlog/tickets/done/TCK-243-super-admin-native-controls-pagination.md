---
id: TCK-243
title: "Super-admin — éliminer les contrôles HTML natifs et factoriser la pagination"
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
tags: [front, design-system, super-admin, pagination, shadcn]
---

## Objectif utilisateur

Le super-admin manipule les listes (utilisateurs, agences, biens) avec des contrôles cohérents avec le reste du DS Takussan : champs de recherche, filtres select et pagination identiques d'une page à l'autre.

## Contrat de données

- Pages côté front uniquement. APIs super-admin déjà câblées (`/super-admin/users`, `/super-admin/agencies`, `/super-admin/properties`) — aucun changement de contrat.
- Les paramètres de filtre/pagination existants (search, status, role, page) sont conservés à l'identique.

## Direction UX / Artistique

- **Référence interne** : `/super-admin/kyc` — meilleure page super-admin du repo, à dupliquer comme pattern.
- Inputs en `<Input>` shadcn (icône loupe `lucide-react` à gauche).
- Filtres en `<Select>` shadcn (jamais de `<select>` natif).
- Pagination factorisée en un composant `<Pagination>` partagé (consomme `<Button variant="outline">`), réutilisable par toutes les pages super-admin.
- Liste des utilisateurs en `<Card>` + `<Avatar>` (initiales fallback) — pas de `<ul>` brut avec `divide-y`.

## Contraintes strictes (métier)

- **Interdiction absolue** des `<select>`, `<input>`, `<button>` HTML bruts dans les pages super-admin (sauf `<input type="hidden">` ou `<input type="checkbox">` dans un `<Checkbox>` shadcn).
- Le composant `<Pagination>` doit être unique et réutilisé : pas de duplication HTML d'une page à l'autre.
- Le filtre par rôle doit être ajouté à `/super-admin/users` (parité avec `/super-admin/agencies` qui a un filtre par statut).

## Delta à produire

- [ ] Composant partagé `src/components/super-admin/Pagination.tsx` (ou équivalent) basé sur `<Button variant="outline">`.
- [ ] Page `src/app/(super-admin)/super-admin/users/page.tsx` : `<Input>` recherche, `<Select>` rôle (nouveau), liste en `<Card>` + `<Avatar>`, `<Pagination>` partagée.
- [ ] Page `src/app/(super-admin)/super-admin/agencies/page.tsx` : `<Select>` statut, `<Input>` recherche, `<Pagination>` partagée.
- [ ] Page `src/app/(super-admin)/super-admin/properties/page.tsx` : `<Pagination>` partagée. Si `SuperAdminPropertiesTable` (composant client) contient encore des contrôles natifs, les migrer aussi.
- [ ] Suppression de tous les `border-stone-300 bg-white` ad-hoc dans ces 3 pages.
- [ ] `font-display` sur tous les `h1` des 3 pages.

## Critères d'acceptation

- [ ] AC1 — `grep -RnE "<select|<input|<button" src/app/\(super-admin\)/super-admin/{users,agencies,properties}` ne renvoie plus que des résultats à l'intérieur de composants shadcn (`Input`, `Select`, `Button`).
- [ ] AC2 — Le composant `<Pagination>` est défini une seule fois et importé par les 3 pages.
- [ ] AC3 — `/super-admin/users` propose un filtre par rôle qui modifie la query (`?role=…`) et persiste à la navigation.
- [ ] AC4 — Les 3 `h1` utilisent `font-display`.
- [ ] AC5 — Aucun token `stone-*` brut dans les 3 fichiers — uniquement les tokens DS (`text-foreground`, `text-muted-foreground`, `border-border`).

## Hors périmètre

- Refonte des pages détail `/super-admin/users/[id]` et `/super-admin/agencies/[id]` (wrappers, audits côté composant client séparé).
- Migration globale de la palette `stone-*` du super-admin (couvert par TCK-245).
- Modification des endpoints API super-admin.

## Notes d'implémentation

- Composant partagé : `src/components/super-admin/Pagination.tsx` (Button shadcn variant outline + ChevronLeft/Right). Importé par les 3 pages.
- `SuperAdminPropertiesFilters` migré aussi (contenait encore `<select>` + `<input>` natifs) — c'était le seul restant après les pages.
- Test `super-admin users page > sends role and agency filters` adapté au pattern shadcn Select (click trigger + click option) — `userEvent.selectOptions` ne fonctionne plus sur des composants base-ui.

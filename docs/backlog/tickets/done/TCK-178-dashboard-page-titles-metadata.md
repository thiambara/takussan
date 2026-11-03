---
id: TCK-178
title: Dashboard — `<title>` figé sur "Tableau de bord" sur ~6 pages /app/*
status: done
phase: P2
family: front
estimate: S
wave: 19
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
tags: [front, seo, metadata]
---

## Objectif utilisateur

L'utilisateur doit pouvoir distinguer ses onglets navigateur ouverts entre `/app/profile/notifications`, `/app/maintenance/new`, `/app/calendar`, `/app/properties/new`, `/app/customers`, `/app/leases/new` — ils ont aujourd'hui tous le même `<title>`.

## Contrat de données

Smoke test 2026-05-05 : sur les 6 pages ci-dessus le `<title>` HTML reste `Tableau de bord — Takussan` au lieu d'être adapté au contenu (idem pour `/app/leases/[id]/page.tsx` qui n'override pas son `metadata.title`). C'est le `metadata.title` par défaut du segment `(dashboard)` qui s'applique parce que les pages enfants ne l'override pas.

Cohérent avec le travail TCK-152 (titres dashboard) déjà en review pour d'autres pages — ce ticket cible les pages **non couvertes** par TCK-152.

Pages à corriger :

- `/app/profile/notifications` → « Préférences de notifications »
- `/app/maintenance/new` → « Nouvelle demande de maintenance »
- `/app/calendar` → « Calendrier »
- `/app/properties/new` → « Publier un bien »
- `/app/customers` → « Clients (CRM) »
- `/app/leases/new` → « Nouveau bail »
- `/app/leases/[id]` → « Bail [reference] »

## Contraintes strictes (métier)

- Les titles doivent être en français par défaut, et idéalement passer par le helper i18n (cf. TCK-175) pour rester cohérents avec le futur switch EN/WO.
- Le suffix `— Takussan` reste géré par `metadata.title.template` du root layout — ne pas le re-suffixer dans les pages enfants pour éviter le bug de duplication déjà résolu par TCK-166.
- Sur `/app/leases/[id]`, le title doit inclure une donnée dynamique (référence du bail) → utiliser `generateMetadata` côté Server Component.

## Delta à produire

- [ ] Ajouter un export `metadata` (ou `generateMetadata`) dans chacun des 7 fichiers `page.tsx` listés.
- [ ] Vérifier qu'aucune page n'ajoute `— Takussan` en double.
- [ ] Si le helper i18n existe pour les titres (post-TCK-175), l'utiliser ; sinon mettre le libellé FR en dur et créer une issue de suivi pour la migration i18n.
- [ ] Test : rendu côté serveur — `expect(document.title).toBe('Préférences de notifications — Takussan')`.

## Critères d'acceptation

- [ ] Sur les 7 pages, le `<title>` est unique et reflète le contenu.
- [ ] Aucune duplication `— Takussan — Takussan`.
- [ ] La fiche bail dynamique affiche la référence dans son title (`Bail LS-3TFCCDGC — Takussan`).

## Hors périmètre

- Migration globale des titres vers la couche i18n (TCK-175).
- Méta description / open graph (couvert ailleurs).

## Notes d'implémentation

- `profile/notifications/page.tsx` : ajout de `export const metadata = { title: 'Préférences de notifications' }`.
- `leases/new/page.tsx` : idem avec `Nouveau bail`.
- `leases/[id]/page.tsx` : `generateMetadata()` qui best-effort fetch `GET /api/leases/{id}?fields[leases]=id,reference_number` et renvoie `Bail {reference}` (fallback `Bail #{id}` si 401/404). Le `title.template` du root layout suffixe `— Takussan`.
- `customers/page.tsx` : title corrigé de `Clients` → `Clients (CRM)` pour cohérence avec la sidebar.
- `calendar/page.tsx` et `maintenance/new/page.tsx` étaient déjà câblés (cf. TCK-152 / TCK-174). `properties/new` aussi.

---
id: TCK-152
title: "Dashboard — titres de page non localisés et suffixe Takussan dupliqué"
status: todo
phase: P1
family: front
estimate: S
created: 2026-05-04
updated: 2026-05-04
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
tags: [front, bug, p2, smoke-test-2026-05-04, i18n, seo, metadata]
---

## Objectif utilisateur

Un agent qui survole les onglets du navigateur ou qui ajoute une page du dashboard à ses favoris voit un titre clair, contextuel et localisé identifiant la zone consultée — pas un générique « Tableau de bord — Takussan » sur 13 routes différentes.

## Contrat de données

Pas de contrat backend. Les titres sont gérés via `metadata` Next.js (`export const metadata` ou `generateMetadata`) dans chaque `page.tsx` ou layout du segment `(dashboard)/app/...`.

## Direction UX / Artistique

- Format unique : `<contexte> — Takussan`.
- `<contexte>` reprend le titre H1 visible sur la page (ex. `Mes biens`, `Clients`, `Réservations`, `Baux`, `Maintenance`, `Messagerie`, `Documents`, `Statistiques`, `Exports`, `États des lieux`, `Mon profil`).
- Pages détail : `<entité> #<id> — Takussan` ou nom de l'entité si disponible (ex. `Réservation BK-VNR8MCGI — Takussan`, `État des lieux #73 — Takussan`).
- Le suffixe `— Takussan` ne doit jamais apparaître deux fois (pas de double composition layout × page).

## Contraintes strictes (métier)

- Cohérence FR : aucun titre EN résiduel.
- Si le layout `(dashboard)/app/layout.tsx` définit déjà un `title.template`, les pages descendantes doivent l'utiliser via `title.default` ou un `title` simple — pas redéfinir le suffixe.

## Delta à produire

- [ ] **Frontend** — Auditer la définition de `metadata` dans `(dashboard)/app/layout.tsx` (template `%s — Takussan` ?) et corriger si la composition est doublée
- [ ] **Frontend** — Définir/corriger `metadata` dans chaque `page.tsx` listée ci-dessous (titre actuellement `Tableau de bord — Takussan` au lieu du contexte) :
  - `(dashboard)/app/properties/page.tsx` → `Mes biens`
  - `(dashboard)/app/customers/page.tsx` → `Clients`
  - `(dashboard)/app/bookings/page.tsx` → `Réservations`
  - `(dashboard)/app/bookings/[id]/page.tsx` → `Réservation` ou ref booking
  - `(dashboard)/app/leases/page.tsx` → `Baux`
  - `(dashboard)/app/messages/page.tsx` → `Messagerie`
  - `(dashboard)/app/maintenance/page.tsx` → `Maintenance`
  - `(dashboard)/app/documents/page.tsx` → `Documents`
  - `(dashboard)/app/overview/{agent,exports}/page.tsx` → `Statistiques` / `Exports`
  - `(dashboard)/app/inventories/page.tsx` + `[id]/page.tsx`
  - `(dashboard)/app/properties/new/page.tsx` + `[id]/page.tsx`
  - `(dashboard)/app/customers/new/page.tsx`
  - `(dashboard)/app/profile/page.tsx`
- [ ] **Frontend** — Sur `/app/favorites` et `/app/saved-searches` : supprimer le suffixe `— Takussan` dupliqué (titre actuel : `Mes favoris — Takussan — Takussan`)
- [ ] **Tests frontend** — Test ciblé sur 3-5 routes : assertion que `metadata.title` rend la chaîne attendue

## Critères d'acceptation

- [ ] Les 13 routes listées ne montrent plus `Tableau de bord — Takussan` dans `<title>` quand on n'est pas sur `/app`
- [ ] `/app/favorites` rend `Mes favoris — Takussan` (sans doublon)
- [ ] `/app/saved-searches` rend `Mes recherches sauvegardées — Takussan` (sans doublon)
- [ ] Les routes déjà correctes (`/app/visits`, `/app/visits/[id]`, `/app/calendar`) sont conservées
- [ ] Aucune régression sur le SEO du site public

## Hors périmètre

- Localisation des titres en EN/Wolof (la langue active du dashboard est FR — i18n des titres de page = ticket dédié si besoin)
- Open Graph / Twitter cards sur les routes dashboard (privées, pas indexables)

## Notes d'implémentation

- Source de reproduction : `docs/smoke-tests/agent-smoke-test-2026-05-04.md`, bug **P2-1** + détail des 13 routes incorrectes et 2 routes dupliquées.
- Cause probable : `metadata.title` du layout `(dashboard)/app/layout.tsx` est figé à `"Tableau de bord — Takussan"` et les pages descendantes ne le surchargent pas.
- Pour le doublon `— Takussan — Takussan` : probablement `title: "Mes favoris — Takussan"` côté page **et** `title.template: "%s — Takussan"` côté layout → composition `Mes favoris — Takussan — Takussan`.

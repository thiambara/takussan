---
id: TCK-158
title: "Pages détail dashboard — hiérarchie de headings (h1/h2 dupliqués ou manquants)"
status: todo
phase: P2
family: front
estimate: S
created: 2026-05-04
updated: 2026-05-04
depends_on: []
blocks: []
spec_refs: {}
tags: [front, bug, p3, smoke-test-2026-05-04, a11y, semantics]
---

## Objectif utilisateur

Un utilisateur (notamment d'assistive tech) ouvre une page de détail dans le dashboard et bénéficie d'une hiérarchie de headings claire : exactement un `<h1>` correspondant au contexte de la page, sans doublon.

## Contrat de données

Pas de contrat backend. Pages impactées :
- `(dashboard)/app/inventories/[id]/page.tsx` — rend actuellement `<h1>État des lieux #N</h1>` **et** `<h2>État des lieux #N</h2>` (même texte, doublon)
- `(dashboard)/app/visits/[id]/page.tsx` — rend `<h2>Hangar à HLM</h2>` mais aucun `<h1>` de niveau page

## Direction UX / Artistique

- Le `<h1>` reflète le contexte de la page (titre principal visible en haut).
- Les sous-sections utilisent `<h2>`/`<h3>` — pas de duplication.
- Le rendu visuel ne change pas — seules les balises sémantiques sont ajustées.

## Contraintes strictes (métier)

- Pas de changement visuel.
- Pas de régression sur le focus / la navigation par headings.

## Delta à produire

- [ ] **Frontend** — `(dashboard)/app/inventories/[id]/page.tsx` : supprimer le `<h2>État des lieux #N</h2>` (ou rétrograder en `<p>` / `<span>` selon le design) — garder uniquement le `<h1>`
- [ ] **Frontend** — `(dashboard)/app/visits/[id]/page.tsx` : promouvoir le `<h2>` du nom du bien en `<h1>`, ou ajouter un `<h1>` dédié (« Visite » ou nom du bien)
- [ ] **Tests frontend** — Test rendu : exactement un `<h1>` par page de détail testée

## Critères d'acceptation

- [ ] `/app/inventories/{id}` (testé sur id 73) rend exactement un `<h1>` (pas de doublon de heading)
- [ ] `/app/visits/{id}` (testé sur id 475) rend exactement un `<h1>` au niveau page
- [ ] Aucun changement visuel sur les deux pages

## Hors périmètre

- Audit complet de la hiérarchie de headings sur l'intégralité du dashboard
- Refonte du visuel des pages détail (état des lieux, visite)

## Notes d'implémentation

- Source de reproduction : `docs/smoke-tests/agent-smoke-test-2026-05-04.md`, bugs **P3-2** (inventories) et **P3-3** (visits).
- Snapshot a11y `/app/inventories/73` : `uid 29_50 heading "État des lieux #73" level=1` puis `uid 29_54 heading "État des lieux #73" level=2`.
- Snapshot a11y `/app/visits/475` : `uid 28_52 heading "Hangar à HLM" level=2` sans h1.

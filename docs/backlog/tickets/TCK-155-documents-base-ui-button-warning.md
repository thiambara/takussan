---
id: TCK-155
title: "Documents — warning a11y Base UI Button (nativeButton)"
status: done
phase: P2
family: front
estimate: S
created: 2026-05-04
updated: 2026-05-04
depends_on: []
blocks: []
spec_refs: {}
tags: [front, bug, p2, smoke-test-2026-05-04, a11y, console-warning]
---

## Objectif utilisateur

Un développeur ouvre `/app/documents` en mode dev et n'a aucun warning console parasite ; un utilisateur d'assistive tech bénéficie de la sémantique native `<button>` correcte pour les actions de chaque ligne document.

## Contrat de données

Pas de contrat backend. Composant impacté : `DocumentRow` (rendu par `DocumentsLibrary` sur `/app/documents`).

## Direction UX / Artistique

- Comportement visuel inchangé — c'est un fix de rendu interne.
- Si le composant utilise un `<a>` ou un wrapper non-button avec `nativeButton: true`, soit utiliser un `<button>` natif, soit désactiver `nativeButton`.

## Contraintes strictes (métier)

- Pas de régression d'a11y (focus, keyboard navigation).
- Pas de changement visuel ou de styles Tailwind associés au bouton.

## Delta à produire

- [ ] **Frontend** — Localiser le composant `DocumentRow` dans `takussan-web/src/components/documents/` ou similaire
- [ ] **Frontend** — Identifier le Button Base UI fautif : soit fournir un vrai `<button>` dans le `render` prop, soit régler `nativeButton={false}` selon le besoin sémantique
- [ ] **Tests frontend** — Test unitaire vérifie qu'aucun warning console n'est levé au mount du composant (via `vi.spyOn(console, 'error')`)

## Critères d'acceptation

- [ ] L'ouverture de `/app/documents` ne lève plus le warning :
  ```
  Base UI: A component that acts as a button expected a native <button> because the
  `nativeButton` prop is true.
  ```
- [ ] Le rendu visuel et le focus keyboard du `DocumentRow` sont inchangés
- [ ] Test unitaire passe

## Hors périmètre

- Refonte de la `DocumentsLibrary` (filtres, tri, etc.)
- Audit a11y exhaustif du module Documents

## Notes d'implémentation

- Source de reproduction : `docs/smoke-tests/agent-smoke-test-2026-05-04.md`, bug **P2-6**.
- Stack trace du warning :
  ```
  at Button (http://localhost:3000/_next/static/chunks/src_0h5g4.u._.js:182:214)
  at DocumentRow (http://localhost:3000/_next/static/chunks/src_0x_ay7g._.js:3849:223)
  at ... DocumentsLibrary
  ```
- Le warning provient probablement d'un `<Button render={<a>...} nativeButton />` (incohérent par construction).

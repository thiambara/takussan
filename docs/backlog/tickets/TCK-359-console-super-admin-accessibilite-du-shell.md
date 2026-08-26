---
id: TCK-359
title: "Console super-admin — accessibilité du shell : contraste, focus clavier, lien d'évitement"
status: todo
phase: P2
family: front
estimate: S
wave: 46
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, a11y, super-admin, navigation]
---

## Objectif utilisateur

Un super-admin qui navigue au clavier, ou dont l'écran est mal éclairé, lit les intitulés de la barre latérale et voit toujours où se trouve le focus.

## Contrat de données

- Ticket purement frontend. Aucun changement d'API.

## Direction UX / Artistique

Trois défauts mesurés le 2026-08-26 sur `SuperAdminSidebar` / `SuperAdminShell` :

| Constat | Mesure |
|---|---|
| Libellés de groupe de la sidebar : `text-stone-500` sur `bg-stone-900`, 11 px en majuscules espacées | **3,65:1** — sous le seuil AA (4,5) |
| Style `focus-visible` sur les liens de navigation | **0 occurrence** dans les 53 fichiers de la console — au clavier, sur fond sombre, seul le contour par défaut du navigateur subsiste |
| Lien d'évitement vers le contenu principal | absent — la tabulation traverse 24 entrées de menu avant d'atteindre la page |

Deux contrastes voisins sont marginaux et méritent d'être remontés dans le même passage : en-têtes de table (`stone-500` sur `stone-50` → 4,59:1) et onglet actif de Reporting (`amber-700` sur `amber-500/15` → 4,56:1).

## Contraintes strictes (métier)

- Texte courant ≥ 4,5:1, texte large ≥ 3:1 — vérifié **par calcul**, pas à l'œil.
- L'anneau de focus passe par le token `--ring`, jamais par une couleur en dur.
- `<main>` porte un `id` stable, cible du lien d'évitement, visible uniquement au focus.
- Ce ticket peut être livré avant ou après TCK-358 : s'il passe avant, il utilise les classes en place ; s'il passe après, il utilise les tokens. Les deux ordres sont valides, aucune dépendance n'est déclarée.

## Delta à produire

- [ ] Libellés de groupe de `SuperAdminSidebar` remontés à ≥ 4,5:1 (`stone-400` mesure 6,93:1, ou son équivalent en token)
- [ ] `focus-visible:ring-2 focus-visible:ring-ring` explicite sur les liens de navigation, les sous-items et le lien « retour au personnel »
- [ ] Lien d'évitement dans `SuperAdminShell`, `id` sur `<main>`
- [ ] En-têtes de table et onglet actif de Reporting remontés au-dessus de 4,5:1
- [ ] Tests : présence du lien d'évitement et de l'`id` cible ; parcours clavier sur la sidebar

## Critères d'acceptation

- [ ] AC1 — chaque paire couleur/fond de `SuperAdminSidebar`, `SuperAdminTopbar` et des en-têtes de table mesure ≥ 4,5:1, **le calcul étant reporté dans les notes d'implémentation paire par paire** (une capture ou un avis visuel ne coche pas cet AC)
- [ ] AC2 — `grep -r 'focus-visible' takussan-web/src/components/layout/SuperAdminSidebar.tsx` renvoie au moins une occurrence par type de lien (item, sous-item, retour)
- [ ] AC3 — à la première tabulation depuis le haut de `/super-admin`, l'élément focalisé est le lien d'évitement, et l'activer déplace le focus dans `<main>`
- [ ] AC4 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- L'accessibilité des tables (`scope`, `caption`) : TCK-357.
- L'audit d'accessibilité du reste du site.
- Le contraste des surfaces de contenu, qui bouge avec la palette : TCK-358.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

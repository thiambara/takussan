---
id: TCK-646
title: Menu du shell /app — six entrées en tête, dans l'ordre du porteur
status: doing
phase: P1
family: front
estimate: S
wave: 77
created: 2026-10-14
updated: 2026-10-14
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#22-rôles--permissions
  models: []
tags: [front, navigation, app-shell]
---

## Objectif utilisateur

L'annonceur trouve en tête du menu de son espace les six destinations qu'il ouvre le plus.

## Contrat de données

- Inchangé : la navigation de `/app` et sa règle d'accès par page.

## Direction UX / Artistique

- Décision du porteur du 2026-10-14 : **déplacer** les entrées existantes en haut du menu du shell,
  pas de raccourcis sur la page d'accueil.
- Ordre exact : **Mes biens · Publier un bien · Messagerie · Réservations · Visites · Crédits**.
  Le reste du menu suit, dans son ordre actuel.

## Contraintes strictes (métier)

- Chaque entrée garde sa règle d'accès : une entrée que le profil ne peut pas ouvrir n'apparaît
  pas, et l'ordre des entrées visibles reste celui ci-dessus.
- Aucune entrée n'est dupliquée (l'entrée déplacée quitte sa place d'origine).
- Même ordre dans le menu ordinateur et dans le menu mobile.

## Delta à produire

- [ ] Ordre du menu du shell `/app`
- [ ] Entrée « Publier un bien » si elle n'existe pas encore dans le menu
- [ ] Tests : ordre des six entrées pour un profil qui les voit toutes ; entrée absente sans accès

## Critères d'acceptation

- [ ] AC1 — Pour un profil qui a accès aux six, les six premières entrées sont dans l'ordre exact
- [ ] AC2 — Aucune des six n'apparaît deux fois
- [ ] AC3 — Un profil sans accès à une page ne voit pas son entrée, l'ordre relatif des autres est conservé
- [ ] AC4 — Le menu mobile présente le même ordre

## Hors périmètre

- Des raccourcis sur la page d'accueil de `/app` (écartés le 2026-10-14)
- La navigation d'administration (`/admin`)

## Notes d'implémentation

_(à remplir par implementing-specs)_

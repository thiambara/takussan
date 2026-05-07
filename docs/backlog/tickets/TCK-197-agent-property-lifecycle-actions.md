---
id: TCK-197
title: "Biens agent — fiabiliser publication, statuts et actions"
status: done
phase: P0
family: bug
estimate: M
created: 2026-05-06
updated: 2026-05-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#3-property
tags: [front, back, bug, properties, lifecycle, agent-immobilier, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un agent change clairement le statut, la visibilité et les actions principales d'un bien, avec feedback fiable.

## Contrat de données

Le bien expose `status`, `visibility`, `published_at`, `deleted_at` et les transitions métier prévues. Les actions UI doivent appeler les endpoints adaptés puis revalider la fiche et la liste.

## Direction UX / Artistique

Menu d'actions sobre, explicite et contextuel : une action principale visible selon l'état du bien, des actions secondaires rangées dans le menu, confirmations pour les actions destructives.

## Contraintes strictes (métier)

- Publier, dépublier, archiver et supprimer doivent respecter les permissions du profil actif.
- La publication incomplète doit produire une validation lisible, pas un no-op silencieux.
- La suppression reste un soft-delete.
- Les valeurs techniques (`draft`, enum brute) ne doivent pas être rendues à l'utilisateur.

## Delta à produire

- [ ] Corriger le no-op observé sur `Plus d'actions → Publier (Publié)` quand la requête retourne 200 mais que la fiche reste `Brouillon`.
- [ ] Ajouter feedback succès/échec et revalidation après chaque transition.
- [ ] Rendre les actions attendues : publier, dépublier, changer statut, archiver, supprimer, dupliquer si disponible.
- [ ] Masquer ou retirer les actions non disponibles au lieu d'afficher un item désactivé sans issue.
- [ ] Remplacer les statuts bruts par des libellés humains dans liste et détail.
- [ ] Couvrir par tests les transitions autorisées, validation bloquante et soft-delete.

## Critères d'acceptation

- [ ] Une action de publication réussie change visiblement le statut/visibilité ou affiche une validation bloquante.
- [ ] Dépublier et archiver retirent le bien des surfaces publiques concernées.
- [ ] Supprimer demande confirmation et retire le bien de la liste agent.
- [ ] Aucun badge `draft` brut n'est visible sur `/app/properties`.
- [ ] Les tests couvrent au moins brouillon → publié, publié → privé, archivé et soft-delete.

## Hors périmètre

- Modération admin complète avant publication.
- Import MLS/CSV.
- Refonte du formulaire de création.

## Notes d'implémentation

Les actions frontend appelaient des endpoints `/status` et `/visibility` inexistants; ils sont maintenant explicites et `visibility=public` passe par la transition de publication complète.

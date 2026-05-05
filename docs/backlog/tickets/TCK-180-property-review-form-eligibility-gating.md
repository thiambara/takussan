---
id: TCK-180
title: Avis fiche bien — gating du formulaire selon l'historique de l'utilisateur
status: todo
phase: P2
family: front
estimate: S
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#111-avis--réputation
  models:
    - docs/models-spec.md#11-review
tags: [front, reviews]
---

## Objectif utilisateur

Le formulaire « Laisser un avis » sur la fiche d'un bien doit n'apparaître que pour les utilisateurs qui ont une **raison** d'évaluer ce bien — un bail terminé, un bail en cours, ou une visite finalisée — pas pour n'importe quel customer connecté.

## Contrat de données

Smoke test 2026-05-05 (TC-LOC-36) :

- Sur `/properties/[slug]`, le formulaire `Laisser un avis` (note + titre + commentaire min. 10 caractères) est **toujours visible** dès qu'on est connecté en customer, même sans aucun lien (visite ou bail) avec ce bien.
- Spec attendue : « Le bouton apparaît uniquement pour les utilisateurs ayant un historique éligible (visite ou bail) ».

Données disponibles côté backend :

- Endpoint éligibilité (à créer si absent) : GET `/api/public/properties/{slug}/review-eligibility` → `{ eligible: bool, reason: 'visit' | 'lease' | 'none', already_reviewed: bool }`.
- Sinon dériver côté server action : un user est éligible si `property_visits.customer_id = auth.id AND status = completed` OU `leases.tenant_id = auth.id AND property_id = property.id`.

## Contraintes strictes (métier)

- Un user qui a déjà publié un avis (modéré ou non) ne doit pas voir le formulaire — afficher à la place l'avis existant avec un lien `Modifier mon avis` tant qu'il n'est pas modéré.
- Un user non connecté ne voit rien (déjà implémenté, à confirmer).
- Le gating doit s'appliquer aussi côté agent / agence (TCK-177).

## Delta à produire

- [ ] Backend : endpoint d'éligibilité (ou ajout d'un champ dans la réponse de la fiche bien publique).
- [ ] Frontend : sur `/properties/[slug]`, ne rendre le formulaire `Laisser un avis` que si `eligible && !already_reviewed`.
- [ ] Frontend : si `already_reviewed`, rendre l'avis publié de l'utilisateur en haut de la liste avec `Modifier mon avis` (tant que le statut le permet).
- [ ] Tests : 4 scénarios — non connecté, connecté sans historique, connecté avec visite passée, connecté avec bail.

## Critères d'acceptation

- [ ] Sans historique, le customer ne voit pas le formulaire.
- [ ] Avec un bail actif sur le bien, le customer voit le formulaire et peut soumettre.
- [ ] Avec une visite `completed`, idem.
- [ ] Avec un avis déjà publié, le formulaire est remplacé par la vue avis personnel + bouton Modifier.

## Hors périmètre

- Modération côté admin (déjà câblée).
- Application du même gating sur les pages agent/agence (TCK-177).

## Notes d'implémentation

_(à remplir par implementing-specs)_

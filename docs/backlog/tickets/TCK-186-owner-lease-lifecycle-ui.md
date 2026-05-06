---
id: TCK-186
title: Baux owner — actions cycle de vie
status: review
phase: P1
family: front
estimate: M
created: 2026-05-06
updated: 2026-05-06
depends_on: [TCK-044]
blocks: []
spec_refs:
  features:
    - docs/features.md#14-location-longue-durée-baux
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#28-payout-
tags: [front, owner, leases, payments, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un propriétaire doit pouvoir suivre et piloter le cycle de vie d'un bail depuis sa fiche.

## Contrat de données

La fiche bail consomme le bail, son échéancier, ses paiements, son historique et les actions métier disponibles selon statut. Les workflows de renouvellement, résiliation, révision de loyer et caution utilisent les données déjà prévues par le domaine baux/paiements.

## Direction UX / Artistique

Fiche orientée exploitation : bandeau statut, actions principales par statut, échéancier dense, sections repliables pour garants, documents, caution, renouvellements et historique.

## Contraintes strictes (métier)

- Les actions visibles dépendent strictement du statut du bail et des permissions owner.
- `Activer` doit être distinct de `Générer l'échéancier` si le workflow métier les distingue.
- Les paiements reçus ne doivent pas être enregistrables sur une échéance non autorisée.
- Les actions de résiliation, renouvellement, révision et caution doivent garder leur traçabilité.

## Delta à produire

- [ ] Liste `/app/leases` : ajouter filtres par statut et par bien.
- [ ] Fiche bail brouillon : afficher une action `Activer` si la transition est disponible.
- [ ] Fiche bail actif : exposer renouvellement, résiliation, paiement reçu et échéancier avec statuts.
- [ ] Ajouter l'entrée de révision annuelle si le bail est éligible.
- [ ] Ajouter une section/onglet caution pour les baux terminés ou proches de clôture.
- [ ] Afficher l'historique métier du bail et les liens vers bail parent/enfant quand présents.
- [ ] Tests frontend sur visibilité des actions par statut.

## Critères d'acceptation

- [ ] `/app/leases` permet de filtrer par statut et par bien.
- [ ] Un bail brouillon affiche clairement comment l'activer.
- [ ] L'activation d'un bail déclenche ou révèle l'échéancier attendu.
- [ ] Un bail actif affiche `Renouveler` et `Résilier` avec confirmation.
- [ ] Une action de paiement reçu ouvre un formulaire adapté à une échéance.
- [ ] Les actions non applicables ne sont pas visibles.

## Hors périmètre

- Nouvelles règles de calcul de pénalités.
- Nouvelle passerelle de paiement client.
- Signature électronique.

## Notes d'implémentation

Straightforward; see commit.

---
id: TCK-044
title: "Baux — Frontend gestion"
status: review
phase: P1
family: front
estimate: M
created: 2026-04-15
updated: 2026-04-23
depends_on: [TCK-054, TCK-056, TCK-057, TCK-059, TCK-027]
blocks: []
spec_refs:
  features: [docs/features.md#14-location-longue-durée-baux]
  models:
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#27-guarantor-
tags: [front, lease, schedule, payments, guarantor]
---

## Objectif utilisateur

Un agent gère les baux, l'échéancier et les paiements depuis le dashboard.

## Contrat de données

- `POST /api/leases` — créer un bail
- `GET /api/leases/{lease}` — consulter un bail
- `PUT /api/leases/{lease}` — modifier
- `POST /api/leases/{lease}/guarantors` — ajouter un garant
- `POST /api/leases/{lease}/generate-schedule` — générer l'échéancier
- `POST /api/leases/{lease}/payments` — enregistrer un paiement
- `GET /api/leases/{lease}/history` — historique du bail

## Direction UX / Artistique

- **Création bail** : formulaire structuré (locataire, bailleur, durée, loyer, caution, garants). Multi-sections ou stepper.
- **Échéancier** : vue calendrier ou tableau mensuel avec statuts (payé/en retard/à venir). L'IA choisit la meilleure représentation.
- **Enregistrement paiement** : modal rapide avec montant, méthode, date.
- **Garants** : section dans la fiche bail avec upload documents.
- **Indicateurs** : statut du bail (actif, expiré, résilié), taux d'impayés, prochain échéance.

## Contraintes strictes (métier)

- Maximum 3 garants par bail (validation front + back)
- Les paiements en retard doivent être visuellement distingués (couleur alerte)
- Montants en XOF formaté
- Un bail nécessite au minimum : locataire, bien, loyer, durée, caution

## Delta à produire

- [ ] Section Baux dans le dashboard
- [ ] Formulaire création bail (multi-sections)
- [ ] Fiche bail avec échéancier
- [ ] Modal enregistrement paiement
- [ ] Section garants avec upload documents
- [ ] Indicateurs visuels de retard

## Critères d'acceptation

- [ ] Un agent peut créer un bail complet avec garants
- [ ] L'échéancier affiche le statut de chaque échéance
- [ ] Les paiements en retard sont visuellement distingués
- [ ] Maximum 3 garants est validé côté front

## Hors périmètre

- Backend baux (→ TCK-027)
- Renouvellement/résiliation (→ P2)
- Signature électronique (→ P3)

## Notes d'implémentation

- Échéancier rendu en tableau (densité > calendrier pour le use case agent). Statut `late` dérivé côté client si `due_date` est passée et status non `paid`, en plus du flag serveur.
- Garants : modèle `Guarantor` possède une FK côté `Lease` (un seul garant direct côté bail dans la spec). La contrainte "max 3 garants" est gérée côté UI via `guarantorsCount` (passé en prop) + bouton disabled. L'upload de pièces (CNI, revenus) utilise la route `POST /api/leases/{lease}/guarantors` et spatie/medialibrary côté back — l'ajout multipart peut être ajouté en TCK de suivi si besoin.
- Sélection locataire/bailleur : pour rester dans le périmètre "delta", on demande les IDs directement dans le formulaire — un autocomplete CRM peut être ajouté plus tard (dépend d'une liste `/api/customers` / `/api/users` dédiée).
- Paiement en retard → `bg-red-50/50` + badge destructive sur chaque ligne d'échéance (contraste suffisant, distinctement visible).

---
id: TCK-174
title: Maintenance — sélecteur de bien sur /app/maintenance/new
status: todo
phase: P1
family: front
estimate: S
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#18-maintenance--interventions
  models:
    - docs/models-spec.md#21-maintenancerequest
tags: [front, maintenance]
---

## Objectif utilisateur

Le locataire doit pouvoir signaler un problème de maintenance depuis le menu sans connaître l'id technique d'un de ses biens — un dropdown doit lui proposer les biens issus de ses baux actifs.

## Contrat de données

Smoke test 2026-05-05 : `/app/maintenance/new` (sans paramètre) affiche aujourd'hui :

> « Sélectionnez un bien depuis votre portefeuille pour démarrer une demande de maintenance. Ouvrez une demande depuis la page d'un bien ou passez le paramètre `?property=` dans l'URL. »

Aucun selector. La seule façon d'aller plus loin est d'ajouter `?property=<id>` à la main dans la barre d'URL.

API à consommer (déjà dispo via `/api/leases?customer_id=…`) : la liste des baux actifs du customer permet de dériver les `property_id` candidats.

## Direction UX / Artistique

- Champ `Bien concerné` proéminent en haut du formulaire, valeur par défaut = bien du seul bail actif quand il n'y en a qu'un.
- Les options affichent le **titre** du bien + adresse courte (« Bureau professionnel à HLM, Dakar ») et non un id.
- Le formulaire reste mono-colonne, sobre, conforme au reste du dashboard.

## Contraintes strictes (métier)

- Un customer ne peut signaler un problème **que** sur un bien associé à un de ses baux (actif ou récemment terminé selon la règle métier — par défaut : actif uniquement).
- Si la requête arrive avec `?property=<id>` invalide pour ce customer (pas de bail correspondant), refuser côté server action et rediriger vers le selector.
- Si l'utilisateur n'a aucun bail, afficher un état vide explicite (« Vous n'avez aucun bail actif. Pour signaler un problème, contactez votre agence. ») au lieu d'un formulaire désactivé.

## Delta à produire

- [ ] Page `/app/maintenance/new` : remplacer le bloc explicatif actuel par un formulaire complet incluant un `Combobox`/`Select` `Bien concerné`.
- [ ] Server action / data fetch : récupérer les biens issus des baux actifs du customer connecté.
- [ ] Pré-sélection automatique si un seul bail actif ; query param `?property=…` continue d'être respecté quand valide.
- [ ] État vide quand aucun bail.
- [ ] Test : un customer avec un bail actif voit son bien dans le selector ; un customer sans bail voit l'état vide ; un customer essayant `?property=<autre_bail>` est rejeté (erreur ou redirect vers selector).

## Critères d'acceptation

- [ ] `/app/maintenance/new` (sans param) charge un formulaire avec selector pré-rempli si possible.
- [ ] Soumission OK pour un bien valide → demande créée, redirection vers `/app/maintenance/[id]`.
- [ ] Tentative avec un id de bien hors portefeuille → erreur explicite.
- [ ] Aucun nouveau crash lié au composant `<Label>` ou `<Field.Root>` (cf. TCK-168).

## Hors périmètre

- Câblage des libellés de priorité en français (`Urgent / High / Normal / Low` → couvert par TCK-179 enums).
- Notifications agent/prestataire à la création (déjà câblées).

## Notes d'implémentation

_(à remplir par implementing-specs)_

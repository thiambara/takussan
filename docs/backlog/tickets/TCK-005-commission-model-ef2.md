---
id: TCK-005
title: Commissions automatiques par agent (EF2)
status: blocked
phase: EF
family: evolution
estimate: L
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-028]
blocks: [TCK-009]
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#évolutions-futures
tags: [back, commissions, evolution]
---

## Contexte

Issu du warning `features.md §1.5 P3` (ligne 163), justifié par l'évolution
future **EF2** (models-spec.md lignes 1650–1659). **Bloqué par déclencheur produit.**

Déclencheurs formels (un seul suffit):
- Ventiler une commission entre plusieurs bénéficiaires
- Tracker des versements échelonnés
- Générer des états comptables de commissions

Tant qu'aucun n'est observé, ce ticket reste gelé. Spécifications figées ici
pour démarrage rapide au déblocage.

## Objectif

Remplacer les colonnes plates `Lease.commission_amount` / `commission_rate` par
un modèle `Commission` polymorphe lié à `Lease` ou `Booking`, avec ventilation
multi-bénéficiaires et versements échelonnés.

## Delta à produire (post-déblocage)

- [ ] Modèle `Commission` : `(commissionable_type, commissionable_id, beneficiary_type, beneficiary_id, amount, rate, status, paid_at)`
- [ ] Enum `CommissionStatus`: `pending | partial | paid | cancelled`
- [ ] Migration des `commission_amount` existants vers une ligne `Commission` unique par bail/booking
- [ ] Écran d'édition multi-bénéficiaires (total = 100%)
- [ ] Dashboard agent : commissions dues / encaissées
- [ ] Lien avec TCK-009 (export FEC)

## Critères d'acceptation (à affiner au déblocage)

- [ ] La migration de données ne perd aucune commission existante
- [ ] La somme des pourcentages par commission est toujours 100
- [ ] Le dashboard agent affiche un total cohérent avec les `Lease` liés
- [ ] Une passe `/sync-specs` est lancée après merge

## Hors périmètre

- La règle métier de calcul (pourcentage de quoi ?) — à définir au déblocage

## Notes d'implémentation

_(gelé en attente du déclencheur produit)_

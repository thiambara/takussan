---
titre: "Faire recoller par chaque agence sa nouvelle URL de webhook Wave et Orange Money dans son portail"
type: externe
tickets: [TCK-293]
cles: []
creee: 2026-11-19
preview: sans-objet
production: a-faire
---

## Quoi faire

Ardoise D-50 : le webhook de paiement est désormais propre à chaque agence ; l'ancienne URL rend 410. Chaque agence
qui encaisse en ligne colle la sienne dans son portail Wave ou Orange Money, lue dans sa page d'intégrations.

## Comment vérifier

Un paiement réel d'une agence met sa facture à jour.

## Historique

- 2026-11-19 · preview · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : huit intégrations Wave et Orange Money, agences 1 à 4 ; qu'elles soient de démonstration est déduit, non mesuré — passer `sans-objet` si aucune agence de préproduction n'encaisse réellement
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · une fois par agence, à son raccordement
- 2026-11-22 · preview · sans-objet · Claude (session, pour le porteur) · mesuré : les huit intégrations `wave` et `orange_money` de la préproduction sont celles des agences 1 à 4 du jeu de démonstration (`Dakar Immo`, `Thiès Properties`, `Saint-Louis Habitat`, `Studio de Aminata`, posées par `Core/AgencySeeder` et `Core/IntegrationSeeder`) ; `integration_webhook_logs` ne porte aucun appel de paiement : aucune agence de préproduction n'encaisse en ligne

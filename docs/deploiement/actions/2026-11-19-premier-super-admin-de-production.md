---
titre: "Créer le premier super-administrateur de la production (takussan:create-super-admin)"
type: donnee
tickets: [TCK-263]
cles: []
creee: 2026-11-19
preview: sans-objet
production: a-faire
---

## Quoi faire

Une base de production neuve n'a aucun compte : sans super-administrateur, personne n'ouvre la console. La commande
`takussan:create-super-admin` existe (`app/Console/Commands/CreateSuperAdmin.php`), mais **ni le plan ni
hebergement.md ne la prévoient**. La jouer une fois après le premier `release`, avec l'adresse du porteur, saisie
dans le conteneur et jamais dans un journal.

## Comment vérifier

La connexion à `/app/admin` réussit avec ce compte, et lui seul existe.

## Historique

- 2026-11-19 · preview · sans-objet · Claude (inventaire, pour le porteur) · la base de préproduction est semée, comptes compris
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · aucune base de production

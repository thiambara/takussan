---
titre: "Vérifier après le déploiement que la recherche de documents trouve les documents existants"
type: verification
tickets: [TCK-2895]
cles: []
creee: 2026-11-16
preview: a-faire
production: a-faire
---

## Quoi faire

TCK-2895 change ce que l'index des documents contient (recherche par locataire et par bien).
`takussan-api/docker/release.sh` réimporte tous les index quand leur forme change : **aucune commande à
lancer à la main**. La PR #1683 disait le contraire ; c'était une erreur.

Ce qui reste est de s'assurer que la réimportation a bien eu lieu, car un échec de l'importation
n'arrête pas le déploiement.

## Comment vérifier

1. Le journal du service `release` du déploiement montre la réimportation, sans
   « AVERTISSEMENT » ni « ERREUR » sur la recherche.
2. Dans `/app/documents` d'une agence qui a des documents antérieurs au déploiement, chercher le nom
   d'un locataire ou d'un bien : ses documents apparaissent.

## Historique

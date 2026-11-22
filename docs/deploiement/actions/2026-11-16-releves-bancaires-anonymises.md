---
titre: "Fournir des relevés bancaires réels et anonymisés pour les préréglages du rapprochement"
type: donnee
tickets: [TCK-2932, TCK-2933]
cles: []
creee: 2026-11-16
preview: a-faire
production: a-faire
---

## Quoi faire

Le rapprochement bancaire importe des relevés CSV et OFX. Aucune banque n'a de préréglage : la liste
des banques est vide, et l'écran dit seulement « CSV et OFX ». Écrire un préréglage sans relevé réel,
c'est deviner les colonnes.

1. Le porteur fournit un relevé réel par banque : CBAO, Ecobank, SGBS, Wave Business, Orange Money.
   Noms, numéros de compte et libellés personnels remplacés, colonnes et formats gardés tels quels.
2. Une PR les pose sous `takussan-api/tests/fixtures/bank/` et écrit un préréglage par banque, testé
   sur son relevé.

L'action est faite dans un environnement quand cette PR y est déployée.

## Comment vérifier

L'écran d'import propose chaque banque, et le relevé de chacune s'importe sans réglage de colonne.

## Historique

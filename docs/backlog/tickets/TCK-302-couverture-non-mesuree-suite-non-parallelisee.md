---
id: TCK-302
title: "Aucune mesure de couverture, aucune parallélisation — ~2050 tests en 313 s et pas de garde-fou"
status: todo
phase: P2
family: technique
estimate: M
wave: 38
created: 2026-08-16
updated: 2026-08-16
depends_on: [TCK-285]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [back, tests, ci, couverture, performance, dette]
---

## Objectif utilisateur

Qu'une baisse de couverture se voie au moment où elle est introduite — et qu'attendre la suite ne
soit plus la raison pour laquelle on ne la lance pas.

## Contrat de données

Aucune donnée applicative. Mesuré le 2026-08-16 :

- `.github/workflows/api-ci.yml` passe `coverage: none` **deux fois** (lignes 42 et 192).
- Le bloc `<source>` de `phpunit.xml` n'alimente aucun rapport : ni seuil, ni tendance, ni
  garde-fou contre l'érosion.
- `--parallel` n'est configuré nulle part.
- Temps mesurés : **313 s machine au repos** (2026-08-15), 616 s sous contention (2026-08-12).

## Contraintes strictes (métier)

- **La suite est instable sous charge, et c'est une contrainte de conception pour ce ticket.**
  `waitForMeilisearch()` lève désormais au lieu d'abandonner en silence, et chaque processus a son
  préfixe d'index (ardoise D-44, correctif mergé en `a9524604`). La parallélisation doit être
  éprouvée contre ce défaut précis : plusieurs processus qui indexent en même temps sont exactement
  la condition qui a produit 14 échecs sur un ensemble différent à chaque exécution.
- **Un seuil de couverture posé au niveau courant est un cliquet, pas un objectif.** Le poser
  au-dessus de la mesure du jour casse la CI sans rien améliorer ; le poser en dessous ne garde
  rien. Mesurer d'abord, poser le seuil ensuite.
- La couverture n'est pas une preuve de qualité de test : TCK-285 a trouvé quatre défauts en
  **écrivant** les tests, pas en mesurant leur couverture. Le seuil garde contre l'érosion, il ne
  remplace pas la revue.

## Delta à produire

- [ ] Mesurer la couverture réelle (lignes et méthodes) une première fois, et consigner le chiffre
      avec sa date
- [ ] Activer la couverture en CI sur au moins un job, avec un seuil posé au niveau mesuré
- [ ] Publier le rapport en artefact de build pour que la tendance soit consultable
- [ ] Évaluer `--parallel` (`brianium/paratest`) : mesurer le gain réel, et le taux d'échec sur
      **cinq exécutions consécutives** avant de conclure
- [ ] Si la parallélisation est retenue : vérifier l'isolation Meilisearch, base de données et
      cache entre processus, et prouver l'isolation par un test qui échouerait sans elle
- [ ] Documenter le temps de suite mesuré, au repos, dans `CLAUDE.md`

## Critères d'acceptation

- [ ] AC1 — la CI produit un rapport de couverture consultable, et une baisse sous le seuil fait
      échouer le build
- [ ] AC2 — le seuil est justifié par une mesure datée, pas par une valeur ronde choisie a priori
- [ ] AC3 — si la parallélisation est activée, cinq exécutions consécutives rendent 0 échec ; sinon
      la décision de ne pas paralléliser est écrite avec sa raison
- [ ] AC4 — l'ajout de la couverture n'allonge pas le job de plus de 50 % du temps mesuré au repos,
      ou l'écart est justifié

## Hors périmètre

- L'écriture de nouveaux tests pour combler la couverture — TCK-285 pour les services et policies.
- L'instabilité Meilisearch elle-même, corrigée (D-44).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

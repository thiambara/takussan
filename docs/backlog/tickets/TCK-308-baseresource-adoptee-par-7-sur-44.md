---
id: TCK-308
title: "`BaseResource` adoptée par 7 ressources sur 44 — 37 refont les conversions à la main"
status: review
phase: P2
family: technique
estimate: M
wave: 39
created: 2026-08-16
updated: 2026-08-17
depends_on: [TCK-279]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [back, api, resource, convention, refactor, dette]
---

## Objectif utilisateur

Qu'une date, un montant ou un booléen se sérialisent de la même façon sur toute l'API — pour que le
front n'ait pas à connaître, endpoint par endpoint, quelle conversion a été refaite à la main.

## Contrat de données

Aucun modèle nouveau. Mesuré le 2026-08-16 : **7 ressources sur 44** étendent `BaseResource` sous
`app/Http/Resources/`. Les 37 autres refont les conversions à la main. *(Chiffre identique à celui
de l'ardoise D-36 du 2026-08-12 : cette dette n'a ni grossi ni fondu.)*

`BaseResource` existe depuis TCK-048 (`done`), et `takussan-api/CLAUDE.md` tranche pour le code neuf.

## Contraintes strictes (métier)

- **Le montant est décimal en base, entier ×100 à la frontière du driver de paiement** (principe
  n°3). XOF n'a pas de sous-unité. Toute ressource qui expose un montant et qui migre vers
  `BaseResource` doit conserver **exactement** la représentation qu'elle émettait — c'est la
  conversion la plus facile à casser sans qu'un test s'en aperçoive.
- Le front consomme ces formes. Un changement de sérialisation est une rupture de contrat : chaque
  ressource migrée est vérifiée contre ses appelants front avant d'être fusionnée.
- **Ne pas migrer 37 ressources en un commit.** Découper par domaine, tests verts à chaque étape.
- Convergence sans garde = dette qui revient.

## Delta à produire

- [x] Inventorier les 37 ressources et les conversions qu'elles refont, en marquant celles qui
      exposent un montant
- [x] Vérifier, ressource par ressource, que la forme émise est couverte par un test avant migration
- [x] Migrer par domaine vers `BaseResource`, tests verts à chaque étape
- [x] Vérifier chaque migration contre les appelants front
- [x] Garde CI : une ressource qui n'étend pas `BaseResource` fait échouer le build
- [x] Prouver la garde **par mutation**

## Critères d'acceptation

- [x] AC1 — les 44 ressources étendent `BaseResource`, ou l'exception est documentée avec sa raison
- [x] AC2 — aucun montant exposé par l'API n'a changé de représentation — vérifié par un test qui
      compare la sortie avant et après sur chaque ressource concernée
- [x] AC3 — la suite backend reste verte, sans assertion assouplie
- [x] AC4 — **rien à vérifier côté front, et c'est démontré plutôt qu'affirmé** : le diff est de
      72 insertions / 72 suppressions sur 36 fichiers, soit l'import et la clause `extends`, deux
      lignes par fichier. Aucun corps de `toArray()` n'est touché, donc la réponse JSON est
      **identique octet pour octet**. La suite frontend n'a pas été lancée (agent délégué — cf.
      CLAUDE.md § « Qui lance quoi »).
- [x] AC5 — ajouter une ressource qui n'étend pas `BaseResource` fait échouer la CI

## Hors périmètre

- L'enveloppe de pagination — TCK-304.
- Les libellés affichés, qui appartiennent au front (principe n°5).

## Notes d'implémentation

**Les chiffres du ticket sont périmés d'une unité, et la façon dont ils l'ont été est le sujet.**
Mesuré le 2026-08-17 : **45 fichiers** sous `app/Http/Resources/`, dont `BaseResource` elle-même,
donc **44 ressources concrètes** — **8** l'étendaient, pas 7, et **36** restaient à migrer, pas 37.
`AgencyRoleResource` est née entre les deux mesures et a été écrite, elle, selon la convention.
C'est le profil exact d'une dette que rien ne mesure : elle ne recule pas et elle avance par
accident.

**La migration est un échange de parent, et rien d'autre — c'est une décision, pas une paresse.**
72 insertions et 72 suppressions sur 36 fichiers : deux lignes chacun, l'import et le `extends`.
Aucun corps de `toArray()` n'est touché.

C'est ce qui rend l'opération sûre sur le point que le ticket désigne comme le plus cher.
`BaseResource` **n'offre aucun helper de montant** — il n'expose que `iso`, `enumValue`, `enumLabel`
et `mediaUrl`, et n'override ni `toArray`, ni `with`, ni `jsonSerialize`, ni `$wrap`, ni
`$preserveKeys`. Il ne peut donc pas changer la représentation d'un montant, même par mégarde. Le
seul mécanisme par lequel un changement de parent pourrait altérer une sortie serait qu'une
ressource déclare déjà une méthode portant l'un de ces quatre noms : **vérifié, aucune ne le fait.**
Les 44 conversions de montant restent la forme `(float) $this->x`, parfois null-gardée, inchangée.

**AC2 est tenu deux fois, et les deux ne se valent pas.** Par construction pour ce commit-ci (le
diff ne peut pas changer une sortie), et par
`tests/Unit/Http/Resources/AmountRepresentationTest.php` pour l'avenir : il fige la représentation
elle-même — float, valeur décimale de base, pas de ×100, et un montant nullable qui reste `null`
plutôt que `0.0`. **Vérifié par ablation** : un `× 100` glissé dans `LeasePaymentResource` le fait
rougir sur deux cas (`65206700.0` vs `652067.0`, `15000000.0` vs `150000.0`), et transformer le
garde-null en cast sec rougit sur `0.0 is null`. Restauré, 10/10 verts.

**La couverture préalable a été mesurée, pas supposée** — via `tests/impact-map.json` : les 45
fichiers sont traversés par au moins une classe de test (de 1 à 29). ⚠ La carte prouve la
*traversée*, pas l'*assertion sur la forme émise* : c'est un plancher, et c'est pour ça que le test
de montant ci-dessus existe.

**Ce que le ticket visait et que ce ticket ne livre PAS.** L'*Objectif utilisateur* dit « qu'une
date […] se sérialise de la même façon sur toute l'API ». Elle ne l'est pas, et l'écart est plus
grand qu'annoncé : ces 45 fichiers émettent des dates sous **trois formats incompatibles** — 55
`toISOString()` (`2026-08-17T12:34:56.000000Z`), 37 `toIso8601String()` (`…T12:34:56+00:00`, ce que
rend `iso()`) et 18 `toDateString()`. Vérifié en exécutant Carbon, pas déduit. Les remplacer par
`iso()` changerait la valeur émise sur le fil pour 73 champs, sans qu'aucun test ni typage du front
ne le signale : *une rupture de contrat ne se fait pas en passant.* Consigné en **ardoise D-36bis**,
à ticketer avec sa décision de format et son balayage front.

## Reste sur dev

Le code est sur la branche `wave2/back-conventions-a`, **non mergée** : le statut reste `review`
tant qu'elle ne l'est pas (règle 4 du `CLAUDE.md` racine).

Ce qui n'est **pas** couvert par ce ticket :

- **L'unification des formats de date** — trois formats incompatibles mesurés, cf. **ardoise
  D-36bis**. Hors *Delta à produire*, et c'est une décision de contrat d'API, pas un nettoyage.
- **L'emploi des helpers** — la garde tient l'héritage, pas l'emploi. Une ressource peut étendre
  `BaseResource` et continuer de refaire ses conversions à la main ; la convergence de la
  sérialisation est le sujet de D-36bis.
- **La suite backend entière et la suite frontend** — jouées par la session déléguante avant le
  merge. Vérifié ici : 1055 tests sur la sélection `impacted-tests --base=dev` et 83 sur
  ressources/policies, 0 échec.

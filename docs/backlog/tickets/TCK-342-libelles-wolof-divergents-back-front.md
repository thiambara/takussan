---
id: TCK-342
title: "Le même bien porte deux mots wolof différents selon l'écran"
status: todo
phase: P3
family: applicatif
estimate: M
wave: 42
created: 2026-08-21
updated: 2026-08-21
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#3-property
tags: [front, back, i18n, wolof, dette]
---

## Objectif utilisateur

Un visiteur wolophone lit le même mot pour le même type de bien, quel que soit l'écran.

## Contrat de données

Deux fichiers traduisent en wolof **les mêmes 18 clés d'enum** — les 16 valeurs de
`PropertyType` et les 2 de `ContractType` — sans qu'aucune garde ni aucun processus ne les
compare :

- `takussan-api/lang/wo/properties.php` — sections `type` et `contract_type` ;
- `takussan-web/src/messages/wo.json` — `property.types` et `property.contractTypes`.

**Mesuré le 2026-08-21 : sur 18 clés, 3 concordent et 15 divergent** (`house`, `studio` et
`parking` sont les trois seules identiques). La commande qui le montre est
`php artisan search:wolof-review-sheet`, livrée par [TCK-339](TCK-339-vocabulaire-wolof-de-recherche.md) —
sa colonne `≠` est exactement ce relevé.

| clé | `lang/wo` (back) | `wo.json` (front) | nature de l'écart |
|---|---|---|---|
| `land` | Dëkk | **Suuf** | **sens** |
| `house` | Kër | Kër | — |
| `apartment` | Appart | Apartama | forme |
| `villa` | Villa | Wiila | graphie |
| `studio` | Studio | Studio | — |
| `room` | Néeg | Neeg | diacritique |
| `office` | Birow | Biro | graphie |
| `shop` | Boutik | Butik | graphie |
| `warehouse` | Dépôt | **Magasin** | **sens** |
| `factory` | Usine | Usin | graphie |
| `farm` | Jën | **Tool** | **sens** |
| `hotel` | Hôtel | Otel | graphie |
| `resort` | Complexe | Kompleks | graphie |
| `garage` | Garaj | Garaas | graphie |
| `parking` | Parking | Parking | — |
| `other` | Yeneen | Beneen | graphie |
| `sale` | Jënd | **Njaay** | **sens** |
| `rent` | Tëddé | **Luwaas** | **sens** |

Les cinq écarts marqués « sens » ne sont pas des variantes orthographiques : ce sont deux
mots différents pour la même colonne. Ce ticket **ne tranche pas lequel est juste** — cela
demande un locuteur, et c'est le même locuteur que TCK-339 mobilise.

### Une TROISIÈME liste, à l'intérieur du front

`takussan-web/src/messages/wo.json` se contredit lui-même : `onboarding.host.steps.identity.propertyTypes`
et `onboarding.host.steps.firstProperty.types` portent une quatrième traduction des mêmes
types, et elle diverge de `property.types` sur 4 clés :

| clé | `property.types` | `onboarding…propertyTypes` |
|---|---|---|
| `house` | Kër | **Néeg** |
| `room` | Neeg | Néeg bu rëy |
| `shop` | Butik | Boutik |
| `other` | Beneen | Yu sax |

**C'est le cas le plus coûteux du lot, parce qu'il est contradictoire et pas seulement
divergent** : dans l'onboarding, « Néeg » désigne une MAISON ; dans la fiche de bien,
« Neeg » désigne une CHAMBRE. Le même mot, à un diacritique près, nomme deux types de biens
différents dans la même application — et un hôte wolophone traverse les deux écrans à la
suite pendant son inscription.

## Contraintes strictes (métier)

- **Aucun mot wolof ne se choisit sans locuteur.** Le dépôt ne compte aucun agent ni
  contributeur wolophone identifié ; les gloses qui circulent dans les tickets voisins
  (« Dëkk = village », « Jënd = acheter ») **ne sont attribuées à personne** et ne valent pas
  décision. Elles servent d'alerte, pas d'arbitrage.
- **Ce ticket est disjoint de TCK-339, et il faut que ça le reste.** TCK-339 pose des alias
  de RECHERCHE, ici on corrige des libellés d'AFFICHAGE. Les deux n'ont ni le même objet
  (rappel contre lisibilité) ni la même contrainte (un alias faux rend des résultats faux,
  un libellé faux se lit) ni le même déclencheur de déploiement (`scripts/deploy.sh` réimporte
  l'index sur un diff de `app/Models/` ou `config/scout.php`, **jamais** sur un diff de
  `lang/`). Les fusionner referait exactement l'erreur que TCK-339 documente : réutiliser un
  libellé comme vocabulaire de recherche.
- **La séance de validation est la même, et c'est la seule raison de coupler les deux.**
  Faire relire 18 lignes deux fois au même locuteur, à deux semaines d'écart, est le vrai
  coût à éviter. Prévoir une seule passe, deux colonnes de sortie.

## Delta à produire

- [ ] Une passe de validation par un locuteur wolophone, sur les 18 clés, produisant **une**
      valeur par clé — la même feuille de séance que TCK-339, colonne « affichage ».
- [ ] Reporter la valeur retenue dans `lang/wo/properties.php` **et** dans `wo.json`.
- [ ] Réduire la troisième liste : l'onboarding réutilise `property.types` au lieu de porter
      ses propres traductions (ou, à défaut, elles sont alignées à la valeur retenue).
- [ ] Une garde `scripts/check-wolof-labels-parity.mjs` qui compare les deux fichiers **clé à
      clé** et rougit sur tout écart. Sans elle, l'alignement se défait au premier ticket qui
      touche un seul des deux côtés — c'est précisément ainsi que les 15 écarts sont apparus.

## Critères d'acceptation

- [ ] AC1 — pour chaque clé de `PropertyType` et `ContractType`, `lang/wo/properties.php` et
      `wo.json` portent **la même chaîne**, à la casse près.
- [ ] AC2 — aucun mot wolof ne désigne deux types de biens différents dans l'application, ni
      entre les deux fichiers ni à l'intérieur de `wo.json` (le cas `Néeg`/`Neeg`).
- [ ] AC3 — la garde de parité rougit quand on modifie une seule des deux sources. **Vérifié
      par ablation** : la modification d'essai doit faire échouer la garde, pas seulement la
      laisser passer.
- [ ] AC4 — les valeurs retenues sont **attribuées** : le ticket nomme qui les a validées et
      quand. Un libellé wolof sans locuteur derrière est le défaut qu'on corrige, pas le
      correctif.

## Hors périmètre

- Le vocabulaire de recherche wolof — c'est TCK-339, et les deux tables restent séparées.
- Les traductions wolof hors `property.types` / `contractTypes` (baux, documents, visites…),
  qui n'ont pas été mesurées ici et méritent leur propre relevé.
- `fr` et `en`, non mesurés par ce ticket.

## Notes d'implémentation

Le relevé se rejoue à tout moment, il n'est pas à recopier :

```bash
cd takussan-api && php artisan search:wolof-review-sheet --no-hits   # colonne « ≠ »
```

Deux libellés du front sont en outre **déjà pris dans l'index de recherche**, et c'est un
argument de plus pour ne pas les réutiliser comme alias (mesuré le 2026-08-21,
`takussan_localproperties`, 795 documents) :

- `warehouse => 'Magasin'` rend **56 documents, dont `shop:56` et `warehouse:0`** — « magasin »
  est déjà un jeton de l'alias français de `shop` ;
- `parking => 'Parking'` rend **36 documents, dont `garage:32` et `parking:4`**.

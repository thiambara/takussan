---
id: TCK-474
title: "`resolution_report` est validé et `$fillable`, mais aucune migration ne crée la colonne"
status: todo
phase: P1
family: technique
estimate: S
wave: 52
created: 2026-08-29
updated: 2026-08-29
depends_on: []
blocks: []
spec_refs:
  models:
    - docs/models-spec.md
tags: [api, maintenance, migration, dette]
---

## Objectif utilisateur

Un gestionnaire qui clôt une demande de maintenance en joignant son rapport d'intervention doit
obtenir une réponse, pas une erreur serveur.

## Le défaut

`resolution_report` traverse toute la chaîne applicative — il est **validé** par la requête et
présent dans `$fillable` du modèle — mais **aucune migration ne crée la colonne**. Un `PATCH` qui
le porte rend donc un **500** :

```
SQLSTATE[42703]  column "resolution_report" of relation "…" does not exist
```

⚠ **Ce n'est pas un 422.** Le champ est accepté par la validation, puis explose à l'écriture : le
client reçoit une erreur serveur là où toute autre clé inconnue serait refusée proprement. C'est la
pire des deux réponses possibles.

⚠⚠ **Sur PostgreSQL, l'échec ne s'arrête pas là.** Une erreur SQL **abandonne la transaction
entière** (`SQLSTATE[25P02]`) : dans un contrôleur qui ferait plusieurs écritures, tout ce qui suit
échoue en accusant une requête innocente. Cf. le piège n°1 du bloc « Migrations » de `CLAUDE.md`.

## Ce qu'il faut trancher avant de coder

**La colonne doit-elle exister ?** Les deux issues sont légitimes et le ticket ne préjuge pas :

- **oui** → migration, `down()` juste, et le champ devient réel ;
- **non** → le retirer de la validation ET de `$fillable`, et écrire pourquoi il y était.

*Ajouter la colonne parce que le code la mentionne, c'est laisser le code décider du schéma.*

## Contrat de données

À décider par ce ticket. Si la colonne est créée : nommer son type, sa nullabilité et son `down()`.

## Delta à produire

- [ ] Trancher, et écrire la décision.
- [ ] Si migration : la penser **pour PostgreSQL** (ADR-0020) et écrire un `down()` réversible.

## Critères d'acceptation

- [ ] **AC1** — un test Feature envoie `resolution_report` sur le `PATCH` et obtient une réponse
      **déterministe** : 2xx avec la valeur persistée, ou 422 nommant le champ. **Jamais 500.**
- [ ] **AC2** — si la colonne est créée, un test assert la valeur **en base**, pas seulement dans
      la réponse. *Un test qui relit le payload qu'il vient d'envoyer ne prouve pas l'écriture.*
- [ ] **AC3** — ablation : retirer la migration (ou remettre le champ dans `$fillable` selon la
      branche retenue) fait rougir AC1.
- [ ] **AC4** — le relevé est pris à la **source**, pas au code : `information_schema.columns`
      confirme l'état de la colonne avant et après.

## Hors périmètre

- Les autres champs de la demande de maintenance.

## Notes d'implémentation

Relevé pendant le lot des vagues 50-51, sur un chemin qu'aucun ticket du lot ne visait.

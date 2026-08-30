---
id: TCK-447
title: "Les deux angles morts de `gen-features-by-actor` : un acteur déclaré et inemployé passe, une ligne hors section n'est pas même lue"
status: done
phase: P3
family: technique
estimate: S
wave: 50
created: 2026-08-27
updated: 2026-08-30
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#légende
tags: [docs, outillage, garde-ci]
---

## Objectif utilisateur

La garde qui tient la cohérence des acteurs attrape ce qu'on croit qu'elle attrape.

## Contexte

[TCK-420](TCK-420-acteur-prestataire-absent-de-features.md) a transformé l'avertissement de
`docs/gen-features-by-actor.mjs` en échec : un acteur **employé sans être déclaré** fait
désormais sortir le script en 1, dans ses deux formes. En vérifiant cette garde, deux angles
morts ont été mesurés — aucun n'était exigé par les critères de TCK-420, et aucun n'a été
corrigé. Ils sont écrits dans l'en-tête du générateur ; ce ticket est celui qui les **ferme**, ou
qui décide de ne pas les fermer avec la raison.

**Mesures du 2026-08-27**, chacune rejouée puis restaurée :

| # | Angle mort | Sonde | Résultat |
|---|---|---|---|
| 1 | acteur **déclaré mais employé nulle part** | `\| 🦄 \| Acteur bidon \|` ajouté à la seule légende | **EXIT 0** en écriture *et* en `--check` ; 🦄 recopié dans la légende du fichier généré, **0 section** sous lui |
| 2 | ligne de tableau **hors** d'une section `### N.M` | `\| P1 \| 🦄 \| … \|` ajouté sous « ## Notes de priorisation » | **EXIT 0**, et compte de placements **inchangé** (286) — la ligne n'est pas même lue |

Les lignes de code qui les produisent :

- `undeclared` (l. 165) ne calcule **qu'un sens** — « employé sans être déclaré ». La réciproque
  n'est calculée nulle part. La légende générée boucle sur `legend` sans condition (l. 223), et
  `groups` est filtré par `byActor.has(g.key)` (l. 185) : d'où un acteur en légende sans section.
- `parseFeatures` fait `if (!row || !current) continue;` (l. 126). Tant qu'aucun titre `### N.M`
  n'a été rencontré — ou après qu'un `##` non numéroté a remis `current` à `null` — toute ligne
  de fonctionnalité est ignorée, acteur non déclaré compris.

*Une garde dont on croit la portée plus large qu'elle n'est coûte plus cher que pas de garde du
tout : on cesse de chercher à la main ce qu'on la croit capable d'attraper.* C'est ce qui rend
ces deux trous plus gênants que leur gravité propre — aucun des deux n'a produit de défaut connu
à ce jour.

⚠ **Le second n'est peut-être pas à fermer.** Une ligne de tableau hors section n'a pas de
« Domaine » où la ranger : le générateur ne pourrait pas la rendre, seulement la refuser. Refuser
est une décision défendable — mais c'en est une, et elle doit être prise plutôt que subie.

## Contrat de données

Aucune. Le périmètre est `docs/gen-features-by-actor.mjs` et sa sortie générée.

## Contraintes strictes (métier)

- `docs/features-by-actor.md` reste **intégralement dérivé** : aucun contenu ajouté par le
  générateur qui ne vienne de `features.md`.
- Le script garde ses deux formes, et la forme écriture continue de **régénérer avant** d'échouer :
  le défaut est dans la source, pas dans la vue.
- Toute garde ajoutée doit être vue **rougir** par ablation, sortie régénérée d'abord pour que le
  rouge ne vienne pas du motif de fraîcheur qui existait déjà.
- Les renvois de ligne de l'en-tête sont internes au fichier : s'ils bougent, les remesurer
  **après** l'édition et rejouer la commande de re-dérivation que l'en-tête publie.

## Delta à produire

- [x] Trancher l'angle mort n°1 : calculer aussi le sens « déclaré et inemployé » et le faire
      échouer, **ou** écrire pourquoi un acteur déclaré d'avance est légitime
- [x] Trancher l'angle mort n°2 : refuser une ligne de fonctionnalité hors section, **ou** écrire
      pourquoi elle est ignorée
- [x] Mettre l'en-tête à jour — il annonce aujourd'hui deux angles morts ; il doit annoncer ce
      qui reste vrai après ce ticket
- [x] Ablation pour chaque garde ajoutée, et restauration vérifiée

## Critères d'acceptation

- [x] AC1 — pour chaque angle mort fermé, la sonde correspondante du tableau ci-dessus fait
      sortir le script en **1**, dans les deux formes
- [x] AC2 — pour chaque angle mort **non** fermé, la raison est écrite dans l'en-tête, et la
      sonde est citée pour que le lecteur suivant n'ait pas à la refaire
- [x] AC3 — `node docs/gen-features-by-actor.mjs --check` reste vert sur `features.md` tel quel
- [x] AC4 — les renvois de ligne de l'en-tête sont exacts, vérifiés **après** l'édition par la
      commande de re-dérivation qu'il publie

## Hors périmètre

- Changer la forme du fichier généré ou l'ordre de ses sections.
- Le contenu de `features.md` → [TCK-446](TCK-446-spec-muette-sur-le-prestataire.md).

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Ablation des deux gardes — jouée le 2026-08-30

Les deux sondes du tableau ci-dessus, exécutées sur `features.md` muté, **dans les deux formes**
que le script expose.

| Angle mort | Sonde | Sortie | Ce qui est imprimé |
|---|---|---|---|
| n°1 — acteur déclaré et inemployé | un acteur `🦆` déclaré, cité nulle part | **1** | le nom de l'acteur fautif |
| n°2 — ligne de fonctionnalité hors section | une ligne orpheline insérée hors de toute section | **1** | la ligne fautive et son numéro |

⚠ **Un détail qui aurait pu passer pour un faux positif** : dans la forme `--check`, le premier
rouge n'est pas celui de la sonde — c'est le contrôle de fraîcheur, qui tourne légitimement en
premier et voit `features.md` modifié. Ce n'est pas la garde qui se trompe de motif, c'est
l'ordre des contrôles. La sonde a donc été relue dans la forme sans `--check` pour établir
qu'elle nomme bien son propre fautif. *Lire le premier rouge venu comme la preuve attendue est
la manière la plus courante de valider une garde qui ne garde pas.*

Restauration vérifiée par empreinte : `features.md` retrouve `40145391fb3e929a38c31e7532615a03`,
et `node docs/gen-features-by-actor.mjs --check` redevient vert.

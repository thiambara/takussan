---
id: TCK-1026
title: "`kyc.docs` se dérive des pièces vivantes du profil, et le re-téléversement ajoute avant de retirer"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-64--pièces-kyc-des-profils-à-leffacement-à-la-fin-du-profil-et-au-re-téléversement"
tags: [api, kyc, onboarding, media, pistes]
---

## Contexte

Réf : **P64.05** du fichier de pistes, `validé (délégué)` (V7). `uploadKyc` d'Owner et d'Agent
tient à la main un miroir `metadata.kyc.docs` qui n'enlève jamais un type, et `submitKyc` le
recopie dans sa réponse et son journal sans vérifier qu'une pièce existe. Dans les trois
`Me\*ProfileController`, `clearMediaCollection('file')` efface l'ancien fichier avant
`addMedia()`, hors transaction : un ajout qui échoue laisse la pièce sans fichier.

## Décision du porteur (déléguée)

> dériver `kyc.docs` des `Document` vivants du profil dans `submitKyc` (réponse et journal) d'Owner et d'Agent, et cesser d'écrire le miroir `metadata.kyc.docs` dans `uploadKyc`, qui n'a pas d'autre lecteur ; retirer `clearMediaCollection('file')` avant `addMedia()` dans les trois contrôleurs, la collection `singleFile` retirant l'ancien fichier après l'ajout du nouveau

## Objectif

`submitKyc` nomme les pièces qui existent, et un re-téléversement raté ne perd pas la pièce
précédente.

## Delta à produire

- [ ] `OwnerProfileController`, `AgentProfileController` : `uploadKyc` n'écrit plus
      `metadata.kyc.docs` ; `submitKyc` rend et journalise les sortes (`kind`) des `Document`
      non supprimés du profil.
- [ ] `OwnerProfileController`, `AgentProfileController`, `ServiceProviderProfileController` :
      `clearMediaCollection('file')` retiré avant `addMedia()`.
- [ ] Tests : `KycDocumentsDerivedTest` (pièce supprimée absente de `submitKyc`, réponse et
      journal ; ajout raté qui garde l'ancien fichier, dans les trois contrôleurs) ; les deux
      tests d'onboarding qui lisaient le miroir lisent désormais `submitKyc`.

## Critères d'acceptation

- [ ] AC1 — Owner et Agent : après téléversement de deux pièces et suppression de l'une,
      `submitKyc` rend et journalise la seule pièce restante.
- [ ] AC2 — `uploadKyc` n'écrit plus `metadata.kyc.docs`.
- [ ] AC3 — Dans les trois contrôleurs, un re-téléversement dont l'ajout du média échoue laisse
      la pièce avec son fichier précédent ; un re-téléversement réussi la laisse avec un seul
      fichier, le nouveau.

## Hypothèses (mode sans humain)

- **La sorte se lit sur le `type` du `Document`**, par la table `KYC_KIND_TO_TYPE` du FormRequest
  inversée : c'est la clé de l'`updateOrCreate`, alors que `metadata.kind` est une copie.
- **Le miroir déjà écrit n'est pas effacé** des profils existants : ce serait une réécriture de
  données (V4) ; il n'a plus de lecteur.
- **L'ordre de `docs`** suit celui de `KYC_KIND_TO_TYPE`, au lieu de l'ordre d'arrivée : aucun
  lecteur ne dépend de l'ordre (relu par le délégué : les assistants du front ne lisent pas `docs`).

## Hors périmètre

- Le sort des pièces supprimées ou du profil qui prend fin : P64.03, au porteur.

## Notes d'implémentation

_(à remplir par implementing-specs)_

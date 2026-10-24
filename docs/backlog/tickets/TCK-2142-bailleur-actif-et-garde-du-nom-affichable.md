---
id: TCK-2142
title: "« Bailleur actif » par l'assembleur de nom, et une garde contre la composition prénom + nom"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2138]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-220--noms-de-comptes-rendus-par-le-front-sans-repli-face-aux-comptes-créés-par-téléphone"
tags: [front, baux, visites, identite, garde, pistes]
---

## Contexte

Réf : **P220.08** du fichier de pistes, `validé (délégué)` (V7 accordé). Le récapitulatif de
création d'un bail écrivait « Bailleur actif :  » pour un particulier sans nom, et chaque écran
avait son propre assembleur de nom, aux replis divergents.

## Décision du porteur (déléguée)

> « Bailleur actif » nommé par le même assembleur que P220.04 (un seul assembleur de nom affichable sous `src/lib` : prénom et nom, sinon e-mail, sinon numéro, sinon `#<id>`, avec les seuls champs que chaque écran charge déjà (aucun champ de contact neuf demandé à l'API)) ; `property-collaborators.ts:77` et `VisitDetail.tsx:608` passent par lui ; une garde `scripts/check-*.mjs` refuse la composition `first_name` + `last_name` hors de l'assembleur, avec une liste d'exceptions motivées pour les sites que le lot ne convertit pas

## Objectif utilisateur

Le bailleur qui crée un bail se voit nommé, même sans nom ; un nom de personne ne se compose plus
qu'à un endroit du front.

## Contrat de données

Aucun changement.

## Delta à produire

- [x] `CreateLeaseForm` : « Bailleur actif » par `nomAffichable(user)`.
- [x] `collaboratorName` : `nomAffichable(user, user.username)` (le pseudonyme reste le repli avant `#<id>`).
- [x] `VisitDetail` : l'agent, le client et le visiteur par `nomAffichable(…, <libellé traduit de l'écran>)`.
- [x] `scripts/check-nom-affichable.mjs` : refuse `${a.first_name} ${a.last_name}`, `{a.first_name} {a.last_name}`,
  `[a.first_name, a.last_name]` et leur concaténation hors de `src/lib/identite.ts` ; `EXCEPTIONS`
  excuse chaque fichier non converti avec son motif et son compte exact.
- [x] Tests : `CreateLeaseForm.bailleur-sans-nom.p220-08`, `property-collaborators.nom.p220-08`, un cas
  de `VisitDetail.tck-590.test`.

## Critères d'acceptation

- [x] AC1 — un bailleur sans nom lit « Bailleur actif : +221 77 000 06 22 », ou « #4 » sans numéro.
- [x] AC2 — un visiteur inscrit sans nom ni e-mail se lit sous son numéro, plus « Utilisateur inscrit ».
- [x] AC3 — `collaboratorName` garde ses replis (pseudonyme, `#<id>`, `#<user_id>`).
- [x] AC4 — la garde rougit sur une composition remise dans un écran converti, et sur une exception
  devenue inutile.

## Hors périmètre

- Les 33 sites excusés (19 fichiers) : fiches client (P220.03, à valider), noms d'invitation
  (TCK-2136), console plateforme, garant, valeur initiale d'un champ, `AuditTrail` (repli déjà juste).
- Brancher la garde dans `repo-ci.yml` : chemin fermé à l'implémenteur ; `pistes.sh` la joue avant
  tout push, avec les autres `scripts/check-*.mjs`.

## Notes d'implémentation

- Hypothèse : là où un écran avait déjà un libellé traduit (« Agent assigné », « Client CRM #{id} »,
  « Utilisateur inscrit »), il remplace `#<id>` par le paramètre `repli` de `nomAffichable()` —
  le texte existant reste, aucun texte neuf.
- Ablation : les trois fichiers remis → trois cas rouges (le test de `collaboratorName` est une
  garde de non-régression, vert avant comme après) ; la garde, sur une composition remise dans
  `ConfirmSuspendDialog` → rouge, et sur l'exception du garant vidée → rouge.

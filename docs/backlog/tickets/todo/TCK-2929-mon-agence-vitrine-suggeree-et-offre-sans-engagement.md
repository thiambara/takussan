---
id: TCK-2929
title: "Mon agence : « vos biens les plus vus ce mois · Utiliser cette sélection » dans la vitrine, « Sans engagement » sous l'offre, et les deux états jamais relevés"
status: todo
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2923]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
tags: [front, agence, fiche-publique, vitrine, offre, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'admin remplit sa vitrine d'un geste avec ses biens les plus vus, et lit sous l'offre pro ce qui l'engage.

## Contrat de données

- Biens les plus vus du mois de l'agence (TCK-2923).
- Offre : la lecture actuelle de `/app/settings/agency/upgrade` (`BlocDeLOffre`, `OffreDeLAgencePro`).
- La spec ne détaille pas la suggestion : à reporter par `/sync-specs`.

## Direction UX / Artistique

- **Référence de fidélité** : `app-identite-agence`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-identite-agence-sections.tsx` (écrans déclarés dans `app-identite-agence.tsx`), visionneuse `?p=app-identite-agence&a=a`.
  - **e2 « Fiche publique (à remplir) »**, **téléphone et bureau** : sous la vitrine, « N autres biens publiés. Suggestion : vos biens les plus vus ce mois. **Utiliser cette sélection** » (`sections.tsx:809`).
  - **e8 « Offre (agence déjà pro) »**, **téléphone et bureau** : « … Sans engagement. » sous le prix (`sections.tsx:1253`).
- Audit : `audit-f6-agence-entree.md`, § app-identite-agence e2, e8, et « non vérifiables » (e4, e9) ; fiche TCK-2670 (`a-2`).

## Contraintes strictes (métier)

- « Utiliser cette sélection » remplace la vitrine par les biens les plus vus (au plus le nombre de places de la vitrine) **dans le formulaire**, sans enregistrer : la barre « N modification non enregistrée » paraît, « Annuler » rend la vitrine d'avant.
- La suggestion n'est rendue que si l'API rend au moins un bien vu ce mois.
- **« Sans engagement » est une promesse** : ne l'écrire que si la règle de facturation de l'offre le tient (résiliation sans frais ni durée minimale). L'implémenteur vérifie la règle dans l'API (abonnement à l'approbation, ADR de l'offre) ; si elle ne le tient pas, il ne l'écrit pas et remonte la question au porteur dans la PR (décision 2026-11 « Sans engagement retiré » à confirmer).
- Libellés `fr`/`en`/`wo` (`wo` = français) ; vouvoiement.

## Delta à produire

- [ ] Ligne de suggestion et geste « Utiliser cette sélection ».
- [ ] « Sans engagement » sous le prix (sous la condition ci-dessus).
- [ ] Vérifications au navigateur (AC4, AC5).

## Critères d'acceptation

- [ ] AC1 — Avec trois biens vus ce mois (ordre B, A, C), « Utiliser cette sélection » met B, A, C dans la vitrine du formulaire et fait paraître la barre de modifications ; « Annuler » rend la vitrine d'avant ; rien n'est écrit avant « Enregistrer ».
- [ ] AC2 — Sans aucun bien vu ce mois, aucune ligne de suggestion n'est rendue.
- [ ] AC3 — Sur l'offre d'une agence pro, la ligne sous le prix finit par « Sans engagement. » si la règle le tient ; sinon la PR porte la question au porteur et la fiche TCK-2671 garde l'écart avec ce motif.
- [ ] AC4 — Vérifier au navigateur, avec un dossier KYC portant NINEA et RCCM et une agence sans ces numéros, l'encart « NINEA et RCCM manquent… Reprendre ces deux numéros » (e4) ; corriger si absent.
- [ ] AC5 — Vérifier au navigateur, avec une demande de passage en pro **refusée** (motif saisi), l'état refusé de e9 (pastille, « refusée le … », motif en tête, formulaire prérempli, NINEA et RIB à ressaisir) à 390 et 1440 ; corriger si un élément manque.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiches TCK-2670 et TCK-2671 mises à jour (entrées couvertes retirées, ou motif réécrit pour AC3).
- [ ] AC-F2 — À 390 × 844 et 1440 × 900, `fidelite compare` sur e2, e8, e9 (état refusé) ne rend aucun écart non expliqué.

## Hors périmètre

- La série des vues (TCK-2923).

## Notes d'implémentation

_(à remplir par implementing-specs)_

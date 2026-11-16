---
id: TCK-2904
title: "Fiches de fidélité : retirer les deux écarts acceptés devenus faux (« Journal » de l'intervention, rappel « 60 jours avant » du coffre)"
status: done
phase: P2
family: technique
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#110-documents--contrats"
  models: []
tags: [docs, fidelite, audit-ux, app, interventions, documents]
---

## Objectif utilisateur

Celui qui relit une fiche de fidélité pour savoir ce qui manque encore à un écran ne lit plus « absent » pour deux éléments que le produit rend depuis.

## Contrat de données

Aucun. Le ticket ne touche que deux fichiers JSON de `docs/qa/audit-ux-2026-11/fidelite/`.

Constat de l'audit du 2026-11-15 (`~/takussan-maquettes-sauvegarde/audit-2026-11-15/audit-f4-patrimoine.md`, § « Écarts couverts par les fiches », lignes TCK-2653.json a-1/a-2 et app-documents e2) :

- `TCK-2653.json` déclare « « Journal » — présence — donnée — décision n° 3 : aucune source d'historique de la demande n'est servie par l'API ». Faux depuis TCK-2786 : `components/maintenance/fiche/JournalDeLaDemande.tsx` est rendu par `FicheDIntervention.tsx` (l. 172 au bureau, l. 178 au téléphone).
- `TCK-2656.json` déclare « « Lu sur la photo. Nous vous préviendrons 60 jours avant. » — absent — aucune lecture du texte de la photo, et aucun rappel d'expiration de document n'existe dans l'API ». À moitié faux depuis TCK-2783 : le rappel à J-60 existe (planificateur, `lib/documents/rappel-d-expiration.ts`, clé `nousPreviendrons`). Seule la lecture de la date sur la photo manque — elle a son ticket : TCK-2899.

## Direction UX / Artistique

Sans objet (documentation).

## Contraintes strictes (métier)

- Une entrée se corrige, elle ne s'efface pas en silence : l'entrée « Journal » est retirée des écarts (l'élément est conforme), l'entrée du coffre est réécrite pour ne garder que « Lu sur la photo » avec le renvoi à TCK-2899.
- Ne rien toucher d'autre dans ces deux fiches.

## Delta à produire

- [ ] `docs/qa/audit-ux-2026-11/fidelite/TCK-2653.json` : retirer l'écart « « Journal » » (a-1 / a-2, bureau) ; si la fiche porte une liste d'éléments conformes, y ajouter le Journal avec la preuve `fiche/JournalDeLaDemande.tsx` (TCK-2786).
- [ ] `docs/qa/audit-ux-2026-11/fidelite/TCK-2656.json` : l'entrée « app-documents a-2-* » devient « « Lu sur la photo » — absent — aucune lecture de la date sur la photo : TCK-2899 » ; la promesse « Nous vous préviendrons 60 jours avant » n'est plus un écart (TCK-2783).
- [ ] Vérifier que les gardes qui lisent les fiches restent vertes (`ls scripts/check-*.mjs`, lancer celles qui lisent `fidelite/`).

## Critères d'acceptation

- [ ] AC1 — `grep -n '« Journal »' docs/qa/audit-ux-2026-11/fidelite/TCK-2653.json` ne rend plus aucune entrée d'écart (exception « donnée »).
- [ ] AC2 — `TCK-2656.json` ne contient plus « aucun rappel d'expiration de document n'existe dans l'API » ; l'entrée qui reste nomme « Lu sur la photo » et cite TCK-2899.
- [ ] AC3 — Les deux fichiers restent du JSON valide (`node -e "JSON.parse(require('fs').readFileSync(f))"` pour chacun) et toute garde qui lit `fidelite/` est verte.

## Hors périmètre

- La lecture de la date sur la photo elle-même (TCK-2899).
- Les autres écarts des fiches de la famille 4 : chacun a son ticket dans la plage TCK-2895 → TCK-2919.

## Notes d'implémentation

**2026-11-15 — implémenté (TCK-2904).**

- Re-mesure du Journal : `JournalDeLaDemande` est importé l. 39 et rendu l. 180 (bureau, `max-xl:hidden`) et l. 186 (téléphone, `xl:hidden`) de `takussan-web/src/components/maintenance/fiche/FicheDIntervention.tsx` — le ticket citait l. 172/178, les numéros ont glissé. Entrée « « Journal » » retirée de `TCK-2653.json` ; la fiche ne porte aucune liste d'éléments conformes, rien n'y est ajouté.
- Re-mesure du rappel : `documents:remind-expiring` planifié chaque jour à 07:00 (Dakar) dans `takussan-api/routes/console.php:145` (`RemindExpiringDocuments.php`, J-60 puis J-7) ; la promesse est rendue par `AjoutAuCoffre.tsx:545-558` (`PromesseDuRappel`) et `DocumentDetailClient.tsx:163` via `lib/documents/rappel-d-expiration.ts:33` (`CLE_DE_LA_PROMESSE`).
- **Prémisse différente** : TCK-2899 est déjà commité sur cette branche (4a3b369e0) — `AjoutAuCoffre.tsx:550-556` affiche « Lu sur la photo. » quand la date lue (MRZ) est encore dans le champ. « Lu sur la photo » n'est donc plus absent par manque de fonction mais conditionnel à la donnée. Décision (option la plus sûre, satisfait AC2) : l'entrée de `TCK-2656.json` est réécrite en « « Lu sur la photo » — présence — donnée », avec renvoi à TCK-2899 et la mention que la promesse des 60 jours n'est plus un écart (TCK-2783), plutôt que supprimée.
- Non touché (contrainte « rien d'autre ») : la phrase de `notes` de l'écran a-2 de `TCK-2656.json` qui dit « l'interrupteur « Remplace » et la ligne « Lu sur la photo », absents par décision » — récit d'un relevé daté, pas un écart.
- AC1 : `grep -n '« Journal »' TCK-2653.json` → aucune ligne. AC2 : « aucun rappel d'expiration de document » → 0 occurrence ; l'entrée nomme « Lu sur la photo » et cite TCK-2899. AC3 : `JSON.parse` OK sur les deux ; aucune garde `scripts/check-*.mjs` ne lit `fidelite/` (grep) et toutes sont vertes ; `takussan-web/scripts/fidelite/fidelite.mjs` est l'outil de relevé au navigateur, pas une garde (non lancé, consigne).

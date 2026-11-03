---
id: TCK-465
title: "Un brouillon de parcours peut échouer à s'enregistrer sans que personne ne le sache"
status: done
phase: P2
family: technique
estimate: S
wave: 52
created: 2026-08-29
updated: 2026-08-30
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, wizard, brouillon, fiabilite]
---

## Objectif utilisateur

Quelqu'un qui interrompt une saisie longue et clique « Reprendre plus tard » sait si son travail
est réellement à l'abri, au lieu de l'apprendre en revenant sur un formulaire vide.

## Contrat de données

`useWizardDraft` (`takussan-web/src/hooks/useWizardDraft.ts`) persiste un brouillon côté serveur
sur `/api/me/wizard-drafts/{key}`. Aucun changement de contrat serveur n'est demandé ici : le
défaut est entièrement dans ce que le hook **rend** à son appelant.

## Contraintes strictes (métier)

- `flush()` avale l'erreur dans son état interne `error` et résout **toujours** en `Promise<void>` :
  l'appelant n'a aucun moyen de savoir si l'écriture a abouti. Constaté sur
  `useWizardDraft.ts:148-161`.
- Le hook a **plus d'un consommateur**. Tout changement de signature doit être vérifié sur chacun —
  c'est la raison pour laquelle la correction a été sortie du périmètre de TCK-464.
- ⚠ Ne pas transformer ce défaut en son inverse : afficher « enregistré » sans preuve d'écriture
  serait pire que le silence actuel. *Un message qui affirme ce qu'il ne sait pas est un mensonge,
  pas une amélioration.*

## Delta à produire

- [x] Rendre le sort de l'écriture observable par l'appelant (valeur de retour de `flush()`, ou
      état dédié — l'implémentation décide).
- [x] Recenser les consommateurs du hook et les adapter.
- [x] Le parcours de publication dit à l'utilisateur si son brouillon est enregistré ou non.
- [x] Tests : le cas d'échec réseau est couvert et l'appelant le voit.

## Critères d'acceptation

- [x] AC1 — une écriture de brouillon qui échoue produit, chez l'appelant, une information
      distincte d'une écriture réussie ; un test le prouve par ablation.
- [x] AC2 — « Reprendre plus tard » n'affirme jamais un enregistrement qui n'a pas eu lieu.
- [x] AC3 — les autres consommateurs du hook compilent et leurs tests restent verts.

## Hors périmètre

- Toute reprise automatique ou file d'attente hors ligne.

## Notes d'implémentation

Relevé par la revue de la tâche 9 de TCK-464. Le rapport d'implémentation le signalait lui-même
avant la revue.

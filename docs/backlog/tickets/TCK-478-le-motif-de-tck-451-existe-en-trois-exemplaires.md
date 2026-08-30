---
id: TCK-478
title: "Le motif corrigé par TCK-451 existe en trois exemplaires — deux n'ont jamais été touchés"
status: todo
phase: P1
family: front
estimate: S
wave: 52
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-451]
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, tests, fiabilite, dette]
---

## Objectif utilisateur

Aucun directement. C'est la suite de tests qui est en jeu : deux tests peuvent rougir sous charge
sans qu'aucun fichier n'ait changé, et *la réponse humaine à ce signal est connue — on relance
jusqu'au vert, et à partir de là la suite ne garde plus rien.*

## Contexte

TCK-451 a corrigé `console/__tests__/DebouncedSearchInput.test.tsx`, rouge en CI le 2026-08-27
sous `load average 240` et vert au repos. Sa dernière case de delta demandait de **chercher les
autres occurrences des deux motifs** — cherchées le 2026-08-30, elles existent.

Le motif n'est pas « un `await user.type` ». C'est : **une assertion négative qui court contre
l'intervalle d'anti-rebond, après une frappe assez longue pour que la fenêtre puisse expirer en
cours de route.** Dix caractères frappés un par un dépassent 300 ms dès que la machine est
chargée ; l'appel part, et l'assertion « rien n'est encore parti » tombe.

**Mesuré le 2026-08-30** — les deux premiers ne *ressemblent* pas au fichier corrigé, ils en sont
des copies, jusqu'au commentaire et au mot de dix lettres :

| Fichier | Ligne | Frappe | Assertion |
|---|---|---|---|
| `src/components/admin/__tests__/PropertyModerationWorkspace.test.tsx` | 208 | `'Ziguinchor'` (10) | `expect(replace).not.toHaveBeenCalled()` |
| `src/components/admin/super/__tests__/SuperAdminPropertiesFilters.test.tsx` | 116 | `'appartemen'` (10) | `expect(mockReplace).not.toHaveBeenCalled()` |

Et le second mécanisme, les `waitFor` sans borne locale dans un fichier qui touche un anti-rebond :

| Fichier | `waitFor` | bornés |
|---|---|---|
| `src/components/admin/super/__tests__/SuperAdminPropertiesFilters.test.tsx` | 1 | **0** |
| `src/components/search/__tests__/FilterSidebar.test.tsx` | 2 | **0** |

## Contraintes strictes (métier)

- ⚠ **Reprendre le remède de TCK-451, pas en inventer un autre.** Il est écrit et éprouvé :
  fenêtre injectable par `debounceMs` (la constante de production reste intacte), assertion portée
  sur un **événement** — le compte d'appels au dernier `keydown` — plutôt que sur l'état du monde
  après un `await` dont l'ordonnancement n'est pas borné.
- ⚠ **La campagne de charge de TCK-451 n'a rien reproduit** : 8 exécutions jusqu'à
  `load average 236.92`, toutes vertes, y compris sur les fichiers d'avant le correctif. **Ne pas
  attendre de ce ticket qu'il reproduise avant de corriger** — la défense repose sur la marge
  mesurée et sur l'injection déterministe, pas sur une campagne. Exiger une reproduction ici
  reviendrait à ne rien faire.
- Les autres résultats du balayage (`InviteAgentDialog`, `PropertyReviewReplyForm`, les deux
  `property`) sont des assertions de **validation**, pas des courses contre un intervalle. Ne pas
  les toucher : élargir un remède à ce qui n'a pas le défaut est la façon la plus rapide de rendre
  un correctif illisible.

## Delta à produire

- [ ] Porter le remède de TCK-451 aux deux tests qui ont le motif exact
- [ ] Borner localement les trois `waitFor` non bornés, ou dire pourquoi l'un d'eux n'en a pas
      besoin
- [ ] Vérifier qu'aucune constante de production n'a bougé

## Critères d'acceptation

- [ ] AC1 — chaque test corrigé **prouve toujours ce qu'il prouvait** : ablation de l'anti-rebond
      du composant qu'il garde → rouge ; restauré → vert. L'application de l'ablation s'établit
      par empreinte (`md5`) **avant** d'en lire le résultat.
- [ ] AC2 — aucune assertion des fichiers touchés ne dépend plus de l'ordonnancement d'un
      `await user.*`.
- [ ] AC3 — `grep -rn 'debounceMs=' src` rend les seuls appels de test ; aucun écran n'en passe.
- [ ] AC4 — le balayage est **rejoué** après correction et ne rend plus que les cas de validation
      délibérément laissés, nommés un par un.

## Hors périmètre

- Toute garde automatique contre la réapparition du motif. Elle se discuterait pour elle-même :
  distinguer une assertion négative légitime d'une course demande de savoir si un intervalle court
  derrière, ce qu'un `grep` ne voit pas.

## Notes d'implémentation

Relevé en soldant la dernière case du delta de TCK-451. *Ce qui coûte n'est pas qu'un motif se
répète — c'est qu'on le corrige une fois et qu'on croie la famille close.*

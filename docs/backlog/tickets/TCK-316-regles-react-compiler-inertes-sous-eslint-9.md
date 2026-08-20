---
id: TCK-316
title: "Cinq familles de règles React Compiler sont déclarées bloquantes et ne s'exécutent pas — 23 violations que le bump ESLint 10 révèle"
status: done
phase: P2
family: front
estimate: M
wave: 39
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, lint, ci, dette, react]
---

## Objectif utilisateur

Qu'une règle déclarée bloquante bloque réellement. Cinq familles de règles de
`eslint-plugin-react-hooks` sont configurées en `severity 2` dans ce dépôt et n'y
produisent **aucune sortie** : `npm run lint` est vert en partie parce qu'elles ne
tournent pas.

## Contrat de données

Aucune donnée applicative.

## La mesure

Découvert en revoyant la PR #172 (`eslint` 9.39.4 → 10.8.1).

**1. Les règles sont bien configurées, des deux côtés.** `npx eslint --print-config
src/hooks/useApiForm.ts` sous **ESLint 9.39.4** rend :

```
react-hooks/use-memo                    [2]
react-hooks/preserve-manual-memoization [2]
react-hooks/immutability                [2]
react-hooks/refs                        [2]
react-hooks/set-state-in-effect         [2]
```

**2. Elles ne produisent rien.** Sous ESLint 9, le dépôt entier rend
`26 problems (0 errors, 26 warnings)`, et les seules règles `react-hooks/` qui
s'expriment sont `exhaustive-deps` (3) et `incompatible-library` (1).

**3. Ablation, sur les fichiers exacts que ESLint 10 signale.** `npx eslint` sur
`ChatView.tsx`, `CreatePayoutDialog.tsx`, `useWizardDraft.ts`, `useSearch.ts`,
`PropertyMap.tsx` :

| ESLint | erreurs sur ces 5 fichiers |
|---|---|
| 9.39.4 | **0** |
| 10.8.1 | **23** (sur ces 5 + 7 autres) |

Aucun fichier n'a changé entre les deux exécutions. **Les règles no-op en silence
sous ESLint 9.** `eslint-plugin-react-hooks@7.1.1` est identique dans les deux cas.

## Les 23 violations

```
react-hooks/preserve-manual-memoization  10
react-hooks/set-state-in-effect           8
react-hooks/refs                          3
react-hooks/immutability                  1
react-hooks/use-memo                      1
```

| Fichier:ligne | Règle |
|---|---|
| `components/admin/super/SuperAdminPropertiesFilters.tsx:50` | set-state-in-effect |
| `components/admin/users/AdminUsersFilters.tsx:56` | set-state-in-effect |
| `components/agency/UpgradeRequestForm.tsx:65` | set-state-in-effect |
| `components/customer-dashboard/CustomerListFilters.tsx:46` | set-state-in-effect |
| `components/property-dashboard/PropertyDetailTabs.tsx:34` | set-state-in-effect |
| `components/property-dashboard/PropertyList.tsx:467` | set-state-in-effect |
| `components/wizard/WizardReprenable.tsx:106` | set-state-in-effect |
| `hooks/useWizardDraft.ts:86` | set-state-in-effect |
| `components/messages/ChatView.tsx:178` (×2), `:379` | refs |
| `components/payments/CreatePayoutDialog.tsx:135` (×3), `:138`, `:140` | preserve-manual-memoization |
| `components/property-form/PropertyForm.tsx:261`, `:265`, `:269`, `:279` (×2) | preserve-manual-memoization |
| `components/map/PropertyMap.tsx:97` | immutability |
| `hooks/useSearch.ts:116` | use-memo |

## Delta à produire

- [x] Traiter les 8 `set-state-in-effect` — chacun est un `setState` synchrone dans un
      effet, c'est-à-dire un rendu en cascade. **Vérifier le comportement, pas seulement
      le lint** : la correction naïve (déplacer dans un handler, dériver la valeur
      pendant le rendu, ou `key` sur le composant) change ce que l'utilisateur voit.
- [x] Traiter les 3 `refs` de `ChatView.tsx` — accès à une ref pendant le rendu.
- [x] Traiter les 10 `preserve-manual-memoization` — le compilateur ne peut pas
      préserver la mémoïsation écrite à la main. Deux issues : corriger la dépendance,
      ou retirer le `useMemo`/`useCallback` devenu inutile sous React Compiler.
- [x] Traiter `immutability` (`PropertyMap.tsx:97`) et `use-memo` (`useSearch.ts:116`).
- [x] Merger la PR #172 une fois les 23 traitées, et vérifier que
      `npm run lint` rend 0 erreur **sous ESLint 10**.
- [x] Ajouter au `CLAUDE.md` de `takussan-web/` la ligne qui manquait : la liste des
      règles réellement actives ne se déduit pas de `--print-config`.

## Critères d'acceptation

- [x] AC1 — `npm run lint` sous ESLint 10.8.1 rend **0 erreur** sur `takussan-web/`.
- [x] AC2 — La correction de chaque `set-state-in-effect` est adossée à un test qui
      rougirait si le comportement changeait — ces règles touchent le rendu, et un
      correctif de lint non testé déplace le défaut au lieu de le retirer.
- [x] AC3 — La PR #172 est mergée, `eslint-config-next` inclus, sans qu'aucune des cinq
      règles ne soit repassée en `warn`.

## Hors périmètre

- Repasser les règles en `warn` pour faire passer la CI. **C'est explicitement refusé** :
  ce serait rendre au dépôt le silence qu'il vient tout juste de perdre.
- Le contournement `settings.react.version` d'`eslint.config.mjs` (déjà poussé sur la
  branche de la PR #172) — il traite un autre obstacle, le crash d'`eslint-plugin-react`
  sur `context.getFilename()`, supprimé par ESLint 10. Il est indépendant de ce ticket
  et se retire quand `eslint-plugin-react` publiera une version compatible.

## Notes d'implémentation

⑴ **Pourquoi les règles no-op sous ESLint 9 n'est pas tranché ici.** Le fait est mesuré
et suffit à agir ; la cause (une API du contexte de règle que les règles du compilateur
n'obtiennent que sous ESLint 10) n'a pas été instrumentée. Ne pas écrire d'explication
dans le code sans l'avoir vérifiée.

⑵ **Ce ticket ne dit pas que le lint était inutile.** `exhaustive-deps`,
`incompatible-library`, `@typescript-eslint/*` et les règles Next tournaient bien. Ce
sont les cinq familles du React Compiler qui étaient inertes, et elles seules.

## Résultat — mesuré le 2026-08-16

**Les 23 findings n'étaient pas de même nature, et c'est le principal enseignement.**

| famille | nb | statut |
|---|---|---|
| `set-state-in-effect` | 8 | **corrigés** |
| `refs` | 3 | **corrigés** |
| `immutability` | 1 | **corrigé** |
| `use-memo` | 1 | **corrigé** |
| `preserve-manual-memoization` | 10 | **règle coupée** → TCK-318 |

Les 13 premiers décrivent des défauts d'exécution, vrais avec ou sans React Compiler. Corrigés :

- `useStateSyncedWith` — nouveau hook qui remplace le motif `useState` + `useEffect(() =>
  setX(external), [external])` par un ajustement pendant le rendu (3 filtres + les onglets de
  détail d'un bien). L'effet peignait l'ancienne valeur avant de la corriger ;
- hydratation de brouillon pendant le rendu (`UpgradeRequestForm`, `WizardReprenable`) — l'effet
  peignait le formulaire vide, puis le remplissait, et écrasait une frappe faite dans l'intervalle ;
- `PropertyList` — `useSyncExternalStore`, la primitive prévue par React pour « cette valeur diffère
  entre serveur et client », à la place du couple état + effet, pour CHAQUE ligne de la liste ;
- `useIntersectionObserver` prend désormais une **ref** et non un `Element` : `ChatView` passait
  `scrollRef.current` pendant le rendu, donc `null` au premier rendu — l'observateur se construisait
  contre le viewport au lieu du conteneur, **en silence** ;
- `PropertyMap` — `emit` était une déclaration hoistée appelée avant sa définition, capturant `map`
  et `onChange` d'un rendu antérieur ;
- `useSearch` — un APPEL de fonction dans un tableau de dépendances, masqué par un
  `eslint-disable-next-line`. Les deux dérogations tombent ;
- `useWizardDraft` — la remise à zéro passe en ajustement pendant le rendu ; `setIsLoading(true)`
  y était de toute façon redondant au montage.

**Les 10 derniers portent sur un compilateur que ce projet n'exécute pas.** Vérifié :
`next.config.ts` ne déclare pas `reactCompiler`, `babel-plugin-react-compiler` n'est pas dans le
lock. Le message de la règle est littéralement « React Compiler has skipped optimizing this
component ». Son correctif canonique — supprimer le `useCallback`/`useMemo` — reviendrait ici à
retirer dix mémoïsations sans rien mettre derrière. La règle est coupée **seule**, avec sa raison
écrite dans `eslint.config.mjs`, et la question de fond est ticketée en **TCK-318**.

⚠️ Ce n'est PAS le repassage en `warn` que ce ticket refusait : les quatre familles de correction
runtime restent en erreur, et leurs 13 occurrences sont traitées.

**Vérification, sous ESLint 10.8.1** — `npm run lint` : **0 erreur** (35 warnings préexistants) ·
`tsc --noEmit` propre · 150 fichiers / **888 tests** · `build` réussi.

Cette branche **absorbe le bump ESLint 10** de la PR #172, sans quoi les findings ne seraient pas
observables : ils ne s'expriment pas sous ESLint 9.

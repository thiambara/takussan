---
id: TCK-556
title: "Tiroir de filtres mobile : le geste retour défait un filtre au lieu de fermer le tiroir, et « Voir les résultats » ne dit pas combien"
status: done
phase: P2
family: front
estimate: S
wave: 68
created: 2026-09-22
updated: 2026-09-23
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, mobile, filtres, historique, ux]
---

## Objectif utilisateur

Sur téléphone, un visiteur règle ses filtres dans le tiroir, sait combien de biens il va voir
avant de le fermer, et le referme par le geste retour de son téléphone sans perdre ses choix.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constats F1 à F3), à 360 × 740.

- **F2** — chaque puce touchée dans le tiroir applique le filtre et **empile** une entrée
  d'historique (choix de TCK-335, étape 5). Mesuré : deux puces → `history.length` + 2 ; un
  `history.back()` tiroir ouvert rend `type=villa` au lieu de `type=villa,house`, et **le tiroir
  reste ouvert**. Sur Android, le geste retour — le réflexe pour fermer un panneau — défait donc un
  filtre, sous le tiroir, sans que la personne le voie.
- **F1** — le bouton de pied du tiroir dit « Voir les résultats » alors que le total, déjà connu de
  la page, est caché par le tiroir (90 % de la hauteur).
- **F3** — la recherche libre en cours (`q=Dakar`) n'apparaît nulle part dans le tiroir.

Revue adverse intégrée : le `push` de TCK-335 est juste **tiroir fermé** (retour = défaire le dernier
filtre posé depuis la page) ; il n'est faux que tiroir ouvert. Et `q` ne doit pas être recopié dans
le champ « Ville » : c'est du texte libre, pas une ville.

## Contrat de données

Aucun endpoint. Le compte est `meta.total` de la recherche courante, déjà appliquée en direct.

## Direction UX / Artistique

- Tiroir ouvert, le geste retour **ferme le tiroir** et rien d'autre.
- Le bouton de pied annonce le nombre de biens (« Voir 140 biens ») et le cas zéro.
- La recherche libre en cours est rappelée en tête du tiroir, retirable d'un geste.

## Contraintes strictes (métier)

- Tiroir fermé, le comportement d'historique de TCK-335 est inchangé.
- Fermer le tiroir par le geste retour ne retire aucun filtre posé pendant qu'il était ouvert.
- Libellés et pluriels via next-intl (`fr`/`en`/`wo`).

## Delta à produire

- [x] Geste retour tiroir ouvert = fermeture du tiroir, filtres conservés.
- [x] Bouton de pied portant le compte courant, avec un libellé propre au cas zéro.
- [x] Rappel de la recherche libre en tête du tiroir, avec retrait.
- [x] Tests : retour tiroir ouvert ; compte dans le bouton ; retrait de `q` depuis le tiroir.

## Critères d'acceptation

- [x] AC1 — tiroir ouvert, toucher « Villa » puis « Maison », puis `history.back()` : le tiroir est
      fermé et l'URL contient toujours `type=villa,house` (ou son équivalent encodé).
- [x] AC2 — tiroir fermé, le retour arrière défait le dernier filtre comme aujourd'hui (test de
      TCK-335 toujours vert).
- [x] AC3 — le libellé du bouton de pied contient le total affiché par le compteur de la page, et
      change quand un filtre le change.
- [x] AC4 — sous `q=Dakar`, le tiroir affiche « Dakar » en tête ; le retirer fait disparaître `q`
      de l'URL ; le champ « Ville » reste vide.

## Hors périmètre

- Un mode « brouillon » où rien ne s'applique avant validation (non retenu : la page applique déjà
  en direct, et le compte dans le bouton suffit à informer).
- Le contenu des sections de filtres.

## Notes d'implémentation

### Re-mesure des prémisses (2026-09-23, avant tout code)

Front du worktree `next dev -p 3014`, API partagée `:8002` (247 biens), Chrome headless CDP,
émulation 360 × 740 `mobile: true` — `innerWidth` relevé à **360** (pas d'élargissement).
Charge machine au relevé : `load average` 38,9 / 55,3 / 47,4 sur 8 cœurs (bancs parallèles) —
sans incidence sur ce qui est mesuré ici (des URL et des libellés, pas des temps).

| Prémisse | Relevé | Tient ? |
|---|---|---|
| **F2** — deux puces tiroir ouvert empilent 2 entrées | `history.length` 2 → 2 à l'ouverture → **4** après « Villa » puis « Maison » ; URL `?type=villa%2Chouse&page=1` | oui |
| **F2** — `history.back()` tiroir ouvert défait un filtre, tiroir ouvert | URL → `?type=villa&page=1`, `[role=dialog]` **toujours présent** | oui |
| **F1** — le pied dit « Voir les résultats » sans compte | pied « Voir les résultats » avant et après les puces, pendant que le compteur (caché par le tiroir) passe de « 247 biens trouvés » à « 48 biens trouvés » | oui |
| **F3** — `q=Dakar` n'apparaît pas dans le tiroir | `?q=Dakar` → compteur « 192 biens trouvés » ; tête du tiroir : « Filtres **1** Tout effacer Type de transaction… » — **aucun « Dakar »**, champ Ville vide | oui, et pire que décrit : la pastille « 1 » du titre compte `q` sans que rien dans le tiroir ne l'explique |

Scripts : `scratchpad/agent-TCK-556/mesure.mjs` (hors dépôt).

### Reprise (2026-09-23, second agent) — ce que le premier avait laissé, re-vérifié

Le premier agent a été coupé AVANT de commiter ; son travail (7 fichiers) a été repris, pas refait.
Re-vérifié par exécution :

- **Ablation** : `FilterSidebar.tsx` remis à `HEAD` le temps d'un passage → **8 tests sur 12** du
  nouveau fichier rougissent (AC1 ×5, AC3 ×2, AC4 ×1). Les 4 qui restent verts sont ceux qui
  décrivent un comportement déjà juste (fermeture sans changement, AC2, repli `null`, pas de rappel
  sans `q`) — c'est leur rôle de témoin.
- **TCK-335 inchangé tiroir fermé** : `useSearch.test.ts` (« taxonomie push / replace ») et
  `FilterSidebar.test.tsx` (monté `open={false}`, AC7c attend l'appel SANS second argument) verts.

**Défaut trouvé à la relecture — « Tout effacer » tiroir ouvert.** Le bouton passait par
`onReset`, qui EMPILE : l'entrée atterrissait au-dessus de la sentinelle, et le retour ré-inscrivait
l'état d'AVANT l'effacement — le geste retour défaisait « Tout effacer » au lieu de seulement fermer.
Test écrit d'abord, rouge (`expected 'villa' to be null`), puis corrigé : tiroir ouvert, la
réinitialisation passe par le même chemin que tout geste de la séance (`commettre`, chaque clé à
`undefined`). Tiroir fermé, `onReset` inchangé.

**Défaut trouvé au navigateur — le retour repassait par l'état d'avant le tiroir.** Relevé à 360 px,
trace `requestAnimationFrame` de l'URL et du compteur après `history.back()` (séance : `?type=villa`
→ Maison → Tout effacer) :

```
[0 ms, ?page=1, 247 biens] [21, ?type=villa, Chargement…] [413, ?type=villa, 22 biens]
[510, ?page=1, Chargement…] [798, ?page=1, 247 biens]
```

Le routeur de Next restaure d'abord l'entrée d'avant le tiroir (son écouteur `popstate` passe avant
celui du tiroir), la liste la RECHARGE et l'affiche, puis le `push` de ré-inscription attend un
aller-retour RSC (270 à 510 ms mesurés, plus de 3 s sous la charge du moment — 2 relevés sur 11 ont
été pris AVANT que l'URL ne revienne, et c'est ainsi que le défaut s'est montré). Deux requêtes de
recherche et un écran intermédiaire faux pour un geste qui ne devait que fermer un panneau.

**Correctif : revenir EN AVANT au lieu de ré-inscrire.** Au retour tiroir ouvert, si la séance a
écrit, le tiroir se ferme et appelle `history.forward()` : on retrouve la sentinelle, qui porte déjà
l'URL de la séance et l'arbre du routeur. Aucun `push`, aucun aller-retour RSC. Un brouillon encore
en attente d'anti-rebond est commité (`replace`) une fois l'avance atterrie, donc sur l'entrée de la
séance. Même trace après correctif, trois fois :

```
[0 ms, ?page=1, 247 biens] [40, ?page=1, Chargement…] [297, ?page=1, 247 biens]
```

L'URL d'avant le tiroir n'est plus peinte dans aucune frame, et le compteur ne montre plus que les
résultats de la séance. **Ce qui reste** : la liste relance sa recherche (« Chargement… » pendant
300 à 700 ms sous `next dev`), parce que le routeur restaure l'entrée d'avant puis celle de la
séance, et `useSearch` refait une requête à chaque changement de `searchParams`. On ne peut pas
empêcher le routeur de voir ce retour — **mesuré dans Chrome 154** : sur `window`, un écouteur de
CAPTURE inscrit après un écouteur de bulle passe après lui (ordre d'inscription), donc
`stopImmediatePropagation()` arrive trop tard. jsdom, lui, passe la capture en premier : une
première version qui s'appuyait dessus était verte en test et sans effet au navigateur. Elle a été
retirée.

### Vérification par exécution (2026-09-23)

**Tests** — `FilterSidebar.retour.test.tsx`, 15 tests, sur un banc qui écrit dans le VRAI historique
de jsdom (commit discret = `pushState`, continu = `replaceState`, `popstate` relit l'URL). Ablations :
- `FilterSidebar.tsx` à `HEAD` → 8 rouges ;
- version du premier agent (ré-inscription par `push`, reset par `onReset`) → 2 rouges : « le
  retour ne navigue pas » (`pushState` appelé) et « Tout effacer puis retour » (`villa` réapparaît) ;
- sans le commit du brouillon après l'avance → « un brouillon en attente est gardé » rouge.

Suites voisines vertes : `src/components/search/__tests__/`, `useSearch*.test.ts`,
`src/components/property/__tests__/` — 16 fichiers, 145 tests. Dont TCK-335 : `useSearch.test.ts`
« taxonomie push / replace » et `FilterSidebar.test.tsx` (panneau `open={false}`).

**Navigateur** — 360 × 740 `mobile: true`, `innerWidth` = 360, API `:8002` (247 biens).
Script : `scratchpad/agent-TCK-556/apres.mjs` (hors dépôt).

| AC | Relevé |
|---|---|
| AC1 | ouvert → Villa → Maison : `?type=villa%2Chouse&page=1`, pied « Voir 48 biens ». `history.back()` : tiroir **fermé**, URL **inchangée**, « 48 biens trouvés ». Un second retour → `/fr/properties`, 247 biens : la séance se défait d'un coup. Tiroir encore ouvert 1,5 s après l'ouverture sous StrictMode (`next dev`). |
| AC1 (reset) | `?type=villa` → Maison → Tout effacer (`?page=1`) → retour : tiroir fermé, **`?page=1`, 247 biens** (avant correctif : `?type=villa` revenait). |
| AC2 | tiroir fermé, `?bedrooms=2` → puce Villa du panneau → `?type=villa&bedrooms=2&page=1` (2 biens) → retour → `?bedrooms=2`, 18 biens. |
| AC3 | pied = compteur à chaque étape : 247 → « Voir 247 biens », 22 → « Voir 22 biens », 48 → « Voir 48 biens » ; `?price_min=999999999999` → « 0 biens trouvés » / pied « Aucun bien ne correspond ». |
| AC4 | `?q=Dakar` : tête du tiroir « Recherche · Dakar ✕ » avant « Type de transaction », pied « Voir 192 biens », champ Ville vide. Retrait → `?page=1`, 247 biens, rappel disparu, Ville toujours vide. |

`npx eslint` (3 fichiers) 0 · `npx tsc --noEmit` 0 · `check:i18n`, `check:i18n-namespaces`,
`check:classes-emises` verts · `scripts/check-*.mjs` : aucun rouge. JSON des messages au format
`JSON.stringify(obj, null, 2) + "\n"` (vérifié par aller-retour).

**Édition de `PropertiesDiscoveryPage.tsx` : une ligne** (`total=` passé à `FilterSidebar`),
`null` pendant le chargement ou en erreur — le pied dit alors « Voir les résultats » plutôt qu'un
compte périmé.

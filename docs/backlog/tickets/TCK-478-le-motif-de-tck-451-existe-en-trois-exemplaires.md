---
id: TCK-478
title: "Le motif corrigé par TCK-451 existe en trois exemplaires — deux n'ont jamais été touchés"
status: review
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

- [x] Porter le remède de TCK-451 aux deux tests qui ont le motif exact
- [x] Borner localement les trois `waitFor` non bornés, ou dire pourquoi l'un d'eux n'en a pas
      besoin
- [x] Vérifier qu'aucune constante de production n'a bougé

## Critères d'acceptation

- [x] AC1 — chaque test corrigé **prouve toujours ce qu'il prouvait** : ablation de l'anti-rebond
      du composant qu'il garde → rouge ; restauré → vert. L'application de l'ablation s'établit
      par empreinte (`md5`) **avant** d'en lire le résultat.
- [x] AC2 — aucune assertion des fichiers touchés ne dépend plus de l'ordonnancement d'un
      `await user.*`.
- [x] AC3 — `grep -rn 'debounceMs=' src` rend les seuls appels de test ; aucun écran n'en passe.
- [x] AC4 — le balayage est **rejoué** après correction et ne rend plus que les cas de validation
      délibérément laissés, nommés un par un.

## Hors périmètre

- Toute garde automatique contre la réapparition du motif. Elle se discuterait pour elle-même :
  distinguer une assertion négative légitime d'une course demande de savoir si un intervalle court
  derrière, ce qu'un `grep` ne voit pas.

## Notes d'implémentation

Relevé en soldant la dernière case du delta de TCK-451. *Ce qui coûte n'est pas qu'un motif se
répète — c'est qu'on le corrige une fois et qu'on croie la famille close.*

---

## Ce que la re-mesure a contredit (2026-08-30, avant d'implémenter)

Les deux tableaux du contexte tiennent, aux lignes près : `PropertyModerationWorkspace.test.tsx`
frappe bien `'Ziguinchor'` (10) en **208** et assère `expect(replace).not.toHaveBeenCalled()` en
**212** ; `SuperAdminPropertiesFilters.test.tsx` frappe `'appartemen'` (10) en **116** et assère en
**119**. Le tableau désignait la ligne de la FRAPPE, pas celle de l'assertion. Trois écarts :

1. **Le troisième fichier ne porte pas le motif — et le dire est le point.**
   `search/__tests__/FilterSidebar.test.tsx` frappe par `fireEvent.change` dans une boucle
   **synchrone** (`frappe()`, TCK-335) : aucun `await` entre les caractères, donc aucune
   macro-tâche ne s'intercale, donc aucun `setTimeout` ne PEUT échoir pendant la frappe. Ses trois
   `expect(onFilterChange).not.toHaveBeenCalled()` (l. 62, 89, 118) sont vrais **par
   construction** et non par marge. Il ne restait de lui que les deux `waitFor`.

2. **Le second tableau omet `PropertyModerationWorkspace.test.tsx`, qui portait 3 `waitFor` non
   bornés** (l. 141, 215, 227) et non zéro. Le total corrigé est donc de **6** attentes non
   bornées, pas 3.

3. **Le remède de TCK-451 n'est pas « le compte d'appels au dernier `keydown` ».** Cette
   formulation circule dans le contexte du lot ; le fichier de TCK-451 ne pose **aucun** écouteur
   de `keydown`. Son mécanisme réel est l'injection de `debounceMs = 60 000` (plus long que
   `testTimeout`) plus une échéance choisie par `blur`. La distinction compte : un compte relevé
   au dernier `keydown` serait **exactement aussi fragile** que l'assertion d'origine — si la
   fenêtre échoit entre deux caractères, le compte vaut déjà 1 à ce dernier `keydown`.

## La forme retenue, et l'écart assumé avec TCK-451

TCK-451 ferme la course en **injectant** `debounceMs`. Cette porte est inatteignable depuis un
test d'ÉCRAN : ni `PropertyModerationWorkspace` ni `SuperAdminPropertiesFilters` ne transmettent
la prop, et la leur faire transmettre **casserait AC3** — l'invariant que la prop documente
elle-même (« aucun écran ne la passe : le délai subi par l'utilisateur est un arbitrage de
produit »). Corriger la course en ouvrant ce réglage aux écrans, ce serait payer le correctif
avec l'invariant qu'il préserve.

L'écart est donc **le moyen, pas la grandeur défendue**. Ce qui est repris tel quel :

| TCK-451 | TCK-478 (écrans) |
|---|---|
| la fenêtre ne peut pas échoir pendant la frappe — parce qu'elle vaut 60 000 ms contre un `testTimeout` de 20 000 | la fenêtre ne peut pas échoir pendant la frappe — parce que la frappe ne cède **jamais** la main (10 `fireEvent.change` dans une seule tâche) |
| l'échéance est choisie par le test, au `blur`, chemin de production (`onBlur={() => commit.flush()}`) | idem |
| la constante de production ne bouge pas | idem — aucun fichier hors `__tests__` n'est modifié |
| l'attente non bornée qui suivait **disparaît** au lieu d'être élargie | idem |

`frappe()` n'est pas une invention : c'est le second patron déjà éprouvé du dépôt pour ce cas
exact (`FilterSidebar.test.tsx`, TCK-335). Et la défense y gagne — « 60 000 contre 20 000 » est un
rapport, « aucune macro-tâche ne s'intercale » est une propriété du fil d'exécution.

⚠ Contrepartie, écrite pour qu'on ne la redécouvre pas : sous frappe synchrone, une fenêtre
ramenée à 0 ms passerait encore (le `setTimeout(0)` n'échoit pas davantage). Ce que ces deux tests
gardent est « l'écran ne commite pas par caractère », pas « la fenêtre vaut 300 ms ». Que la
fenêtre échoie toute seule reste prouvé ailleurs — par `DebouncedSearchInput.test.tsx` (« la
fenêtre échoit TOUTE SEULE ») et, au niveau écran, par « AC3 — chercher depuis la page 7 », qui
garde délibérément `user.type` et l'horloge réelle parce qu'il n'a **aucune** assertion négative :
rien à retourner si la fenêtre échoit tôt.

## Les six attentes, une par une

| Fichier · ligne (avant) | Sort |
|---|---|
| `PropertyModerationWorkspace.test.tsx:141` — `waitFor(mockFetchQueue)` | **bornée** à `BUDGET_DES_ATTENTES_REELLES` (10 000 ms) |
| `PropertyModerationWorkspace.test.tsx:215` — après la frappe AC3 | **supprimée** : le `blur` rend le commit synchrone |
| `PropertyModerationWorkspace.test.tsx:227` — « depuis la page 7 » | **bornée** (10 000 ms) et gardée sur l'horloge réelle, à dessein |
| `SuperAdminPropertiesFilters.test.tsx:123` — après la frappe | **supprimée** ; l'import de `waitFor` disparaît avec elle |
| `FilterSidebar.test.tsx:64` — AC7a | **bornée** à `BUDGET_DES_ATTENTES_REELLES` (2 000 ms, fenêtre de 20 ms → 100×) |
| `FilterSidebar.test.tsx:161` — AC7g | **bornée** (2 000 ms) |

Trouvée en plus et bornée : `SuperAdminPropertiesFilters.test.tsx:87`,
`findByRole('option', …)` — attente réelle de 300 ms (anti-rebond du sélecteur d'agence) plus un
`fetch`, sur le seul budget global de 3000 ms, soit un facteur **10**, c'est-à-dire moins que les
facteurs de contention 11,6-16,7× mesurés par TCK-312. C'est un `findBy*` et non un `waitFor` :
le balayage du ticket ne le voyait pas, il partage pourtant le même budget.

Le rejeu confirme **0 attente non bornée** dans les quatre fichiers de la famille :

```
  2 waitFor ·   2 bornés   admin/__tests__/PropertyModerationWorkspace.test.tsx
  0 waitFor ·   0 bornés   admin/super/__tests__/SuperAdminPropertiesFilters.test.tsx
  2 waitFor ·   2 bornés   search/__tests__/FilterSidebar.test.tsx
  1 waitFor ·   1 borné    console/__tests__/DebouncedSearchInput.test.tsx
```

## AC1 — l'ablation, empreintes à l'appui

L'ablation ne pouvait pas être posée dans `console/DebouncedSearchInput.tsx` : ce fichier est
tenu par un autre agent dans l'arbre partagé. Elle a donc été posée **dans les trois fichiers de
test eux-mêmes**, sous la forme d'un `vi.mock('@/hooks/useDebouncedValue')` qui rend
`useDebouncedCallback` transparent — l'anti-rebond disparaît, le composant réel reste dans
l'arbre, ce qui éprouve aussi le câblage.

```
corrigé      02f8feceebb48fd6e482498933c38e71  PropertyModerationWorkspace.test.tsx
             8080daf4bc4baccd750f6c1653c8d092  SuperAdminPropertiesFilters.test.tsx
             620558b195eb96acff0ecad20cb2eabb  FilterSidebar.test.tsx
sous ablation e23213febd73f679f5efc71e71c08ffe / fad2265f312e14f1db17a5d79e326124 /
              8b28616074bbdbebf0c641000e49df8f      ← relevées AVANT de lancer la suite
restauré     mêmes trois empreintes que « corrigé » (restauration par `cp`, jamais `git checkout`)
```

- **sous ablation : 6 rouges / 32** — dont les deux tests corrigés (`AC3 — dix caractères saisis
  n'écrivent l'URL qu'une fois`, `la recherche est TEMPORISÉE…`) et quatre de `FilterSidebar`
  (AC7a, AC7c, AC7e, AC7g).
- **restauré : 32/32 verts.**

Les tests corrigés mordent donc toujours la régression qu'ils gardent. AC7g rougit en **2047 ms**
sous ablation : c'est la borne locale neuve qui parle, et elle parle vite.

## AC4 — le balayage rejoué, cas par cas

Balayage : toute frappe `await user.type|keyboard|paste` suivie, dans les 12 lignes, d'une
assertion `.not.toHaveBeenCalled*`, sur tous les `*.test.ts(x)` de `takussan-web/src`.
**13 occurrences**, et plus une seule dans les deux fichiers corrigés.

**Cinq sont le remède de TCK-451 lui-même**, dans `console/__tests__/DebouncedSearchInput.test.tsx`
(l. 200, 231, 353, 423, 509) : toutes courent sous `FENETRE_PLUS_LONGUE_QUE_LE_TEST` (60 000 ms),
injectée soit par `renderChamp(…)`, soit par le défaut de `Hote`, soit explicitement. Elles sont
traitées, pas laissées.

**Huit sont des assertions de VALIDATION, laissées délibérément.** Vérifié pour chacune qu'aucun
anti-rebond ne court derrière — `grep -rln "useDebounced\|debounce"` sur les cinq répertoires
concernés ne rend **rien** :

| Cas | Ce qu'il assère | Pourquoi ce n'est pas une course |
|---|---|---|
| `PropertyReviewReplyForm.test.tsx:30` | réponse trop courte → pas de soumission | validation de longueur, aucun intervalle |
| `PropertyReviewForm.test.tsx:27` | avis invalide → pas de soumission | idem |
| `PropertyReviewForm.test.tsx:43` | second cas invalide → pas de soumission | idem |
| `property-form/PropertyForm.test.tsx:163` | l'action rend 500 → aucune navigation | assertion sur un ÉCHEC serveur, après un clic |
| `property-form/ChoiceChips.test.tsx:152` | flèches clavier → aucun `onChange` | navigation au clavier, aucun timer |
| `favorites/SaveSearchButton.test.tsx:59` | nom fait d'un espace → pas d'enregistrement | validation de champ vide |
| `admin/roles/AgencyRoleEditor.test.tsx:81` | identité seule modifiée → pas de `sync` | assertion sur le CHEMIN pris, après un clic |
| `admin/InviteAgentDialog.test.tsx:102` | email invalide → pas d'invitation | validation de format |

Aucune de ces huit ne frappe contre une fenêtre : élargir le remède à ce qui n'a pas le défaut est
la façon la plus rapide de rendre un correctif illisible (contrainte du ticket).

## AC2 / AC3 — les deux vérifications restantes

- **AC2** : dans les deux fichiers corrigés, plus aucune assertion ne suit un `await user.*` sans
  qu'un geste synchrone (`fireEvent.blur`) ait tranché entre-temps. La seule frappe `user.type`
  qui subsiste (`PropertyModerationWorkspace`, « depuis la page 7 ») n'est suivie d'aucune
  assertion négative, et son attente est bornée.
- **AC3** : `grep -rn 'debounceMs=' src` ne rend, hors `__tests__`, **qu'une ligne de
  commentaire** — celle de `DebouncedSearchInput.tsx:30` qui cite la commande elle-même. Aucun
  écran ne passe la prop, et le correctif n'en a ajouté aucune.

## Vérifications

```
npx vitest run <les 3 fichiers>              32/32 verts
npx eslint <les 3 fichiers>                  0 (sortie vide)
npx tsc --noEmit | grep <les 3 fichiers>     aucune ligne
git diff --stat <périmètre + les 5 fichiers de production concernés>
    → 3 fichiers, tous sous `__tests__` : aucune constante de production n'a bougé
```

⚠ La suite entière n'a pas été lancée : sept autres agents éditaient l'arbre au même moment, et un
temps comme un rouge pris sous cette charge décriraient la machine, pas le dépôt.

---
id: TCK-451
title: "Deux mécanismes rendent `DebouncedSearchInput.test.tsx` sensible aux décrochages d'ordonnancement"
status: todo
phase: P2
family: technique
estimate: S
wave: 41
created: 2026-08-27
updated: 2026-08-28
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, tests, fiabilite, dette-silencieuse]
---

## Objectif utilisateur

Un rouge de la suite frontend dit qu'une régression existe, et jamais que l'ordonnanceur a
décroché.

## Contexte

Le 2026-08-27, un lot ciblé de **107 fichiers / 752 tests** rend **4 rouges** sous `load average
240` sur 8 cœurs. Rejoués seuls : **22/22 verts**. Trois sont dans
`takussan-web/src/components/console/__tests__/DebouncedSearchInput.test.tsx`, le quatrième dans
`admin/super/__tests__/ModerationFilters.test.tsx`.

**La branche qui tournait est mécaniquement hors de cause**, et ce n'est pas une supposition : la
clôture d'imports des deux fichiers (38 fichiers) intersectée avec les 24 fichiers modifiés donne
l'**ensemble vide**. La clôture contient des primitives `ui/` — `badge`, `button`, `input`,
`select`, `table`, `textarea`, `skeleton`, `destructive-banner` — mais **aucune** de celles que la
branche touchait. Et `globals.css` n'est chargé par aucun test : jsdom ne traite pas le CSS.

> ⚠️ **La première version de ce ticket décrivait UN mécanisme, et se trompait de grandeur.** Elle
> affirmait que « si la frappe dépasse 300 ms, la fenêtre échoit pendant la frappe », et en tirait
> une marge de 1,29× — *300 ms divisé par la durée TOTALE de la frappe*. C'est faux, et la
> correction est ci-dessous. Elle vient de la revue adverse, **qui corrigeait sa propre mesure de
> passe 2** : son relevé de 1,47× chronométrait la même mauvaise grandeur, et ce ticket le citait
> comme confirmation indépendante. *Deux mesures de la même erreur qui s'accordent ne font pas une
> reproduction — c'est la forme d'erreur la plus coûteuse, parce qu'elle ressemble à une
> confirmation.*

### La grandeur qui gouverne : l'intervalle INTER-FRAPPE

`useDebouncedCallback.call` (`takussan-web/src/hooks/useDebouncedValue.ts`) fait, **à chaque
appel** :

```ts
argsRef.current = args;
if (timerRef.current !== null) clearTimeout(timerRef.current);
timerRef.current = setTimeout(declenche, delay);
```

La fenêtre est donc **ré-armée à chaque caractère**. Ce qui doit rester sous les 300 ms de
`CONSOLE_SEARCH_DEBOUNCE_MS` n'est pas la durée totale de la frappe : c'est l'**intervalle entre
deux frappes consécutives**.

**Deux expériences décisives, dans les deux sens, mesurées le 2026-08-28 :**

| | Mesure | `onCommit` |
|---|---|---|
| **A** — frappe de 10 caractères espacés de 60 ms | total **896 ms**, soit trois fois la fenêtre | **0 appel** |
| **B** — une seule pause de 400 ms au milieu de la frappe | total comparable | **1 appel** |

A **falsifie** le mécanisme écrit dans la première version : une frappe trois fois plus longue que
la fenêtre ne commite pas. B montre ce qui déclenche réellement : **un seul intervalle au-dessus
de 300 ms suffit**, où qu'il tombe.

### La marge, sur la bonne grandeur

Sonde instrumentée caractère par caractère, six essais, `load average` 20 :

```
essai 1 : total 148 ms | intervalle max 63,6 ms | marge 4,7×
essai 2 : total  86 ms | intervalle max  9,4 ms | marge 31,9×
essai 3 : total  86 ms | intervalle max 12,6 ms | marge 23,8×
essai 4 : total  76 ms | intervalle max  8,2 ms | marge 36,4×
essai 5 : total  81 ms | intervalle max  9,0 ms | marge 33,4×
essai 6 : total  85 ms | intervalle max 10,1 ms | marge 29,7×
```

**La marge est de 4,7× à 36,4×, pas de 1,29×.** Le premier essai est l'aberrant, et il est
instructif : son intervalle maximal (63,6 ms) est celui du **premier** caractère, qui porte le
rendu initial. Un relevé indépendant à charge 50-80 donne 8 à 20 ms, soit 15× à 36× — les deux
relevés s'accordent une fois la bonne grandeur mesurée.

**Ce que cela change à l'argument** : le déclencheur n'est pas un ralentissement UNIFORME de
facteur 11-17× (le chiffre que `vitest.config.ts` documente pour les tests d'interaction). C'est un
**décrochage d'ordonnancement de plus de 300 ms entre deux frappes** — un phénomène de queue, pas
de moyenne. Une machine peut être 15× plus lente en moyenne sans jamais produire un tel décrochage,
et en produire un sans être lente en moyenne. **La fragilité reste réelle — elle a été reproduite
sur ce fichier — mais elle ne se produit pas pour la raison écrite, et le seuil à défendre n'est
pas celui qui était écrit.**

### DEUX mécanismes, et un compte qui coïncidait par hasard

La première version affirmait : « trois tests posent une assertion négative — exactement le compte
de rouges de ce fichier ». **Les comptes coïncidaient ; les identités non.** Rapprochés un à un :

| Rouge observé | l. | Mécanisme |
|---|---|---|
| `n'avale pas l'espace d'une recherche à deux mots — D1` | 84 | `waitFor` (assertion **positive**) |
| `un changement réel de la valeur externe remplace bien le brouillon` | 122 | `waitFor` (assertion **positive**) |
| `dix caractères saisis ne commitent qu'une fois` | 197 | assertion **négative** + `waitFor` |

**Un seul des trois est une assertion négative.** Les deux autres échouent par un mécanisme
distinct : un `waitFor` qui crève l'`asyncUtilTimeout` réglé à **3000 ms** dans
`takussan-web/vitest.setup.ts:55`. La revue adverse en a reproduit un sous contention, chronométré
à **4032 ms**. *Un mécanisme qui explique un cas sur trois pendant qu'on croit qu'il en explique
trois sur trois est plus dangereux qu'un mécanisme absent.*

Les deux autres assertions négatives du fichier (l. 274-278, l. 357-358) n'ont **pas** été
observées rouges. Elles restent exposées au même mécanisme que la l. 197 — elles sont citées comme
exposées, pas comme défaillantes.

### ⚠ Ce n'est PAS un réglage de plafond

Augmenter `CONSOLE_SEARCH_DEBOUNCE_MS` ou `asyncUtilTimeout` déplacerait les deux seuils sans
retirer la course, et le premier est une décision de PRODUIT — le délai que l'utilisateur subit
avant que sa recherche parte —, pas un bouton de test.

### Le quatrième rouge : voisin, et NON reproduit

`admin/super/__tests__/ModerationFilters.test.tsx` (« la 63ᵉ agence est sélectionnable ») partage
l'horloge — `AgencyCombobox` porte son propre `AGENCY_SEARCH_DEBOUNCE_MS = 300` — mais son
assertion est POSITIVE et son échec est un appel manquant. **Personne ne l'a reproduit**, ni moi ni
la revue adverse, qui a explicitement cherché. Il est cité pour ne pas être oublié, et il ne doit
pas être « corrigé » par analogie : *ranger un cas non reproduit sous l'explication du voisin, c'est
fabriquer une cause.*

## Contrat de données

Aucun. Ce ticket ne touche ni endpoint, ni modèle, ni composant de rendu.

## Contraintes strictes (métier)

- **`CONSOLE_SEARCH_DEBOUNCE_MS` ne change pas** : c'est le délai que l'utilisateur subit. Si la
  correction a besoin d'une autre valeur en test, elle passe par une injection.
- **L'horloge réelle reste**, sauf à démontrer par mesure que la bascule en faux temps ne
  réintroduit pas les 8 timeouts sur 11 que l'en-tête du fichier documente.
- **Ce que les tests PROUVENT doit survivre** : « dix caractères ne commitent qu'une fois », « la
  valeur externe remplace le brouillon », « le `blur` commite ». Un correctif qui retirerait
  l'assertion négative retirerait la garde — c'est elle qui distingue « anti-rebond » de « pas
  d'anti-rebond du tout ».
- **Les deux mécanismes se traitent séparément**, et le second (`asyncUtilTimeout`) touche deux
  tests sur trois : un correctif qui ne viserait que l'assertion négative laisserait la majorité
  des rouges observés entière.
- Le quatrième test n'est corrigé qu'après avoir été **reproduit**.

## Delta à produire

- [ ] Mécanisme 1 — retirer la course sur l'intervalle : faire porter l'assertion négative sur un
      **événement** (le compte d'appels observé au dernier `keydown`) plutôt que sur l'état du
      monde après un `await user.type` dont l'ordonnancement n'est pas borné ; ou rendre la fenêtre
      injectable, sans toucher la constante de production
- [ ] Mécanisme 2 — traiter les `waitFor` qui crèvent `asyncUtilTimeout` : borne locale explicite,
      ou attente d'un signal plutôt que d'une condition
- [ ] Reproduire, ou écarter par mesure, le rouge de `ModerationFilters.test.tsx`
- [ ] Chercher les autres occurrences des deux motifs dans la suite frontend

## Critères d'acceptation

- [x] **AC1** — les tests prouvent toujours ce qu'ils prouvaient : le vérifier par ABLATION, en
      retirant l'anti-rebond de `console/DebouncedSearchInput.tsx` et en constatant qu'ils
      rougissent. Un correctif de fiabilité qui rendrait le test insensible à la régression qu'il
      garde serait pire que le défaut.
- [x] **AC2** — plus aucune assertion du fichier ne dépend de l'ordonnancement d'un `await
      user.*` : elle porte sur un événement observable, ou sur une horloge que le test contrôle.
- [x] **AC3** — ⚠ **VÉRIFIÉ SOUS CHARGE ARTIFICIELLE, et c'est l'AC qui compte.** Le fichier passe
      **cinq exécutions consécutives** pendant qu'une charge CPU soutenue tourne (protocole des 64
      brûleurs déjà employé par TCK-312, décrit dans le docblock de `vitest.config.ts`). Sans cette
      épreuve, la correction est invérifiable : le défaut ne se manifeste PAS au repos, et un vert
      au repos est exactement ce qu'on avait avant.
- [x] **AC4** — la grandeur défendue est **nommée et mesurée** dans le fichier, avec sa date : pour
      le mécanisme 1, l'intervalle inter-frappe ; pour le mécanisme 2, le budget de `waitFor`. Ou
      bien le fichier explique pourquoi il n'y a plus de grandeur à défendre.
- [x] **AC5** — les deux mécanismes sont traités, et le rapport dit lequel couvre quel test. Un
      correctif qui ne traite qu'un des deux le dit explicitement.
- [x] **AC6** — le rouge de `ModerationFilters.test.tsx` est soit reproduit et corrigé, soit
      **écarté par mesure** et écrit comme tel. Il n'est pas rangé sous l'explication du voisin
      sans reproduction.
- [x] **AC7** — `npx vitest run` sur `src/components/console` et `src/components/admin/super` est
      vert, au repos ET sous charge.

## Hors périmètre

- **`CONSOLE_SEARCH_DEBOUNCE_MS` et `AGENCY_SEARCH_DEBOUNCE_MS`** : leur valeur est un arbitrage
  produit.
- **`testTimeout`** de `vitest.config.ts`, relevé à 20 s par TCK-312 avec sa mesure, et
  **`asyncUtilTimeout`** de `vitest.setup.ts` : les relever déplacerait le seuil sans retirer la
  course.
- **La parallélisation de la suite frontend** et le temps d'exécution en général — c'est la vague
  41 dans son ensemble ; ce ticket n'en traite que deux symptômes précis.
- **Les autres tests d'interaction du dépôt**, tant qu'aucune mesure ne les a montrés dans le même
  cas. Le delta demande de les CHERCHER, pas de les corriger en masse.

## AC3 et AC7 — la campagne sous charge, le 2026-08-29, et ce qu'elle ne prouve PAS

Machine à 8 cœurs, prise au repos (`load average` 2,04). Protocole des 64 brûleurs du docblock de
`vitest.config.ts`.

### AC7 — cinq exécutions consécutives sur les deux répertoires

`npx vitest run src/components/console src/components/admin/super`, 34 fichiers / 165 tests :

```
  exécution   charge 1-min   résultat        durée
      1          26,76       165/165 ✓       84,7 s
      2         108,82       165/165 ✓       85,6 s
      3         161,87       165/165 ✓       84,6 s
      4         168,69       165/165 ✓       85,2 s
      5         161,35       165/165 ✓       83,5 s
  ─────────────────────────────────────────────────
  au repos      5,55         165/165 ✓       17,6 s
```

**Facteur de contention mesuré : 4,7× à 4,9×** sur le temps de paroi de l'ensemble. Vert au repos
ET sous charge : AC7 tenu.

### ⚠ Le CONTRÔLE, et le résultat gênant qu'il faut écrire

Un vert sous charge ne dit rien si l'on ne sait pas ce que faisait l'ancien code dans la même
condition. Les trois fichiers ont donc été **rétablis dans leur état d'avant ce ticket**
(`git show 316e73d2^:…`, empreintes relevées avant et après) et rejoués sous **96 brûleurs**, avec
une rampe de 180 s pour amener la moyenne 1-min au niveau de l'incident du 2026-08-27 (240) :

```
  AVANT ce ticket   charge 158,69 → 183,25    22/22 ✓   cinq fois sur cinq
  APRÈS ce ticket   charge 194,57 → 236,92    23/23 ✓   trois fois sur trois
```

**Les tests d'AVANT ne rougissent pas non plus.** Huit exécutions au total, sur deux campagnes, à
des charges allant jusqu'à 236,92 — c'est-à-dire la charge de l'incident — n'ont pas reproduit le
défaut une seule fois.

**Ce qu'il faut en conclure, et surtout ce qu'il ne faut pas :**

1. **La charge CPU n'est PAS un reproducteur fiable de ce défaut.** C'est une course : elle se
   déclenche quand un décrochage d'ordonnancement dépasse 300 ms *au mauvais moment*, pas quand la
   machine est chargée. Charger la machine augmente la probabilité, elle ne la porte pas à 1.
2. **Donc ces huit verts ne prouvent pas que le correctif était inutile** — et cinq verts n'auraient
   pas prouvé qu'il était suffisant. *Une course n'est ni prouvée absente ni prouvée présente par
   des exécutions qui passent.*
3. **Ce qui défend le correctif est ailleurs, et c'est mesuré** : la marge de 9,8-10,0× de l'ancien
   `waitFor` face aux facteurs de contention 11,6-16,7× de TCK-312 (le test était sous la marge
   nécessaire), et la **reproduction déterministe** — 2900 ms injectés dans le `fetch` moqué rendent
   EXACTEMENT le message du 2026-08-27, en 3195 ms. *Le seul reproducteur fiable de cette panne est
   l'injection, jamais la charge.*
4. **Et ce qui rend le correctif vérifiable, lui, ne dépend d'aucune probabilité** : la fenêtre de
   60 000 ms est plus longue que `testTimeout` (20 000 ms). Ce n'est plus une marge, c'est une
   propriété — aucun ordonnancement ne peut la faire échoir pendant la frappe.

⚠ **À ne pas relire comme « 5 exécutions vertes sous charge, donc c'est réglé ».** La lettre
d'AC3 est tenue ; son esprit — *« sans cette épreuve la correction est invérifiable »* — est
tenu par l'injection déterministe, pas par la campagne. Écrit ici pour que la prochaine personne
qui verra un rouge d'ordonnancement sache où chercher : dans une injection reproductible, pas dans
un `yes > /dev/null`.

## Notes d'implémentation

_(à remplir par implementing-specs)_

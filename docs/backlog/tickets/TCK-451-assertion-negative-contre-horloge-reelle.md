---
id: TCK-451
title: "Trois tests d'anti-rebond courent une assertion négative contre une horloge réelle — la marge est de 1,29×"
status: todo
phase: P2
family: technique
estimate: S
wave: 41
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, tests, fiabilite, dette-silencieuse]
---

## Objectif utilisateur

Un rouge de la suite frontend dit qu'une régression existe, et jamais que la machine était
occupée.

## Contexte

Le 2026-08-27, un lot ciblé de **107 fichiers / 752 tests** rend **4 rouges** sous `load average
240` sur 8 cœurs. Rejoués seuls, immédiatement après : **22/22 verts**. Trois des quatre sont dans
`takussan-web/src/components/console/__tests__/DebouncedSearchInput.test.tsx`, le quatrième dans
`admin/super/__tests__/ModerationFilters.test.tsx`.

**La branche qui tournait est mécaniquement hors de cause**, et ce n'est pas une supposition : la
clôture d'imports des deux fichiers (38 fichiers) intersectée avec les 24 fichiers modifiés donne
l'**ensemble vide**. La clôture contient bien des primitives `ui/` — `badge`, `button`, `input`,
`select`, `table`, `textarea`, `skeleton`, `destructive-banner` — mais **aucune** de celles que la
branche touchait (`dialog`, `dropdown-menu`, `sheet`, `toast`, `warning-banner`). Et `globals.css`
n'est chargé par aucun test : jsdom ne traite pas le CSS.

**Le sujet de ce ticket est ce qui reste une fois la branche disculpée.**

### Le mécanisme, mesuré

`CONSOLE_SEARCH_DEBOUNCE_MS` vaut **300 ms**, et
`console/__tests__/DebouncedSearchInput.test.tsx` tourne sur **horloge RÉELLE**. Ce choix est
délibéré et documenté dans son propre en-tête, avec sa mesure : `vi.useFakeTimers()` plus
`userEvent` fait sortir **8 tests sur 11** en « Test timed out in 20000ms », parce que `user.type`
attend des `setTimeout` que le faux temps n'avance pas tout seul. *Ce n'est donc pas une négligence
à corriger, c'est une contrainte à contourner autrement.*

Trois tests posent une **assertion NÉGATIVE immédiatement après une frappe dont la durée n'est
bornée par rien** :

| l. | Forme |
|---|---|
| 201-202 | `await user.type(champ(), 'Ziguinchor')` puis `expect(onCommit).not.toHaveBeenCalled()` |
| 274-278 | `await user.type(champ(), 'Saly')` puis `expect(onCommit).not.toHaveBeenCalled()` |
| 357-358 | `await user.type(champ(), 'Mbour')` puis `expect(onCommit).not.toHaveBeenCalled()` |

Si la frappe dépasse 300 ms, la fenêtre échoit **pendant** la frappe : `onCommit` part, et
l'assertion négative devient fausse. **Trois tests — exactement le compte de rouges de ce
fichier.**

### La marge, mesurée deux fois

`user.type(champ, 'Ziguinchor')` — dix caractères, la frappe la plus longue du fichier — chronométré
cinq fois **à `load average 37`**, machine ni au repos ni saturée :

```
essai 1 : 232 ms — marge 1,29×      essai 4 :  98 ms — marge 3,07×
essai 2 : 161 ms — marge 1,86×      essai 5 : 110 ms — marge 2,74×
essai 3 :  59 ms — marge 5,12×
```

Un relevé indépendant, à `load average 56-67`, donne 76 ms, 90 ms puis **205 ms** — marge 1,47×.
Les deux relevés se rejoignent : **le pire cas est déjà autour de 1,3×, et il l'est SANS
saturation.**

Or `takussan-web/vitest.config.ts` porte, dans son propre docblock, la mesure du dépôt sur ce
point : sous contention CPU, les tests d'interaction ralentissent d'un facteur **11,6× à 16,7×**
(relevé sous 64 brûleurs, charge 1-min à 105).

> **Une marge de 1,3× devant un facteur 11-17× n'est pas une marge.** Ces trois tests ne
> distinguent plus « l'anti-rebond fonctionne » de « la machine était disponible ».

### ⚠ Ce n'est PAS un réglage de plafond

Augmenter `CONSOLE_SEARCH_DEBOUNCE_MS`, ou `testTimeout`, ne ferait que déplacer le seuil — et le
premier est une décision de PRODUIT (le délai que l'utilisateur subit avant que sa recherche
parte), pas un bouton de test. Le fond est ailleurs : **une assertion négative ne peut pas courir
contre une horloge réelle dont l'action adverse n'est pas bornée.** Tant que la borne n'existe
pas, le test est vrai avec une probabilité qui dépend de la charge.

### Le quatrième rouge : voisin, et NON prouvé

`admin/super/__tests__/ModerationFilters.test.tsx` (« la 63ᵉ agence est sélectionnable ») partage
l'horloge — `AgencyCombobox` porte son propre `AGENCY_SEARCH_DEBOUNCE_MS = 300` — mais **pas la
forme** : son assertion est POSITIVE (`mockReplace` doit avoir été appelé), et l'échec observé est
un appel manquant, pas un appel de trop. Le mécanisme exact n'a **pas** été reproduit. Il est cité
ici pour ne pas être oublié, et il ne doit pas être « corrigé » par analogie : *ranger un cas non
reproduit sous l'explication du voisin, c'est fabriquer une cause.*

## Contrat de données

Aucun. Ce ticket ne touche ni endpoint, ni modèle, ni composant de rendu.

## Contraintes strictes (métier)

- **`CONSOLE_SEARCH_DEBOUNCE_MS` ne change pas** : c'est le délai que l'utilisateur subit, arbitré
  ailleurs. Si la correction a besoin d'une autre valeur en test, elle passe par une injection,
  pas par une modification de la constante de production.
- **L'horloge réelle reste**, sauf à démontrer par mesure que la bascule en faux temps ne
  réintroduit pas les 8 timeouts sur 11 que l'en-tête du fichier documente.
- **Ce que les trois tests PROUVENT doit survivre** : « dix caractères saisis ne commitent qu'une
  fois », « la fenêtre n'a pas encore échu », « le `blur` commite ». Un correctif qui supprimerait
  l'assertion négative supprimerait la garde — c'est elle qui distingue « anti-rebond » de « pas
  d'anti-rebond du tout ».
- Le quatrième test n'est corrigé qu'après avoir été **reproduit**.

## Delta à produire

- [ ] Borner ce que l'assertion négative mesure : la faire porter sur un **événement**, pas sur du
      temps écoulé — par exemple le compte d'appels observé au dernier `keydown` plutôt qu'après un
      `await user.type` dont la durée est inconnue
- [ ] Ou rendre la fenêtre **injectable** pour les tests, sans toucher la constante de production
- [ ] Ou tout autre mécanisme qui ferme la course — le choix appartient à l'implémentation, la
      contrainte est qu'il soit **falsifiable** (cf. AC3)
- [ ] Reproduire, ou écarter par mesure, le rouge de `ModerationFilters.test.tsx`
- [ ] Chercher les autres occurrences du motif dans la suite : une assertion négative posée après
      un `await user.*` non borné, en face d'une temporisation réelle

## Critères d'acceptation

- [ ] **AC1** — les trois tests de `DebouncedSearchInput.test.tsx` prouvent toujours ce qu'ils
      prouvaient : le vérifier par ABLATION, en retirant l'anti-rebond de
      `console/DebouncedSearchInput.tsx` et en constatant qu'ils rougissent. Un correctif de
      fiabilité qui rendrait le test insensible à la régression qu'il garde serait pire que le
      défaut.
- [ ] **AC2** — plus aucune assertion du fichier ne dépend de la durée d'un `await user.*` :
      l'assertion porte sur un événement observable, ou sur une horloge que le test contrôle.
- [ ] **AC3** — ⚠ **VÉRIFIÉ SOUS CHARGE ARTIFICIELLE, et c'est l'AC qui compte.** Le fichier passe
      **cinq exécutions consécutives** pendant qu'une charge CPU soutenue tourne (le docblock de
      `vitest.config.ts` décrit le protocole des 64 brûleurs déjà employé par TCK-312). Sans cette
      épreuve, la correction est invérifiable : le défaut ne se manifeste PAS au repos, et un vert
      au repos est exactement ce qu'on avait avant.
- [ ] **AC4** — la marge résiduelle est **mesurée et écrite dans le fichier**, avec sa date, ou
      bien le fichier explique pourquoi il n'y a plus de marge à mesurer (le temps ne gouverne
      plus l'assertion).
- [ ] **AC5** — le rouge de `ModerationFilters.test.tsx` est soit reproduit et corrigé, soit
      **écarté par mesure** et écrit comme tel. Il n'est pas rangé sous l'explication du voisin
      sans reproduction.
- [ ] **AC6** — `npx vitest run` sur `src/components/console` et `src/components/admin/super` est
      vert, au repos ET sous charge.

## Hors périmètre

- **`CONSOLE_SEARCH_DEBOUNCE_MS` et `AGENCY_SEARCH_DEBOUNCE_MS` eux-mêmes** : leur valeur est un
  arbitrage produit.
- **`testTimeout`** de `vitest.config.ts`, relevé à 20 s par TCK-312 avec sa mesure. Le relever
  encore ne ferait que déplacer le seuil de ce défaut-ci.
- **La parallélisation de la suite frontend** et le temps d'exécution en général — c'est la vague
  41 dans son ensemble, ce ticket n'en traite qu'un symptôme précis.
- **Les autres tests d'interaction du dépôt**, tant qu'aucune mesure ne les a montrés dans le même
  cas. Le delta demande de les CHERCHER, pas de les corriger en masse.

## Notes d'implémentation

_(à remplir par implementing-specs)_

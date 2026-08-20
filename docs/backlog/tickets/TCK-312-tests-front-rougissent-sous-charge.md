---
id: TCK-312
title: "Quatre tests front rougissent sous charge — le pendant frontend de D-44"
status: done
phase: P2
family: front
estimate: S
wave: 38
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, tests, ci, flaky, dette]
---

## Objectif utilisateur

Qu'un test rouge veuille dire « le code est cassé » — et non « la machine était chargée ce jour-là ».

## Contrat de données

Aucune donnée applicative. Mesuré le 2026-08-12 (ardoise D-30bis), en lançant les suites back et
front **simultanément** : quatre tests de la console super-admin sortent en
`Test timed out in 5000ms`.

| Test | Fichier |
|---|---|
| `InviteSuperAdminModal` | `src/components/super-admin/__tests__/InviteSuperAdminModal.test.tsx` |
| `AgencyOnboardingDialog` | `src/components/admin/super/__tests__/AgencyOnboardingDialog.test.tsx` |
| `FeatureFlags` | `src/components/admin/super/__tests__/FeatureFlags.test.tsx` |
| `TemplateEditor` | `src/components/admin/super/__tests__/TemplateEditor.test.tsx` |

Au repos, les 802 tests passent.

## Contraintes strictes (métier)

- **Ne pas augmenter le délai en aveugle.** C'est la consigne que l'ardoise pose elle-même : *un
  test à 12 % de son plafond n'a pas le même problème qu'un test à 90 %*. La marge réelle de chacun
  des quatre se mesure **avant** de décider quoi que ce soit.
- **Le pendant backend a déjà été résolu, et pas par le délai** (D-44, mergé en `a9524604`) : la
  cause n'était pas la lenteur mais une barrière qui abandonnait en silence. Chercher ici aussi la
  cause avant le symptôme — un `waitFor` sans assertion, un mock qui ne résout jamais, une attente
  sur un effet qui ne se produit pas.
- Une garde qui rougit sous charge **accuse le code**. Le coût n'est pas le test rouge, c'est
  l'heure passée à chercher un bug qui n'existe pas.
- Ces quatre tests rougiront un jour sur un runner GitHub partagé, sur une PR qui n'y est pour rien.

## Delta à produire

- [x] Mesurer la marge réelle de chacun des quatre tests : temps d'exécution au repos rapporté au
      plafond de 5000 ms
- [x] Chercher la cause pour chacun — attente sans assertion, promesse non résolue, effet jamais
      déclenché — avant d'envisager le délai → **aucune n'existe ici**, mesuré et instrumenté
- [x] Corriger la cause quand il y en a une ; ajuster le plafond seulement pour ceux dont la marge
      mesurée le justifie, et écrire la mesure qui justifie chaque ajustement
- [x] Rejouer les deux suites **simultanément** cinq fois de suite pour vérifier — *avec la réserve
      sur la suite backend, cf. Notes d'implémentation*

## Critères d'acceptation

- [x] AC1 — la marge de chacun des quatre tests est mesurée et consignée
- [x] AC2 — cinq exécutions consécutives des deux suites en simultané rendent 0 échec
      *(campagne A : 5/5 à 882/882. Une campagne B, ~10× plus dure que l'AC, fait apparaître un
      cinquième test sur un autre bouton — TCK-313.)*
- [x] AC3 — tout plafond augmenté cite la mesure qui le justifie ; aucun ne l'est « pour voir »
- [x] AC4 — la suite front reste verte au repos, et le compte de tests n'a pas baissé
      *(882 tests avant et après ; aucun test ni fichier supprimé, le diff ne touche aucun test)*

## Hors périmètre

- La couverture et la parallélisation backend — TCK-302.
- L'instabilité Meilisearch backend, soldée (D-44).

## Notes d'implémentation

### La marge mesurée — et ce qu'elle dit (2026-08-16, machine à 8 cœurs)

Suite entière, **au repos**, 882 tests (et non 802 : la suite a grossi depuis la mesure d'ardoise) :

| Test | au repos | % du plafond 5000 ms |
|---|---|---|
| `AgencyOnboardingDialog` | 822 ms | 16 % |
| `TemplateEditor` | 512 ms | 10 % |
| `FeatureFlags` — *updates segments* | 489 ms | 10 % |
| `InviteSuperAdminModal` | 391 ms | 8 % |
| `FeatureFlags` — *session override* | 67 ms | 1 % |

Sur les 882 tests : **aucun** au-dessus de 1000 ms, **5** au-dessus de 500 ms. Les quatre tests du
ticket sont donc bien dans le cas « 12 % du plafond » que l'ardoise anticipait — **le plafond n'est
pas serré, ces tests sont simplement les plus longs de la suite.**

### Il n'y a pas de barrière silencieuse ici — ce n'est pas le même défaut que D-44

Cherché, et mesuré, avant de toucher au plafond. Découpage instrumenté d'`AgencyOnboardingDialog`
au repos (399 ms de total) :

```
render 15,8 · click ouvrir 93,2 · type(53 car.) 237,3 · clicks 50,4 · dblClick 15,1 · waitFor 1,9
```

Le `waitFor` final se résout en **1,9 ms**. Aucune attente sans assertion, aucune promesse qui
n'aboutit pas, aucun effet manquant, aucun timer non simulé — et aucun `setTimeout` / `debounce`
dans les quatre composants (vérifié par grep). Le coût est réparti : ~60 % dans `user.type`, à
**~4,5 ms par frappe** (une macrotâche + un flush `act()` complet de React par caractère), sur des
formulaires `useState` contrôlés parfaitement ordinaires. Le coût est donc en O(frappes) et
proportionnel à la contention CPU. **Les 51 fichiers qui utilisent `userEvent` sont sur la même
pente ; ces quatre-là sont juste les plus longs.**

Le mode d'échec le confirme : `Test timed out in 5000ms` est l'épuisement du budget *agrégé* du
test, pas l'expiration d'une attente. Une vraie régression, elle, sort en ~1 s par le délai propre
de `waitFor` (voir l'ablation plus bas).

**Levier écarté par la mesure** — `userEvent.setup({ delay: null })` supprime la macrotâche par
frappe, mais **casse le test** : le wizard ne dépasse plus l'étape « Agence ». Mesuré, pas supposé.

### Reproduction

Sous 64 brûleurs CPU sur 8 cœurs (charge 1-min montée à 105), avec le plafond par défaut :
**2 des 4 sortent en `Test timed out in 5000ms`**, et les 2 autres passent à 87 % et 95 % du
plafond — les quatre sont sur la falaise en même temps.

### Ce qui a été corrigé : un plafond qui n'avait jamais été choisi

**Les 5000 ms n'étaient pas une décision, c'était le défaut de vitest** — `vitest.config.ts` ne
déclarait aucun `testTimeout`. Ce défaut se trouvait à ~6× du test le plus lent de la suite, alors
que ces tests ralentissent d'un facteur 11,6× à 16,7× sous contention. *Un défaut de framework
n'est pas une mesure.*

Plafond porté à **20 s**, `takussan-web/vitest.config.ts`, avec la mesure en commentaire. Vraies
durées sous charge (plafond relevé, donc non tronquées) :

| test | au repos | sous charge | facteur |
|---|---|---|---|
| `AgencyOnboardingDialog` | 822 ms | 11 773 ms | 14,3× |
| `FeatureFlags` (segments) | 489 ms | 6 739 ms | 13,8× |
| `InviteSuperAdminModal` | 391 ms | 6 518 ms | 16,7× |
| `TemplateEditor` | 512 ms | 5 928 ms | 11,6× |

Poussé plus loin encore (campagne B ci-dessous, charge jusqu'à 253), le pire cas **toutes mesures
confondues** est **12 356 ms**. 20 s laisse donc **1,6× sur le pire cas observé** et **24× sur le
test le plus lent au repos** — dans une condition (~30× les cœurs) très au-delà de ce que
rencontre un runner CI.

**Ce plafond ne retarde pas le signalement d'une vraie régression**, et c'est vérifié par ablation
et non par raisonnement : un mock rendu muet (`new Promise(() => {})` au lieu de la valeur
attendue) fait échouer le test en **1310 ms**, avec son message d'assertion
(`expected "vi.fn()" to be called 1 times, but got 0 times`) — via le délai propre de `waitFor`
(1000 ms, non touché ici), pas via `testTimeout`. Le plafond relevé ne se déclenche que quand les
interactions elles-mêmes sont lentes, c'est-à-dire exactement sur le faux positif visé.

**Ablation du correctif** : sous charge, sans le relèvement, deux des quatre rougissent dès la
charge 105, et les quatre dépassent l'ancien plafond à chacun des 5 tours de la campagne B
(110 % à 247 %). Le correctif est donc nécessaire, pas décoratif.

### Vérification — deux campagnes, pas une

**Campagne A — la condition du ticket** (« les deux suites en simultané »). Une vraie suite backend
tournait (10 à 18 processus `php`, charge 1-min 21 à 27) ; la suite front a été rejouée **5 fois de
suite** :

| tour | résultat | durée | pic des 4 cibles |
|---|---|---|---|
| 1 | **882/882**, 0 échec | 51 s | 1397 ms (28 %) |
| 2 | **882/882**, 0 échec | 53 s | 1304 ms (26 %) |
| 3 | **882/882**, 0 échec | 64 s | 1414 ms (28 %) |
| 4 | **882/882**, 0 échec | 60 s | 1741 ms (35 %) |
| 5 | **882/882**, 0 échec | 49 s | 1657 ms (33 %) |

Les quatre tests tournent à **13–35 % du plafond** dans cette condition. **AC2 est vert.**

**Campagne B — délibérément 10× plus dure que l'AC**, pour savoir où est vraiment la falaise :
suite entière rejouée 5 fois sous 64 brûleurs CPU **et** pendant qu'une suite backend tournait
(charge 1-min **81 → 253**, soit jusqu'à ~30× les 8 cœurs).

- **Les quatre tests visés passent 5 tours sur 5**, à **110 % à 247 % de l'ancien plafond de
  5000 ms** — autrement dit, sans le correctif ils auraient rougi à chaque tour. C'est la preuve
  de nécessité.
- Pire durée observée, toutes campagnes confondues : **12 356 ms** — 62 % du nouveau plafond.
- **Un cinquième test rougit, et ce n'est pas le même défaut** : `Integrations.test.tsx`, sur
  `findByPlaceholderText('••••1234')`, **4 tours sur 5**. Ce n'est pas `testTimeout` mais le délai
  propre de `waitFor`/`findBy` de Testing Library (1000 ms, un autre défaut de framework jamais
  mesuré). Laissé **hors périmètre à dessein** : le relever est un arbitrage différent, qui se paie
  sur les 882 tests à chaque exécution rouge. Ticketé à part —
  [TCK-313](TCK-313-delai-waitfor-rtl-tendu-sous-charge.md), ardoise **D-30ter**.

### Réserves

- **La suite backend n'a pas pu être lancée** pour la vérification simultanée : une autre suite
  backend tournait déjà et partage l'instance Meilisearch. Elle a été remplacée par des brûleurs
  CPU **calibrés plus dur** que `php artisan test` (64 processus contre ~8), sous la charge exacte
  qui reproduisait l'échec.
- Un `ENOSPC` observé pendant les essais venait du **disque de la machine, plein à 254 Mio près**,
  pas du code. À noter au passage : le rapporteur JSON de vitest a compté `numFailedTests: 0`
  alors qu'un *fichier* de test avait échoué — un compteur de tests ne suffit pas à conclure au
  vert, il faut aussi lire le statut des fichiers.

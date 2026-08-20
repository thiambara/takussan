# ADR-0015 — Le React Compiler est activé, et la mémoïsation manuelle devient l'exception

- **Statut** : Accepté
- **Date** : 2026-08-17
- **Tickets** : TCK-318 (décision), TCK-316 (les 13 corrections qui l'ont rendue possible)

## Contexte

Le dépôt était dans un état contradictoire, mesuré le 2026-08-16 en traitant TCK-316 :
`eslint-plugin-react-hooks@7`, tiré par `eslint-config-next`, activait **cinq familles de règles du
React Compiler**, toutes bloquantes — alors que **le compilateur n'était pas activé**. L'une d'elles,
`preserve-manual-memoization`, rend compte littéralement d'une compilation qui n'avait pas lieu :
*« React Compiler has skipped optimizing this component »*. Elle produisait **10 des 23 erreurs** de
TCK-316.

Son correctif canonique est de **supprimer** le `useCallback` / `useMemo` signalé, en laissant le
compilateur mémoïser à la place. Sans compilateur, l'appliquer aurait retiré une mémoïsation sans
rien mettre derrière. La règle a donc été coupée dans `eslint.config.mjs`, avec sa raison — et cet
ADR est la contrepartie de cette coupure : *une garde qui décrit un build qu'on ne produit pas et
une garde qui ne tourne pas sont deux formes du même défaut.*

Trancher demandait une mesure sur **ce** dépôt, pas une conviction générale sur le compilateur.

## La mesure

Toutes les valeurs ci-dessous ont été relevées le 2026-08-17, sur une machine à **8 cœurs**
(`sysctl -n hw.ncpu`), `charge 1-min` notée à chaque exécution. Les deux builds comparés sont
lancés **dos à dos, à la même charge** — un `next build` chronométré sous charge ne mesure que la
machine.

### 1. Compatibilité : 870 composants sur 870, sans un seul abandon

```
$ npx react-compiler-healthcheck --src "./src/**/*.{ts,tsx}"
Successfully compiled 870 out of 870 components.
StrictMode usage not found.
Found no usage of incompatible libraries.
```

⚠ **Ce 870/870 ne veut PAS dire « tout est optimisé », et c'est le piège de ce chiffre.** Le
`healthcheck` et la règle ESLint n'appliquent pas le même verdict, sur **deux** points :

- `preserve-manual-memoization` signalait **10 abandons dans 2 composants**
  (`CreatePayoutDialog`, `PropertyForm`) que le healthcheck comptait comme compilés. Les deux ont
  été corrigés par TCK-318.
- `react-hooks/incompatible-library` en signale **2 autres** — `BookingTunnel.tsx:76` et
  `DepositRefundModal.tsx:74` — pendant que le healthcheck imprime, littéralement, *« Found no
  usage of incompatible libraries »*. Le compilateur saute ces deux composants **délibérément et
  sans danger** (mémoïser l'API en cause produirait une UI périmée) ; ils restent donc dans l'état
  exact d'aujourd'hui, non compilés. Ce sont des avertissements, pas des erreurs, et ils ne
  bloquent rien.

*Un compte vert rendu par un outil ne certifie que ce que cet outil regarde* — deux outils du même
éditeur, sur la même base de code, ne comptent pas la même chose.

### 2. Poids : +3,6 à +6,1 % de JavaScript par page — et non +27 %

Le premier chiffre pris était faux, et il l'était d'un facteur **cinq**. Sommer tout
`.next/static/chunks` donne **1289,4 → 1633,4 Kio gz, soit +26,7 %** — mais cette somme contient le
code de **toutes** les routes, alors qu'un visiteur n'en télécharge qu'une. Mesuré pour de bon, en
servant le build de production et en pesant les `<script src>` réellement référencés par le HTML :

| page | sans compilateur | avec compilateur | écart |
|---|---|---|---|
| `/` | 434,5 Kio gz · 30 scripts | 459,1 Kio gz · 33 | **+24,6 Kio · +5,7 %** |
| `/properties` | 463,5 Kio gz · 32 scripts | 491,9 Kio gz · 35 | **+28,4 Kio · +6,1 %** |
| `/auth/login` | 427,8 Kio gz · 28 scripts | 443,0 Kio gz · 30 | **+15,2 Kio · +3,6 %** |

C'est ce que coûte le cache de mémoïsation injecté par composant. Le point compte pour ce
produit : la cible est le Sénégal, souvent en 3G — mais +25 Kio gz sur 435 est d'un autre ordre que
+344 Kio, et la décision aurait été l'inverse sur le mauvais chiffre.

### 3. Rendu : un re-rendu de grille passe de ~35 ms à ~1,5 ms

Banc d'essai : 200 `PropertyCardStandard` dans un parent dont un état **sans rapport** change
60 fois — le cas canonique d'un écran de liste (ouvrir un filtre, survoler, saisir une recherche).
Trois paires d'exécutions alternées, à la même charge :

| | montage | par re-rendu |
|---|---|---|
| sans compilateur | 174,8 / 208,2 / 224,7 ms | 32,87 / 39,44 / 41,40 ms |
| avec compilateur | 246,7 / 216,3 / 272,9 ms | **1,17 / 1,80 / 1,61 ms** |

Soit **≈ 25×** sur le re-rendu, contre **+21 % sur le montage** — ce dernier écart étant bruité
(les intervalles se recouvrent), là où l'écart de re-rendu est de deux ordres de grandeur et ne
laisse aucun doute.

> ⚠ **Ce banc est un MEILLEUR CAS, et il faut le lire comme tel** : 200 cartes dont les props ne
> changent pas d'un rendu à l'autre. Un écran réel invalide une partie de son arbre à chaque
> interaction et ne verra pas 25×. Ce qu'il établit n'est pas un facteur de gain applicatif, c'est
> que **le mécanisme fonctionne sur les composants de ce dépôt**.

> ⚠ Le banc a d'abord rendu **zéro gain**, trois exécutions durant. Cause :
> `@vitejs/plugin-react@6` transforme avec **oxc** et **n'expose plus d'option `babel`** — le plugin
> passé y était silencieusement ignoré. Il a fallu ajouter au banc une assertion « la transformation
> a-t-elle eu lieu ? » (`_c(` présent dans le source du composant) pour le voir. *Une mesure de
> performance sans témoin d'application mesure le placebo.*

### 4. Build : ×2, et non ×4

| | compilation |
|---|---|
| sans compilateur | **10,7 s** |
| avec compilateur | **21,5 s** |

Un premier relevé donnait 28,6 s contre 112 s, soit ×4 — il avait été pris à `charge 1-min` 13 et
92 respectivement. Ce n'était pas le compilateur qu'il mesurait.

## Décision

**Le React Compiler est activé** (`reactCompiler: true` dans `next.config.ts`,
`babel-plugin-react-compiler` en `devDependency` — sans lui `next build` échoue).

**En conséquence, `useMemo` et `useCallback` cessent d'être le réflexe par défaut.** Du code neuf
n'en pose pas « au cas où » : le compilateur mémoïse, et une mémoïsation manuelle qu'il ne peut pas
préserver le fait **abandonner la compilation du composant entier** — on paie alors le pire des deux
mondes. Ils restent légitimes là où la mémoïsation porte une **sémantique** et non une
optimisation : une identité de référence qu'un tiers exige, un calcul à effet de bord observable.

**`react-hooks/preserve-manual-memoization` redevient bloquante**, la coupure de `eslint.config.mjs`
est retirée, et ses 10 signalements sont traités par leur vrai correctif — la suppression du
`useMemo` / `useCallback`, jamais l'ajustement de ses dépendances.

## Conséquences

**Ce que ça coûte** : +15 à +28 Kio gzippés par page, ×2 sur le temps de `next build` (donc sur
chaque exécution de `web-ci.yml`), et une dépendance de build de plus.

**Ce que ça interdit** : d'ajouter une mémoïsation manuelle sans regarder ce que la règle en dit. Un
`useMemo` que le compilateur ne peut pas préserver ne coûte pas « rien » : il désoptimise tout le
composant.

**Ce que ça rend possible** : que les cinq familles de règles du React Compiler décrivent enfin le
build qu'on produit. C'était la contradiction que cet ADR ferme.

**⚠ La limite honnête, et elle est structurelle : la suite de tests n'exerce PAS le code compilé.**
`vitest` transforme via `@vitejs/plugin-react@6`, qui utilise oxc et n'a plus de point d'entrée
Babel ; le compilateur n'est appliqué que par `next build`. Les 888 tests valident donc la
sémantique des composants, jamais leur version compilée. Ce qui garde ce flanc aujourd'hui, c'est
le compilateur lui-même (il refuse de compiler ce qu'il ne peut pas prouver sûr) plus `npm run
build` en CI — pas la suite. **Ne pas lire un vert de `npm run test` comme une validation du
build.**

**Les 4 `react-hooks/exhaustive-deps` restants ont été instruits, et aucun ne bloque le
compilateur** — celui-ci ne réécrit pas les tableaux de dépendances de `useEffect` :

| site | nature | verdict |
|---|---|---|
| `auth/oauth/[provider]/callback/page.tsx:46` | `setUser` / `refreshUser` absents des deps | **délibéré** : les ajouter relancerait l'échange de jeton OAuth à chaque rendu du contexte d'auth — un défaut pire que celui signalé |
| `property-dashboard/PropertyDetailTabs.tsx:49` | `setTab` absent d'un `useCallback([])` | **inoffensif** : un setter de `useState` a une identité stable garantie par React |
| `customer-dashboard/CustomerListFilters.tsx:42` | `activeTags` re-créé à chaque rendu | **inefficacité latente**, rendue sans objet par le compilateur ; son vrai correctif est de retirer les `useCallback`, pas d'ajouter un `useMemo` |
| `profile/ProfileSwitcher.tsx:37` | `profiles` (`?? []`) re-créé pendant le chargement | idem |

Les deux derniers sont un nettoyage à part : ils ne sont pas dans le delta de TCK-318, qui porte
sur les 10 signalements de `preserve-manual-memoization`.

## Application

- `takussan-web/next.config.ts` — `reactCompiler: true`, avec les chiffres en commentaire.
- `takussan-web/package.json` — `babel-plugin-react-compiler` en `devDependency`. **C'est ce paquet
  qui rend la décision exécutable** : `next build` échoue sans lui, ce qui est la garde la plus
  simple qui soit contre une désactivation silencieuse.
- `takussan-web/eslint.config.mjs` — le bloc `takussan/react-compiler-rules` est **supprimé** : les
  cinq familles de règles sont de nouveau actives, `preserve-manual-memoization` comprise.
- `src/components/payments/CreatePayoutDialog.tsx` et
  `src/components/property-form/PropertyForm.tsx` — les 10 signalements corrigés, chacun avec le
  commentaire qui dit pourquoi il n'y a **pas** de `useMemo` là où on s'attendrait à en trouver un.
- **Ce qui empêche la régression** : `npm run lint` (0 erreur, la règle est bloquante) et
  `npm run build`, tous deux joués par `web-ci.yml`.

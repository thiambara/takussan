---
id: TCK-571
title: "Quatre formulaires lisent encore watch() pendant le rendu — le motif que le React Compiler fige en production (cause de TCK-564)"
status: done
phase: P2
family: bug
estimate: S
wave: 69
created: 2026-09-23
updated: 2026-09-24
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, react-compiler, formulaires, react-hook-form]
---

## Objectif utilisateur

Dans un formulaire de l'espace connecté, ce que l'utilisateur change se reflète tout de suite à
l'écran : total d'une facture, commission d'un versement, champs qui dépendent du type de bail,
devise de l'agence.

## Contexte

TCK-564 (retour testeur du 2026-09-23, point W9) a établi la cause d'un défaut que le testeur a vu
dans l'assistant « Publier un bien » : une pastille cliquée ne s'allumait pas. `watch('type')` était
lu pendant le rendu ; `next.config.ts` active `reactCompiler: true`, et le compilateur met la valeur
en cache sur l'identité — stable — de `watch`. Le défaut n'existe **qu'en code compilé** : vitest ne
compile pas, la suite est verte. Le correctif est `useWatch({ control, name })`, déjà employé par
`BookingTunnel.tsx` et par les étapes de l'assistant.

Relevé au `grep` le 2026-09-23, hors assistant :

| Fichier | Lectures pendant le rendu | Ce qui figerait |
|---|---|---|
| `components/payments/CreatePayoutDialog.tsx:113-117` | `gross_amount`, `commission_rate`, `commission_amount`, `fees_amount`, `currency` | le calcul affiché de la commission et du net |
| `components/payments/CreateInvoiceDialog.tsx:97-99` | `items`, `tax_rate`, `currency` | les totaux de la facture |
| `components/leases/CreateLeaseForm.tsx:105-108` | `type`, `property_id`, `tenant_id` | les champs qui dépendent du type et du bien choisis |
| `components/admin-agency/AgencyConfigForm.tsx:119` | `currency` | la devise affichée |

### Mesures du 2026-09-24 — avant correctif

Deux moyens, faute de pouvoir lancer `next build` (la pile de dev partage le même `.next`) :

1. **vitest compilé** : une configuration hors dépôt (dérivée de celle de TCK-577) fait passer les
   quatre fichiers par `babel-plugin-react-compiler` avec les options par défaut de
   `reactCompiler: true`, et **refuse de tourner** si un fichier sort non compilé. Chaque formulaire
   a reçu un test de comportement (`__tests__/<Formulaire>.test.tsx`). ⚠ Ses mocks ont une
   **identité stable**, comme les vrais hooks : un routeur neuf à chaque appel casse le cache du
   compilateur et rend un faux vert (mesuré par TCK-564).
2. **La pile de dev** (`localhost:3000`), qui sert du code **compilé** : relevé dans le chunk servi,
   `if ($[15] !== form) { t7 = form.watch("type"); … }`. Piloté par CDP, compte `admin@dakarimmo.sn`,
   1366 px et 360 px.

| Formulaire | Compilé ? | vitest compilé | Pile de dev | Verdict |
|---|---|---|---|---|
| `CreateLeaseForm` | oui — `if ($[14] !== form) t7 = form.watch("type")` | **rouge 2/2** | « Vente » choisi → le champ reste « Loyer mensuel* » | **ATTEINT** |
| `AgencyConfigForm` | oui — la lecture est dans un bloc gardé par 19 dépendances, dont aucune ne bouge avec la devise | **rouge 2/2** | EUR choisi → l'aperçu reste « 100 000 F CFA », aucun avertissement | **ATTEINT** |
| `CreateInvoiceDialog` | oui, mais les lectures sortent **sans cache** | vert 3/3 | 10 000 saisi → total 10 000 F CFA, bouton actif | **épargné par chance** |
| `CreatePayoutDialog` | **non** — le compilateur abandonne le composant (`eslint-disable react-hooks/exhaustive-deps`) | n/a (non compilé) | 50 000 saisi → brut et net suivent | **épargné par chance** |

**Pourquoi la facture était épargnée — et pourquoi ce n'était pas une garantie.** `onSuccess` y
capture `form` (`form.reset(DEFAULT_VALUES)`), et le compilateur renonce alors à mettre en cache ce
qui dépend de `form`. Mesuré : sans ce `form.reset`, le test de la ligne ajoutée rougit sous
compilation. L'hypothèse inverse, que l'appel `useFieldArray` coupait la portée, est **réfutée** :
déplacé au-dessus des lectures, le test reste vert. Le versement, lui, était écrit « épargné
tant que son `eslint-disable` fait abandonner le compilateur » — **FAUX, corrigé le 2026-09-24** :
il l'est par DEUX effets de bord. Sans l'`eslint-disable`, il compile, et `watch()` reste vert grâce au
`form.reset` d'`onSuccess`, comme la facture ; il ne fige que si les deux disparaissent (voir
« Reprise des défauts mineurs »).

## Correctif

Les douze lectures passent à `useWatch({ control, name })` dans les quatre fichiers, y compris les
deux épargnés, qui ne doivent pas dépendre d'un effet de bord du compilateur. Le reste du comportement
est inchangé : le diff ne touche que les lectures, leurs imports et un commentaire par fichier.

Après correctif, sous vitest compilé : **7/7 verts** (bail, agence, facture). Sur la pile de dev :
« Vente » → « Prix de vente* » ; EUR → « 100 000,00 € » et l'avertissement s'affiche, à 1366 et à
360 px ; facture et versement inchangés.

**La garde** : `src/test/__tests__/watch-pendant-le-rendu.test.ts`, analyse de l'arbre syntaxique de
tout `src/` (`sourcesDe`, 500 fichiers et plus, `__tests__` exclus). Elle est **plus stricte**
que « pas dans le corps d'un composant » : toute *lecture* `watch(…)` est refusée **partout**,
puisqu'au clic ou dans un effet l'idiome est `getValues`. Juger de ce qui s'exécute pendant le rendu
est justement ce qui a laissé passer la mutation MV1 de TCK-564. Un *abonnement* `watch((v) => …)`
n'est admis que dans un effet (l'autosave de `PropertyWizard`, que la garde vérifie exercé).

**`getValues(…)` au rendu est gardé aussi, depuis la vérification.** Le vérificateur a posé la
mutation `(form.getValues('currency') || 'XOF')` dans `AgencyConfigForm` : le test de comportement
rougissait sous compilation (2/2), la première version de la garde restait **verte** (4/4) —
reproduit tel quel. `getValues` a des usages légitimes (clic, effet, `handleSubmit`), il ne peut
donc pas être refusé partout : la garde le refuse là où il s'exécute pendant le rendu, par une
heuristique syntaxique — corps d'un composant ou d'un hook ; rappel de `useState`, `useMemo`,
`useReducer`, `useSyncExternalStore` ou d'une méthode de tableau synchrone (`.map`, `.find`…),
récursivement ; fonction nommée du composant que ce corps appelle ou passe à l'un d'eux (un
niveau) ; IIFE ; prop de rendu (`render={…}`, enfant-fonction), quel que soit le champ lu —
ajouts de la reprise du 2026-09-24. Les 16 appels `getValues(…)` de `src/` (hors `__tests__`) passent tous (clic, effet, `useCallback`,
soumission). Angles morts écrits dans son en-tête : alias, `.call`/`.apply`, composant anonyme,
indirection de plus d'un niveau, fonction définie hors du composant, prop de rendu sous un autre
nom que `render`, rappel `watch` passé par nom.

## Critères d'acceptation

- [x] Chacun des quatre formulaires est mesuré sur `npm run build && npm run start` : la valeur
      affichée suit-elle la saisie ? Le verdict, par fichier, est écrit ici.
      → **Mesuré par la session le 2026-09-24 sur un build de production** (`npm run build`, puis
      `next start` sur :3000 contre l'API locale ; compte `admin@dakarimmo.sn`, jeton de mesure
      supprimé ensuite ; CDP, scripts `cdp-devise`, `cdp-bail`, `cdp-finances`) — **les quatre
      suivent la saisie** :
      - `AgencyConfigForm` : XOF → EUR, l'aperçu passe de « 100 000 F CFA » à « 100 000,00 € » et
        l'avertissement de changement de devise apparaît ;
      - `CreateLeaseForm` : type « Location résidentielle » → « Vente », le champ « Loyer
        mensuel » devient « Prix de vente » ; le bien choisi apparaît au récapitulatif ;
      - `CreateInvoiceDialog` : total 0 → 10 000 F CFA, bouton activé ;
      - `CreatePayoutDialog` : brut 50 000, taux 8 → commission 4 000 et net 46 000 F CFA, bouton
        activé (la commission ne se calculait jamais avant le correctif de `FormInput`).
- [x] Toute lecture pendant le rendu passe par `useWatch` ; aucune lecture `form.watch(…)` ne
      reste dans le corps d'un composant, ni aucun `getValues(…)` au rendu au sens de la garde.
      Vérifié par la garde : 0 refus sur `src/`.
- [x] Une garde empêche le motif de revenir, et elle rougit sur une réintroduction. Preuves par
      ablation, avec restauration par `cp` et contrôle `md5` :
      - les quatre fichiers d'avant remis en place → **rouge**, 12 lectures relevées dans les quatre
        fichiers ;
      - une réintroduction inventée, `const { watch } = form; watch('currency')` dans
        `AgencyConfigForm` → **rouge** (ligne 125), et le test de comportement sous compilation aussi
        (2/2) ;
      - dans le fichier même, une source inventée de huit formes (identifiant nu, `['watch']`, rappel
        de `.map`, `useMemo`, gestionnaire de clic, abonnement hors effet) donne 8 refus et
        2 abonnements admis.
      - la mutation du vérificateur, `form.getValues('currency')` lu au rendu d'`AgencyConfigForm`
        → **rouge** (ligne 123, « lu au rendu de AgencyConfigForm »), et le test de comportement
        sous compilation aussi (2/2) ; avant l'extension de la garde, elle passait verte ;
      - une réintroduction inventée, `properties.find((p) => p.id === form.getValues('property_id'))`
        dans `CreateLeaseForm` → **rouge** (ligne 114, « (.find) »). Le test de comportement
        compilé reste vert sur celle-là (2/2) : la garde est plus stricte que ce que le
        compilateur fige dans ce cas précis, délibérément ;
      - dans le fichier même, une source inventée de seize `getValues` donne exactement les
        9 refus attendus (corps, destructuration, `useState`, `.map` dans `useMemo`, fonction
        nommée appelée ou passée à `useMemo`, `.filter` dans le JSX, `memo(function …)`, hook) et
        admet les 7 autres (fonction de clic, `useCallback`, effet, `handleSubmit`, `render`
        de `<Controller>`, `onClick` en ligne, utilitaire hors composant). ⚠ **Admettre le
        `render` de `<Controller>` était FAUX** (reprise du 2026-09-24) : il est refusé depuis, et
        la même source donne 10 refus pour 6 admis ;
      - reprise du 2026-09-24 — `getValues` dans le `render` d'un `<Controller>` et dans une IIFE,
        les deux mutations du vérificateur dans `CreateLeaseForm` → **rouge** (lignes 225 et 108) ;
        avant, **vertes**, pendant que le test compilé du bail rougissait. Détail et ablations
        dans « Reprise des défauts mineurs ».
- [x] Chaque formulaire a un test qui change un champ et vérifie la valeur dérivée affichée : un
      total, le net, un champ conditionnel ou la devise. 10 tests, verts sans compilation. Sous
      compilation, 4 sont rouges avec `watch()` et 7/7 sont verts avec `useWatch`.

## Reprise des défauts mineurs (2026-09-24)

Trois défauts laissés par les vérifications adverses de la vague 69, chacun **reproduit avant
d'être corrigé**. Test compilé : configuration hors dépôt qui passe les quatre formulaires par
`babel-plugin-react-compiler` (options par défaut), comme plus haut.

**1. `getValues` dans le `render` d'un `<Controller>` — la garde l'admettait, à tort.** Son en-tête
disait « un `render` de `<Controller>` (appelé par le Controller, pas mis en cache) : admis », et un
test sonde l'affirmait. Mutation dans `CreateLeaseForm` : le bloc `isSale ? … : …` remplacé par
`<Controller name="notes" render={() => form.getValues("type") === "sale" ? <prix/> : <loyer/>} />`
→ garde **5/5 verte**, test compilé du bail **rouge** (« Vente » remplace le loyer mensuel…). Cause :
le compilateur met l'ÉLÉMENT `<Controller>` en cache sur `form`, et le Controller ne se re-rend que
sur son propre champ ; le `type` lu reste celui du premier rendu. Correctif : tout `getValues` dans
une **prop de rendu** est refusé — `render={…}` de tout élément, ou enfant-fonction `<X>{(v) => …}</X>`,
écrite en ligne ou nommée (`render={rendreChamp}`), quel que soit le champ lu (le Controller fournit
déjà `field.value` pour le sien) et où que soit écrit l'élément. Un gestionnaire écrit dans la prop
de rendu (`onClick`) reste admis. En-tête et test sonde corrigés.

**2. `getValues` dans une IIFE.** `const type = (() => form.getValues('type'))();` → garde **verte**
(le parent de la fonction est une `ParenthesizedExpression`, pas l'appel), test compilé du bail
**rouge**. Correctif : une IIFE, parenthèses sautées, est jugée comme le corps où elle est écrite.

Après correctif, les deux mutations → garde **rouge** : `ligne 225 — form.getValues("type") lu dans
la prop render de <Controller>` et `ligne 108 — form.getValues('type') lu au rendu de CreateLeaseForm
(IIFE)`. `CreateLeaseForm.tsx` restauré par `cp`, md5 `298de47f…` identique. Sur `src/`, toujours
**0 refus** (6/6 verts). Nouveau test : « attrape `getValues(…)` dans une prop de rendu et dans une
IIFE… » (7 refus, 5 admis). Ablations dans le fichier de la garde, restauré par `cp`, md5 `9bb8b183…`
identique :

| Ablation | Résultat |
|---|---|
| branche IIFE neutralisée | 1 rouge (le nouveau test) |
| `propDeRendu` rend toujours `undefined` | 2 rouges (sonde existante + nouveau test) |
| `render={rendreChamp}` nommé non suivi | 1 rouge |
| enfant-fonction non reconnu | 1 rouge |
| tout attribut JSX au lieu du seul `render` | 3 rouges, dont `src/` (faux positifs sur les `onClick`) |

Nouveaux angles morts, écrits dans l'en-tête : une prop de rendu sous un autre nom que `render`
(`renderItem`, `children={…}` en attribut), une fonction de rendu définie hors du composant et
passée par nom, une IIFE par `.call(…)`.

**3. « Le versement n'est épargné que tant que son `eslint-disable` stoppe la compilation » — FAUX.**
Rejoué sur `CreatePayoutDialog.test.tsx` (4 tests), `useWatch` remis en `form.watch(…)` :

| `eslint-disable` | `form.reset` d'`onSuccess` | Compilé ? | Tests |
|---|---|---|---|
| présent | présent | non | 4/4 verts |
| retiré | présent | **oui** — `const gross = form.watch("gross_amount")`, sans cache | 4/4 verts |
| présent | retiré | non | 4/4 verts |
| retiré | retiré | oui — `if ($[11] !== form) { t6 = form.watch("gross_amount") … }` | **4/4 rouges** |

Avec `useWatch` (l'état livré), sans l'`eslint-disable` : compilé, 4/4 verts. Les trois textes qui
portaient l'affirmation — ce ticket, l'en-tête de `CreatePayoutDialog.test.tsx` et le commentaire
du composant — disent désormais la mesure. `CreatePayoutDialog.tsx` restauré, md5 `cddbb775…`.

## Hors périmètre

- L'assistant « Publier un bien » : traité par TCK-564.
- ~~Défaut relevé, non corrigé : dans le versement, la commission automatique ne se calcule jamais,
  et la soumission est impossible.~~ **Corrigé par la session le 2026-09-24**, à la cause, dans
  `components/forms/FormInput.tsx` : `Controller` transmettait `event.target.value`, une chaîne, et
  quinze schémas déclarent `z.number()` (versement, facture, bail, réservation, paiements de bail et
  de réservation). Un nombre tapé part désormais en nombre (`valueAsNumber`) ; un champ vide garde
  la chaîne vide, ce que les schémas lisaient déjà (`z.coerce.number`, message d'un `z.number({ error })`
  requis) — `undefined` aurait fait ré-afficher la valeur par défaut du formulaire. Tests :
  `forms/__tests__/FormInput.nombre.test.tsx` (3) et, dans `CreatePayoutDialog.test.tsx`, « le taux
  de l'agence calcule la commission, et le reversement part avec des nombres » (taux 10 %, brut
  50 000 → commission 5 000, net 45 000, `mutateAsync` appelé avec `landlord_id: 7`,
  `gross_amount: 50000`). Correctif retiré → **2 rouges** ; md5 restaurée. Les 355 tests des
  formulaires à champs numériques (`payments`, `bookings`, `leases`, `property-form`, `maintenance`,
  `documents`, `forms`) restent verts.
- Faire compiler vitest par le React Compiler, ce qui rendrait ces tests gardiens par eux-mêmes :
  cela touche `vitest.config.ts` et toute la suite.

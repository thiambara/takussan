---
id: TCK-564
title: "Publier un bien : les pastilles choisies ne s'allumaient pas (lecture watch() figée par le React Compiler), et le prix se saisissait sans séparateur de milliers"
status: doing
phase: P2
family: front
estimate: S
wave: 69
created: 2026-09-23
updated: 2026-09-23
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  models: []
tags: [front, property-form, wizard, react-compiler, react-hook-form, a11y, i18n, retour-testeur]
---

## Objectif utilisateur

Un propriétaire qui publie un bien voit immédiatement ce qu'il a choisi (type, contrat, statut
foncier, état, équipements), et relit sans effort le prix qu'il tape : « 49 000 000 », pas
« 49000000 ».

## Contexte

Retour testeur du 2026-09-23 (preview.takussan.com, compte propriétaire « Fa Diop »), deux points
pour ce ticket.

### W9 — « La sélection ne marche pas » — **confirmé**, et plus grave que signalé

> « J'ai cliqué Terrain et Vendre mais aucun changement de couleur ou de bordure pour que je puisse
> savoir. » Puis, étape 3 : « Même problème ici, j'ai sélectionné Bail. »

Le style de la pastille retenue existe (`bg-primary`, `ChoiceChips.tsx`) et les tests le vérifiaient,
verts. Le défaut n'est pas dans le style : **la pastille ne recevait jamais la valeur choisie**.

**Mécanisme, établi sur la sortie réelle du compilateur** (`babel-plugin-react-compiler` 1.0.0, la
version du dépôt, appliqué hors dépôt à `StepBien.tsx`) :

```js
if ($[2] !== watch) { t2 = watch("type"); $[2] = watch; $[3] = t2; } else { t2 = $[3]; }
```

Chaque étape lisait ses valeurs par `form.watch('…')` **pendant le rendu**, avec un `form` reçu en
prop. Le React Compiler (actif, ADR-0015) tient les props pour immuables : il met le résultat de
`watch('type')` en cache sur l'identité de `watch`, stable pour toute la vie du formulaire — donc
la valeur du premier rendu, `undefined`, pour toujours. Et `PropertyWizard` compilé met
`<StepFinition form={form} />` en cache sur l'identité de `form` (`if ($[57] !== form)`).

Le clic écrivait pourtant bien la valeur : `PropertyWizard`, hôte du formulaire, a sa propre lecture
que le compilateur n'avait pas mise en cache, d'où un « Continuer » qui s'activait — c'est ainsi que
le testeur a atteint l'étape 3, puis la 4.

**Pourquoi la suite était verte** : vitest ne compile pas (`takussan-web/CLAUDE.md`, « La suite de
tests n'exerce PAS le code compilé »). Rejouées sous le compilateur (configuration de mesure hors
dépôt : `vitest.config.ts` + un plugin `enforce: 'pre'` qui passe `components/property-form/**` et
`components/forms/**` par `@babel/core` + `babel-plugin-react-compiler`), **sept assertions
existantes** rougissaient :

| fichier | test | reçu |
|---|---|---|
| `StepBien.test.tsx` | un clic sur un type le REMPLACE | `aria-checked="false"` |
| `StepBien.test.tsx` | AC4 — le contrat bascule | `aria-checked="false"` |
| `StepBien.test.tsx` | M-12 — flèche droite sélectionne | `aria-checked="false"` |
| `StepBien.test.tsx` | M-12 — enroulement | `aria-checked="false"` |
| `StepCaracteristiques.test.tsx` | le statut foncier se désélectionne | `aria-pressed="false"` |
| `StepCaracteristiques.test.tsx` | une VILLA demande son état | `aria-pressed="false"` |
| `StepCaracteristiques.test.tsx` | un clic ajoute un équipement | `aria-pressed="false"` |

**Au-delà du retour**, mesuré sous le compilateur sur le code d'avant (les six tests
d'`abonnement-des-etapes.test.tsx`, tous rouges ; les équipements aussi sans hôte mémoïsant) :

- **perte de données sur les équipements** : WiFi puis Piscine → `tag_ids` vaut `[8]`, pas
  `[7, 8]` (la liste lue dans la fermeture était figée à `[]`) ;
- « Bail » recliqué ne pouvait pas s'effacer — *déduit* de la sortie compilée, non mesuré à part
  (le test rougit dès le premier clic) : la comparaison se faisait contre la valeur figée ;
- la position posée par « Utiliser ma position » n'atteignait pas la carte de `StepLieu` ;
- le compteur de caractères de la description de `StepFinition` restait figé ;
- le bloc « location » de `StepPrix` ne suivait pas un changement de contrat fait après montage.

Même motif recherché dans tout le front (`watch('…')` lu dans un composant qui n'appelle pas
`useForm`) : **seuls les cinq fichiers d'étapes** le portaient.

⚠ **Mais ce n'est pas le seul motif, et l'affirmation première de ce ticket — « seuls les cinq
fichiers portaient le motif » — était trop large.** La revue adverse a montré qu'une lecture
`watch()` dans l'HÔTE du formulaire peut, elle aussi, tomber dans un bloc mis en cache : dans
`AgencyConfigForm` compilé, `form.watch("currency")` vit dans un bloc gardé par
`agency.*`, `control`, `form`, `router`, `t`… — rien qui change avec la devise. **Mesuré par
exécution le 2026-09-23** (sonde hors dépôt, `babel-plugin-react-compiler` 1.0.0 sur tout
`src/**/*.tsx`, routeur de test **stable** comme celui de Next) : on choisit EUR, la liste affiche
EUR, et l'avertissement `currencyChanged` n'apparaît **jamais** ; sans compilateur, il apparaît.
Une première sonde avec un routeur simulé *instable* (un objet neuf à chaque appel) était verte :
elle cassait le cache par un artefact du test — *une dépendance instable dans un mock suffit à
rendre invisible un défaut de mémoïsation.* Ce composant est hors du périmètre de ce ticket
(ticket séparé à ouvrir) ; `PropertyForm.tsx`, lui, en est, et passe à `useWatch` (voir Delta).

### W10 — « Un séparateur de milliers pour le montant » — **confirmé**

Capture : « 49000000 » brut à l'étape « À quel prix ? ». Le champ était un
`<input type="number">` (`StepPrix.tsx`, et `PropertyForm.tsx` à l'édition), qui **ne peut afficher
aucun séparateur** : le navigateur refuse toute valeur qui n'est pas un nombre brut. Aucun
composant de saisie de montant n'existait dans le dépôt.

Préview non consultée : `https://preview.takussan.com/fr` rend **401** (authentification HTTP), et
la capture du testeur (emojis sur les types de bien) date d'avant `dd979540` (2026-09-16, icônes
Lucide) ; le motif `watch()` fautif est présent depuis `e85034d2` (2026-08-29), avec le compilateur
actif depuis le 2026-08-17 — il vaut donc pour les deux builds.

### Revue adverse, seconde passe — cinq défauts mineurs, tous reproduits avant correction

Reproduits par une sonde hors dépôt (`lireSaisie` et `propertyFormSchema.shape.price`) sur le code
de la première réparation, avant d'y toucher :

| entrée | reçu | attendu |
|---|---|---|
| « 1.500,00 », XOF, `en` | 150 000 | 1 500 — le Delta promettait sans réserve que les centimes collés tombent |
| « 1.500 », EUR, `fr` | 1,50 | 1 500 — un point suivi de trois chiffres groupe |
| « 1.500,50 », EUR, `en` | 1,5 | 1 500,5 — divisé par 1 000 |
| « 1 500,5 » **puis « , » tapée**, EUR, `fr` | 15 005 | 1 500,5 — *trouvé en reproduisant* : une frappe de trop multipliait par 10 |
| prix vidé | « Le prix doit être supérieur à 0. » | « Le prix est requis. » — un test l'affirmait sans le mesurer |

La cause des quatre premiers est une seule : la lecture ne regardait qu'**un signe à la fois**, et
prenait la **dernière** occurrence du séparateur décimal. Or un texte qui porte les deux signes
n'est pas ambigu (le dernier sépare, l'autre groupe), et c'est la **première** occurrence tapée
qui compte. Le cinquième : `z.coerce.number(null)` vaut 0.

Et une mutation survivante : `currency={form.getValues('currency')}` dans `PropertyForm` laissait
tout vert. Pas de défaut aujourd'hui (l'hôte se re-rend par son abonnement à
`formState.dirtyFields`), mais la garde de source ne cherchait que `watch(` ; une lecture
`getValues` affichée n'a aucun abonnement.

Hors périmètre, relevé sur la sortie compilée : `CreateLeaseForm` met `form.watch("type")`,
`("property_id")` et `("tenant_id")` en cache sur l'identité de `form` (`if ($[14] !== form)`) —
même motif que W9, non mesuré par exécution faute de test.

### Revue adverse, troisième passe — la frappe de trop de l'AUTRE signe, reproduite

Le vérificateur a mesuré sur le vrai composant (`FormAmountInput` sous `useForm`, `EUR`,
`userEvent.type`) ce que la seconde passe déclarait fermé. Reproduit par les tests ajoutés AVANT le
correctif (`saisie-montant.test.ts` : **8 rouges**) :

| frappe (EUR) | reçu | attendu |
|---|---|---|
| « 1 500,5 » + « . », `fr` (et `wo`) | 15 005 | 1 500,5 |
| « 1 500,50 » + « . », `fr` | 150 050 | 1 500,5 |
| « 1500.5 » + « , », `en` | 15 005 | 1 500,5 |
| « 1,500.5,0 » collé, `en` (signes entremêlés) | 150 050 | 1 500,5 |

Cause : `marqueDecimale` (règle 1, « deux signes → le dernier sépare ») prenait la frappe de trop
pour « le dernier » et lisait la vraie virgule décimale comme un groupe. Et la garde des signes
entremêlés (`autres[…] > memes[0]`) n'était couverte par aucun test (mutation MX3 : 277/277 verts) ;
elle rendait -1, c'est-à-dire tout en partie entière — un facteur 100.

### Revue adverse v2 — « 1.500 » TAPÉ valait 1,50 €, et un brouillon repris bloquait l'étape 2

Deux défauts majeurs mesurés par le vérificateur, **reproduits** avant d'y toucher :

| mesure | reçu | attendu |
|---|---|---|
| « 1.500 » tapé touche par touche, EUR, `fr` (et `wo`) | `1,50`, price 1,5 — étapes `1 \| 1, \| 1,5 \| 1,50` | `1 500`, 1 500 |
| « 150.000 » tapé, EUR, `fr` | `150,00`, 150 | `150 000` |
| « 1.500,50 » tapé, EUR, `fr` | `1,50`, 1,5 (« ,50 » avalé) | `1 500,50`, 1 500,5 |
| brouillon serveur `street: null`, `postal_code: null`, étape 2, « Continuer » | rien ne se passe ; `Invalid input: expected string, received null` posé dans la section repliée | étape 3 |

**Cause du premier** : la règle « un point suivi de trois chiffres groupe » (AC16) ne valait que
pour un texte COLLÉ. `lireSaisie` réécrivait le point en virgule dès « 1. » — avant que le
troisième chiffre ait pu décider —, et « 1, » suivi de « 500 » ne pouvait plus grouper. Le test
d'AC16 appelait `lireSaisie('1.500')` d'un bloc : aucun test ne FRAPPAIT « 1.500 ».

**Cause du second** : l'autosave envoie `''` pour un texte vide ; Laravel le rend `null`
(`ConvertEmptyStringsToNull`). `reset({ ...valeursInitiales(), ...donnees })` posait `null`, que le
schéma (`optional()`) refuse, et l'erreur atterrissait dans le détail d'adresse replié : invisible.
Antérieur au premier correctif de ce ticket, traité ici parce que le périmètre est le même écran.

Troisième relevé, mineur : la garde AST des `getValues` s'évitait par une flèche anonyme
(`useState(() => form.getValues('type'))`, mutation MV1) — elle jugeait par le nom de la fonction
englobante.

**Mesuré après correctif au navigateur** (pile locale, `next dev`, Chrome headless, 390×844 mobile
et 1280×800), brouillon repris à `street: null` : étapes 1 → 2 → 3 → 4 sans erreur ; devise passée
à « Euro (EUR) » ; « 1.500 » tapé (`Input.insertText`, touche par touche) → `1 | 1. | 1.5 | 1.50 |
1 500`, `1 500` après sortie du champ, brouillon enregistré `price: 1500, currency: "EUR"` ; champ
de 44 px, aucun défilement horizontal.

## Contrat de données

Aucun changement. Le prix part à l'API en **nombre sans séparateur**, comme avant ; vérifié sur le
payload de création (`price: 49000000`) et de mise à jour (`price: 90000000`), et en euros
(`price: 1500.5, currency: 'EUR'`) dans les deux écrans.

## Delta produit

- [x] Les cinq étapes (`StepBien`, `StepCaracteristiques`, `StepLieu`, `StepPrix`,
      `StepFinition`) lisent par `useWatch({ control, name })` ; `PropertyWizard` aussi pour
      `type`/`contract_type` (sa lecture n'était pas mise en cache, mais par effet de bord de la
      sortie du compilateur, pas par contrat). `watch(callback)` de l'autosave, un abonnement
      dans un effet, reste.
- [x] Les bascules (statut foncier, état, équipements) relisent la valeur **au clic**
      (`getValues`), plus dans une fermeture de rendu.
- [x] `FormAmountInput` (nouveau, `components/forms/`) : champ texte au clavier numérique, groupé
      selon la locale active pendant la frappe (`fr`/`wo` → espace fine, `en` → virgule),
      curseur conservé, décimales selon la devise (0 en XOF/XAF, 2 en EUR/USD), exemple formaté.
      Rend un **nombre** au formulaire, `null` si vidé. Conversions pures dans
      `lib/format/saisie-montant.ts`.
- [x] Branché sur le prix du parcours (`StepPrix`) et de l'édition (`PropertyForm`).
- [x] Clés `property.wizard.placeholders.priceSale` / `priceRent` supprimées (l'exemple est un
      nombre formaté par la locale, plus un texte figé « 25000000 »).
- [x] *(revue adverse)* En franc CFA, des centimes **collés** en fin de montant (« 1 500,00 »,
      « 49 000 000,50 FCFA », « 1.500,00 » sur un écran anglais) tombent, au lieu d'être lus
      comme un groupe de milliers de plus — ce qui multipliait le montant par 100. Un groupe de
      trois chiffres reste un groupe (« 49.000 » = 49 000). **Seule exception**, voulue : quand le
      texte ne porte QU'UN signe et que c'est le séparateur de milliers de la locale, il groupe
      (en anglais, « 1,500,00 » en cours de correction vaut 150 000).
- [x] *(revue adverse, 2ᵉ passe)* La marque décimale se décide par des règles écrites
      (`marqueDecimale`, `lib/format/saisie-montant.ts`) : deux signes présents → le dernier
      sépare, l'autre groupe, dans toutes les langues ; plusieurs signes suivis chacun de trois
      chiffres → des milliers ; en euro, le point du clavier numérique n'ouvre des centimes que
      suivi d'au plus deux chiffres (« 1.500 » = 1 500 €) ; le **premier** séparateur décimal
      tapé compte quand le **même** signe est répété (« 1 500,5 » + « , »). *(Cette case disait
      « une frappe de trop ne change plus l'ordre de grandeur » sans réserve : c'était faux pour
      l'AUTRE signe — voir la troisième passe ci-dessous.)*
- [x] *(revue adverse, 3ᵉ passe)* Une frappe de trop ne décide rien, **quel que soit le signe** :
      un point ou une virgule final, qu'aucun chiffre ne suit, derrière une marque décimale déjà
      posée, est ignoré (règle 0 de `marqueDecimale`). « 1 500,5 » + « . » vaut 1 500,5 et non
      15 005 ; « 1 500,50 » + « . », 1 500,5 et non 150 050. Sans marque avant lui (« 1.500 » en
      français), le signe final ouvre toujours les décimales. Des signes **entremêlés**
      (« 1,500.5,0 ») ne se lisent plus comme une partie entière : en euro, le premier séparateur
      décimal de la locale tranche ; en franc CFA, aucun centime.
- [x] *(revue adverse v2)* En euro, le point tapé reste un **point** à l'écran tant qu'il est
      ambigu (seul de son espèce, au plus deux chiffres derrière) : « 1. », « 1.5 », « 1.50 ».
      Le troisième chiffre le fait grouper (« 1.500 » → `1 500`) ; la sortie du champ le tranche
      en décimales, affichées dans la convention de la locale (« 10.5 » → `10,5`). Le formulaire
      porte à chaque frappe la lecture courante. Le curseur reste après le point gardé.
- [x] *(revue adverse v2)* Un brouillon repris tel que le serveur le rend (champs vides → `null`)
      est ramené aux valeurs initiales avant `reset` (`sansNulls`, `PropertyWizard.tsx`) : il ne
      bloque plus l'étape 2 et part sans les champs vides.
- [x] *(revue adverse v2)* Une erreur posée dans le détail d'adresse **replié** (rue, code
      postal, pays) le déplie (`StepLieu.tsx`, `useFormState`) : elle se voit, et l'utilisateur
      peut le replier ensuite.
- [x] *(revue adverse v2)* La garde AST juge un rappel qu'un hook exécute **au rendu**
      (`useState`, `useMemo`, `useReducer`, `useSyncExternalStore`) comme le corps du composant
      qui l'appelle ; `useCallback` et `useEffect` restent admis.
- [x] *(revue adverse, 2ᵉ passe)* Un prix **effacé** dit « Le prix est requis. » :
      `propertyFormSchema.price` ramène `null` et le texte vide à `undefined` avant la coercition
      (`lib/schemas/property.ts`, seuls consommateurs : `PropertyForm` et `PropertyWizard`).
- [x] *(revue adverse, 2ᵉ passe)* La garde de source lit aussi l'**arbre syntaxique** : aucun
      `getValues(…)` directement dans le corps d'un composant ou d'un hook (au clic, dans un
      effet ou un `useCallback`, il reste admis).
- [x] *(revue adverse)* Une valeur à décimales venue d'ailleurs s'affiche **telle qu'elle part**,
      jamais arrondie à la devise (1500,5 en XOF s'affichait « 1 501 »).
- [x] *(revue adverse)* `PropertyForm.tsx` lit toutes ses valeurs par `useWatch` (type, contrat,
      description, position, équipements, devise), et la garde de source l'inspecte.

## Critères d'acceptation

- [x] AC1 — dans le parcours, « Terrain » puis « Vendre » cliqués portent `aria-checked="true"` et
      la classe `bg-primary` ; « Bail » à l'étape 3 porte `aria-pressed="true"` et `bg-primary`.
      *(`PropertyWizard.test.tsx`, « W9 ». Sous le compilateur : **rouge** sur le code d'avant,
      **vert** après. Sans compilateur, vert dans les deux cas — d'où AC2.)*
- [x] AC2 — une étape montée sous un hôte qui la **mémoïse** (ce que fait le parcours compilé)
      voit : la pastille choisie (type, contrat, statut foncier), les deux équipements cochés
      (`tag_ids` = `[7, 8]`), la position posée hors de l'étape, le compteur de description, le
      bloc location. *(`abonnement-des-etapes.test.tsx`, 6 tests : **rouges tous les six** sans
      le correctif, par ablation.)*
- [x] AC3 — garde de source : aucune lecture `watch('…')`, `watch([…])` ou `watch()` dans
      `PropertyWizard.tsx`, `wizard/*.tsx` et `wizard/steps/*.tsx` ; la garde vérifie qu'elle
      inspecte bien les six étapes. *(Rouge sur les cinq étapes d'avant, par ablation.)*
- [x] AC4 — « 49000000 » tapé au prix s'affiche `49 000 000` (U+202F) et part à l'API en
      `49000000` (nombre). *(`PropertyWizard.test.tsx`, « W10 » ; rouge avec l'ancien
      `type="number"`, par ablation.)*
- [x] AC5 — à l'édition, le prix existant s'affiche groupé et le prix modifié part en nombre.
      *(`PropertyForm.test.tsx` ; rouge avec l'ancien champ, par ablation.)*
- [x] AC6 — un champ vidé reste vide (l'ancien prix ne reparaît pas) et rend `null`.
      *(`FormAmountInput.test.tsx` ; rouge avec `undefined`, par ablation : react-hook-form
      ré-affichait la valeur par défaut.)*
- [x] AC7 — corriger un chiffre au milieu garde le curseur à sa place (« 1 500 000 » → curseur
      après « 1 », « 23 » → « 123 500 000 »).
- [x] AC8 — l'ensemble des tests `property-form/`, `forms/`, `saisie-montant` et du schéma
      `property` (301) est vert
      **aussi sous le React Compiler** (configuration de mesure hors dépôt, qui compile tout
      `src/**/*.tsx`).
- [x] AC10 — le prix suit la devise **choisie dans l'écran** : devise passée à EUR par la liste,
      « 1500,50 » s'affiche `1 500,50` et part `price: 1500.5, currency: 'EUR'`, dans le parcours
      et à l'édition. *(`PropertyWizard.test.tsx` et `PropertyForm.test.tsx`, « devise CHOISIE » ;
      devise remplacée par la constante `'XOF'` dans `StepPrix` et `PropertyForm` → **2 rouges**
      — c'était une mutation survivante de la revue.)*
- [x] AC11 — une valeur changée ailleurs **pendant la frappe**, champ toujours focalisé, remplace
      le texte tapé. *(`FormAmountInput.test.tsx` ; condition réduite à `saisie !== null` →
      **rouge** — mutation survivante de la revue : l'ancien test passait par un clic, qui ôtait
      le focus avant le `reset`.)*
- [x] AC12 — en franc CFA, « 1 500,00 » collé vaut 1 500 et s'affiche `1 500`, en `fr`, `wo` et
      `en` (« 1,500.00 ») ; « 49.000 » vaut 49 000 ; « 1,500,00 » en anglais vaut 150 000.
      *(`saisie-montant.test.ts` + `FormAmountInput.test.tsx` ; règle retirée → **7 rouges** ;
      exclusion du séparateur de la locale retirée → **1 rouge**.)*
- [x] AC13 — `ecrireMontant(1500.5, 0, 'fr')` rend `1 500,5`. *(Arrondi rétabli → **rouge**.)*
- [x] AC14 — la garde de source couvre `PropertyForm.tsx`. *(Fichier d'avant remis → **rouge**,
      6 lectures `watch(` relevées.)*
- [x] AC15 — deux signes : « 1.500,00 » (XOF, `en`) vaut 1 500 ; « 1.500,50 » (EUR, `en`) et
      « 1,500.50 » (EUR, `fr`) valent 1 500,5 ; « 1.000.000,25 » (EUR, `en`) vaut 1 000 000,25.
      *(`saisie-montant.test.ts` ; règle des deux signes retirée → **4 rouges**.)*
- [x] AC16 — en euro sur un écran français, « 1.500 » vaut 1 500 et s'affiche `1 500` ; « 10.50 »
      vaut 10,5. *(Règle « trois chiffres groupent » retirée → **1 rouge**.)* ⚠ **Cochée à tort
      à la 2ᵉ passe** : vraie pour un collage seulement, fausse au clavier (revue v2 : « 1.500 »
      tapé valait 1,50 €). Elle ne vaut qu'avec AC22.
- [x] AC17 — « 1 500,5 » suivi d'une virgule tapée garde 1 500,5 (idem « 1,500.5. » et « 1.5. »
      en anglais). *(Dernière occurrence au lieu de la première → **2 rouges**.)*
- [x] AC18 — un prix effacé (`null`, `''`, espaces) donne `validation.property.priceRequired` ;
      0 garde `pricePositive` ; dans le parcours, le prix tapé puis effacé affiche « Le prix est
      requis. ». *(`property.test.ts` + `PropertyWizard.test.tsx` ; pré-traitement retiré →
      **4 rouges**.)*
- [x] AC19 — la mutation de la revue (`currency={form.getValues('currency')}` dans
      `PropertyForm`) rougit la garde ; une sonde de la garde vérifie qu'elle relève un
      composant, un `memo(function …)` et un hook, et laisse passer clic, `useCallback`,
      `useEffect` et fonction utilitaire. *(Mutation rejouée → **1 rouge**.)*
- [x] AC20 — en euro, l'AUTRE signe tapé derrière des décimales ne change pas l'ordre de
      grandeur : « 1 500,5. », « 1 500,50. », « 1500,5. » (`fr`, `wo`), « 1,500.5, » et
      « 1500.5, » (`en`) valent 1 500,5, affichage sans le signe de trop ; au clavier sur le
      composant, « 1500,5. », « 1500,50. » (`fr`) et « 1500.5, » (`en`) aussi. Un signe final sans
      marque avant lui ouvre toujours les décimales (« 1.500, » `fr`, « 1,500. » `en` → `1 500,` /
      `1,500.`). *(`saisie-montant.test.ts` + `FormAmountInput.test.tsx` : **8 rouges avant le
      correctif** ; règle 0 neutralisée → **7 rouges** ; règle 0 qui rend aussi -1 → **2 rouges**.)*
- [x] AC21 — des signes entremêlés se lisent par la langue de l'écran : « 1,500.5,0 » (`en`) et
      « 1.500,5.0 » (`fr`) valent 1 500,5 en euro. *(MX3 rejouée — garde des entremêlés retirée
      → **2 rouges** ; ancien retour -1 → **2 rouges**.)*
- [x] AC22 — au clavier, sur le composant, en euro : « 1.500 » (`fr`, `wo`) → `1 500` et
      1 500 ; « 150.000 » → `150 000` ; « 1.500,50 » → `1 500,50` et 1 500,5 ; « 49.000.000 » →
      49 000 000 ; « 10. » reste `10.`, « 10.5 » vaut 10,5 et s'affiche `10,5` à la sortie.
      *(`FormAmountInput.test.tsx` + `saisie-montant.test.ts` ; correctif retiré (`lireSaisie` qui
      réécrit le point) → **14 rouges** ; seul le curseur après le point gardé retiré → **4 rouges**.
      Et au navigateur, 390×844 et 1280×800 — voir Contexte.)*
- [x] AC23 — un brouillon repris à `street: null, postal_code: null, …` passe l'étape 2 et part
      sans ces champs. *(`PropertyWizard.test.tsx` ; `sansNulls` retiré → **2 rouges** ; au
      navigateur, étape 2 → 3 sans erreur sur le brouillon réel.)*
- [x] AC24 — une erreur dans le détail d'adresse replié (code pays « S ») le déplie :
      `aria-hidden="false"`, bouton `aria-expanded="true"`, message visible. *(`StepLieu.tsx`
      d'avant remis → **1 rouge**.)*
- [x] AC25 — la garde AST relève `useState(() => form.getValues(…))`, `useMemo`, `useReducer`,
      `useSyncExternalStore`, et laisse `useCallback` / `useEffect`. *(Remontée au composant
      retirée → **1 rouge** ; MV1 rejouée sur `StepBien.tsx` → la garde **rougit** (2 relevés),
      plus 1 test de comportement.)*
- [x] AC26 — les 320 tests de `property-form/`, `forms/`, `saisie-montant` et du schéma
      `property` sont verts, avec et sans React Compiler (2026-09-23, repair-1 v2).
- [ ] AC9 — vérifié sur preview.takussan.com après déploiement, compte propriétaire, 360 px et
      bureau. *(Non fait : préproduction derrière authentification HTTP, et non redéployée.)*

## Hors périmètre

- Les autres champs de montant du front (`BookingPaymentDialog`, `LeasePaymentDialog`,
  `CreateLeaseForm` — dépôt, `QuoteSubmitForm`) restent en `type="number"` : ils peuvent adopter
  `FormAmountInput` tel quel, domaine par domaine.
- Faire exécuter le React Compiler par vitest (voir Notes) : décision de configuration globale.
- `AgencyConfigForm.tsx` (`components/admin-agency/`) : l'aperçu de devise et l'avertissement
  de changement de devise ne suivent pas la devise choisie une fois compilé — **mesuré par
  exécution**, voir Contexte. Correctif attendu : `useWatch({ control, name: 'currency' })`, et
  un test sous compilateur. Ticket séparé.
- `CreateLeaseForm.tsx` (`components/leases/`) : même motif relevé sur la sortie compilée
  (`form.watch("type" | "property_id" | "tenant_id")` en cache sur `form`) ; à mesurer par un
  test sous compilateur, puis `useWatch`. Même ticket séparé.
- Collages restant ambigus par nature : « 1,500 » collé en euro sur un écran français vaut
  1,50 € (la virgule EST le séparateur décimal du français). L'affichage réécrit aussitôt le
  montant retenu : l'erreur se voit.

## Notes d'implémentation

- **Pourquoi `useWatch` et pas une autre parade.** Un hook rend une valeur que le compilateur tient
  pour réactive, et il abonne le composant qui l'appelle : l'étape se re-rend d'elle-même, que son
  parent l'ait mise en cache ou non. `'use no memo'` sur les étapes aurait masqué le symptôme en
  renonçant au compilateur sans rien dire du motif.
- **La mesure sous compilateur** : `vitest.config.ts` fusionné avec un plugin Vite
  `enforce: 'pre'` qui transforme `src/components/(property-form|forms)/**/*.tsx` (hors tests) par
  `@babel/core` + `@babel/preset-typescript` + `babel-plugin-react-compiler`
  (`panicThreshold: 'all_errors'`), et échoue si un fichier sort sans `react/compiler-runtime`.
  `@babel/core` n'est qu'une dépendance transitive (eslint-plugin-react-hooks, shadcn) : c'est la
  raison pour laquelle la configuration n'est pas versionnée ici. Le problème de fond — **aucun
  test du front n'exerce le code que la production exécute** — mérite son ticket.
- `null` et non `undefined` pour un prix vidé : `undefined` fait ré-afficher à react-hook-form la
  valeur par défaut. `z.coerce.number(null)` valant 0, c'est le **schéma** qui ramène le vide à
  `undefined` avant la coercition — d'où « Le prix est requis. » (2ᵉ passe de revue ; avant,
  « doit être supérieur à 0 », comme la chaîne vide de l'ancien `type="number"`).

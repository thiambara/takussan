---
id: TCK-574
title: "Saisie : brouillons rendus tels qu'écrits, 0 de préfixe national retiré sous un indicatif étranger, « ,5 » en euro ne vaut plus 50 ; restes de TCK-564 et TCK-566"
status: done
phase: P2
family: full
estimate: S
wave: 69
created: 2026-09-24
updated: 2026-09-24
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#21-authentification--comptes
  models: []
tags: [front, api, wizard, brouillon, telephone, montant, a11y, retour-testeur]
---

## Objectif utilisateur

Quand on reprend un parcours, on retrouve exactement ce qu'on avait laissé, y compris un champ
qu'on avait vidé. Un numéro étranger tapé comme on le compose dans son pays (`06 12 34 56 78`)
part sous une forme qui reçoit les SMS. Un prix en euro qui commence par la virgule (`,5`) vaut
0,50 €, pas 50 €.

## Contexte

Les vérifications de TCK-564 et TCK-566 (2026-09-23) ont laissé des défauts hors périmètre ou
mineurs. Chacun a été reproduit avant d'être corrigé.

### a. Des brouillons infidèles : l'API réécrivait `''` en `null`

- **Mesuré.** `tests/Feature/WizardDraft/WizardDraftFideliteTest.php`, écrit avant le correctif :
  **3 rouges sur 4**. Un `PUT {data: {display_name: ''}}` était rendu `null`, et
  `'Rue de la '` devenait `'Rue de la'`.
- **Cause : trois mécanismes, et non un seul.** Chacun suffisait à lui seul :
  `TrimStrings` et `ConvertEmptyStringsToNull`, montés en middleware global par Laravel, puis
  `BaseFormRequest::prepareForValidation()`, dont `UpsertWizardDraftRequest` hérite. Retirer
  seulement le middleware laissait le défaut en place, et c'est l'ablation qui l'a montré.
- **Conséquence (TCK-566).** Dans un assistant d'onboarding, un champ pré-rempli que la personne
  avait vidé revenait pré-rempli à la reprise : `mergeDraft` ignore les `null`.

### b. Le 0 de préfixe national restait derrière un indicatif étranger

- `composerTelephone('0612345678', '+33')` rendait `+330612345678`. Ce numéro a la forme E.164
  (12 chiffres) : le champ l'acceptait, l'API aussi (`send-otp` → 200), et le code partait vers
  un numéro qui n'existe pas. Avant correctif, 6 tests rouges dans `phone.test.ts` et 1 dans
  `PhoneVerificationTest.php`.
- **Pays où le 0 fait partie du numéro** (vérifié, et gardé) : l'Italie (`+39 06 …`, les fixes ;
  le Vatican emploie `+39 06`), Saint-Marin (`+378 0549 …`), la Côte d'Ivoire (plan à 10 chiffres
  de 2021, `+225 07 …`), le Bénin (plan à 10 chiffres du 30 novembre 2024, `+229 01 …`), le Gabon
  (`+241 06 …`) et le Congo (`+242 06 …`).
- **Pour savoir où s'arrête l'indicatif**, on s'appuie sur le fait que les indicatifs de l'UIT
  forment un code préfixe. `+1` et `+7` ont un chiffre, 44 indicatifs en ont deux (zones 2 à 9),
  tous les autres en ont trois. `+2250…` est donc ivoirien (le 0 est gardé), et dans `+2207…`
  (Gambie) le 0 appartient à l'indicatif.

### c. Montant en euro : « ,5 » valait 50

- **Mesuré au clavier** (jsdom) : `« ,5 » → 50,` et `« ,75 » (wo) → 750,`, soit 4 rouges
  sur 4 dans `FormAmountInput.test.tsx`, et 4 sur 4 dans `saisie-montant.test.ts`.
- **Cause** : `positionApresReecriture` (`lib/format/saisie-montant.ts`). L'affichage `0,` porte un
  « 0 » que personne n'a tapé. La boucle ne compte que les chiffres tapés (ici aucun), et le
  curseur restait donc devant ce 0. Le chiffre suivant s'insérait avant lui.
- **Mesuré au navigateur après correctif**, sur la pile locale, prix en EUR du brouillon de
  démonstration : à 360 px (fr), `« ,5 » → 0,@2 | 0,5@3 → « 0,5 »` et `« .5 » → « 0,5 »` ; à
  390 px (wo), `« ,75 » → « 0,75 »` ; aucun défilement horizontal (`scrollWidth` = `innerWidth`).

### c bis. « 10.505 » : un arbitrage, pas une correction

La vérification a relevé que « 10.505 » tapé en euro sur un écran français valait 10 505, alors
que l'écran montrait « 10.50 » une frappe plus tôt. **Ce cas ne peut pas être corrigé sans en
casser un autre** — tant que la partie entière n'est pas nulle (le cas nul est corrigé, § c ter). La suite de touches est exactement celle de « 1.500 » et de « 150.000 »
(chiffres, point, trois chiffres), et la revue adverse v2 de TCK-564 exige de lire ces deux-là en
milliers (`FormAmountInput.test.tsx`, « TAPÉ … le point suivi de trois chiffres groupe »). Seule
la valeur des chiffres distingue les deux saisies.

**Le défaut est réel** : l'écran montre « 10.50 », et la frappe suivante donne « 10 505 »
(reproduit au navigateur par la vérification, Chrome à 320 px : `1@1 | 10@2 | 10.@3 | 10.5@4 |
10.50@5 | 10 505@6`). Il n'est **pas corrigé**, et ce n'est pas une décision que cette unité
peut prendre seule : la mission disait « corrige », et aucune délégation des arbitrages produit
n'est vérifiable. **Décision PROPOSÉE, à confirmer par la session** : garder la lecture en
milliers, pour trois raisons.

- Sur le prix d'un bien, un groupe de milliers est l'intention la plus probable.
- Un troisième chiffre de centimes n'existe pas en euro.
- L'écran ne promettait pas « 10,50 € ». Il montrait « 10.50 », un point encore ambigu, et le
  regroupement « 10 505 » se voit dès la frappe.

Le cas est épinglé dans `saisie-montant.test.ts`, avec ce raisonnement : si la session tranche
autrement, c'est ce test qui doit changer, en même temps que ceux de « 1.500 » (revue v2). La virgule, elle, n'est
jamais ambiguë : `« 10,505 » → 10,50`.

### c ter. « 0.505 » : la partie entière nulle, corrigée (repair-2)

La vérification de repair-1 a réfuté l'argument de § c bis **sur un sous-cas** : « ne se corrige pas
sans en casser un autre » est faux quand la partie entière vaut 0 ou est vide. « 0 500 » n'est
l'écriture d'aucun montant, donc lire le point comme décimale derrière une partie entière nulle ne
touche ni « 1.500 » ni « 150.000 ».

- **Reproduit avant correctif** : `lireSaisie('0.500', 2, 'fr')` → `{affichage: '500', valeur: 500}`,
  `'0.505'` → 505, `'.500'` → 500, `'0,500'` en anglais → 500, `',5'` en anglais → 5 (la virgule y
  groupe, règle 2). Au clavier (jsdom, vrai `FormAmountInput`), « .500 » et « 0.505 » en fr, « ,5 »
  en en : **12 rouges** sur les tests écrits avant le correctif (9 dans `saisie-montant.test.ts`,
  3 dans `FormAmountInput.test.tsx`). Le correctif « .5 tapé en premier » (§ c) rendait la séquence
  plus facile à atteindre : `.5 → 0.5 → 0.50 → 500`.
- **Correctif** : règle 1 bis de `marqueDecimale` (`lib/format/saisie-montant.ts`). En devise à
  décimales, quand aucun chiffre non nul ne précède le premier signe, ce signe ouvre les décimales,
  quel qu'il soit. Le franc CFA garde ses règles (`'0.500'` XOF vaut toujours 500, `',5'` XOF 5 :
  épinglés).
- **Mesuré au navigateur après correctif** (pile locale, `/app/properties/new`, brouillon d'owner1
  passé en EUR le temps de la mesure puis restauré à l'identique, Chrome headless,
  `Input.insertText` touche par touche) :
  - 320 px, fr : `« ,5 » → 0,@2 | 0,5@3` ; `« .500 » → 0.@2 | 0.5@3 | 0.50@4 | 0.50@4`, sortie
    « 0,5 » ; `« 0.505 » → … | 0.50@4 | 0.50@4` ; `« 1.500 » → … | 1.50@4 | 1 500@5` (inchangé).
  - 360 px, fr : `« .5 » → 0.5`, sortie « 0,5 » ; `« .500 »` → « 0,5 » ; `« 150.000 » → 150 000`.
  - 390 px, wo (`<html lang="wo">`) : `« ,75 » → 0,75` ; `« .500 »` → « 0,5 » ; `« 1.500 » → 1 500`.
  - 1280 px, en (`<html lang="en">`) : `« ,5 » → 0,5`, sortie « 0.5 » ; `« 0,500 »` → « 0.5 » ;
    `« 1,500 » → 1,500` (inchangé).
  - `scrollWidth` = `innerWidth` à chaque largeur.
- ~~En anglais, « ,5 » garde la virgule à l'écran pendant la frappe~~ — plus vrai depuis § c quater :
  derrière une partie entière nulle, le signe est réécrit dans la convention de la locale dès la
  frappe (« ,5 » → « 0.5 » en anglais, « .5 » → « 0,5 » en français).

### c quater. L'édition en anglais — corrigée par la session (2026-09-24)

La vérification de repair-2 a trouvé que la règle 1 bis cassait ce que la règle 2 protège : **en
anglais, effacer le premier chiffre de « 1,500 »** laisse « ,500 », lu 0,5 ; la frappe suivante
donnait « 2,050 » au lieu de « 2,500 » (mesuré au navigateur à 390 et 1280 px, `lang=en`, et en
jsdom : « 1,500,000 » → « 0,50 » → « 3,050 »).

- **Correctif** : la règle 1 bis ne s'applique plus au séparateur de milliers de la locale suivi
  d'un groupe entier (trois chiffres ou plus) — « ,500 », « 0,500 », « ,500,000 » groupent en
  anglais. « ,5 » et « ,50 » tapés restent des décimales.
- **Et l'affichage tranche** : derrière une partie entière nulle, le signe est déjà décidé, il est
  donc réécrit dans la convention de la locale (« ,5 » → « 0.5 » en anglais, « .5 » → « 0,5 » en
  français). La frappe « ,500 » au clavier en anglais passe par « 0. », « 0.5 », « 0.50 » et reste
  0,50 : le troisième chiffre ne peut plus la faire grouper, puisqu'elle ne porte plus de virgule.
- **Ablation** : la condition retirée → **3 rouges** (`saisie-montant.test.ts`, « en anglais, « ,500 »
  (un montant dont on efface le premier chiffre) reste des milliers »), fichier restauré, vert.

### c quinquies. « 10.505 » : décision

La session tranche AC7 bis : **« 10.505 » tapé en euro sur un écran français vaut 10 505**, et
cette lecture est gardée. Raisons : c'est la même suite de touches que « 1.500 » et « 150.000 », que
les francophones tapent au pavé numérique pour des milliers et que la revue v2 exige de lire ainsi ;
l'écran montre le regroupement dès la frappe (« 10 505 »), rien ne part en silence ; et le séparateur
décimal du français, la virgule, n'est jamais ambigu (« 10,505 » → 10,50).

## Delta produit

- **API** : l'écriture d'un brouillon (`PUT api/me/wizard-drafts/*`) échappe au trim et à la
  conversion `''` → `null`. Les deux middlewares sont exemptés dans `bootstrap/app.php`, au moyen
  de `UpsertWizardDraftRequest::estEcritureDeBrouillon`, et `prepareForValidation()` est neutralisé
  dans la requête. Toutes les autres routes restent normalisées.
- **Front** : les tolérances aux `null` restent en place (`sansNulls` dans `PropertyWizard`,
  `mergeDraft` dans `WizardReprenable`, `formulaireUpgradeDepuisBrouillon`,
  `relireTelephoneBrouillon`). Les brouillons écrits avant ce ticket portent encore des `null` en
  base, jusqu'à leur purge à 90 jours. Les commentaires qui affirmaient que le serveur écrit `null`
  sont datés.
- **Téléphone** : `lib/phone.ts` gagne `indicatifDe`, `aPrefixeNational`, `sansPrefixeNational` et
  `INDICATIFS_A_ZERO_SIGNIFICATIF`. Ces fonctions sont appliquées par `composerTelephone`, pour la
  saisie nationale comme pour la saisie internationale, puis par `recomposerTelephone` et
  `numeroComposable`. `<PhoneInput>` affiche la frappe telle quelle, et le 0 reste donc à l'écran,
  parce qu'un chiffre qui disparaît sous les doigts se retape. Seule la valeur est normalisée.
- **API téléphone** : `PhoneNumber::hasNationalTrunkPrefix` reprend la même table. `send-otp`
  rejette `+330612345678` par un 422 avec `validation.rules.phone_trunk_prefix` (fr/en/wo), et
  accepte `+390612345678`. Appelé sans `phone`, il juge le numéro ENREGISTRÉ par les mêmes règles
  (`ResendPhoneVerificationRequest::after()`, repair-1).
- **Profil** : `normalizePhoneInput` retire aussi le 0 de préfixe national (repair-1).
- **Montant** : quand un séparateur décimal est tapé en premier, le curseur passe le « 0 » que
  l'affichage insère. Derrière une partie entière nulle, en euro ou en dollar, le premier signe
  ouvre les décimales (« 0.505 » vaut 0,50, repair-2) ; « 10.505 » reste lu en milliers, en
  attente de la décision de la session.

## Critères d'acceptation

- [x] AC1 — `PUT` puis `GET` d'un brouillon : `''`, `''` imbriqué, `['', 'piscine']` et
      `'Rue de la '` reviennent tels quels, en réponse comme en base. Un `step` vide reste refusé
      (422). Dans la même requête de test, les autres routes normalisent toujours (voir AC1 bis).
      *(`WizardDraftFideliteTest.php` : 4 verts. Ablation de l'exemption du middleware seule →
      **3 rouges**, ablation de l'override de `prepareForValidation` seul → **3 rouges**, md5
      restaurées. Sur la pile locale : `PUT {name:'', street:'Rue de la ', nested:{a:''}}` puis
      `GET` rend les mêmes valeurs.)*
- [x] AC1 bis *(repair-1)* — l'exemption ne s'étend à AUCUNE autre route : des sondes enregistrées
      par le test, qui lisent la requête BRUTE (sans FormRequest), normalisent toujours `''` et
      `'  x  '` sur un autre `PUT`, un `PUT` sous `api/me/`, et un `POST` ou un `PATCH` sur le
      chemin même des brouillons. *(Le test précédent n'exerçait qu'un `POST /api/tags`, qui
      normalise de toute façon par `prepareForValidation()` : la mutation du vérificateur
      « exemption élargie à `PUT api/*` » y restait **verte**, reproduite ici. Après réécriture,
      trois mutations — `PUT api/*`, tout verbe sur `api/me/wizard-drafts/*`, `api/me/*` — donnent
      chacune **1 rouge** ; md5 restaurée `6e64cd90…`.)*
- [x] AC2 — reprise : un champ pré-rempli que la personne a vidé (`title: ''` sur un
      `initialData` à « Du compte ») revient vide, et le brouillon n'est pas supprimé.
      *(`WizardReprenable.test.tsx`. Mutation « `mergeDraft` saute aussi `''` » → **1 rouge**.)*
- [x] AC3 — `composerTelephone` : `0612345678` sous `+33` donne `+33612345678`, de même sous
      `+32` et `+44`, et avec `+33 06…`, `0033 06…`, `+1 0…`, `+20 0…` ou `+7 0…`. Le 0 est gardé
      sous `+39`, `+378`, `+225`, `+229`, `+241` et `+242`. Un seul 0 est retiré, et `0` seul donne
      `''`. *(`phone.test.ts` : 7 nouveaux tests. Mutations : `aPrefixeNational` toujours faux →
      **7 rouges**, liste des zéros significatifs vidée → **5 rouges**, table des indicatifs à deux
      chiffres vidée → **7 rouges**.)*
- [x] AC4 — `<PhoneInput>` sous `+33` : taper `0612345678` affiche `0612345678` et rend
      `+33612345678`. `0` seul affiche `0` et rend `''`. Une valeur posée par le parent
      l'emporte sur la frappe en cours. *(`phone-input.test.tsx`. Mutation « affichage dérivé de la
      seule valeur » → **2 rouges** : celui de cet AC, et le test du remontage ajouté par repair-1
      (AC4 bis). Rejoué en repair-2, md5 restaurée `70dee547…`.)*
- [x] AC5 — API `send-otp` : `+330612345678` → 422 sur `phone` avec le message
      `phone_trunk_prefix`, rien n'est enregistré et aucun code n'est en cache. `+390612345678` →
      200. *(`PhoneVerificationTest.php`, `PhoneNumberTest.php`. Règle retirée → **1 rouge**,
      liste vidée → **2 rouges**. Sur la pile locale : 422 et le message français.)*
- [x] AC6 — en euro, `,5` (fr), `.5` (fr, en) et `,75` (wo) tapés en premier valent 0,5 / 0,5 /
      0,75. En franc CFA, `,5` vaut 5. *(`FormAmountInput.test.tsx`, `saisie-montant.test.ts`.
      Correctif retiré → **8 rouges**. Au navigateur : 360 px (fr) et 390 px (wo) dans
      l'implémentation ; 320 px (fr) et 1280 px (en) ajoutés en repair-2, voir § c ter.)*
- [x] AC7 — `« 10.505 »` en euro (fr) : le comportement proposé est épinglé (10 505), et
      `« 10,505 »` vaut 10,50. *(`saisie-montant.test.ts`.)*
- [x] AC7 bis — la lecture en milliers de « 10.505 » est **confirmée comme décision produit** par
      la session (§ c quinquies). Depuis repair-2, elle ne porte plus que sur une partie entière
      NON nulle.
- [x] AC7 quater *(session)* — en anglais, un montant dont on efface le premier chiffre (« ,500 »,
      « 0,500 », « ,500,000 ») reste des milliers, et la frappe suivante le corrige (« 2,500 »,
      « 3,500,000 ») ; derrière une partie entière nulle, le signe s'affiche dans la convention de la
      locale. *(`saisie-montant.test.ts`, `FormAmountInput.test.tsx` ; condition retirée → **3 rouges**.)*
- [x] AC7 ter *(repair-2, amendé par § c quater)* — en euro, une partie entière nulle ne regroupe
      pas : « .500 » et « 0.505 » tapés (fr), « 0.500 » (wo), « ,5 » et « ,500 » tapés (en) valent
      0,50 / 0,5 ; la frappe
      « 0. » → « 0.500 » se relit à l'identique à chaque étape ; « 1.500 », « 10.500 » et « 1,500 »
      (en) groupent toujours ; en franc CFA, « 0.500 » vaut 500 et « ,5 » (en) 5, comme avant.
      *(`saisie-montant.test.ts`, `FormAmountInput.test.tsx` : **12 rouges avant correctif**, puis
      règle 1 bis retirée → **12 rouges**, md5 restaurée `c11138fa…`. Navigateur : § c ter.)*
- [x] AC8 — `eslint` sur les fichiers touchés : 0. `tsc --noEmit` : propre. `check-i18n` et
      `check-i18n-namespaces` : verts. Pint : propre. 429 tests du périmètre verts à repair-1 (430 dans 27 fichiers au relevé de la vérification ; 29 fichiers :
      `property-form/`, `forms/`, `wizard/`, `onboarding/`, `UpgradeRequestForm`, `phone`,
      `saisie-montant`, `wizard-drafts`), et 48 tests API.
- [x] AC5 bis *(repair-1)* — la page de profil ne fait plus partir de code vers
      `+330612345678`. Deux verrous : (1) `normalizePhoneInput` (champ libre de
      `ProfileContactSection`) retire le 0 de préfixe national (`+33 06…` et `+33 (0)6…` →
      `+33612…`), et le garde sous `+39` et `+225` ; (2) `send-otp` appelé SANS `phone` — ce que
      font `PhoneVerificationSection` et `ProfileContactSection` — relit désormais le numéro
      ENREGISTRÉ avec les mêmes règles (`ResendPhoneVerificationRequest::after()`) : 422 sur
      `phone`, aucun code en cache, numéro non réécrit, pour `+330612345678`
      (`phone_trunk_prefix`), `780143710+221`, `771234567` et `+22178014371` (`phone_e164`). Un
      numéro valide envoyé remplace un enregistré injoignable. *(Avant correctif : **4 rouges**
      API, **4 rouges** front. Ablations : `after()` retiré → **4 rouges**, branche préfixe national
      retirée → **1 rouge**, `normalizePhoneInput` d'origine → **4 rouges** ; md5 restaurées. Pile
      locale : compte temporaire au numéro enregistré `+330612345678`, `send-otp` sans `phone` →
      **422**, message français `phone_trunk_prefix` ; compte supprimé ensuite. Chrome sur
      `/app/profile` (owner1, sans enregistrer) : « +33 06 12 34 56 78 » tapé → `+33612345678` à
      360 et 1280 px, « +39 06 1234 5678 » → `+390612345678` à 320 px, `aria-invalid="false"`,
      aucun débordement. Dans ce champ LIBRE, le 0 disparaît dès qu'il est tapé (`+33` →
      `+336`) : le champ affiche sa valeur, contrairement à `<PhoneInput>`.)*
- [x] AC4 bis *(repair-1)* — relevé du vérificateur : « 0 » tapé sous `+33` puis valeur remise à
      `''` par le parent → « 0 » reste affiché. **Mécanisme confirmé** (sonde jetable : attendu `''`,
      reçu `0`), **sans correctif dans le composant** : `''` → `''` ne change pas `value`, un parent
      contrôlé n'a rien à transmettre. Aucun des quatre assistants ne remet le téléphone à `''`.
      Le contrat est écrit dans `<PhoneInput>` : remonter le composant (`key`), épinglé par
      `phone-input.test.tsx` (« vider une frappe qui ne compose rien passe par un remontage »).
- [x] AC5 ter *(repair-2)* — `send-otp` avec un `phone` PRÉSENT mais vide (`''`, `null`, espaces
      seuls) relit encore le numéro enregistré : `+330612345678` → 422 `phone_trunk_prefix`, aucun
      code en cache, numéro non réécrit. *(`PhoneVerificationTest.php`,
      `test_send_otp_avec_un_phone_vide_relit_encore_le_numero_enregistre`, 3 jeux de données.
      Mutation du vérificateur `filled('phone')` → `has('phone')` : **3 rouges** (19 verts avant ce
      test, relevé par la vérification) ; md5 restaurée `00737921…`.)*
- [x] AC5 quater *(session)* — le profil n'enregistre plus un numéro injoignable :
      `UpdateProfileRequest` (`PUT /api/auth/profile`) et `UpdateMeRequest` (`PATCH /api/me`)
      portent la règle `App\Rules\TelephoneJoignable`, la même que `send-otp` (qui la lit par
      `ResendPhoneVerificationRequest::defautDeJoignabilite()`, devenue une délégation) :
      `+330612345678`, `+2217801437100` et `+22178014371` → 422 sur `phone`, rien d'enregistré ;
      `+390612345678` (0 significatif italien) et `''` (effacer) passent. Le message
      `phone.regex` de ces deux requêtes, écrit en français en dur, passe par
      `validation.rules.phone_e164`. *(`AuthProfileTest` +4, `MeUpdateTest` +1 ; règle retirée des
      deux requêtes → **4 rouges** ; 60 tests verts sur `AuthProfileTest`, `MeUpdateTest`,
      `PhoneVerificationTest`, `AccountAndProfileValidationTest`.)*
- [ ] AC9 — vérifié sur preview après déploiement. *(Non fait : la préproduction est derrière une
      authentification HTTP.)*

## Hors périmètre

- `UpdateProfileRequest` et `UpdateMeRequest` (profil) valident encore le téléphone par
  `^(?:\+[1-9]\d{6,14})?$` seul, et **enregistrent** donc `+330612345678` si un client autre que
  le front l'envoie. Depuis repair-1, ce numéro ne reçoit plus aucun code (`send-otp` relit
  l'enregistré) et le front ne l'écrit plus (`normalizePhoneInput`) ; le refuser dès
  l'enregistrement se branche par `ResendPhoneVerificationRequest::defautDeJoignabilite`, dans un
  ticket à part (fichiers hors du périmètre de cette unité).
- Les préfixes nationaux autres que `0` (le `8` de la Russie et du Kazakhstan, le `06` de la
  Hongrie) ne sont pas retirés. Les retirer à l'aveugle casserait des numéros valides.
- La table des zéros significatifs est tenue à la main des deux côtés (`lib/phone.ts` et
  `PhoneNumber.php`), et chaque fichier renvoie à l'autre. Aucune garde ne les compare.
- La correction en base du numéro corrompu du compte du testeur (`780143710+221`, vérifié).

## Notes d'implémentation

- **Pourquoi exempter plutôt que retirer le middleware** : `ConvertEmptyStringsToNull` et
  `TrimStrings` sont le contrat de toutes les autres routes (cf.
  `BaseFormRequestNormalizationTest`). Ils tournent **avant** le routage, donc l'exemption se
  décide sur le chemin et le verbe (`PUT api/me/wizard-drafts/*`), pas sur le nom de route.
- `Middleware::trimStrings(except:)` et `convertEmptyStringsToNull(except:)` enregistrent des
  rappels statiques. `InteractsWithTestCaseLifecycle` les vide entre deux tests, et ils ne
  s'accumulent pas.
- `<PhoneInput>` mesure la largeur de son préfixe (`ResizeObserver`) pour poser le retrait du
  champ. L'estimation en `ch` reste la valeur du premier rendu. Voir TCK-566.

---
id: TCK-2643
title: "Créer un bail en quatre étapes, prérempli depuis le bien et les réglages de l'agence"
status: todo
phase: P2
family: full
estimate: L
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2679, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2639]
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#3-property"
    - "docs/models-spec.md#30-setting-"
tags: [back, front, leases, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agent qui a trouvé un locataire pour un bien crée le bail au téléphone en quatre écrans courts, sans retaper ce que l'annonce et l'agence savent déjà (loyer, caution, pénalité, commission). Il voit le total à l'entrée avant de l'envoyer à la signature.

## Contrat de données

**Relevé sur `dev` le 2026-11-10** :

- `StoreLeaseRequest` (`:47-70`) accepte :
  - `property_id`, `tenant_id`, `booking_id`, `guarantor_id`, `type` ;
  - les dates, `monthly_rent`, `sale_price`, `deposit_amount` ;
  - `commission_rate`, `commission_amount`, `agent_id` ;
  - `payment_frequency`, `payment_day`, `currency` ;
  - `terms`, `special_conditions`.
- Il **n'accepte pas** `late_fee_percent`, `late_fee_grace_days`, `early_termination_penalty_months` ni `rent_review_max_pct`. Ces colonnes du bail existent, mais ne s'écrivent qu'après coup, par `PATCH`.
- `CreateLeaseForm` n'envoie ni commission ni agent.
- Le bien porte `deposit_months`, `advance_months`, `agency_fee_months` et `monthly_charges` (§1.1, TCK-598). Rien ne s'en préremplit.
- Réglages d'agence à repli (`ScopedSetting`) : `lease.rent_review_max_pct` et `lease.early_termination_penalty_months` existent. **Aucun défaut de pénalité de retard** (taux, délai de grâce). `agency.commission_rate` existe.

**À produire** :

- **Back** :
  - `StoreLeaseRequest` accepte `late_fee_percent`, `late_fee_grace_days`, `early_termination_penalty_months` et `rent_review_max_pct`, avec les mêmes règles que `UpdateLeaseRequest` ;
  - nouvelle route **`GET /api/leases/defaults?property_id=`** → `LeaseDefaultsController`. Elle rend le préremplissage, et la **source** de chaque valeur (`property`, `agency` ou `platform`) :
    - `monthly_rent` : le prix du bien loué au mois ;
    - `deposit_months`, et `deposit_amount` = mois × loyer ;
    - `payment_day` ;
    - `late_fee_percent` et `late_fee_grace_days` ;
    - `commission_rate` ;
    - `early_termination_penalty_months` ;
    - `rent_review_max_pct` ;
    - `monthly_charges` : les charges mensuelles du bien (`properties.monthly_charges`), devenues un terme du bail (TCK-2679) ;
    - le total à l'entrée : loyer + charges + caution + avance + frais d'agence, d'après le coût d'entrée du bien (§1.1) ;
  - deux nouvelles clés `ScopedSetting` (catégorie `rentals`) : `lease.late_fee_percent` et `lease.late_fee_grace_days`, lues par la même chaîne agence → catalogue (cf. `spec-delta.md`).
- **Front** : création en quatre étapes sur `/app/leases/new`, entrée par `?property=`, `?customer=` et `?booking_id=`. `?booking_id=` existe déjà.

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-baux&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écrans « Création — étape 3, les conditions » (téléphone et bureau) et « Création — étape 4, vérifier » (téléphone).
- **Repère d'étapes** : « 1 Bien · 2 Locataire · 3 Conditions · 4 Vérifier ».
- **Étape 1, Bien** : recherche, les biens vacants d'abord (TCK-2637). Le bien est préchoisi quand on vient de sa fiche.
- **Étape 2, Locataire** : recherche (nom, e-mail, téléphone), ou création rapide (nom et téléphone) par l'endpoint client existant.
- **Étape 3, Conditions** :
  - préremplies : loyer / mois, caution « N mois = montant » (modifiable), échéance « le N du mois », pénalité « x % après n j », commission, indemnité de départ anticipé ;
  - encadré « Réglages de l'agence appliqués — Modifier ».
- **Étape 4, Vérifier** : récapitulatif, « Total à l'entrée : … » détaillé, puis « Créer le brouillon » ou « Envoyer à la signature ».
- **Téléphone (360-390 px)** : un écran par étape, bouton « Continuer » collé en bas.
- **Bureau (≥ 1280 px)** : une page à sections numérotées à gauche, et dès `lg` une colonne droite collante avec le total à l'entrée, l'aperçu du contrat et les deux boutons.

## Contraintes strictes (métier)

- **Les charges sont un terme du bail** (décision du porteur du 2026-11-10, point 7 b ; [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md) § 6, amendement du 2026-11-10 d'[ADR-0042](../../../adr/0042-preuve-de-consentement-a-la-signature-du-bail.md)) : l'étape « Conditions » préremplit « Charges mensuelles » depuis le bien, modifiable, et l'envoie (`monthly_charges`, TCK-2679) ; le récapitulatif et le total à l'entrée les comptent, et le contrat les imprime.
**Rien ne se perd** (audit famille 4, § 3, *Fonctions existantes* 14) :

- type de contrat (y compris la vente, avec un prix de vente et sans loyer), début, fin facultative ;
- loyer ou prix, caution, fréquence, jour du paiement ;
- conditions générales et particulières ;
- garant ;
- « Annuler » ;
- préremplissage depuis une réservation (`?booking_id=` : bien, locataire, dates, loyer — §1.4, P48.03) ;
- lien « Publier un bien » quand aucun bien n'est éligible ;
- état « sans agence » (`NoAgencyState`).

Autres contraintes :

- **Préremplir n'est pas imposer** :
  - toute valeur préremplie se modifie ;
  - le préremplissage ne réécrit jamais une valeur déjà saisie à la main ;
  - la source de chaque valeur se dit (« depuis l'annonce », « réglage de l'agence »).
- **« Envoyer à la signature »** = créer le brouillon, puis `POST /api/leases/{id}/signature-request`. Si la seconde étape échoue, le brouillon reste, et l'écran le dit.
- **Devise** : XOF seule. Pas de sélecteur à une option, mais la valeur part comme aujourd'hui.
- **Montants** : chiffres groupés selon la langue, aucune décimale en F CFA (TCK-564).
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement.

## Delta à produire

- [x] Back : `StoreLeaseRequest` élargi. `GET /api/leases/defaults` (`LeaseDefaultsController`, policy `create` sur `Lease`). Clés `ScopedSetting` `lease.late_fee_percent` et `lease.late_fee_grace_days` au catalogue.
  - Preuve : 14c8f0a19 ; la policy est `LeasePolicy::createOn` (décision 4), même règle que la création.
- [x] Back, tests :
  - Preuve : `tests/Feature/Lease/LeaseDefaultsTest.php` (16 méthodes) et `StoreLeaseWithLateFeeTest.php`, verts au HEAD 58c870a28.
  - `LeaseDefaultsTest` : bien à 2 mois de caution donne caution = 2 × loyer ; défaut d'agence puis repli au catalogue ; source rendue ; appelant hors agence 403 ;
  - `StoreLeaseWithLateFeeTest`.
- [x] Front : parcours en quatre étapes (téléphone) et en une page (bureau). Entrées `?property=`, `?customer=` et `?booking_id=`.
  - Preuve : 8c469da8c, e69154bd8, f5f8b2d23 ; `?property=` c9e87782d.
- [x] Front, tests :
  - Preuve : `CreateLeaseForm.creation.tck-2643.test.tsx`, `.verification.`, `.dates.`, `.bien-prechoisi.`, `.depuis-reservation.p48-03` ; avec `leases/new/__tests__/page.tck-2643.test.tsx` : `components/leases/__tests__` et `leases/new`, 36 fichiers, 245 tests verts (2026-11-14).
  - préremplissage depuis le bien ;
  - une valeur saisie n'est pas écrasée ;
  - « Envoyer à la signature » enchaîne les deux appels ;
  - réservation préremplie, comme aujourd'hui ;
  - bail de vente.

## Critères d'acceptation

- [x] AC1 — Depuis la fiche d'un bien à 670 000 F / mois avec 2 mois de caution, l'étape 3 affiche « Caution 2 mois = 1 340 000 F » sans saisie. Le POST envoie `deposit_amount: 1340000`.
  - Preuve : `LeaseDefaultsTest::test_deux_mois_de_caution_donnent_deux_fois_le_loyer_depuis_l_annonce` ; front « AC1 — 2 mois de caution… » et « AC3 — le brouillon part avec la caution… » (`deposit_amount: 1340000`).
- [x] AC2 — Une agence dont le réglage `lease.late_fee_percent` vaut 5 préremplit « 5 % ». Une agence sans réglage prend la valeur du catalogue, et l'écran dit « réglage de la plateforme ».
  - Preuve : `LeaseDefaultsTest::test_la_penalite_de_retard_vient_de_l_agence_puis_du_catalogue` (source `agency` puis `platform`) ; front « AC2 — la source se dit… ».
- [x] AC3 — Le bail créé porte `late_fee_percent` et `late_fee_grace_days` dès le POST, sans PATCH ultérieur (vérifié au réseau et en base).
  - Preuve : en base, `StoreLeaseWithLateFeeTest` (les termes écrits dès le POST, aucun PATCH) ; au réseau, le corps du POST en jsdom (test AC3). Aucun relevé réseau sur la démo : la base de démo ne s'écrit pas.
- [x] AC4 — « Envoyer à la signature » produit, dans l'ordre, `POST /api/leases` puis `POST /api/leases/{id}/signature-request`. Le bail est `pending_signature`.
  - Preuve : front « POST du bail, PUIS demande de signature du bail créé » et « un échec de la signature laisse le brouillon… » ; API `BailFermeLesAutresCandidaturesTest` (`pending_signature`).
- [x] AC5 — À 390 px, chaque étape tient son bouton « Continuer » visible sans défiler. À 1280 px, le total à l'entrée reste visible pendant la saisie.
  - Preuve : relevé du 2026-11-14 au HEAD 58c870a28, sans écriture. 390 × 844 : « Continuer » en 784-832 / 844 à scrollY 0 aux étapes 1, 2 et 3. Étape 4 : « Envoyer à la signature » (728-776) et « Créer le brouillon » (784-832). 1280 × 900 : total en 127-255, puis en 22-149 après saisie du loyer et défilement complet ; le montant est recalculé.
- [x] AC6 — `/app/leases/new?booking_id=…` préremplit encore le bien, le locataire, les dates et le loyer.
  - Preuve : `CreateLeaseForm.depuis-reservation.p48-03.test.tsx` et « les valeurs de la réservation l'emportent sur celles du bien » ; page : `?booking_id=` passé au formulaire (`leases/new/__tests__/page.tck-2643.test.tsx`).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [x] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2643.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
  - Preuve : la fiche ; `_zones` motive l'absence de zone déclarée.
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [x] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
  - Preuve : `TCK-2643.absents.json` donne un motif à chacun des 72 absents des trois rapports (alias, écart accepté, vérité des données ou coque).
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
  - Non coché : l’outil mesure l’en-tête de la coque du téléphone à 1,34 % (> 0,5 %), écart motivé (« Brouillon », trait de ×) mais non soldé ; à trancher par le porteur (cf. `_zones` de la fiche).
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [x] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.
  - Preuve : `fidelite balayer` à 768 et 1024 : débord 0, aucune coupe ; innerWidth = scrollWidth à 390, 1024 et 1280 (relevés qui impriment les deux : le viewport n'est pas élargi) ; à 1024 la colonne du total passe sous le formulaire (collante dès `xl`, écart du lot 3). À 1280, l'écran est comparé à la maquette « bureau 1280 ».

## Hors périmètre

- La création depuis la visite ou depuis la fiche client (famille 5 : l'entrée `?customer=` est prête).
- La signature elle-même, qui ne change pas.

## Notes d'implémentation

Relevé du 2026-11-12 (terrain-7, branche `feat/audit-ux-app-lot-2`). Décisions de la session (déléguées par le porteur), qui priment sur le texte du ticket là où il se trompait :

1. **Pénalité de retard** : clés `lease.late_fee_percent` (0-50) et `lease.late_fee_grace_days` (0-30) au catalogue `rentals`, défaut **0** = pas de pénalité (aucune valeur commerciale inventée ; la maquette montre 5 % / 5 j : écart accepté). Leur seul lecteur est le préremplissage (`App\Services\Lease\LeaseDefaults`) : `LateFeeCalculator` lit la colonne du bail.
2. **Total à l'entrée** : `CoutDEntree` (API et front), sur les valeurs SAISIES du bail. La formule du ticket comptait deux fois le premier mois.
3. **Commission** : `agencies.commission_rate` n'est PAS recopié sur le bail (il figerait le taux des reversements, `PayoutCalculator` lit le bail d'abord). `defaults` le rend en information (`agency_commission_rate`), au personnel seul.
4. **Autorisation** : `LeasePolicy::createOn(User, Property)` — la règle de `LeaseService::create()` extraite (bailleur du bien non bloqué, ou personnel `leases.create` de l'agence du bien). « policy `create` » du ticket aurait refusé le bailleur que la création admet. Bien absent, id mal formé ou manquant → 403, comme un bien étranger (TCK-1068).
5. **« Préavis 3 mois »** de la maquette : aucune colonne ; l'étape montre l'indemnité de départ anticipé, bornée 0-12 (le catalogue admet 24 : une valeur d'agence au-delà est ramenée à 12).
6. **Jour de paiement** : 1, source `platform` ; pas de nouvelle clé (maquette « le 5 » : écart accepté).
7. **« Réglages de l'agence appliqués — Modifier »** : encadré sans « Modifier » — aucune page n'écrit un réglage d'agence (`POST /api/settings` scope agence sans appelant au front). À suivre dans un ticket à part.
8. **Locataire créé à l'étape 2** : personnel seulement, prénom ET nom ; « Envoyer à la signature » désactivé pour un locataire sans compte (422 `lease_signature.tenant_without_account` sinon), le brouillon se crée quand même.
9. **Loyer** prérempli seulement d'une location mensuelle (`CoutDEntree::sApplique`) ; sinon `property_price` (montant, période) pour l'aide. Type : vente si le bien est à vendre, commercial pour bureau/boutique/entrepôt/usine, sinon habitation.
10. **Candidatures ouvertes** (TCK-2734) : `defaults.open_applications` (`id`, `customer_id`) ; l'étape « Vérifier » dit, près de « Envoyer à la signature », combien d'AUTRES candidatures l'ENVOI en signature fermera (celle du locataire se complète) — décision 7b du porteur : la clôture a quitté la création du brouillon pour `LeaseService::cloreLesCandidaturesDuBien()`, appelée par `LeaseSignatureService` ; l'avis se tait quand l'envoi est fermé (locataire sans compte).
11. **Garant** : la phrase « après création » reste. 12. **Devise** : le sélecteur reste (4 options), devise du bien par défaut.

Livré : `?property=` préchoisit le bien s'il figure parmi les biens proposés (lot 1, débloque TCK-2639) ; `StoreLeaseRequest` accepte les quatre termes aux bornes d'`UpdateLeaseRequest` ; `GET /api/leases/defaults` (route littérale avant `leases/{lease}`). Tests : `tests/Feature/Lease/LeaseDefaultsTest.php`, `StoreLeaseWithLateFeeTest.php` (8 ablations rouges).

Front (lot 3) — `CreateLeaseForm` reste le seul formulaire ; les pièces de présentation vivent sous `components/leases/creation/`.

- **Étapes** : sous `md`, un écran par étape (sections masquées par CSS : chaque champ n'est rendu qu'une fois et garde sa valeur), « Continuer » valide les champs de l'étape (`trigger`), une erreur à l'envoi ramène à l'étape qui la porte ; l'en-tête de la coque dit « Étape n sur 4 · Nom ». Dès `md`, une page à sections numérotées ; la colonne du total et des deux envois est collante dès `xl` (maquette `xl:grid-cols-[minmax(0,1fr)_min(400px,36.5%)]` ; « dès `lg` » du ticket : à 1024, 694 px utiles, la colonne ne laisserait qu'environ 420 px aux conditions).
- **Préremplissage** : `form.reset({...défauts, ...préremplies}, { keepDirtyValues, keepDirty })` à l'arrivée de `GET /api/leases/defaults` — `resetField` ignorait un champ pas encore monté (le prix d'une vente). Les valeurs de la réservation ne sont jamais remplacées. La source s'écrit sous le champ tant que la valeur est celle qui a été reprise.
- **Caution** : un pas-à-pas en mois écrit le MONTANT (mois × loyer) ; le montant reste libre.
- **Vente** : le schéma refusait toute vente (`monthly_rent: 0` contre `.positive()`, champ non affiché) — corrigé (`nonnegative`, la location exige toujours un loyer positif) ; une vente n'envoie ni loyer, ni charges, ni pénalité, ni indemnité.
- **Signature** : POST du bail puis `POST /leases/{id}/signature-request` ; un échec de la seconde laisse le brouillon, l'écran le dit et lie la fiche, sans second POST. Locataire sans compte : bouton désactivé et motif écrit.
- **Écarts** : pas de « Brouillon » ni d'enregistrement automatique (aucun n'existe) ; pas d'« Aperçu du contrat » (aucun rendu avant création ; le PDF existe une fois le bail créé) ; « Préavis » → indemnité de départ (décision 5) ; aplat d'icône des réglages en `bg-muted` (`bg-accent/<n>` interdit dans `/app`) ; l'étape « Bien » garde le sélecteur (biens vacants d'abord, `include=occupancy`), sans champ de recherche.

Fidélité (lot 4) — fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2643.json` (écrans a-2 téléphone, bureau 1440 et 1280, a-3 téléphone ; la maquette n'a pas d'a-3 au bureau), relevés en lecture seule sur le bien 13 et la cliente 3 de démo : la perturbation refuse toute requête autre que GET/HEAD/OPTIONS (« écritures refusées : 0 »). ⚠ `--bloquer` de l'outil apparie par sous-chaîne : `*/api/leases` bloquait aussi `/api/leases/defaults`.

- **Bien et locataire choisis** : une ligne (`creation/LigneChoisie`, `data-slot="ligne-choisie"`) — vignette ou initiales, nom, « réf · bailleur · loyer annoncé » ou téléphone, et « Changer », qui rend le sélecteur. Les initiales ne s'importent pas de `customer-dashboard/liste/pieces` : ce module lit `crm`/`agentCrm`, que la frontière `(dashboard)/app/leases` ne transporte pas (`check:i18n-namespaces`).
- **Mise en page** : page en `PagePleineLargeur`, colonne de droite `min(25rem, 36.5%)` (400 px de la maquette, et non 360) ; dates « 1 déc. 2026 » (`formatAffiche` additif de `FormDatePicker`) ; barre d'action du téléphone à la taille `action`, boutons `xl` ; « / mois » en `muted-foreground` ; Devise et Fréquence après les règles ; l'avis des garants rejoint ceux de l'envoi (décisions 11 et 12).
- **Écarts acceptés** : listés avec leur motif dans la fiche (`ecarts_acceptes`) — dont la caution, qui garde un montant libre à côté du pas-à-pas (la maquette n'écrit que « = N F »), décision de session (team-lead, 2026-11-12) : pas de régression.

### Suivi (2026-11-13) — r1 de la vérification de 65d3142b6 (r6) : une seule règle pour la valeur et la source (back-4)

- **Constat.** Avec une ligne d'agence `{"value": 0}` sur l'indemnité ou la révision, `GET /api/leases/defaults` servait la valeur du global (7, 12,5) mais la source `agency`. Le formulaire annonçait alors des « réglages de l'agence ».
  - La cause : `LeaseDefaults::agencyValue()`, double de `ScopedSetting::numericAgencyValue()`, n'appliquait pas le `> 0` des résolveurs.
- **Règle unique.** `ScopedSetting::numericAgencyValue()` rend la valeur d'agence VALABLE : numérique, et au moins au plancher des règles du catalogue (`min:x`, `gt:x` : `EditablePlatformSettings::atteintLePlancher()`).
  - Les résolveurs (`EarlyTerminationService::resolvePenaltyMonths`, `RentReviewService::resolveMaxPct`) et `LeaseDefaults` (valeur et `source`) la lisent. `LeaseDefaults::agencyValue()` est retiré.
  - Au-dessus du plafond, `clamp()` ramène toujours la valeur : la ligne reste un réglage de l'agence.
- **Effets.**
  - Indemnité et révision : `{"value": 0}` donne le global et la source `platform`.
  - Pénalité de retard (`min:0`) : 0 reste un réglage de l'agence (« pas de pénalité »).
  - Une ligne héritée négative passe sous le plancher : le catalogue reprend la main, au lieu d'être ramenée à 0 et dite « de l'agence ».
  - Les deux écrivains de lignes d'agence refusent déjà ces valeurs : seules les lignes héritées sont concernées.
- **Épinglé par** `LeaseDefaultsTest::test_une_ligne_d_agence_sous_le_plancher_n_est_pas_un_reglage_de_l_agence` et par les cas r6 de `ScopedSettingReadersTest`.
- **Ablations, toutes rouges :**
  - sans plancher : 3 rouges ;
  - la `source` jugée par l'ancienne règle : 1 rouge ;
  - `gt` lu comme `min` : 2 rouges.
- Prévenu : terrain-7 (`LeaseDefaults`).

### Clôture (2026-11-14) — re-mesure au HEAD 58c870a28

- **Prémisse** : aucun fichier de la création du bail n'a bougé depuis 98608127e. Les réserves de la vérification adverse des lots 1 à 3 (terrain-5) sont fermées au HEAD :
  - r1 à r4 par f5f8b2d23 ;
  - r5 par ee5324269 (TCK-2767) ;
  - r6 par bfca8d72d ;
  - la caution libre et le format de date par 2ce1c2242 ;
  - l'avis des candidatures par 98608127e.
- **Ablations de droits** (rejouées après TCK-2767, une à la fois, md5 restauré) :
  - retirer la capacité `leases.create` de `createOn` restait vert : test ajouté (`test_un_agent_de_l_agence_sans_la_capacite_de_creer_un_bail_est_refuse`), désormais rouge ;
  - le bailleur bloqué restait vert : test ajouté (`test_le_bailleur_bloque_dans_l_agence_du_bien_est_refuse`), désormais rouge ;
  - les autres gardes rougissent : personnel et capacité retirés ensemble (5 rouges), bailleur toujours admis (6), commission rendue au bailleur (1), bien absent admis (1).
  - Retirer le contrôle de personnel seul reste vert : la capacité est jugée dans l'agence du bien, la défense est double.
- **Rien ne se perd**, nouveaux tests :
  - conditions générales et particulières, fréquence et devise partent au POST, et le garant est annoncé ;
  - page : état « sans agence », « Annuler » vers la fiche du bien ou la liste, entrées passées au formulaire.
- **Fidélité** : mêmes comptes qu'au 2026-11-12 (fiche, `mesures`) ; au bureau, 123 des 147 écarts sont dans la coque.
- **Reste** :
  - AC-F2, AC-F4 et AC-F5 : le porteur valide sur le rideau les écarts motivés « décision produit », « garde de dépôt » et « composant partagé », qui sont hors des trois exceptions d'ADR-0106 § 2, et l'en-tête de coque du téléphone à 1,34 % ;
  - « Modifier » des réglages d'agence (décision 7) : suivi écrit, [TCK-2832](TCK-2832-modifier-les-reglages-de-bail-de-l-agence.md) ;
  - **contre-vérification à faire** (confiée par team-lead à un vérificateur) de f5f8b2d23, 2ce1c2242 et 98608127e, que personne n'a encore contre-vérifiés :
    - f5f8b2d23 (`CreateLeaseForm.tsx`, `hooks/useApiForm.ts` et son test, `CreateLeaseForm.verification.tck-2643.test.tsx`) :
      - changer de bien remet loyer, caution, charges et prix de vente à ceux du NOUVEAU bien, ou vides : AC1, « préremplir n'est pas imposer » ;
      - la caution non saisie suit le loyer, et ne bouge plus une fois saisie ;
      - deux clics dans la même tâche n'envoient qu'un bail (ref synchrone de `useApiForm`) : `useApiForm` est PARTAGÉ, chercher les régressions chez ses autres appelants ;
      - un `?customer=` illisible ne saute pas à « Conditions » : aucune impasse, aucun locataire étranger affiché.
    - 2ce1c2242 (test seul, `CreateLeaseForm.dates.tck-2643.test.tsx`) : il épingle « 1 déc. 2026 » sur le vrai `FormDatePicker` et la durée de l'étape « Vérifier » ; vérifier qu'il rougit sous ablation du format (`formatAffiche`, `DATE_DU_BAIL`).
    - 98608127e (`CreateLeaseForm.tsx`, `CreateLeaseForm.creation.tck-2643.test.tsx`) : l'avis « L'envoi en signature clôturera N candidatures » se tait quand l'envoi est fermé (locataire sans compte, ou brouillon créé dont l'envoi a échoué) : AC4, décision 7b.
    - Droits (rien n'y a touché, à reconfirmer) : `LeasePolicy::createOn`, `LeaseDefaultsRequest::authorize`, `agency_commission_rate` tu au bailleur ; ablations de ce lot dans le manifeste.


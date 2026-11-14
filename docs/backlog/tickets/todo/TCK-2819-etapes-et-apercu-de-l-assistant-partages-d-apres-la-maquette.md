---
id: TCK-2819
title: "Les étapes et l'aperçu de l'assistant d'annonce suivent la maquette, sur /publish comme sur /app/properties/new"
status: todo
phase: P2
family: front
estimate: L
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2600]
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#3-property"
tags: [front, publish, assistant, fidelite, audit-ux, app, suite-de-tck-2600]
---

## Objectif utilisateur

Que l'on publie sans compte sur `/publish` ou depuis l'espace sur `/app/properties/new`, l'assistant d'annonce montre les
mêmes étapes, le même aperçu et le même pied que la maquette retenue `app-entree-publier`. Un seul assistant, un seul
dessin.

## Origine

Suite de TCK-2600. La session a accepté le 2026-11-14 les écarts ouverts de sa fiche de fidélité
(`docs/qa/audit-ux-2026-11/fidelite/TCK-2600.json`, `ecarts_ouverts`), à condition d'en faire ce ticket. TCK-2600 n'a
redessiné que le cadre d'entrée (`cadreDEntree` de `WizardShell`, monté par `/publish` seul) : le contenu des étapes, la
colonne d'aperçu et le pied du téléphone sont ceux de `/app/properties/new`, et les redessiner change aussi l'assistant
connecté, que la maquette ne couvre pas.

## Contrat de données

Aucun endpoint touché. Les étapes lisent ce qu'elles lisent aujourd'hui (`/api/public/amenities` pour l'anonyme, les
référentiels de l'assistant connecté) ; AC4 de TCK-2600 reste vrai : pour un même couple type × contrat, les deux
entrées montrent les mêmes champs.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-publier&a=a`, écrans a-0 à a-5, au téléphone (390) et
  au bureau (1440, et 1280 quand la visionneuse en a une) — **référence de fidélité, non versionnée**, cf.
  [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- Ton : vouvoiement ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md)) ; la maquette tutoie.
- Fidélité : [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), densité du bureau
  [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md).

## Delta à produire

Les lignes d'écart viennent de la fiche de TCK-2600 (`ecarts_ouverts`), relevée au bureau 1440 et au téléphone :

- [ ] **Contenu des six étapes** (`StepBien`, `ChampsLieu`, `StepCaracteristiques`, `StepPrix`, `MediaDropzone`,
  finition) — écarts relevés au bureau 47 · 34 · 43 · 33 · 16 · 24 lignes, au téléphone 43 · 24 · 32 · 33 · 20 · 15.
  Parmi eux : cartes du contrat et des types ; région, ville et quartier en grille ; « Utiliser ma position » et
  « Placer sur la carte » en pastilles ; loyer suivi de « Par Mois / Semaine / Jour / An » au lieu de Prix + Fréquence ;
  « Total à l'entrée » ; dépôt des photos et « Couverture » ; apostrophes typographiques des libellés partagés
  (« Coût d'entrée », « Titre de l'annonce »).
- [ ] **Colonne d'aperçu** : la carte (`ApercuAnnonce` : pastille « En location », « Vos photos viendront ici », titre,
  lieu, prix) et « Pour publier » (`ListePourPublier` : titre 15 px / 600 au lieu de 12,6, notes « en cours »,
  « facultatif », « à la fin » alignées à droite au lieu d'être dans le libellé, puce). Écarts relevés : 21 · 19 · 21 ·
  21 · 19 · 21 lignes. La colonne collante retrouve son `y` de 104 sur a-0, a-2 et a-5 quand les étapes reprennent leur
  hauteur.
- [x] **Pied de l'assistant au téléphone** : le `PiedAssistant` de la maquette (pied de 117 px, « Continuer » 172 × 48 en
  16 px / 600, « Précédent ») remplace celui de `WizardShell` sous `lg`, avec le bandeau d'aperçu.
- [x] **Débord de 1 px à 360** : sur a-4, « Précédent », « Plus tard » et « Continuer » côte à côte finissent à 361 px
  (relevé de la fiche, champ `balayage`). Le nouveau pied ne déborde à aucune largeur.
- [x] Fiche de fidélité de ce ticket : `docs/qa/audit-ux-2026-11/fidelite/TCK-2819.json`, sur les deux entrées.

## Contraintes strictes (métier)

- **Un seul assistant.** Aucune copie des étapes pour `/publish` : le redessin vaut pour les deux entrées, et AC4 de
  TCK-2600 (mêmes champs pour un même couple) reste tenu.
- Le brouillon local de `/publish` ([ADR-0093](../../../adr/0093-publier-sans-compte-le-brouillon-vit-dans-le-navigateur.md))
  et le brouillon serveur de `/app/properties/new` relisent leurs valeurs sans migration : un brouillon d'avant ce ticket
  rouvre à la même étape avec les mêmes valeurs.
- **Ce qui reste accepté** (décision de la session du 2026-11-14, ne pas « corriger ») : « Effacer ce brouillon », la
  ligne d'état « Brouillon gardé sur ce téléphone » et la note « Brouillon gardé dans ce navigateur » dès a-0 ;
  « Publier l'annonce » comme geste final.
- i18n `fr` / `en` / `wo` (le `wo` porte le texte français tel quel, wolof en pause).

## Critères d'acceptation

- [x] AC1 — Pour un studio en location au mois, `/publish` et `/app/properties/new` rendent à chaque étape les mêmes champs
  (test de structure sur les deux montages). Une régression qui copie une étape pour une seule entrée le fait rougir.
- [x] AC2 — Un brouillon écrit avant ce ticket (fixture des deux formes : local et serveur) rouvre à la même étape avec
  les mêmes valeurs, photos comprises.
- [x] AC3 — À 360, 390, 768, 1024, 1280 et 1440 px, sur a-0 à a-5 et sur `/app/properties/new`, aucun débord
  (`scrollWidth − innerWidth = 0`), a-4 à 360 compris.
- [x] AC4 — Au téléphone, le geste « Continuer » mesure 48 px de haut et reste visible sans défilement de la page à
  chaque étape.
- [ ] AC-F1 à AC-F6 — comme TCK-2600 (fiche, zéro écart non expliqué, rien ne manque, zones identiques, preuve dans la PR,
  largeurs intermédiaires), avec `fidelite compare` sur a-0 à a-5. Les écarts listés « ce qui reste accepté » ci-dessus
  sont reportés tels quels.

**Preuves (lot 1, 2026-11-14)** :

- AC1 — `takussan-web/src/components/publication/__tests__/etapes-identiques.tck-2819.test.tsx` : les six étapes d'un
  studio en location au mois, relevées sur `PropertyWizard` (particulier) et `PublierSansCompte`, champs et gestes de
  l'étape (colonne d'aperçu exclue), seule différence nommée : les coordonnées du compte à la finition. Ablation : l'étape
  du prix copiée pour `/publish` (`fraisDAgence` forcé sans compte) → rouge à l'étape 4.
- AC2 — `…/publication/__tests__/brouillon-d-avant.tck-2819.test.tsx` : brouillon local figé (`valeurs` + `photos` au
  format d'IndexedDB) et brouillon serveur (`{ step, data }`) rouvrent au prix, loyer, période, total d'entrée, surface et
  photos (« 2 photos sur 10 », « 1 / 2 ») compris. Ablations : `price` retiré des clés du brouillon local → rouge (local) ;
  `area` perdu à la reprise → rouge (les deux).
- AC3 — balayage a-0 à a-5 × 360 / 390 / 768 / 1024 / 1280 / 1440 sur `/publish` et `/app/properties/new` aux six
  largeurs : `scrollWidth − innerWidth = 0` partout (`innerWidth` relevé), a-4 à 360 : « Continuer » finit à 344 (fiche,
  `produit.releves.balayage`).
- AC4 — « Continuer » 48 px, visible sans défilement à chaque étape sous `lg` (balayage) ; classes épinglées aux deux
  montages par `WizardShell.pied-du-telephone.tck-2819.test.tsx`.

**Preuves (lot 2, 2026-11-14)** :

- Contenu des étapes (premier point du delta, porté sauf ce que nomme « Ce qui reste (suite) ») — prix :
  `…/property-form/__tests__/StepPrix.encadre.tck-2819.test.tsx` (« Loyer » en F CFA, « Par Mois · Semaine · Jour · An »
  en groupe de radios, encadré à compteurs, total, charges) ; photos : `…/__tests__/DepotDePhotos.tck-2819.test.tsx`
  (tuiles, zone, « Couverture », croix de 44 px, plafond) ; bien, caractéristiques et lieu : `StepBien.test`,
  `PropertyWizard.test` (W9 : tuile retenue en anneau `primary`, pastille en encre pleine), `cibles-tactiles.test`
  (compteurs et pastilles à 44 px). AC1 et AC2 restent verts ; AC2 relit en plus les compteurs, les charges, le total
  de l'encadré et la pastille « Mois ».
- Assertions de TCK-633 déplacées de la carte vers l'encadré, sans perte : composantes (« 2 mois d’avance, 1 mois de
  caution, 1 mois de frais d’agence »), total (1 800 000 et 1 585 000 F), note « Montant indicatif… fait foi », purge
  des frais d'un indépendant, hors location mensuelle. La carte garde le total (« À l’entrée : … », mêmes montants).
  Ablations, chacune rouge : composantes retirées, note retirée, charges hors du total, purge des frais retirée,
  plancher zéro du compteur levé ; « Couverture » sur la 2ᵉ vignette.
- Colonne d'aperçu : la carte ne dit plus que « À l’entrée : … » (maquette `CarteApercu`), et ses chiffres
  (« 38 m² ») seulement tant qu'il n'y a pas de prix (`ApercuAnnonce.maquette.tck-2819`) ; le `y` de 104 reste à
  re-relever (case laissée ouverte).
- Fidélité : relevés 390 et 1280 de a-0 à a-5 (fiche, `produit.releves.resultats_lot2`) — les absents baissent sur
  a-0 à a-4, a-5 inchangé (contacts sur place, note de fin) ; a-3 bureau 4,5 → 5,4 % de pixels avec l'encadré complet (9,9 % avant la ligne loyer + fréquence).

- AC3 / AC4 re-mesurés sur le DOM du lot 2 : débord 0 sur a-0 à a-5 aux six largeurs, « Continuer » 48 px visible à
  chaque étape (fiche, `resultats_lot2.balayage`) ; `/app/properties/new` balayé à l'étape 1 seule.

**Ce qui reste (suite, ticket à écrire)** : « Contacts sur place » et la note « C’est tout pour l’annonce » (composant
partagé avec la fiche du bien), la phrase des CGU sous « Publier l’annonce » au téléphone, le repli de l'encadré du
coût d'entrée, le `y` de 104 de la colonne collante à re-relever, AC-F1 à AC-F6 (écarts ouverts de la fiche).

**Ce qui restait (lot 2)** : le contenu des six étapes (premier point du delta, encore ouvert), dont dépendent le `y` de 104
de la colonne collante (deuxième point : la carte et « Pour publier » sont livrés, le `y` suit les étapes), la phrase des
CGU sous « Publier l’annonce » au téléphone, la réduction du coût d'entrée de l'aperçu à « À l’entrée : … » (décision du 2026-11-14 : composantes et note restent sous la carte jusqu'à ce que l'encadré de l'étape du prix les porte ; les assertions de TCK-633 y suivront) et AC-F1 à AC-F6 (écarts ouverts nommés dans la fiche `TCK-2819.json`).

## Hors périmètre

- Le cadre d'entrée de `/publish` (TCK-2600) et la feuille de compte (TCK-2601).
- Le découpage de l'espace `property` du dictionnaire servi à `/publish` (TCK-2771).
- Le titre de la barre « Publier votre bien » et son interligne (`CoqueDEntree`, TCK-2598).

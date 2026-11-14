---
id: TCK-2600
title: "Publier sans compte : l'anonyme remplit toute l'annonce, gardée dans son navigateur"
status: todo
phase: P1
family: front
estimate: L
wave: 86
created: 2026-11-10
updated: 2026-11-13
depends_on: [TCK-2598, TCK-2599, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2601, TCK-2603]
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#3-property"
tags: [front, publish, acquisition, mobile, audit-ux, app]
---

## Objectif utilisateur

Le propriétaire qui touche « Publier » sans compte commence son annonce tout de suite et la remplit jusqu'au bout — le bien, le lieu, les caractéristiques, le prix, les photos, le titre — sans donner son numéro avant d'avoir vu ce qu'on lui demande.

## Contrat de données

Re-mesure sur `dev` (1bce3798a) :

- `/publish` (`app/publish/page.tsx`) n'a pas de formulaire : un anonyme y est renvoyé vers `/auth/login?redirect=/publish` (`usePublishIntent`, statut `anonymous`).
- L'assistant (`PropertyWizard`) n'est monté que sous `/app/properties/new`, gardé par le proxy ; son brouillon est **serveur seulement** (`useWizardDraft('property-create-wizard')` → `/api/me/wizard-drafts`, sous session). Aucun brouillon anonyme n'existe.
- Ce que l'assistant lit et qui est déjà public : `/api/public/geo/regions|cities|neighborhoods`, `/api/public/amenities` (mêmes identifiants que les équipements de la page connectée, `TagType::Amenity` approuvés). Ce qui ne l'est pas : `POST /api/geo/resolve-link` → TCK-2599.
- Aucune écriture n'a lieu dans ce ticket : la création du bien, l'envoi des photos, des équipements et des contacts, et la publication restent ceux d'aujourd'hui, déclenchés par TCK-2601.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-publier&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Départ : le bien », « Le lieu », « Les caractéristiques », « Le prix », « Les photos », « Le titre et la finition ». Les notes de maquette en pointillé (champs selon le type et le contrat) décrivent l'existant : elles ne se dessinent pas.
- Départ : « Publiez votre bien gratuitement » et sa ligne « En ligne aujourd'hui · 5 minutes · un code SMS suffit », puis la première question de l'assistant telle quelle (Louer / Vendre, types) ; sous le contenu, « Vous êtes une agence ou un agent ? Créer un compte pro » (vers la porte pro d'TCK-2608) et « Un brouillon vous attend déjà ? Me connecter ». La carte de preuves chiffrées n'est rendue que par TCK-2603.
- **Téléphone (360-390 px)** : un écran par étape, résumé collant en haut (« Studio · En location · Mermoz »), feuille « Aperçu », pied collant Précédent / Continuer (l'existant), avancement dans la barre de la coque (TCK-2598).
- **Bureau (≥ 1280 px)** : colonne de gauche ; à droite, l'aperçu de l'annonce et la liste « Pour publier », qui gagne une ligne « Votre numéro · à la fin » ; la mention « Brouillon gardé dans ce navigateur — il passera dans votre compte au moment de publier ».
- Ton : vouvoiement partout ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10) ; la maquette tutoie, elle n'est pas une référence de ton.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0093](../../../adr/0093-publier-sans-compte-le-brouillon-vit-dans-le-navigateur.md).

Pas de régression — **toutes** les étapes et tous les champs de l'assistant d'aujourd'hui restent, avec leurs conditions (`field-matrix.ts`, `CLES_PAR_ETAPE` de `PropertyWizard.tsx`) :

- Le bien : contrat Louer / Vendre et type (9 + « Plus de types (7) »), aucun des deux pré-sélectionné, « Continuer » inactif tant qu'ils manquent.
- Le lieu : « Utiliser Dakar, Dakar », région, ville requise, quartier libre vérifié ensuite, rue / code postal / pays repliés, « Utiliser ma position actuelle », coller un lien ou une position (TCK-2599), carte et repère ; les champs repliés se redéplient à chaque refus.
- Les caractéristiques selon le type et le contrat (chambres, salles de bain, étage ou nombre de niveaux, parking, année, surface, meublé, état, statut foncier, équipements avec ajout libre).
- Le prix : montant en F CFA, fréquence **Mois / Semaine / Jour / An**, « Disponible à partir du », coût d'entrée (mois d'avance, mois de caution, charges) et son total, seulement pour un loyer au mois ; en vente, le prix seul.
- Les photos : facultatives, prendre une photo ou choisir, limites de format et de poids d'aujourd'hui, première en couverture, retrait.
- Le titre et la finition : titre requis et titre proposé, description, lien de visite virtuelle ou vidéo, contacts sur place (jusqu'à trois).
- Aperçu en direct, « Pour publier » avec l'état de chaque partie, retour à une partie depuis la liste, Entrée qui ne soumet qu'à la dernière étape.
- **Les champs réservés aux agences ne paraissent pas pour l'anonyme mais ne disparaissent pas du produit** : choix et invitation du bailleur (`ChoixDuBailleur`), frais d'agence (`agency_fee_months`), mode proposition du bailleur, note de quota — tous restent servis, inchangés, par `/app/properties/new` à qui y a droit.
- **Le brouillon anonyme vit dans ce navigateur** : valeurs ET photos survivent au rechargement de la page et à la fermeture de l'onglet ; il ne quitte pas l'appareil avant la création du compte (TCK-2601) ; il ne contient aucune donnée sensible (ni code, ni jeton). Un navigateur qui refuse le stockage garde l'annonce le temps de l'onglet et le dit.
- `/app/properties/new` et son brouillon serveur restent tels quels pour l'utilisateur connecté ; un visiteur connecté qui touche « Publier » suit la décision d'aujourd'hui (`usePublishIntent`).
- Libellés neufs en `fr`/`en`/`wo` (`wo` = le français tel quel).

## Delta à produire

- [ ] `/publish` sert l'assistant à l'anonyme (départ + six étapes) au lieu de la redirection vers la connexion.
- [ ] Brouillon local (valeurs, étape, photos) relu à l'ouverture, avec l'annonce de reprise existante.
- [ ] Équipements lus sur `/api/public/amenities` ; position collée par TCK-2599.
- [ ] Liens « Créer un compte pro » et « Me connecter » du départ.
- [ ] Tests : les six étapes et leurs conditions (type × contrat, dont fréquence « An ») ; reprise après rechargement, photos comprises ; aucun appel à `/api/me/*` ni à une server action d'écriture avant TCK-2601 ; champs d'agence absents pour l'anonyme et présents pour un agent d'agence `standard` sur `/app/properties/new`.

## Critères d'acceptation

- [ ] AC1 — Anonyme, `/publish` affiche « Publiez votre bien gratuitement » sans redirection (statut 200, aucune navigation vers `/auth/login`, vérifié au réseau).
- [ ] AC2 — Après avoir rempli lieu, prix (fréquence « An ») et ajouté 3 photos, un rechargement rouvre à la même étape avec les mêmes valeurs et les 3 photos.
- [ ] AC3 — Pendant tout le parcours anonyme, aucune requête vers `/api/me/*`, `/api/properties*` ni `/api/me/wizard-drafts*` (vérifié au réseau).
- [ ] AC4 — Pour un studio en location au mois, l'étape caractéristiques montre exactement les champs que montre `/app/properties/new` pour le même couple (comparaison des libellés rendus).
- [ ] AC5 — À 390 px, chaque étape garde son bouton « Continuer » visible sans défilement de la page ; à 1280 px, l'aperçu est à droite et se met à jour à la frappe du prix.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2600.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La feuille de compte, la création du bien et la publication (TCK-2601) ; l'écran « En ligne » (TCK-2602) ; les preuves chiffrées (TCK-2603).
- Publier depuis WhatsApp (approche C, non retenue).

## Notes d'implémentation

### Le cœur (2026-11-13, terrain-9)

- **Un seul assistant.** `PropertyWizard` devient une enveloppe (brouillon serveur, `useWizardDraft`) autour d’`AssistantDePublication`, que `/publish` monte aussi avec un mode `anonyme` : départ, finition et ligne « Votre numéro · à la fin » déclarés par la page, aucune écriture (`onSubmit` remet l’annonce validée, ses photos et les contacts à `surPublier`). AC4 tient par construction, et `caracteristiques-identiques.tck-2600.test.tsx` le garde (libellés ET équipements proposés, studio en location).
- **Le brouillon local** (`src/lib/publication/brouillon-local.ts`, ADR-0093) : IndexedDB `takussan-publication`, une liste FERMÉE de clés de l’annonce (`CLES_DE_L_ANNONCE` : ni frais d’agence, ni identité), 10 photos réduites à l’ajout, purge à 30 jours sans geste ; repli en mémoire (« refus », « quota ») qui emporte ce qui était déjà écrit, dit à l’écran et dans une région `status`. `useBrouillonLocal` a la forme de `useWizardDraft` ; écriture à 400 ms, immédiate en arrière-plan et au démontage.
- **Hydratation** : l’état du stockage part de « dans ce navigateur » — le serveur n’a pas d’IndexedDB ; partir de `brouillon.etat()` rendait le message du repli côté serveur (« Hydration failed », puis « Encountered a script tag » par le re-rendu client). Relevé, corrigé, gardé par `useBrouillonLocal.tck-2600.test.ts`.
- **« Effacer ce brouillon »** se range dans la ligne d’état sous la barre : sous l’assistant, il remontait le pied de 52 px dès la première photo (relevé à 390). Dès 1280 px, il passe dans la barre, après « Brouillon gardé dans ce navigateur » (cadre d’entrée, ci-dessous) : un seul à la fois, inerte sous le verrou du compte (TCK-2601, AC5) où qu’il soit.
- `useResolutionDeLien` : `/api/public/geo/resolve-link` sans compte (TCK-2599), la route sous session sinon.
- **Les contacts sur place ne sont PAS gardés au brouillon** (ADR-0093 : ni numéro, ni nom — ceux d’un tiers moins que tout autre ; décision de la session principale du 2026-11-13) : passés à `surPublier`, perdus au rechargement, et **l’écran le dit** sous leur cadre (« Ces contacts ne sont pas gardés si vous quittez la page », `publishRedirect.sansCompte.finition.contacts`). Deux barrières indépendantes : l’assistant les tient hors du formulaire (état local), et la couche de stockage n’écrit que `CLES_DE_L_ANNONCE`. Le test « sous les contacts sur place » saisit un contact en dernier, ferme la page et relit le stockage : rien. Ablations : la ligne retirée → rouge ; l’assistant qui écrit les contacts au brouillon → vert (la liste fermée les écarte, c’est son rôle) ; les deux à la fois → rouge.
- **Écart à ADR-0093 (« testée sous `fake-indexeddb` ou équivalent »)** : aucune dépendance ajoutée (décision du 2026-11-13). La couche reçoit un **moteur injectable** (`MoteurDeStockage` : lire, écrire, effacer) ; les tests passent `moteurEnMemoire()` ou un moteur qui refuse ou lève `QuotaExceededError`, et IndexedDB réel n’est éprouvé qu’au navigateur (AC2 ci-dessous : étape, valeurs et photos relues après rechargement dans un profil Chrome neuf). C’est « l’équivalent » de l’ADR, avec une limite dite : le code qui parle à `indexedDB` (ouverture, transaction, `onblocked`, `onabort`) n’est exercé par aucun test unitaire.
- Les liens de la page gardent une encre opaque au survol (soulignement `decoration-primary/40` → `decoration-primary`, comme « Utiliser plutôt mon numéro ») : `hover:text-primary/80` faisait rougir `encre-sans-alpha.contraste.test.ts`.

### Relevés navigateur (2026-11-13, profil Chrome neuf, IndexedDB réel, anonyme)

Script : parcours studio · louer · « Utiliser Dakar, Dakar » · 250 000 F « Année » · 3 photos de 10,5 Mo · rechargement · « Précédent ».

- AC1 : `/publish` → 200, aucune redirection, « Publiez votre bien gratuitement ».
- AC2 (390 et 1280) : rechargement → « Ajoutez des photos », « 3 photos sur 10 », annonce de reprise ; au prix, « 250 000 » et « Année ». IndexedDB : étape 4, `rent_period: yearly`, photos réduites de 10,5 Mo à 3,2 Mo, clés de l’annonce seules.
- AC3 : aucune requête vers `/api/me*`, `/api/properties*`, `wizard-drafts` ; aucune requête autre que GET ; lues : `/api/maintenance/status`, `/api/public/amenities`, `/api/public/geo/{regions,cities,neighborhoods}`. Console vide.
- AC5 : à 390, « Continuer » (ou « Publier l’annonce ») de 784 à 828 sur 844 à chaque étape, document sans défilement (0) ; à 1280, l’aperçu est à droite (x 920, 360 px ; colonne jusqu’à 755) et passe de « Prix à venir » au prix à la frappe.
- AC-F6 : débord 0 à 768, 1024, 1280 sur les six étapes.

### Fidélité (2026-11-13, terrain-9)

**Fiche** : [`TCK-2600.json`](../../../qa/audit-ux-2026-11/fidelite/TCK-2600.json) — a-0 à a-5, référence gelée du 2026-11-11, `/publish` sans compte, perturbateurs cumulatifs (Louer, Studio, Dakar, 38 m², 250 000, quatre photos, titre).

**Le cadre d’entrée de bureau** (`cadreDEntree` de `WizardShell`, dès `lg`), d’après le `GabaritBureau` de la maquette :
- une grille centrée de 1 112 px (`max-w-[69.5rem]`, `px-8`, `pt-10 pb-12`) : la question dans une colonne de 560 px (`minmax(0,35rem)` : à 1024, une barre de défilement classique la rétrécirait au lieu de faire déborder la grille — non mesuré), l’aperçu dans une colonne de 400 px, collante à 104 px du haut de la page, DANS la zone défilante ;
- le titre de 32 px, 600, interligne 1,1 (a-0 : 36 px, 1,08, sans surtitre — `accueil`) ; le sous-titre de 15 px serré (a-0 : 17 px) ; le surtitre en 12 px ;
- le pied sur la même grille : progression et gestes sous la question, une note propre à chaque étape sous l’aperçu (`noteDuPied` : départ, lieu, caractéristiques, prix — « Brouillon gardé … », photos, finition — la phrase des conditions en 12 px avec ses deux liens) ; gestes du `BoutonE` (44 px, 15 px à 1,5, 600, ronds, sans filet) ; « Précédent » fantôme décalé de −20, en encre pleine (la maquette l’atténue à 80 % : une encre de texte ne s’atténue pas par l’opacité, TCK-658, `encre-sans-alpha.contraste.test.ts`) ; « Continuer » de 176 px ; « Plus tard » collé à « Continuer » ; pas de « Précédent » sur le départ ;
- `PanneauDeCompte` (TCK-2601) prend la colonne de 560 px : son décalage de +52 px disparaît (fiche TCK-2601 mise à jour).
- **Réservé à `/publish`** : `/app/properties/new` ne monte pas le cadre ; son DOM est celui d’avant (aucune enveloppe — `GrilleDEntree` rend ses enfants tels quels hors du cadre), épinglé par test et ablation.

**Mesure** (`fidelite compare`, `conformes · écarts · absents · % pixels` ; « avant » : les relevés pris avant toute modification, comparés avec la même fiche) :

| Écran | Téléphone 390 | Bureau 1440 | Bureau 1280 |
|---|---|---|---|
| a-0 Départ : le bien | 2 · 38 · 19 · 22,89 % (avant 24,23) | 16 · 54 · 21 · 10,01 % (avant 4 · 60 · 24 · 15,77) | 16 · 54 · 21 · 11,26 % (avant 4 · 60 · 24 · 14,92) |
| a-1 Le lieu | 2 · 21 · 21 · 12,55 % | 18 · 40 · 21 · 8,55 % (avant 4 · 47 · 23 · 14,27) | 18 · 40 · 21 · 9,62 % (avant 4 · 47 · 23 · 13,23) |
| a-2 Les caractéristiques | 2 · 28 · 28 · 14,16 % | 15 · 48 · 26 · 8,05 % (avant 4 · 52 · 28 · 14,96) | 15 · 48 · 26 · 9,06 % (avant 4 · 52 · 28 · 14,01) |
| a-3 Le prix | 2 · 15 · 32 · 12,72 % | 17 · 25 · 37 · 7,29 % (avant 4 · 31 · 39 · 13,65) | 17 · 25 · 37 · 8,2 % (avant 4 · 31 · 39 · 12,6) |
| a-4 Les photos | 2 · 20 · 13 · 33,7 % | 18 · 29 · 16 · 14,55 % (avant 4 · 35 · 19 · 19,18) | 18 · 29 · 16 · 16,37 % (avant 4 · 35 · 19 · 19,93) |
| a-5 Le titre et la finition | 2 · 14 · 15 · 17,62 % | 15 · 37 · 20 · 12,95 % (avant 4 · 38 · 23 · 16,66) | 15 · 37 · 20 · 14,56 % (avant 4 · 38 · 23 · 17,03) |

La couleur de « Précédent » et de « Plus tard » reste comptée en écart (a-1 à a-5) : c’est l’encre pleine, acceptée ci-dessus.

Rideaux : bloc-notes de la session, `impl/lot2/2600f/final3-cmp-a-{0..5}-{bureau-1440,bureau-1280}/rideau.html` (état livré) et `final2-cmp-a-{0..5}-telephone/rideau.html` (sous `lg`, rien n’a changé depuis). Le porteur valide sur le rideau (AC-F5).

- **Le cadre est conforme** : grille, colonnes, titre, sous-titre, surtitre, libellés de l’aperçu, pied (rôle « pied de l’assistant » : boîte, segments, libellés, gestes, note). Les écarts acceptés qui restent sont d’appariement ou de vouvoiement (fiche).
- **Écarts ouverts** (fiche, à trancher) : « Effacer ce brouillon » et la ligne d’état du téléphone, absents de la maquette (proposition : accepter, fonction du ticket) ; **le contenu des six étapes et de la colonne d’aperçu**, composants partagés avec `/app/properties/new` (bureau 1440 : 16 à 47 lignes par écran pour les étapes, 19 à 21 pour l’aperçu) ; le pied du téléphone, celui de `/app` ; « Publier l’annonce » au lieu de « Publier ». Les redessiner change aussi l’assistant connecté, que la maquette ne couvre pas : ticket de suite au périmètre à trancher. C’est l’essentiel des pourcentages restants, et tout le téléphone.
- **AC-F6** (règle de cadence 7 : 360, 1280, et 1024 où la disposition change ; état livré) : document sans défilement, aucune coupe, geste du pied visible, requêtes autres que GET : [] ; dès 1024 les deux colonnes et le pied sur la même grille (à 1024 : 6 px entre elles). À 360, a-4 déborde de 1 px (« Précédent », « Plus tard », « Continuer » côte à côte) : pied de `/app`, classes hors `lg` inchangées, hors de ce ticket. Non mesuré : une barre de défilement classique à 1024 (l'outil masque les barres) — `minmax(0,35rem)` évite le débord, un décalage d'environ 7 px entre corps et pied reste attendu sous Windows.
- **AC5 revérifié** : à 390, « Continuer » visible sans défilement de la page sur les six étapes (y 784, document 0) ; à 1280, l’aperçu à droite (x 767, 400 px) — après la frappe du loyer, la carte y affiche « 250 000 F CFA » (relevé `final3-prod-a-3-bureau-1280.json`, x 781, y 501).
- **Tests** : `WizardShell.cadre-d-entree.tck-2600.test.tsx` (sans cadre : DOM et classes d’avant ; avec : grille, aperçu collant, titres, pied, note, gestes, départ sans « Précédent ») ; `PublierSansCompte.cadre.tck-2600.test.tsx` (notes par étape, liens des conditions ; « Effacer » dans la barre dès 1280, dans la ligne d’état en deçà, jamais deux, inerte sous le verrou) ; `PropertyWizard.panneau.tck-2601.test.tsx` (le mode anonyme monte le cadre, l’accueil, la note de l’étape) ; `PropertyWizard.depuis-publication.tck-2601.test.tsx` (connecté : pas de cadre).
- **Ablations** (18, chacune rouge, fichier restauré, md5 vérifié) : la grille jamais / toujours rendue ; la colonne de la question sans `minmax` ; « Effacer » dans la barre sous 1280, sans contenu, et en double dès 1280 ; la note du prix ; le cadre sur `/app` ; le cadre absent de `/publish` ; l’accueil ; la note non transmise ; « Précédent » au départ ; l’écart de « Plus tard » ; la taille de la phrase des conditions ; la largeur de « Continuer » ; « Revenir à l’annonce » sans son retrait ; la colonne du panneau rendue par sa section, puis retirée de `/app`. Une première ablation d’« Effacer » en double était VERTE : `.not.toBeInTheDocument()` sur un conteneur détaché passe toujours ; l’assertion est passée à `toBeNull()`, l’ablation rejouée rouge.

---
id: TCK-2670
title: "Fiche de l'agence : un sommaire avec sa complétude, une section par écran, une seule barre d'enregistrement"
status: todo
phase: P1
family: front
estimate: L
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2669, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#2-agency"
tags: [front, agency, settings, mobile, audit-ux, app]
---

## Objectif utilisateur

L'admin voit ce qui manque à sa fiche et pourquoi c'est important (factures, paiement hors ligne, fiche publique), corrige un numéro Wave au téléphone en un écran, et n'a qu'un bouton « Enregistrer ».

## Contrat de données

- Agence : `GET` et `PATCH /api/agencies/{agency}` (un seul endpoint pour tous les champs, vitrine comprise : `tagline`, `highlights`, `showcase_property_ids`) ; logo par `POST /api/media` (`collection=logo`) ; confirmation d'un relèvement du seuil `POST /api/agencies/{agency}/payout-threshold/confirm` ; filigranes (existant).
- Numéros des pièces KYC, pour « Reprendre ces deux numéros » : `GET /api/agencies/{agency}/kyc` (`document_number`, TCK-2669).
- Comptes affichés dans « Règles » : biens en attente de validation (compteur du menu, existant) ; membres sans double authentification (liste des membres, existante).
- Aucune complétude n'existe côté API : elle se calcule à l'écran, sur la liste fermée ci-dessous.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-identite-agence&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Sommaire », « Identité et contact », « Fiche publique (à remplir) », « Paiement hors ligne », « Facturation et mentions (à remplir) », « Règles de l'agence », « Menu de l'équipe », téléphone et bureau (les écrans « Vérification », « Offre » et « Passage en pro » sont dans TCK-2671).
- **Téléphone** : en-tête logo, nom, adresse de la fiche publique à copier ; carte « Fiche complète à 60 % · 4 éléments à remplir » dont les deux premiers sont des liens vers leur champ ; une ligne par section, avec un point d'état (incomplet, alerte) : Identité et contact · Fiche publique · Paiement hors ligne · Facturation et mentions légales · Vérification de l'agence · Règles de l'agence · Menu de l'équipe · Offre et passage en pro. Chaque ligne ouvre **un écran court** ; « Enregistrer » collant en bas n'apparaît que lorsqu'un champ a changé ; le retour prévient d'une modification non enregistrée.
- **Bureau (dès `lg`)** : deux colonnes — navigation des sections collante à gauche, avec ses points d'état ; section courante à droite ; jauge dans l'en-tête ; **une seule barre collante** « N modifications · Annuler · Enregistrer » en bas, qui apparaît au premier changement, pour toutes les sections.
- Les aperçus de la maquette : « Ce que voit votre locataire » (paiement hors ligne), « Ce qui s'imprime sur vos factures » (mentions), aperçu de la couverture (fiche publique), « Le menu de vos agents » (menu de l'équipe).
- La section est dans l'URL (`?section=paiement`) : la jauge, la tuile d'un autre écran ou un lien d'aide y mènent directement.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0104](../../../adr/0104-l-identite-legale-de-l-agence-n-a-qu-une-source.md).

Fonctions existantes à garder, toutes (`agency/page.tsx`, `AgencyConfigForm.tsx`, `AgencyPublicProfileCard.tsx`, `RegenerateWatermarksCard.tsx`) :

- **Identité et contact** : nom (obligatoire), identifiant d'URL en lecture seule (montré comme l'adresse de la fiche publique, à copier), numéro de licence, description, e-mail, téléphone, site internet ; logo (aperçu ou initiales, JPG / PNG / WEBP, 2 Mo) ; carte « Régénérer les filigranes » seulement si le filigrane est allumé.
- **Fiche publique** : accroche (120), trois « pourquoi nous » (80), sélection ordonnée de six biens publics et disponibles (recherche titre ou référence, un septième refusé et dit, un bien qui n'est plus en ligne signalé et retirable), aperçu de la couverture, « Voir ma fiche publique » ; réservée à l'admin principal ou à qui tient `agency.update`.
- **Paiement hors ligne** : Wave, Orange Money (normalisés E.164 et réaffichés tels que l'API les rend), coordonnées bancaires (500, compteur) ; un champ ne part que s'il a changé ; vidé, il part `null` (TCK-2536). Pour toute agence, individuelle comprise.
- **Facturation et mentions légales** : TVA par défaut, commission par défaut, devise (exemple de rendu et avertissement de changement), raison sociale, NINEA, RCCM, adresse du siège. **« Reprendre ces deux numéros »** apparaît quand NINEA ou RCCM est vide et que le dossier de vérification les porte : il remplit les champs, les marque modifiés, et **n'enregistre rien** avant « Enregistrer ». Mentions absentes pour une agence individuelle (l'API les refuse).
- **Règles de l'agence** : modération obligatoire (avec « N biens attendent votre validation » vers la file), pénalités de retard encaissées en ligne, seuil d'approbation des reversements avec l'état « relèvement en attente d'un second approbateur » et son bouton « Confirmer », double authentification obligatoire (avec « N membres sur M ne l'ont pas activée » vers l'Équipe).
- **Menu de l'équipe** : les sept modules et leurs aides ; « Onboardings en attente » devient « Entrées à finaliser ».
- L'enregistrement reste sous la double authentification de l'admin (`avecGardeDoubleFacteurAction`) ; les erreurs 422 se posent sur leur champ, même dans une autre section (la section fautive prend un point d'alerte).
- États : sans agence (`EmptyState`), agence illisible (`ErrorState`).
- **Complétude, liste fermée** — agence `standard` : logo, téléphone, e-mail, au moins un moyen hors ligne, raison sociale, NINEA, RCCM, adresse du siège, accroche, au moins une raison « pourquoi nous », au moins un bien en vitrine, vérification à jour ; agence `individual` : la même sans les quatre mentions légales. Le pourcentage est le nombre d'éléments présents sur le total, arrondi à l'entier.
- **Décision 3a (retouche)** : ni horaires, ni zones d'intervention — ils n'existent pas dans le produit.
- Le bouton flottant « Messagerie » ne recouvre pas la barre d'enregistrement au bureau (règle d'une seule couche flottante en bas).
- i18n `fr` / `en` / `wo` (`wo` = texte français), vouvoiement.

## Delta à produire

- [ ] Sommaire et jauge de complétude, téléphone et bureau.
- [ ] Les sections, chacune son écran au téléphone et sa colonne au bureau, avec les champs ci-dessus.
- [ ] Une seule barre d'enregistrement ; garde de sortie (navigation interne et `beforeunload`).
- [ ] « Reprendre ces deux numéros ».
- [ ] Tests : un seul `PATCH` portant exactement les clés modifiées de deux sections ; garde de sortie ; complétude sur la liste fermée (`standard` et `individual`) ; reprise des numéros sans enregistrement ; 422 posé dans la bonne section.

## Critères d'acceptation

- [ ] AC1 — Au bureau, modifier l'accroche puis le numéro Wave affiche « 2 modifications » ; « Enregistrer » envoie **un** `PATCH` dont le corps ne contient que `tagline` et `settings.offline_payment_wave_number` (vu au réseau).
- [ ] AC2 — Au téléphone, après avoir changé le numéro Wave, la flèche de retour ouvre une confirmation ; « Rester » garde la saisie.
- [ ] AC3 — Sur la base de démo (Dakar Immo : NINEA, RCCM, raison sociale, adresse, Wave, Orange Money, banque, accroche, raisons et vitrine vides), la jauge affiche le pourcentage calculé sur la liste fermée, et ses deux premiers liens ouvrent les bons champs.
- [ ] AC4 — Avec un RCCM sur la pièce KYC et un RCCM vide dans les mentions, « Reprendre ces deux numéros » remplit le champ, le marque modifié, et aucune requête ne part avant « Enregistrer ».
- [ ] AC5 — À 390 px, le sommaire (en-tête, jauge, huit lignes) ne défile pas à l'horizontale et chaque ligne mesure au moins 44 px.
- [ ] AC6 — Pour une agence individuelle, la section « Facturation » n'a pas de mentions légales et la jauge ne les compte pas.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2670.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Vérification, offre et passage en pro (TCK-2671).
- La complétude comme étape du « Démarrer » de l'espace (ambition de l'audit).
- La fiche publique éditée en place (approche C, non retenue).

## Notes d'implémentation

_(à remplir par implementing-specs)_

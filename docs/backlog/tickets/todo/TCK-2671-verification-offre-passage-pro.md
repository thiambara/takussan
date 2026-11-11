---
id: TCK-2671
title: "Vérification, offre et passage en pro : l'enjeu dit, l'identité reprise, le prix affiché"
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
  models:
    - "docs/models-spec.md#42-kycdossier-"
    - "docs/models-spec.md#49-agencyupgraderequest-"
    - "docs/models-spec.md#43-plan-"
    - "docs/models-spec.md#44-agencysubscription-"
tags: [front, agency, kyc, upgrade, billing, audit-ux, app]
---

## Objectif utilisateur

L'admin sait ce que la vérification bloque et la renouvelle sans être arrêté par un bouton grisé ; l'agence pro voit ce qu'elle paie et ce qu'elle consomme ; l'hôte voit le prix avant de donner son RIB, et renvoie une demande refusée sans tout retaper.

## Contrat de données

- Vérification : `GET /api/agencies/{agency}/kyc`, `POST …/kyc/documents` (`document_number` pour RCCM et NINEA, remplacement d'une pièce qui expire : TCK-2669), `POST …/kyc/submit`.
- Mentions légales (source unique, pour préremplir) : `GET /api/agencies/{agency}`.
- Offre : `GET /api/me/subscription` (plan, prix `monthly_price_xof`, commission, limites, dérogations), `GET /api/me/quota` (biens et agents utilisés, TCK-2669).
- Passage en pro : `GET|POST|DELETE /api/agencies/{agency}/upgrade-requests` (`resubmit_of`, TCK-2669), `GET /api/me/upgrade-offer` (prix de l'offre, TCK-2669).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-identite-agence&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Vérification », « Offre (agence déjà pro) » et « Passage en pro (hôte) », téléphone et bureau.
- **Vérification de l'agence** (titre unique, plus « Dossier KYC ») : **un état, une phrase, une action** — à fournir · en cours d'examen · vérifiée (badge, prochaine échéance) · refusée (motif et « Corriger ») · à renouveler (la pièce, la conséquence : « vos reversements Takussan sont suspendus et le badge « Agence vérifiée » ne s'affiche plus »). Pièces : RCCM et NINEA avec leur numéro (« sert aussi à vos mentions légales »), pièce du dirigeant avec sa date d'expiration. Au téléphone, « Prendre en photo » à côté de « Choisir un fichier ». Les dates passent dans un « Historique » replié. Encart « Ce que la vérification vous apporte ».
- **Offre (agence pro)** : « Votre agence est déjà professionnelle » ; carte de l'offre — prix mensuel en F CFA, commission sur les paiements en ligne, jauges « Biens en ligne 67 / 100 », « Agents 9 / 15 » ; lien « Abonnement et factures ». La page Abonnement (`/app/agency/billing`) reçoit le même bloc prix et jauges en tête.
- **Passage en pro (hôte)** : état de la dernière demande en tête (en cours : soumise le, « Révoquer » ; refusée : le motif, « remplacez la pièce, le reste est conservé ») ; « Pourquoi passer en pro ? » avec le prix ; formulaire prérempli (raison sociale, RCCM, NINEA « repris de votre vérification », RIB professionnel, adresse fiscale, nombre d'agents) ; statuts en photo ou en fichier ; « Envoyer la demande ». Au bureau, deux colonnes dès `lg` : le formulaire, et le récapitulatif « ce que vous obtenez · ce que ça coûte » qui reste visible.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0104](../../../adr/0104-l-identite-legale-de-l-agence-n-a-qu-une-source.md).

Fonctions existantes à garder (`kyc/page.tsx`, `AgencyKycClient.tsx`, `kyc-components.tsx`, `KycUploader.tsx`, `KycEcheance.tsx`, `SharedIdentifiersNotice.tsx`, `billing/page.tsx`, `SubscriptionSummary.tsx`, `AgencyPayoutsClient.tsx`, `upgrade/layout.tsx`, `upgrade/page.tsx`, `ProUpgradeCard.tsx`) :

- Vérification : statut, échéance, dates, motif de refus, pièces avec lien vers le fichier, date d'expiration exigée pour la pièce du dirigeant, « Soumettre le dossier », avis d'identifiants partagés, verrou d'un dossier vérifié **tel que l'API le juge** (le remplacement d'une pièce qui expire est permis, TCK-2669), texte sans agence.
- **Jamais un bouton désactivé sans sa raison écrite à côté.**
- Abonnement : plan, statut, période, commission, limites (« Illimité »), dérogations ; reversements plateforme (liste et état vide) ; agence individuelle : reversements seuls.
- Passage en pro : accès réservé à l'admin d'une agence `individual` (une `standard` lit « déjà professionnelle », un autre profil renvoyé vers `/app`) ; carte « Passer en pro » / « Demande en cours » de la barre latérale ; brouillon conservé ; révocation confirmée ; échec de lecture = état d'erreur, jamais le formulaire vide.
- **Décision 14** : le prix s'affiche en F CFA, lu de l'API (`monthly_price_xof`), jamais écrit dans le code. Aucune phrase que le produit ne tient pas (« sans engagement », « le premier mois n'est facturé qu'après l'acceptation ») tant que TCK-2681 (l'approbation pose l'abonnement, décidé par le porteur le 2026-11-10) n'est pas livré ; ensuite, l'écran peut dire « Votre abonnement commence à l'approbation ».
- Les succursales : leur limite seule, sans jauge (aucun compte n'existe) — **décidé par le porteur le 2026-11-10** (point 13 a).
- Vocabulaire unifié : « RCCM » partout (plus « Numéro RC »), « Vérification de l'agence » partout (menu, palette, assistant compris si ce ticket les touche ; sinon renvoi à la famille 3).
- Messages d'échec précis (plus « Une erreur est survenue ») ; libellé accessible sans « upgrade ».
- i18n `fr` / `en` / `wo` (`wo` = texte français), vouvoiement.

## Delta à produire

- [ ] Vérification refaite (états, pièces avec numéros, renouvellement, photo, historique).
- [ ] Section « Offre » de la fiche et bloc prix + jauges en tête de l'Abonnement.
- [ ] Passage en pro : prix, préremplissage depuis les mentions et la vérification, reprise d'une demande refusée (`resubmit_of`), statuts en photo.
- [ ] Tests : renouvellement permis sur un dossier vérifié qui expire ; aucun bouton désactivé sans raison ; prix lu de l'API ; reprise d'une demande refusée sans NINEA ni RIB ressaisis ; accès hôte / pro / autre profil.

## Critères d'acceptation

- [ ] AC1 — Dossier vérifié dont la pièce du dirigeant expire dans 20 jours : « Remplacer la pièce d'identité » est actif et l'envoi aboutit (200 vu au réseau).
- [ ] AC2 — Sur la page de vérification, chaque bouton `disabled` porte un `aria-describedby` vers un texte visible qui dit pourquoi.
- [ ] AC3 — Avec un plan à 65 000 en base, l'hôte lit « 65 000 F CFA / mois » sur le passage en pro et la page Abonnement aussi ; aucun « 50 000 » n'est écrit dans le code (recherche dans le diff).
- [ ] AC4 — Demande refusée : le motif est le premier bloc ; le formulaire est prérempli ; l'envoi part avec `resubmit_of` et sans `ninea` ni `rib_pro` dans le corps (vu au réseau).
- [ ] AC5 — La page Abonnement affiche « Biens en ligne {used} / {limit} » et « Agents {used} / {limit} » égaux à `GET /api/me/quota`.
- [ ] AC6 — À 360 px, « Prendre en photo » et « Choisir un fichier » mesurent au moins 44 px et tiennent côte à côte sans débordement.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2671.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Le dossier en étapes (approche B) et la comparaison des offres.
- Poser un abonnement à l'approbation (décision produit).
- Le menu de bureau et ses libellés (famille 3), sauf ce que ce ticket touche déjà.

## Notes d'implémentation

_(à remplir par implementing-specs)_

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

**Vérification de l'agence** (`/app/agency/kyc`, `src/components/kyc/VerificationDeLAgence.tsx`, `src/lib/verification-de-l-agence.ts`) : un état (à fournir · prêt · en examen · vérifiée · refusée · à renouveler), une phrase, une action ; pièces avec leur numéro (prérempli des mentions légales, ADR-0104), pièce du dirigeant avec sa date d'expiration, « Prendre en photo » à côté de « Choisir un fichier », historique replié des seules dates que l'API rend. `AgencyKycClient` est retiré.

**Le renouvellement n'a qu'une source** (décision Q4 a du team-lead, 2026-11-12) : `KycWorkflowService::renewalOpensOn()` donne le premier jour où la pièce du dirigeant d'un dossier vérifié se remplace ; `assertNotVerified()` la juge par elle, et `KycDossierResource::renewal` la sert (`{document_type, opens_on}`, `calendarDate`, ADR-0018). Le front ne recopie ni la durée ni la pièce : la constante `FENETRE_DE_RENOUVELLEMENT_JOURS` et son test de parité sont supprimés. Tests : `KycRenewalWhileVerifiedTest` (le jour servi est celui où l'API accepte, la veille `kyc.locked` ; échéance en cours de journée ; `null` sans vérification ou sans échéance), ablation rouge.

**Offre** : `BlocDeLOffre` (prix `monthly_price_xof` en F CFA « / mois », commission, jauges « {used} sur {limit} » ou « Illimité », succursales par leur limite seule — décision 13 a) en tête de l'Abonnement et dans l'écran « déjà professionnelle » (`OffreDeLAgencePro`, avec « Abonnement et factures » et ce que le passage a ouvert). Un abonnement illisible se dit à sa place.

**Passage en pro** (hôte) : état de la dernière demande d'abord (motif d'un refus, révocation confirmée), « Pourquoi passer en pro ? » avec le prix lu de `GET /api/me/upgrade-offer` (décision 14 ; aucun « 50 000 » dans le diff, vérifié par recherche), formulaire prérempli des mentions légales ; une demande refusée se reprend (`resubmit_of`) sans ressaisir NINEA ni RIB (« Conservé… », clés absentes du corps, ADR-0104 § 5) ; statuts en photo ou en fichier ; une liste illisible est un état d'erreur, jamais le formulaire vide.

**Le cadre de la fiche** : la vérification et l'offre sont des pages, posées dans le cadre de la fiche de l'agence (`CadreDeLaFiche` : tête « Mon agence », jauge, navigation des sections ; au téléphone, l'écran de la section et son retour au sommaire). Hors de la fiche, un lien de section mène à `/app/agency?section=…`. La ligne « Offre » de la fiche mène à `/app/settings/agency/upgrade` pour toute agence (elle menait à l'Abonnement pour une agence `standard`) ; pour une agence individuelle, elle s'appelle « Passage en pro ».

**Les boutons de la pièce à 360 px** (AC6) : mesurés par CDP, « Prendre en photo » et « Choisir un fichier » faisaient 143 px chacun et leurs libellés étaient tronqués à 320 et 360 px. Ils passent à la ligne (`min-h-11`, `whitespace-normal`) : 143 × 45 px à 360, entiers, côte à côte, `scrollWidth − innerWidth = 0` ; 158 × 44 px à 390.

**La jauge** suit les maquettes : présente sur l'offre d'une agence déjà professionnelle (a-8), absente de la vérification (a-5) et du passage en pro de l'hôte (a-9) — `CadreDeLaFiche` prend `jauge`, faux par défaut.

**Fidélité** (`docs/qa/audit-ux-2026-11/fidelite/TCK-2671.json`, rideaux sous `takussan-web/.fidelite/TCK-2671/cmp-v4-a{5,9}-…` et `cmp-v2-a8-…`) — conformes · écarts · absents · % pixels :

| Écran | Téléphone 390 | Bureau 1440 | Bureau 1280 |
|---|---|---|---|
| a-5 Vérification (admin) | 26 · 25 · 12 · 8,64 % | 65 · 174 · 32 · 7,04 % | 64 · 173 · 32 · 7,82 % |
| a-8 Offre, agence pro (admin) | 24 · 22 · 6 · 13,66 % | 64 · 178 · 33 · 13,1 % | 13,08 % |
| a-9 Passage en pro (hôte) | 17 · 15 · 23 · 22,74 % | 31 · 128 · 75 · 9,92 % | 31 · 121 · 67 · 10,7 % |

Les écarts restants sont au tableau de la fiche : surtout des données (dossier `pending` au lieu de vérifié-expiré, plan et quota de l'API, « 120 » biens pour 100), et le relevé a-9 fait sur la demande `pending` de la démo — décision du team-lead (2026-11-12) : aucun refus n'est écrit en base, l'état refusé est prouvé par les tests (AC4). Largeurs intermédiaires (AC-F6) : `fidelite balayer --largeurs 360,768,1024` sur la vérification et l'offre (admin, hôte), débord 0 et coupes 0.

**Hors du produit** : aucune phrase que le produit ne tient pas (« sans engagement », « le premier mois… ») ; « Votre abonnement commence à l'approbation » après TCK-2681. Aucune écriture dans la base de démo.

**Défaut de la vérification (2026-11-12) — `/app/agency/billing` rendait une 500 à l'hôte.** MISSING_MESSAGE `nav.sidebar.payouts`. La disposition de l'hôte nomme sa facturation « Reversements » (`libelles: { 'agence-facturation': 'payouts' }`, TCK-2478), et la clé existe sous `nav.admin`, là où le menu la lit (`labelSpace` de la destination). C'est l'en-tête de la coque (`titreDuMenu`, `src/lib/navigation/en-tete-de-la-coque.ts`) qui cherchait tout libellé propre au persona sous `nav.sidebar`. Correctif : l'espace de la destination, comme au menu ; aucune clé ajoutée. Test : `src/lib/navigation/__tests__/en-tete-de-la-coque.libelles-propres.test.ts` (l'hôte lit « Reversements » ; chaque libellé propre de chaque disposition est traduit en fr et en en dans l'espace de sa destination), rouge avant le correctif. Mesuré à la page (hôte, `next dev`) : 500 avec le fichier d'avant remis en place, 200 après, restauré md5 vérifié.

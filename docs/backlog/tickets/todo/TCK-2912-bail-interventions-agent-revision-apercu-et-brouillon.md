---
id: TCK-2912
title: "Baux : « Interventions (3) · 1 en cours », appeler l'agent, révision et préavis sur le dossier ; aperçu du contrat et brouillon enregistré à la création ; « Réviser » qui s'ouvre sur la liste"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2906]
blocks: [TCK-2921]
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
tags: [front, baux, fiche, creation, revision, audit-ux, app]
---

## Objectif utilisateur

Sur le dossier d'un bail, l'agent voit l'intervention en cours, la date de révision, le préavis, et appelle l'agent responsable ; en créant un bail, il relit le contrat avant de l'envoyer et ne perd jamais sa saisie ; il révise un loyer depuis la file sans quitter la liste.

## Contrat de données

- `maintenance_summary`, `next_revision_date`, `notice_period_days` à la création, `agent.phone`, `documents_count` / `history_count`, `POST /api/leases/contract-preview` : TCK-2906.
- Brouillon enregistré : `PUT /api/me/wizard-drafts/{key}` (existant, générique, `routes/api/me.php:79`) — aucun endpoint neuf.
- Révision : `FeuilleDeRevision` et son endpoint existants.
- « Modifier » des réglages de l'agence dans la création : **déjà livré** par TCK-2832 (`CreateLeaseForm.modifier-les-reglages.tck-2832.test.tsx`) — hors de ce ticket.

Audit (`audit-f4-patrimoine.md`, app-baux) :

- **e1** : ligne « Interventions (3) · 1 en cours » (téléphone ET bureau — fiche `TCK-2645.json` a-1) ; Appeler / WhatsApp de l'agent responsable ; « révision possible le … » et « préavis 3 mois » ; comptes des onglets Documents / Historique ; montant dans « Encaisser 1 422 750 F ».
- **e2** : bureau, « Aperçu du contrat » de la colonne de droite (fiche `TCK-2643.json` a-2-bureau) ; lien « Brouillon » d'en-tête (enregistrement automatique).
- **e4** : bureau, panneau latéral au lieu du dialogue centré (décision porteur) ; la feuille s'ouvre sur la fiche (`?geste=reviser`) et non sur la liste.

## Direction UX / Artistique

**Référence de fidélité** : page `app-baux`, approche `a`, fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-baux.tsx` :

- **e1 « Fiche — dossier du bail »** :
  - téléphone et bureau : la ligne de dossier « Interventions (3) — 1 en cours · rideau métallique » (l. 397, l. 509), qui ouvre la liste des interventions filtrée sur le bail ; sous Durée « préavis 3 mois » (l. 332) et « 5ᵉ mois sur 36 · révision possible le 1 juil. 2027 » (l. 335) ; Appeler / WhatsApp sur la ligne de l'agent responsable ; comptes « Documents (n) » et « Historique (n) » dans les onglets ;
  - téléphone : la barre collée « Encaisser 1 422 750 F » (montant dû, l. 526).
- **e2 « Création — étape 3, les conditions »** :
  - téléphone et bureau : « Brouillon » à droite de l'en-tête (l. 632, l. 697) et « brouillon enregistré à 10:42 » sous le titre au bureau (l. 763) ; champ « Préavis » (l. 668, l. 806) ;
  - **bureau** : la carte « Aperçu du contrat » dans la colonne de droite (l. 817), qui se met à jour avec les conditions saisies.
- **e4 « Feuille « Réviser le loyer » »** : le geste « Réviser » de la file ouvre la feuille **sur la liste** (téléphone : feuille du bas ; **bureau : dialogue centré** de la maquette).

## Contraintes strictes (métier)

- La ligne « Interventions » n'est rendue que si le bail en a au moins une ; elle mène à `/app/maintenance?filter[lease_id]=…` (filtre serveur existant).
- Appeler / WhatsApp de l'agent : seulement quand `agent.phone` est servi (personnel de l'agence).
- Le brouillon reprend la saisie au retour sur la page (même clé par bien) et s'efface à la création du bail.
- L'aperçu du contrat ne crée rien (TCK-2906) ; il se rafraîchit au plus une fois par seconde de saisie (pas d'appel par frappe).
- **Le dialogue centré de « Réviser » au bureau renverse une décision du porteur** (panneau latéral) : appliquer la maquette, et le signaler dans la PR.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel.

## Delta à produire

- [ ] Dossier du bail : ligne Interventions, révision, préavis, agent joignable, comptes des onglets, montant dans « Encaisser ».
- [ ] Création : champ Préavis, brouillon enregistré (indicateur « Brouillon » / « enregistré à »), aperçu du contrat au bureau.
- [ ] File des baux : « Réviser » ouvre la feuille sur la liste ; dialogue centré au bureau.
- [ ] Mettre à jour les fiches de fidélité `TCK-2645.json`, `TCK-2643.json` et celle de la révision.
- [ ] Tests : ligne Interventions avec `total: 3, open: 1` → « Interventions (3) » et « 1 en cours » ; absente avec `total: 0` ; Appeler `tel:` ; « Encaisser 1 422 750 F » ; brouillon écrit puis relu ; aperçu appelé avec les conditions ; « Réviser » sans navigation.

## Critères d'acceptation

- [ ] AC1 — Le dossier d'un bail avec `maintenance_summary = {total: 3, open: 1, latest_open: {title: "Rideau métallique"}}` rend « Interventions (3) » et « 1 en cours · Rideau métallique » à 390 et à 1440 ; la ligne mène à la liste filtrée `lease_id`.
- [ ] AC2 — Le dossier rend « préavis 3 mois » pour `notice_period_days = 90` et « révision possible le 1 juil. 2027 » pour `next_revision_date = 2027-07-01`.
- [ ] AC3 — La ligne de l'agent responsable porte « Appeler » (`tel:`) et « WhatsApp » quand `agent.phone` est servi, rien sinon.
- [ ] AC4 — Les onglets rendent « Documents (n) » et « Historique (n) » depuis `documents_count` / `history_count`.
- [ ] AC5 — À 390, la barre collée rend « Encaisser 1 422 750 F » quand le montant dû est 1 422 750.
- [ ] AC6 — En création, saisir un loyer puis recharger la page restitue la saisie ; l'en-tête affiche l'heure du dernier enregistrement ; créer le bail efface le brouillon.
- [ ] AC7 — À 1440, la colonne de droite de l'étape 3 rend « Aperçu du contrat » ; changer le loyer rappelle `POST /api/leases/contract-preview` (au plus une fois par seconde) et l'aperçu montre le nouveau loyer.
- [ ] AC8 — Le champ « Préavis » de l'étape 3 envoie `notice_period_days` à la création.
- [ ] AC9 — Toucher « Réviser » sur une ligne de la file ouvre la feuille de révision sans changer d'URL de page ; à 1440 la feuille est un dialogue centré.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)) — fiches : `docs/qa/audit-ux-2026-11/fidelite/TCK-2645.json`, `TCK-2643.json` et la fiche de la révision :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2645.json`, `TCK-2643.json` et la fiche de la révision liste chaque écran de maquette implémenté par ce ticket (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés ; les écarts que ce ticket lève en sont retirés.
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'ADR-0106 § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif (une des trois exceptions d'ADR-0106 § 2, ou une donnée).
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une, sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- « Modifier » les réglages de l'agence (TCK-2832, livré).
- L'étape 4 (conforme).

## Notes d'implémentation

2026-11-15 — implémenté (agent délégué, vague 92, worktree `feat/audit-manques-2026-11-15`). Aucune mesure au
navigateur (consigne du lot) : AC-F2 à AC-F6 **non mesurés** ; fidélité jugée à la lecture de la maquette.

**Prémisses re-mesurées — ce qui différait**
- AC3 était déjà livré : `Partie` rend Appeler / WhatsApp dès que `agent.phone` est servi (TCK-2906 le sert au
  personnel). Seul le test manquait (ajouté) ; l'écart accepté « agent responsable » de `TCK-2645.json` est retiré.
- La liste des interventions de l'agence (`InterventionsDeLAgence`, zone de TCK-2918) ne lit PAS
  `filter[lease_id]` dans l'adresse (seulement `bien`, `q`, `priorite`, `metier`, `status`, `vue`) ; l'API, elle,
  filtre `lease_id`. La ligne mène à `/app/maintenance?filter[lease_id]=…` comme le ticket le fixe : la liste
  s'ouvre NON filtrée tant que TCK-2918 ne lit pas ce paramètre (reste, fichier tenu par un agent en cours).
- « Encaisser 1 422 750 F » est, dans la maquette, le bouton de la carte « Actions » du bureau ; le téléphone
  n'y montre pas de montant. Le geste principal est UN composant (barre collée ET carte) : le montant est dit aux deux.
- `useReviewLeaseRent` n'invalidait pas `['leases','summary']` (comptes des onglets de la file) : ajouté.

**Décisions mineures (tranchées ici)**
- Montant de « Encaisser » = `remaining_amount + late_fee_outstanding` de l'échéance visée (`totalDuDeLEcheance`,
  la somme que la carte Loyer dit « total ») ; sans échéance visée, « Encaisser » seul. Le dialogue d'encaissement
  n'est pas touché.
- Préavis : en mois quand les jours en font un multiple de 30 (« préavis 3 mois »), en jours sinon. Révision :
  « révision possible le … » à venir, « révision possible depuis le … » passée ; rien sans date (TCK-2906 la tait
  hors bail actif). Ligne Interventions : rendue dès `total > 0`, « n en cours · <titre> », ou « Aucune en
  cours » ; l'état de la dernière (« devis attendu ») n'est pas écrit (libellés dans l'espace `maintenance`).
- Onglets : le compte en 12 px à côté du nom (maquette `OngletsSoulignes`), nom accessible « Documents (6) » ;
  rien sans compte servi.
- Brouillon : clé dérivée de l'adresse seule (`lease-new[.booking-n][.property-n][.customer-n]`) ; ne garde que
  les champs SAISIS (`dirtyFields`) et l'étape — un formulaire seulement prérempli n'écrit rien (TCK-566) ; repris
  `shouldDirty` (les défauts du bien arrivés ensuite ne le réécrivent pas) ; effacé dès que `POST /api/leases`
  réussit (aussi quand la signature échoue ensuite). « Brouillon » (téléphone) et « brouillon enregistré à HH:MM »
  (bureau, `SuiviDuBrouillon` relie l'en-tête serveur au formulaire) ne s'affichent qu'après un enregistrement.
  Clé hors des règles du bandeau de reprise (`lib/wizard-drafts.ts`) : pas de lien de reprise depuis l'accueil.
- Aperçu : le PDF de l'API dans un cadre (`<iframe>` d'un `blob:`) + « Voir le contrat en entier » ; aucun article
  recomposé côté front. Demandé 1 s après la dernière saisie, jamais deux fois le même corps, au bureau seulement
  (`useMatchesMedia`), et seulement quand bien, locataire, début et loyer/prix sont saisis (pas de `safeParse` du
  schéma : la garde `traducteurs-de-messages` l'interdit sans traduction) ; un 429 / réseau garde l'aperçu d'avant.
- Préavis à la création : champ en jours (1-365, schéma + `CreateLeasePayload`), prérempli par
  `defaults.notice_period_days` (« Réglage de la plateforme »), équivalent « 3 mois » dessous ; ôté d'une vente
  (`TERMES_DE_LOCATION`) ; ligne « Préavis » au récapitulatif « Vérifier » du téléphone.
- « Réviser » de la file : la feuille s'ouvre sur la liste ; le bail se lit au toucher comme la fiche le lit
  (`useLease(id, { avecLocataire })`, même clé de cache) avec ses échéances, et se juge comme la fiche
  (`gestesSecondaires`) ; refusé ou illisible → la fiche (`?geste=reviser`), qui le dit.
- ⚠ **Dialogue centré au bureau** : `FeuilleDuBas` reçoit `bureau="dialogue"` (opt-in, 520 px, défaut `panneau`
  inchangé) ; `FeuilleDeRevision` l'emploie, sur la fiche comme sur la liste. **Renverse, pour cette feuille, la
  décision du porteur du 2026-11-11 (panneau latéral)** : à signaler dans la PR.

**Mesures** — tests neufs : `LeaseDetail.dossier.tck-2912` (12), `CreateLeaseForm.brouillon-et-apercu.tck-2912`
(8), `liste-des-baux.tck-2644` (+2, « Réviser » : le cas `rent_review_open` du `it.each` « vers la fiche » retiré) ;
`LeaseDetail.fiche.tck-2645` : « Encaisser » visé par son `data-testid` (il nomme le montant). 16 ablations une à
une, toutes rouges, restaurées au md5. Joués verts : tous les tests de `components/leases/**`, les primitives
`ui` (TCK-2688, TCK-2690), `show-sans-fields.garde`, `fields-demandables.tck-1184`, `ressource-de-detail.partage`,
`traducteurs-de-messages`, `new/__tests__/page.tck-2643` ; ESLint, `tsc --noEmit`, `check:i18n`,
`check:i18n-namespaces`, `check:classes-emises`, `check:vouvoiement`, gardes racine `scripts/check-*.mjs` : verts.
Fiches de fidélité : `TCK-2645.json` (7 écarts retirés, 3 posés), `TCK-2643.json` (3 retirés, alias « Préavis »
retiré, 3 posés). La fiche de la révision est l'écran a-4 de `TCK-2645.json`.

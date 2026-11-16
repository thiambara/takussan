---
id: TCK-2876
title: "Réservations, offre : « Contre-proposer » (barre, en-tête, carte Décision), financement, délai de signature, conditions, et « · N visites · première offre reçue »"
status: done
phase: P1
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2870, TCK-2873]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
tags: [front, bookings, offre, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Devant une offre d'achat, l'agent voit comment l'acheteur paie, en combien de temps il signe et sous quelles conditions, et peut répondre par un autre prix au lieu de refuser.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-reservations e4). Données et route : TCK-2870 (financement, délai, conditions), TCK-2873 (contre-offre), [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 1 et 5.

## Contrat de données

- `GET /api/bookings/{booking}` : `financing`, `signature_within_days`, `conditions`, `counter_offer`, `awaiting`, `property_visits_count`, `offer_rank` (TCK-2870, TCK-2873).
- `POST /api/bookings/{booking}/counter-offers` (TCK-2873).

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-reservations`, approche **a**, écran **e4 Offre** — fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-reservations-a.tsx` (l. 128-134 Quoi de l'offre ; l. 518 barre du téléphone ; l. 980, 1018 en-tête et carte Décision du bureau).

- **Téléphone (390)** — manque : « Contre-proposer » dans la barre collante (avec Refuser / Accepter) ; dans Quoi, « Financement », « Délai de signature », « Conditions » ; après « En vente depuis N jours », « · N visites · première offre reçue ».
- **Bureau (1440)** — manque : « Contre-proposer » dans l'en-tête et comme 3ᵉ bouton de la carte « Décision » ; les mêmes lignes du Quoi.
- La feuille « Contre-proposer » n'est pas dessinée : elle reprend la grammaire des feuilles de la fiche (feuille du bas au téléphone, panneau droit dès `xl`) — montant (prérempli du prix affiché), message facultatif, validité (défaut 3 jours), bouton « Contre-proposer {montant} ». Une contre-offre en cours se lit en tête du Quoi (« Contre-offre de 90 000 000 F envoyée · en attente de {prénom} jusqu'au … ») et remplace « Contre-proposer » par « Modifier la contre-offre ».

## Contraintes strictes (métier)

- [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 5 ; « Contre-proposer » n'existe que sur une offre `pending`, sous la capacité qui permet Accepter.
- « · N visites » = `property_visits_count` (visites du bien, tous visiteurs) ; « première offre reçue » quand `offer_rank = 1`, sinon « {rang}ᵉ offre reçue ».
- i18n `fr`/`en`/`wo` ; libellés du financement par code (`cash` → « Comptant », `mortgage` → « Crédit immobilier », `mixed` → « Apport et crédit »).

## Delta à produire

- [ ] Lignes Financement / Délai de signature / Conditions.
- [ ] Geste « Contre-proposer » (barre, en-tête, carte Décision) et sa feuille.
- [ ] État « contre-offre en cours » en tête du Quoi et dans l'historique.
- [ ] Complément « · N visites · première offre reçue ».
- [ ] Tests de composant : présence du geste sur une offre `pending`, absence sur une candidature ; envoi du montant ; état en cours ; libellé du financement.

## Critères d'acceptation

- [ ] AC1 — À 390, une offre `pending` montre « Contre-proposer » entre Refuser et Accepter ; une candidature ne le montre pas.
- [ ] AC2 — Contre-proposer 90 000 000 F appelle la route avec ce montant ; la fiche montre ensuite « Contre-offre de 90 000 000 F envoyée » et « en attente de {prénom} ».
- [ ] AC3 — Une offre `financing = cash`, `signature_within_days = 30`, `conditions = "Aucune"` montre « Financement Comptant », « Délai de signature 30 jours », « Conditions Aucune ».
- [ ] AC4 — À 1440, la carte « Décision » de l'offre a trois boutons : Refuser, Contre-proposer, Accepter {montant}.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2876.json` : écran e4 de `app-reservations` (a), téléphone et bureau.
- [ ] AC-F2 — `fidelite compare` à 390 × 844 et 1440 × 900 sans écart non expliqué ; la feuille de contre-offre, non dessinée, est déclarée « hors maquette » avec son motif.

## Hors périmètre

- La réponse du client à la contre-offre (TCK-2879).

## Notes d'implémentation

**2026-11-15 — implémentation (agent délégué, vague 92).** Front seul : l'API (TCK-2870, 2873, 2874) était commitée.

Livré :
- `types/booking.ts` (bloc TCK-2876) : `counter_offer` (`BookingCounterOffer`), `awaiting`, `source` (`BookingSource`), `stage_change` (`BookingStageChange`), `financing` resserré sur `OfferFinancing` ; union `CounterOfferStatus`.
- `lib/queries/booking-counter-offer.ts` : `useContreProposer` → `POST /api/bookings/{id}/counter-offers` (`amount`, `message?`, `valid_until`), relit la fiche et la liste. Hors de `bookings.ts` : les 15 tests de la fiche mockent ce module-là en fabrique fermée.
- `feuilles/FeuilleDeContreOffre.tsx` (non dessinée) : feuille du bas / panneau dès `xl`, montant prérempli du prix affiché (ou de la contre-offre ouverte qu'on modifie), validité 3 · 7 · 15 · 30 jours (3 par défaut, envoyée comme JOUR de Dakar, `decalerJour`), message facultatif (≤ 500), « Contre-proposer {montant} » ; l'erreur de l'API (prose localisée de `booking.counter_offer_*`) reste dans la feuille. Montée seulement ouverte (elle porte sa mutation).
- `detail/contre-offre.tsx` : la contre-offre « en cours » (`counter_offer.status = pending` ET `awaiting = customer` ET réservation `pending`) en tête du Quoi, téléphone et bureau (« Contre-offre de 90 000 000 F envoyée · en attente d'Ibrahima jusqu'au dim. 15 nov. ») ; l'historique (envoi, puis acceptée / déclinée à `responded_at`, ou expirée au soir de `valid_until`) ; les libellés du financement par code.
- Fiche : « Contre-proposer » / « Modifier la contre-offre » dans la barre du téléphone (Refuser et Accepter à la largeur de leur libellé, le geste du milieu prend le reste), dans l'en-tête du bureau, et 3ᵉ bouton de la carte « Décision » (ordre de la maquette : Accepter {montant}, Contre-proposer, Refuser) ; Quoi : Financement, Délai de signature, Conditions avant « Valable jusqu'au » ; « En vente depuis 47 jours · 6 visites · première offre reçue. » (`offre.enVenteDepuis` perd son point, recomposé par `offre.faits` ; un fait non servi se tait).
- `customer-timeline.ts` : jalon `counter_offer` et sa `counter_offer {id, amount (chaîne), valid_until, status}`. `lib/crm/fil-du-client.ts` : `cleDeLEntree` (type, id, jalon, id de contre-offre), utilisée par le rendu de `FilDuClient` ET par la fusion des pages.

Écarts à la prémisse / choix :
- **Défaut voisin corrigé** : `entreesDesPages` dédoublonnait sur `type:id` (+ jalon pour les seules visites) — l'acceptation d'une réservation (même id que son dépôt) et la seconde contre-offre d'une réservation étaient SUPPRIMÉES du fil, pas seulement mal clées. Même clé que le rendu désormais.
- « Contre-proposer » est gardé par `canConfirm` ET `personnel` (personnel actif de l'agence) : `BookingPolicy::proposeCounterOffer` refuse le bailleur, que `canConfirm` admet. Jamais au client.
- L'état en cours et l'historique de la contre-offre ne sont montrés qu'au personnel : la vue du client est TCK-2879.
- L'API ne sert que la DERNIÈRE contre-offre : l'historique de la fiche ne relit pas une contre-offre remplacée (le fil de la fiche client, lui, en a une entrée par contre-offre).
- Gardes : `CounterOfferStatus` passe de `SANS_UNION` / `SANS_LIBELLE` à `CORRESPONDANCES` (`types/booking.ts`) et `LIBELLES` (`bookings.fiche.contreOffre.statut`, lu par `detail/contre-offre.tsx`).
- Test périmé mis à jour : `BookingDetail.trois-natures.tck-2594` (la barre d'une offre a désormais trois gestes).
- Bloc Qui (`detail/pieces-du-detail.tsx`, bloc TCK-2876) : le fait « Achat comptant » / « Achat à crédit » / « Apport et crédit » d'une offre (maquette e4). La phrase « Sam. 31 oct. sur place, puis jeu. 5 nov. en visite virtuelle » reste écart de donnée (`last_visit_on_property` ne sert que la dernière visite).
- Au téléphone, « Modifier la contre-offre » dit « Modifier » dans la barre (trois gestes dans ~340 px) ; le nom accessible garde le libellé entier.
- Le montant prérempli est le « Prix affiché » de la comparaison (`list_price_at_booking`), à défaut le prix du bien.
- Non changé : la route `counter-offers` n'a pas le middleware `idempotent` (comme `confirm` / `reject`) ; le double envoi est tenu par la feuille (bouton désactivé pendant l'envoi).

Tests : `BookingDetail.offre.tck-2876` (14 : AC1 ×2, bailleur/client/acceptée, AC4, AC3, financement par code, faits et rang, AC2 envoi, AC2 état en cours, modifier, « Modifier » au téléphone, « Achat comptant », déclinée, client), `booking-counter-offer.tck-2876` (1, la route réelle), `FilDuClient.cles.tck-2876` (2). Treize ablations une à une, toutes rouges puis restaurées (md5) : geste de la barre, garde du personnel, lignes du Quoi, validité envoyée, « en cours » sans état, rang, tête du Quoi au bureau, historique montré au client, bouton de la carte Décision, clé du rendu, clé de la fusion des pages, libellé court de la barre, fait « Achat comptant ». 40 fichiers de test du domaine verts (293). `tsc`, ESLint, `check:i18n`, `check:i18n-namespaces`, `check:classes-emises`, `check:vouvoiement`, toutes les `scripts/check-*.mjs` (racine et front) vertes.

Fidélité : fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2876.json` (feuille et état en cours déclarés « hors maquette ») ; AC-F2 non mesuré (pas de navigateur dans ce lot).

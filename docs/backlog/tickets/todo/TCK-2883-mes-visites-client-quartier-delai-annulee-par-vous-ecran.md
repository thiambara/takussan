---
id: TCK-2883
title: "Visites, côté client et confirmation : le quartier dès la demande, « L'agence vous répond d'ordinaire en N h », « Annulée par vous », et « prévenu par SMS et par e-mail » à la confirmation"
status: todo
phase: P1
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2871]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
tags: [front, visits, client, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Le client sait où il ira (le quartier) dès qu'il demande une visite, combien de temps l'agence met d'ordinaire à répondre, et distingue ce qu'il a annulé lui-même ; l'agent qui planifie lit par quels canaux le client a été prévenu.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-visites e6 et e7). Trois éléments de e7 avaient été « acceptés » faute de donnée (quartier, délai de réponse, « Annulée par vous ») ; e6 dit « par SMS et par e-mail » là où le produit dit « Un SMS a prévenu ». Les données arrivent par TCK-2871.

## Contrat de données

- `GET /api/property-visits` (client) : `neighborhood`, `cancelled_by` (TCK-2871).
- `GET /api/agencies/{agency}/response-time` (TCK-2871) — 204 sous le seuil.
- `POST /api/property-visits` : `notification.channels` (TCK-2871).

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-visites`, approche **a** — fichiers `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-visites-a.tsx` et `app-visites-a-mobile.tsx`, `app-visites-blocs.tsx` ; écrans **e6 Planifier — confirmée** et **e7 Côté client** ; téléphone et bureau.

- **Les deux formats** — manque : e7, le quartier après le titre du bien d'une visite en attente ; « L'agence vous répond d'ordinaire en 2 h » sous « En attente de confirmation » ; « Annulée par vous » dans les Passées ; e6, « Un SMS et un e-mail ont prévenu {prénom} » quand les deux canaux sont partis (le texte suit `notification.channels`, il ne promet pas un canal qui n'est pas parti).

## Contraintes strictes (métier)

- Le délai n'est pas affiché quand l'API rend 204 (pas de chiffre inventé).
- i18n `fr`/`en`/`wo`, vouvoiement.

## Delta à produire

- [ ] e7 : quartier, délai de réponse, « Annulée par vous ».
- [ ] e6 : texte selon les canaux.
- [ ] Tests de composant : délai absent sur 204 ; « Annulée par vous » seulement pour `cancelled_by = visitor` ; texte e6 selon `channels` (sms seul, sms+mail).

## Critères d'acceptation

- [ ] AC1 — À 390, une visite `requested` du client montre « Studio meublé · Ouakam » (quartier) ; l'adresse n'apparaît pas.
- [ ] AC2 — L'agence rend `median_hours = 2` : « L'agence vous répond d'ordinaire en 2 h » ; 204 : la ligne n'existe pas.
- [ ] AC3 — Une visite annulée par le client porte « Annulée par vous » ; annulée par l'agence, « Annulée par l'agence » avec son motif.
- [ ] AC4 — Après planification avec `channels = [sms, mail]`, la confirmation dit « Un SMS et un e-mail ont prévenu Mouhamed ».
- [ ] AC5 — Vérifier au navigateur, compte client, dans les 24 h après une visite terminée : l'avis « encore N h » s'affiche (e7) ; corriger si non.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2883.json` : écrans e6 et e7 de `app-visites` (a), téléphone et bureau.
- [ ] AC-F2 — `fidelite compare` à 390 × 844 et 1440 × 900 sans écart non expliqué.

## Hors périmètre

- Le côté personnel de la liste et du détail (TCK-2882).

## Notes d'implémentation

2026-11-15 — agent (vague 92, arbre `takussan-manques`).

**Prémisse re-mesurée — deux écarts.**
- Le quartier était déjà rendu par `bienEtQuartier` (`par-le-temps/pieces.tsx`), mais lu sur `property.address.neighborhood`, clé ABSENTE avant confirmation : une demande en attente n'avait donc jamais son quartier. Repli sur `property.neighborhood` (TCK-2871), qui sert aussi la console.
- **Le client ne pouvait pas savoir quelle agence interroger** : `GET /api/agencies/{agency}/response-time` (TCK-2871) prend l'agence, que la visite ne servait pas au client (le bloc `property` suit `fields[properties]=id,title,slug`, et `agent.agency_name` n'est servi qu'à la visite confirmée). **API** : `property.agency_id` ajouté au bloc `property` de `PropertyVisitResource`, relu par `VisitReadContext` (déjà amorcé pour la page, aucune requête de plus), hors `fields` comme `neighborhood`. L'agence d'un bien publié est publique. Test `VisitResourceNeighborhoodTest::test_tck2883_…` (rouge par ablation).

**Livré (front).**
- e7 : « Studio meublé · Ouakam » dès la demande ; sous une demande `scheduled`, « L'agence vous répond d'ordinaire en N h » (`useDelaiDeReponse`, `lib/queries/visits.ts` : une lecture par agence, partagée ; 204 → `null`, erreur → rien, bien sans agence → aucune lecture). Les confirmées de « Ensuite » n'ont pas la ligne (elle ne dit plus rien une fois confirmée).
- Passées : « Annulée par vous : « motif » », « Annulée par l'agence : « motif » », sans motif « Annulée par vous » ; `cancelled_by` nul (visite annulée avant la colonne) → « Motif : « … » » comme avant. `cancelled_by` ajouté à `VISIT_CLIENT_FIELDS` (et à la liste épinglée de `visits.champs-du-client.tck-2587.test.ts`).
- e6 : la phrase du succès suit `notification` (`canauxRemis`) : SMS remis = `notification.sms` non nul (JAMAIS `channels` seul : un SMS retenu par la borne y figure encore) ; e-mail = `channels` ∋ `email` ; WhatsApp = `channels` ∋ `whatsapp` sans SMS remis. « Un SMS et un e-mail ont prévenu {prénom}. », « Un SMS a prévenu … », « Un e-mail a prévenu … », « Un message WhatsApp (et un e-mail) a/ont prévenu … », aucun canal externe → « Ni SMS ni e-mail n'est parti : prévenez {prénom} par un autre moyen. » ; sans prénom, « le visiteur ». Réponse sans `notification` → la phrase d'avant. Vaut pour e6 et la planification depuis une demande (même `PhraseDuSms`). Le cas « SMS retenu » garde sa phrase (`smsRetenu`, prioritaire).
- Clés (outil i18n) : `visits.client.delaiDeReponse`, `visits.client.annulee.{parVous,parVousMotif,parLAgence,parLAgenceMotif}`, `visitPlanning.plan.notified.{sms,smsEmail,email,whatsapp,whatsappEmail,aucun,leVisiteur}`.

**Mesures.** `mes-visites.tck-2883.test.tsx` (6), `canaux-du-succes.tck-2883.test.tsx` (5), un cas TCK-2883 dans `PlanifierUneVisite.demande.tck-2881.test.tsx` (bout en bout réponse → phrase). 9 ablations une à une, toutes rouges, restaurées au md5 (repli du quartier, ligne du délai, `enabled` de la lecture — test renforcé après une première ablation verte —, `cancelled_by` ignoré, `cancelled_by` hors des `fields`, phrase sans canaux, SMS lu sur `channels`, `canaux` non passé, `agency_id` API). 35 fichiers vitest voisins verts (317) ; `tsc` propre ; ESLint 0 ; `check:*` du front et gardes racine verts ; Pint ; les trois gardes d'architecture, `ValeursEnListeParcoursDesRoutesTest`, `ImpersonationReadSweepTest`, `PropertyVisitAddressVisibilityTest` verts. `DateInventoryByValueTest` rouge sur `LeaseResource::next_revision_date` seul (clé d'un autre agent en cours, TCK-2906), rien de `PropertyVisitResource`.

**Écart de vocabulaire.** Le ticket écrit `channels = [sms, mail]` ; l'API rend `email` (`NotificationChannel::Email`, asserté par `VisitStoreReturnsSmsTest`) : le front lit `email`.

**Décisions à relire par le porteur.**
- `property.agency_id` servi à tout lecteur de la visite (agence d'un bien publié, déjà publique par l'annonce).
- Sans aucun canal externe remis : « Ni SMS ni e-mail n'est parti : prévenez {prénom} par un autre moyen. » — phrase que ni le ticket ni la maquette ne donnent (l'ancienne « Un SMS a prévenu » y aurait menti).
- Les clés i18n de ce ticket sont arrivées sur la branche avec le commit de TCK-2916 (661df3dc2, fichiers de messages partagés).

**Non mesuré.** AC5 au navigateur et AC-F2 (brief du lot : ni navigateur ni relevé) ; « encore N h » est tenu par `mes-visites.tck-2587.test.tsx` (« encore 21 h »). Fiche AC-F1 `docs/qa/audit-ux-2026-11/fidelite/TCK-2883.json` écrite sans relevé.

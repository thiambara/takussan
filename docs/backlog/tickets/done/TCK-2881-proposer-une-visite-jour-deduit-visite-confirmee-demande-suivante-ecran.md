---
id: TCK-2881
title: "Fil commercial, de la demande à la visite : le jour déjà choisi d'après le message, « Critères déduits du bien », puis « Visite confirmée » avec les critères repris, le SMS parti et « Demande suivante → »"
status: done
phase: P1
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2871]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
    - "docs/models-spec.md#67-propertycontactlead-"
tags: [front, visits, leads, fil-commercial, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

L'agent qui transforme une demande en visite n'a rien à retaper (le jour que le client a écrit est déjà choisi, ses critères sont déduits du bien), voit ce qui est parti au client, et enchaîne sur la demande suivante sans revenir à la boîte.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-fil-commercial e1 et e2). « Demande suivante » avait été renvoyée par TCK-2586 à TCK-2584, qui ne l'a pas faite (aucune clé dans `fr.json`) : fonction orpheline. « {prénom} a écrit samedi » et le texte du SMS étaient `ticket: null`. Le SMS parti est servi par TCK-2871.

## Contrat de données

- La planification depuis une demande (`PlanifierUneVisite`, `POST /api/property-visits`) ; réponse `notification.sms` (TCK-2871).
- Le message de la demande (`GET /api/contact-leads/{lead}`) ; les critères repris du bien par la création de fiche depuis la demande (TCK-2582).
- Demande suivante : la liste de la boîte (`GET /api/contact-leads?filter[handled]=0`, ordre de la boîte).

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-fil-commercial`, approche **a** — fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-fil-commercial-a.tsx` ; écrans **e1 Proposer une visite** (l. 450-510) et **e2 Visite confirmée** (l. 570-615) ; téléphone et bureau.

- **Les deux formats** — manque :
  - e1 : « {prénom} a écrit « samedi » : le jour est déjà choisi. » (l. 471) et le jour présélectionné ; sous « Créer la fiche client… », « Critères déduits du bien : Chambre · Ouakam · ≤ 100 000 F » (l. 491) ;
  - e2 : dans la liste des faits, « Bien d'intérêt et critères repris (…) » (l. 580) ; le bloc « SMS envoyé à 09:21 » avec le texte du SMS (l. 590) ; le bouton **« Demande suivante → »** (l. 611) à côté de « Voir la fiche ».
- Le téléphone et le bureau diffèrent seulement par le conteneur (feuille / panneau) déjà en place.

## Contraintes strictes (métier)

- Le jour se déduit **côté front**, sans appel : premier nom de jour (« lundi » … « dimanche », « demain », « aujourd'hui ») trouvé dans le message, résolu à sa prochaine occurrence dans les 7 jours ; en `fr` et `en` ; aucun jour trouvé → rien de présélectionné, et la ligne n'est pas rendue (décision prise à l'écriture du ticket : une extraction simple et explicable, pas d'IA).
- Les critères déduits sont ceux que la création de fiche reprend réellement (type, quartier, plafond = prix du bien) ; la ligne ne promet rien que la création n'écrit pas.
- Le bloc SMS n'est rendu que si `notification.sms` n'est pas nul ; sinon « Aucun SMS envoyé » n'est pas affiché non plus (rien).
- « Demande suivante » ouvre la plus ancienne demande non traitée suivante dans l'ordre de la boîte ; absente quand il n'y en a pas.
- i18n `fr`/`en`/`wo`.

## Delta à produire

- [ ] Déduction du jour depuis le message et sa ligne d'aide.
- [ ] Ligne « Critères déduits du bien ».
- [ ] Faits de la confirmation : critères repris ; bloc SMS envoyé.
- [ ] « Demande suivante → ».
- [ ] Tests unitaires de la déduction (« samedi », « Samedi ? », « demain », aucun jour, `en` « Saturday ») ; tests de composant du bloc SMS et de « Demande suivante ».

## Critères d'acceptation

- [ ] AC1 — Une demande dont le message contient « Une visite samedi est-elle possible ? », planifiée un mardi, ouvre la feuille avec le samedi suivant sélectionné et la ligne « Mouhamed a écrit « samedi » : le jour est déjà choisi. ».
- [ ] AC2 — Un message sans jour n'a ni présélection ni ligne.
- [ ] AC3 — La confirmation montre « SMS envoyé à 09:21 » (`queued_at`) et le texte rendu par l'API ; sans SMS, aucun bloc.
- [ ] AC4 — « Demande suivante → » ouvre la demande non traitée suivante ; avec une seule demande, le bouton n'est pas rendu.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2881.json` : écrans e1 et e2 de `app-fil-commercial` (a), téléphone et bureau.
- [ ] AC-F2 — `fidelite compare` à 390 × 844 et 1440 × 900 sans écart non expliqué.

## Hors périmètre

- Le message WhatsApp prérempli de la demande (TCK-2885).

## Notes d'implémentation

2026-11-15 — livré (front).

- **Prémisse re-mesurée — deux écarts.**
  - Le plafond n'est PAS le prix du bien : `ContactLeadService::criteriaFromProperty` (TCK-2582) écrit
    `budget_max` = prix × 1,2 (en entiers), et seulement pour une vente ou un loyer mensuel (ou sans
    période). La ligne suit l'API (« ne promet rien que la création n'écrit pas ») : un loyer de 100 000 lit
    « ≤ 120 000 F », pas « ≤ 100 000 F » comme la maquette. Miroir : `lib/visites/criteres-du-bien.ts`.
  - L'API déduit les critères du bien de la DEMANDE (`$lead->property_id`), pas du bien de la visite :
    la ligne est calculée dans la boîte (`PlanifierDepuisLaDemande`, bien relu par `useBienDeLaDemande`,
    qui sert déjà `type`, `rent_period`, `location.quarter`) et passée sur `demande.criteres` ; « changer »
    de bien ne la change pas. Le contrat (`seeking_contract_type`, aussi écrit) n'est pas cité (maquette).
- **Jour du message** (`lib/visites/jour-du-message.ts`) : premier mot par POSITION, fr et en quelle que
  soit la langue de l'interface (le client écrit), insensible à la casse, `aujourd'hui` à apostrophe
  droite ou typographique. Un nom de jour → prochaine occurrence AUJOURD'HUI COMPRIS (« mardi » lu un
  mardi = ce jour) ; « après-demain » = +2 (ajouté : sans lui, son « demain » était lu à tort) ; un mot
  qui contient un jour (« samedis ») n'en est pas un. Jour de semaine pris sur le jour de l'API (UTC =
  Dakar), jamais `getDay()`. Seulement quand l'appelant ne pose pas de `jour` (l'agenda garde le sien).
  Le jour écrit au-delà des quatre pastilles y prend place : aujourd'hui, demain, le jour écrit et son
  lendemain (maquette a-1 : « Aujourd'hui, Demain, Sam. 7 nov., Lun. 9 nov. »). La ligne « {prénom} a
  écrit « samedi » : le jour est déjà choisi. » disparaît si l'agent choisit un autre jour.
- **e2** : « Bien d'intérêt et critères repris (…) » seulement quand la fiche NAÎT de la demande
  (`create_customer`) — rattachée à une fiche existante, seuls ses critères vides sont remplis, la ligne
  promettrait trop. Bloc « SMS envoyé à 09:21 » (`f.heure`, Dakar) + texte, lus de `notification.sms`
  (TCK-2871) ; absent (`null`, ou réponse sans `notification`) → aucun bloc.
- **« Demande suivante → »** : `PlanifierDialog` reçoit `onDemandeSuivante` (facultatif : les autres
  appelants n'ont pas de bouton). La boîte prend la suivante À L'OUVERTURE de la feuille (la planification
  traite la demande et relit la liste, d'où elle sort) : la non traitée qui suit dans l'ordre de la vue,
  sinon la première non traitée qui précède ; aucune → pas de bouton. Le clic ferme la feuille puis ouvre
  la suivante (`?ouverte=`). Placé à côté de « Voir la fiche » (a-2) ; « Voir la visite » (TCK-2586 AC4)
  passe dessous au téléphone. ⚠ Écart : le bureau de la maquette (a-2) n'a pas ce bouton ; le ticket le
  veut dans les deux formats — il est rendu au bureau aussi.
- **Tests** : `lib/visites/__tests__/jour-du-message.tck-2881.test.ts` (9), `criteres-du-bien.tck-2881.test.ts`
  (3), `components/visits/__tests__/PlanifierUneVisite.demande.tck-2881.test.tsx` (7),
  `ContactLeadsInbox.test.tsx` (bloc TCK-2881, 3 ; l'assertion exacte de `demande` d'AC3/TCK-2584 porte
  `message` et `criteres`). 17 ablations une à une, toutes rouges, restaurées au md5 (une garde redondante
  `ficheCreee` au rendu, que l'ablation laissait verte, a été retirée). 57 fichiers voisins verts (713).
- **Non mesuré** : AC-F1/F2 (brief du lot : ni navigateur ni relevé de fidélité).

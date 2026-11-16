---
id: TCK-2885
title: "Demandes : raccourcis clavier J/K/V/T au bureau, quartier sur la ligne, filtre « Agent » pour qui lit toute la boîte, « Annuler » sur le toast de traitement, message WhatsApp qui nomme l'agent et l'agence et propose deux créneaux libres"
status: done
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2884]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#67-propertycontactlead-"
tags: [front, leads, crm, clavier, fil-commercial, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

L'agent traite sa boîte au clavier sans lâcher la liste, sait de quel quartier parle chaque demande, rattrape un « traité » de trop, et répond sur WhatsApp par un message qui se présente et propose déjà deux heures.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-demandes e0 à e3 ; app-fil-commercial e0). Relevé :

- raccourcis : la fiche de TCK-2584 les disait « absents de la maquette retenue » — **motif faux**, la maquette les dessine (`app-fil-commercial-a.tsx:257-258, 390-396`) ; aucun gestionnaire `keydown` dans `components/leads/` ;
- quartier : la ligne ne lit que `property.title` ; servi par TCK-2884 ;
- filtre « Agent » : conditionné à `crm.assign` (`FiltresDuBureau.tsx:132`) ; la maquette le montre à l'agent. Or seul le titulaire de `crm.view_all` lit d'autres demandes que les siennes (`ContactLeadController`, en-tête) : le filtre se rattache donc à **cette** capacité, sans changer aucune règle d'accès (décision prise à l'écriture du ticket) ;
- « Annuler » des toasts : écarté faute de route ; servie par TCK-2884 ;
- message prérempli : générique (`whatsappReplyProperty`, `messages/fr.json:17765-17766`) ; la maquette : « Bonjour {prénom}, c'est {agent} de {agence}, au sujet de « {bien} · {quartier} ». Je vous propose samedi 10:00 ou lundi 17:30. » (`app-fil-commercial-a.tsx:319-321`).

## Contrat de données

- `GET /api/contact-leads?include=property.address` ; `POST /api/contact-leads/{lead}/unhandle` (TCK-2884) ; `POST …/handle` (existant).
- Créneaux libres : `GET /api/property-visits/slots` (existant, utilisé par la planification).
- Nom de l'agent : l'utilisateur courant ; agence : l'agence active.

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-fil-commercial`, approche **a**, écran **e0 La demande** — fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-fil-commercial-a.tsx` (BoiteBureau, DemandeOuverte) ; et maquette `app-demandes`, écrans **e0 à e3** — fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-demandes.tsx`.

- **Bureau (1280 / 1440)** — manque : pied de la liste « J K parcourir · V visite · T traiter » et barre de gestes de la demande « V visite · T traiter » (à 1440) ; raccourcis actifs (J suivante, K précédente, V ouvre « Proposer une visite », T marque traitée) ; filtre « Agent » visible à qui a `crm.view_all`.
- **Les deux formats** — manque : « · {quartier} » après le titre du bien sur la ligne ; « Annuler » sur le toast « Marquée traitée » (e2) et « Demande traitée. » (e3, au-dessus de l'état vide) ; le message prérempli de la maquette.

## Contraintes strictes (métier)

- Les raccourcis ne s'activent pas quand le focus est dans un champ, une zone de texte ou un dialogue ouvert ; ils ont `aria-keyshortcuts` sur les boutons concernés ; aucun sans modificateur ne vole une saisie.
- Le message prérempli prend les **deux premiers créneaux libres** de l'agent pour ce bien dans les 7 jours (jamais un créneau pris) ; sans créneau, la phrase de proposition disparaît (le reste du message demeure).
- « Annuler » : 6 s ; appelle `unhandle` ; la demande revient en tête de la liste.
- i18n `fr`/`en`/`wo`.

## Delta à produire

- [ ] Raccourcis J/K/V/T et leurs indications (bureau).
- [ ] Quartier sur la ligne.
- [ ] Filtre Agent sous `crm.view_all`.
- [ ] « Annuler » sur les deux toasts.
- [ ] Message prérempli : agent, agence, bien · quartier, deux créneaux.
- [ ] Tests de composant : J/K changent la sélection, V ouvre la feuille, T traite ; inactifs dans un champ ; Annuler appelle `unhandle` ; message avec et sans créneaux.

## Critères d'acceptation

- [ ] AC1 — À 1440, la liste a le pied « J K parcourir · V visite · T traiter » ; J sélectionne la demande suivante, T la marque traitée et le toast offre « Annuler », qui la remet dans la liste.
- [ ] AC2 — Taper « t » dans la recherche ne traite rien.
- [ ] AC3 — La ligne d'une demande sur un bien de Ouakam lit « Chambre meublée · Ouakam ».
- [ ] AC4 — Un agent avec `crm.view_all` sans `crm.assign` voit le filtre « Agent » ; un agent sans `crm.view_all` ne le voit pas.
- [ ] AC5 — Le message WhatsApp d'une demande, l'agent ayant samedi 10:00 et lundi 17:30 libres, est « Bonjour Mouhamed, c'est Sokhna Sène de Dakar Immo, au sujet de « Chambre meublée · Ouakam ». Je vous propose samedi 10:00 ou lundi 17:30. ».
- [ ] AC6 — Vérifier au navigateur la barre « Vous avez répondu ? » au retour d'onglet après WhatsApp (téléphone : au-dessus des onglets ; bureau : pied du panneau), et le bandeau des délais avec un compte administrateur à 1440 ; corriger si absents.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2885.json` : `app-fil-commercial` e0 et `app-demandes` e0 à e3, téléphone et bureau.
- [ ] AC-F2 — `fidelite compare` à 390 × 844 et 1440 × 900 sans écart non expliqué.

## Hors périmètre

- La feuille « Proposer une visite » et sa confirmation (TCK-2881).

## Notes d'implémentation

2026-11-15 — livré (front).

- **Raccourcis** (`components/leads/boite/raccourcis.ts`) : un écouteur `keydown` sur le document, actif
  au bureau (`lg`), liste non vide, sans feuille « Proposer une visite » ouverte. Ignorés : Ctrl/⌘/Alt/Maj,
  touche répétée, focus dans un champ (input, textarea, select, contenteditable, textbox, combobox),
  toute surface ouverte (`dialog`, `alertdialog`, `menu`, `listbox`) **hors du toast** — base-ui donne au
  toast le rôle `dialog` : sans l'exception, J était bloqué 6 s après chaque T. J/K ouvrent la ligne
  suivante/précédente (`?ouverte=`), V ouvre la planification préremplie, T traite la demande ouverte
  (non traitée, non convertie) puis, dans une vue « à traiter », ouvre la suivante (sinon `?ouverte=`
  gardait la traitée et T suivant ne faisait rien). `aria-keyshortcuts` : la liste (`J K`), « Proposer une
  visite » (`V`), « Marquer traitée » (`T`). Pied « J K parcourir · V visite · T traiter » sous la liste
  au bureau ; « V visite · T traiter » dans la barre de gestes dès 1440 (`min-[90rem]`).
- **Traiter + « Annuler »** (`boite/traiter.tsx`, `useTraiterLaDemande`) : un seul chemin pour T,
  « Marquer traitée » (deux régimes) et « Oui, c'est traité » ; il vit dans la BOÎTE (la demande ouverte se
  démonte avant les 6 s). Toast `timeout: 6000`, `ActionDuToast` « Annuler » → `toast.close` puis
  `POST …/unhandle` (`useUnhandleLead`) ; la demande rendue est **préposée en tête** de la vue où on l'a
  traitée (état local, comme la désignée `?lead=` — l'ordre « plus anciennes d'abord » l'aurait remise à
  sa place chronologique), et rouverte au bureau.
- **Quartier** : `include=property.address` (sans `fields[addresses]`, cf. TCK-2884) ; « Titre · Quartier »
  sur la ligne et sur la carte du bien de la demande ouverte (maquette a-0, l. 165) ; titre seul sans quartier.
- **Filtre « Agent »** : montré sous `crm.view_all` OU `crm.assign`. ⚠ Écart : la liste des membres
  (`GET /agencies/{a}/members` hors administration) reste réservée à `crm.assign`
  (`AgencyPolicy::listAssignableStaff`) — la règle d'accès ne bouge pas (décision du ticket). Sans
  `crm.assign`, le filtre propose les destinataires des demandes lues (`recipient`, déjà visibles) ; avec,
  les membres plus ces destinataires. Dans le système, l'agent porte les deux capacités : le cas ne vise
  qu'un rôle personnalisé.
- **Message prérempli** (`boite/message-whatsapp.ts`) : « Bonjour {prénom}, c'est {agent} de {agence}, au
  sujet de « {bien · quartier} ». Je vous propose {jour heure} ou {jour heure}. » — agent = `libelleDe(user)`,
  agence = `useNomDeLAgenceActive` (sans agence : « c'est {agent} » seul ; sans nom d'agent : les anciens
  libellés `whatsappReply*`). Créneaux : `useCreneauxLibresDuBien` → `chercherCreneauxLibres`, jour par jour
  (`GET /property-visits/slots`, occupation de l'appelant), `available` et ≥ maintenant + 30 min, arrêt à
  deux, sept jours au plus, un jour illisible arrête la recherche. ⚠ Écart : lu pour la **seule demande
  ouverte** (20 lignes × 7 jours = 140 requêtes sinon) ; les gestes WhatsApp des LIGNES (téléphone) gardent
  le message sans la phrase de proposition. Un créneau seul : « Je vous propose {jour heure}. » Les deux
  premiers libres sont pris tels quels (peuvent être 10:00 et 10:30 le même jour).
- **Tests** : `ContactLeadsInbox.test.tsx` (bloc TCK-2885, 11 tests), `contact-leads.creneaux-libres.tck-2885.test.ts`
  (3). Mocks des trois fichiers de la boîte complétés (`useUnhandleLead`, `useCreneauxLibresDuBien`,
  `ActionDuToast`, `close`, `useNomDeLAgenceActive`) ; l'assertion du toast « Demande traitée. » passe à
  `objectContaining` (+ `timeout: 6000`). 10 ablations rouges une à une, restaurées au md5.
- **Non mesuré** : AC6 et AC-F1/F2 (brief du lot : ni navigateur ni relevé de fidélité). Par lecture : la
  barre « Vous avez répondu ? » est au-dessus des onglets au téléphone (`BarreDAction`) et au pied du panneau
  au bureau ; le bandeau des délais à l'administrateur dès `lg` — couverts par les tests existants (AC2, AC5
  de TCK-2584).
- Clés i18n (`contactLeads.whatsapp.*`, `toasts.undo`, `shortcuts.*`) : déjà emportées par le commit
  d2cc6a051 (TCK-2866), qui a pris `messages/*.json` entiers.

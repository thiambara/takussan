---
id: TCK-2648
title: "État des lieux : récapitulatif des réserves, signature du locataire sur place avec code SMS, et une fiche qui nomme le logement et les signataires"
status: todo
phase: P1
family: front
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2646, TCK-2647, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#19-état-des-lieux--inventaires"
  models:
    - "docs/models-spec.md#24-inventory-"
tags: [front, inventory, signature, mobile, audit-ux, app]
---

## Objectif utilisateur

À la fin du tour, l'agent relit les réserves avec le locataire, le fait signer sur son propre téléphone après un code reçu par SMS, signe pour le bailleur, et repart avec un état des lieux figé et son PDF. Chacun retrouve ensuite une fiche qui dit de quel logement il s'agit et qui a signé.

## Contrat de données

- `POST /api/inventories/{id}/submit` (existant).
- `POST /api/inventories/{id}/sign/onsite-code`, puis `POST /api/inventories/{id}/sign` avec `role=tenant`, le tracé et `code` ; `can_sign_as.tenant_onsite` (TCK-2646).
- `POST …/sign` avec `role=tenant`, sans code, depuis le compte du locataire (existant), et `role=landlord` (existant).
- `POST …/dispute`, restreint aux deux parties (TCK-2646). `GET …/pdf` (existant).

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-etats-des-lieux&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écran « Récapitulatif et signatures », au téléphone et au bureau.
- **Résumé** : « 6 pièces · 41 éléments · 23 photos ».
- **Réserves** : les éléments Usé, Abîmé ou Manquant, avec leur note et leur photo (« Cuisine — évier : joint noirci »).
- **Bloc « Locataire : {nom} »** :
  - « Signer ici » ouvre un tracé plein écran, et le paysage est proposé ;
  - « Lui envoyer un code par SMS » ;
  - puis « Code reçu par {prénom} : [ six cases ] ». L'API envoie 6 chiffres ; la maquette en dessine 4.
- **Bloc « Agence (pour le bailleur) : {nom} »** : « Signer ».
- **Bouton collé** « Terminer et envoyer le PDF » (libellé sous réserve, cf. *Hors périmètre*).
- **Fiche de l'état des lieux** :
  - titre « État des lieux d'entrée — {bien} », jamais « #25 » ;
  - les signatures dites **une fois**, avec les signataires nommés ;
  - une date sans « 00:00 » quand l'heure n'est pas connue ;
  - « Contester » au seul locataire et au seul bailleur ;
  - PDF une fois signé.
- **Téléphone (360-390 px)** : récapitulatif puis signatures, tracé plein écran.
- **Bureau (≥ 1280 px)** : récapitulatif à gauche, avec les réserves et leurs photos ; signatures à droite, empilées (rapport maq-f4a : côte à côte, les titres se repliaient).

## Contraintes strictes (métier)

**Rien ne se perd** (audit famille 4, § 4, *Fonctions existantes* 6-10, lues dans `InventoryDetail.tsx` et `SignaturePad`) :

- en-tête : bien et « Voir le bien », référence du bail, type, statut, état général, date ;
- édition du brouillon et « Soumettre pour signature » ;
- photos par pièce ;
- **signature tracée par partie, chacune pour elle-même depuis son compte**. Le chemin existe et reste ;
- **mention d'immutabilité** ;
- contestation avec motif ;
- **PDF une fois signé** ;
- état terminal expliqué quand aucune action ne reste.

Autres contraintes :

- **Signature sur place** ([décision 7](../../../qa/audit-ux-2026-11/README.md#décisions-du-porteur-sur-la-partie-connectée-2026-11-10), [ADR-0098](../../../adr/0098-le-locataire-signe-l-etat-des-lieux-sur-place-par-code-sms.md)) :
  - offerte seulement quand l'API rend `tenant_onsite` ;
  - le code se saisit sur le téléphone de l'agent ;
  - l'écran dit à qui le code est parti (numéro masqué) ;
  - « Renvoyer » n'est actif qu'après le délai de l'API ;
  - les erreurs de l'API (pas de téléphone, code faux, verrou) se disent en clair sur le bon champ.
- **Les gestes suivent l'API** : `can_sign_as` et les capacités, jamais `user.roles` (aujourd'hui `canSignTenant = roles.includes('tenant')`, `InventoryDetail.tsx:451` ; `canDispute` ne lit que le statut, `:338`).
- **Le tracé** reste lisible : cibles ≥ 44 px, et « Effacer » avant de valider.
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement, dates par `useFormatteurs()`.

## Delta à produire

- [ ] Écran de récapitulatif : comptes et réserves.
- [ ] Signature sur place du locataire (code, tracé) et signature du bailleur. Terminer.
- [ ] Fiche : titre par le logement, signataires nommés une fois, date sans heure fictive, « Contester » selon l'API.
- [ ] Tests :
  - signature sur place (deux appels, erreurs sur le champ code) ;
  - signature depuis le compte du locataire, inchangée ;
  - « Contester » selon le rôle ;
  - titre sans identifiant ;
  - PDF après signature.

## Critères d'acceptation

- [ ] AC1 — Au toucher de « Lui envoyer un code par SMS », le réseau montre `POST …/sign/onsite-code`. Le bon code et le tracé envoient `POST …/sign` avec `role=tenant`, `code` et `signature`. Un code faux affiche l'erreur sous le champ code, et le tracé est gardé.
- [ ] AC2 — Le locataire connecté à son compte signe sans code, par le chemin existant (test inchangé, vert).
- [ ] AC3 — « Contester » n'est pas rendu pour l'admin ni pour l'agent. Il est rendu pour le locataire et pour le bailleur (lu sur la réponse de l'API, test sur les trois rôles).
- [ ] AC4 — Le titre de la fiche ne contient aucun identifiant numérique. Les deux signataires y sont nommés une seule fois. « Signé le 1 juil. 2026 » ne porte pas « 00:00 ».
- [ ] AC5 — À 390 px, le tracé s'ouvre plein écran, et ses boutons « Effacer » et « Valider » font au moins 44 px.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2648.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La saisie des pièces (TCK-2647).
- La signature sur place du bail.
- Tout envoi neuf du PDF aux parties (WhatsApp, e-mail). « Terminer » ferme le parcours, et le PDF reste téléchargeable. Le libellé ne promet un envoi que si le produit en fait déjà un à la seconde signature (à vérifier à l'implémentation). Sinon le bouton dit « Terminer ».

## Notes d'implémentation

**2026-11-13 — terrain-8 (front).** Construit sur TCK-2647, livré dans l'arbre mais pas encore fusionné, avec l'accord de team-lead.

**Prémisse re-mesurée.**

- **Le libellé du bouton est « Terminer ».** À la seconde signature, `InventorySignatureService::sign` fige l'état des lieux sans rien envoyer, et `InventoryOnboardingObserver` ne fait que cocher la checklist.
- **`canSignTenant` lisait déjà `can_sign_as`** (TCK-596). La ligne `:451` citée plus haut était périmée.
- **`canDispute` ne lisait que le statut.** La ressource ne servait ni `abilities.dispute` ni aucun nom. Un delta API est demandé à team-lead (voir plus bas). Le front lit déjà ces champs, et se replie sans eux.

**Écran « Récapitulatif et signatures »** (`terrain/RecapEtSignatures.tsx`, `terrain/SignaturesSurPlace.tsx`) :

- **Accès.** L'écran est un état de la page : `/app/inventories/{id}?etape=signatures`, à qui a `abilities.update`, en brouillon, en attente ou signé. La dernière pièce du parcours y mène. La fiche y renvoie par « Faire signer sur place » quand l'API rend `tenant_onsite`, ou `landlord` avec `sign_on_behalf_of`.
- **Gel du brouillon.** Le premier geste de signature (envoi du code, signature de l'agence) appelle d'abord `POST …/submit`, qui refuse un élément non qualifié. Le locataire signe donc un contenu figé. Avant ce geste, l'état général et les notes se modifient (`PATCH`) ; après, ils se lisent. « Revenir aux pièces » et « Tout relire » mènent au parcours en brouillon, puis aux pièces de la fiche (`#pieces`).
- **Envoi au sixième chiffre.** Le tracé et les six chiffres partent ensemble, au geste qui complète le second : le sixième chiffre, ou « Valider » du tracé quand le code était déjà saisi. Un couple (code, tracé) déjà refusé ne repart pas, car chaque essai faux compte pour le verrou.
- **Erreurs.**
  - Code faux (422 de validation sur `code`) et verrou (423) : sous les cases, le tracé gardé. Le verrou ferme les cases.
  - Pas de téléphone et SMS non parti : sous l'envoi.
  - Un 429 `resend_too_soon` (page rechargée) ouvre quand même les cases.
  - « Renvoyer » attend 60 s comptées depuis le 202.
- **Tracé plein écran.** `SignaturePad` a un mode `grand` : canevas à la hauteur donnée, « Effacer » et « Valider » en `lg` (44 px), remesure quand le téléphone tourne. Le paysage est suggéré en portrait.
- **Les noms.** « Locataire · {nom} » et « Code reçu par {prénom} » lisent `inventory.tenant`, sinon le bail (`useContexteDuBail`). L'agence est le lecteur (`useAuth`), et le mandant est `sign_on_behalf_of`. L'élision suit le prénom : « d'Aminata », mais « de Yacine ».

**Fiche :**

- Le titre nomme le logement : « État des lieux d'entrée — {bien} », ou le type seul, jamais « #id ». L'en-tête est passé de `page.tsx` (serveur, qui ne connaissait que l'id) à `InventoryDetail`.
- Les signatures ne figurent plus dans l'en-tête. Elles se disent une fois, nommées, sur leurs cartes : « Locataire · Aminata Diop », « Signé sur place devant {agent}, avec le code reçu au {numéro} », « Signé par {agent}, au titre du mandat de gestion ».
- Les dates de signature sont sans heure. Une date de réalisation à 00:00 (heure de Dakar) se dit sans heure.
- « Contester » ne s'affiche que sur `abilities.dispute`.

**Tests.**

- 32 tests TCK-2648, au compte de vitest :
  - `RecapEtSignatures` : 18 ;
  - `InventoryDetail.fiche` : 12 ;
  - `inventory` (les deux appels) : 2.
- Ensemble inventory : 16 fichiers, 117 tests, verts.
- 29 ablations, toutes tuées. Une a d'abord survécu (le même code renvoyé après « Refaire »), et le test a été renforcé.
- AC2 : `InventorySignatures.test.tsx` est inchangé et vert.
- Retouchés : `InventoryDetail.terrain.tck-2647` (l'en-tête est rendu par `InventoryDetail`) et `ParcoursDeTerrain.tck-2647` (la dernière pièce mène à `?etape=signatures`).

**Fidélité** (`docs/qa/audit-ux-2026-11/fidelite/TCK-2648.json`, écran a-2, état « Code attendu ») :

| Appareil | Conformes · écarts · absents | Pixels |
|---|---|---|
| Téléphone | 13 · 19 · 4 | 11,28 % |
| Bureau 1440 | 68 · 120 · 24 | 5,6 % |
| Bureau 1280 | 68 · 120 · 24 | 6,19 % |

- Aucun débord de 390 à 1440. Les 14 écarts acceptés sont motivés dans la fiche.
- Le faux 202 du code est servi dans la page : aucun SMS n'est parti.

**Le front lit le delta API de back-4** (section suivante, commit `a6027376d`). Les champs y ont les formes que les tests du front simulent : `abilities.dispute`, `tenant {id, full_name, first_name}`, `landlord`, `tenant_signed_via`, `owner_signed_by` et `owner_signed_on_behalf_of` `{id, full_name}`. Sans ces champs, le front se replie : « Contester » ne s'affiche pas, et les cartes ne disent que le rôle.

Relevé en GET sur la démo le 2026-11-13, sans écriture :

- `abilities.dispute` vaut vrai pour le locataire (état des lieux 42) et pour deux bailleurs (89, 81). Il vaut faux pour l'agent et l'admin sur ces mêmes états des lieux.
- `tenant` et `landlord` sont servis avec la forme attendue.
- Les trois signataires sont `null` partout : la démo n'a aucune signature sur place. Les cartes « Signé sur place devant… » et « au titre du mandat » ne sont donc éprouvées que par les tests (front et `InventoryFicheNommeeTest`).
- `tenant_otp_destination` est masqué dès l'écriture (`LeaseSignatureService::maskPhone`).

### Delta API (2026-11-13, back-4)

- `InventoryResource`, sous `forViewer()` (la fiche `GET /api/inventories/{id}` seulement ; la liste n'en sert rien) :
  - `abilities.dispute` : `InventoryPolicy::dispute` est appelée EN DIRECT, sans `Gate::before`, sur un statut `pending_signature` ou `signed`. Vrai pour le locataire et le bailleur. Faux pour l'agent, l'admin d'agence et le super-admin, et faux en brouillon comme une fois contesté. La route refuse aussi le super-admin (403).
  - `tenant` {id, full_name, first_name}, depuis la fiche client du bail.
  - `landlord` {id, full_name}.
  - `tenant_signed_via`, `owner_signed_by` et `owner_signed_on_behalf_of` {id, full_name}, résolus depuis leurs colonnes d'id par trois relations neuves de `Inventory`. `full_name` vaut `User::nameWithoutContact()`.
  - Jamais de téléphone ni d'e-mail.
- `InventoryController::show` charge `lease.landlord`, `tenant` et les trois signataires.
  - Sur un seul état des lieux, ce chargement ne change pas le nombre de requêtes : une requête par relation, chargée d'avance ou à la demande. Aucun test ne peut donc l'observer.
- Épinglé par `tests/Feature/Api/InventoryFicheNommeeTest.php` (4 tests) :
  - la signature sur place est réelle : code SMS, puis l'agent signe pour le compte du bailleur ;
  - le prestataire et l'agent d'une autre agence reçoivent 403.
- `InventoryAbilitiesTest` lit désormais `abilities.update`, et non plus l'objet entier. `DateInventoryByValueTest` déclare les cinq clés neuves.
- Ablations, toutes rouges (k5 l'est devenu après le renfort du test) :
  - k1 : dispute par la Gate ;
  - k2 : sans condition de statut ;
  - k3 : `tenant` hors `forViewer` ;
  - k4 : e-mail ajouté au nom ;
  - k5 : la colonne du signataire locataire lue sur celle du bailleur ;
  - k6 : `on_behalf_of` lu sur le bailleur du bail.

### Reprise après la contre-vérification de 065941306 (2026-11-13, terrain-8)

- **r2** : un code que l'API a refusé (422 sur `code`) ne repart plus, même avec un tracé refait. La clé de l'essai était le couple (code, tracé), et « Refaire » donne une autre image ; c'est désormais le code seul. Chaque essai faux compte pour le verrou.
- **r3** : une panne de transport, ou un 401, 408 ou 429, n'est plus un verdict.
  - Le même code peut repartir, en ressaisissant le dernier chiffre ou par « Réessayer » sous l'alerte. La clé `inventory.terrain.signatures.reessayer` est neuve.
  - Un essai en vol ne repart pas.
- **q1** : le récapitulatif ne demande plus le locataire du bail. Son nom vient de l'état des lieux (`InventoryResource`, `{id, full_name, first_name}`).


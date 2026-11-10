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
depends_on: [TCK-2646, TCK-2647]
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

## Hors périmètre

- La saisie des pièces (TCK-2647).
- La signature sur place du bail.
- Tout envoi neuf du PDF aux parties (WhatsApp, e-mail). « Terminer » ferme le parcours, et le PDF reste téléchargeable. Le libellé ne promet un envoi que si le produit en fait déjà un à la seconde signature (à vérifier à l'implémentation). Sinon le bouton dit « Terminer ».

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

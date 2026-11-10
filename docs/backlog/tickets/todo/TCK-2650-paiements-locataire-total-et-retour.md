---
id: TCK-2650
title: "Paiements du locataire : un total, un geste, le prochain loyer — et un retour de paiement qui ne dit jamais « confirmé » sans le serveur"
status: todo
phase: P1
family: front
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2649]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
tags: [front, payments, mobile, bug, audit-ux, app]
---

## Objectif utilisateur

Le locataire ouvre « Paiements » et lit sans défiler :

- combien il doit, pénalités comprises ;
- où il le paie : en ligne, ou à l'agence ;
- quand tombe son prochain loyer.

Il ne lit jamais « à jour » au-dessus d'une dette, ni « Paiement confirmé » quand son paiement n'est pas confirmé.

## Contrat de données

- `GET /api/me/rent-summary` (TCK-2649) : `total_due`, `parts`, `items`, `next_rent`, `schedule_state`, `lease`, `offline_payment`.
- `GET /api/payments/history` : l'historique et la quittance par ligne, existants. `payment_type=deposit` nomme la caution, le champ existe.
- Paiement en ligne : les endpoints existants (choix parmi les seuls fournisseurs activés par l'agence, montant figé à l'ouverture).
- Retour de passerelle : l'endpoint de vérification existant, interrogé par `PaymentReturnClient`.

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-paiements&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écrans « Locataire — quelque chose est dû », « Locataire — payer, choix du moyen », « Locataire — à jour », « Locataire — échéancier pas encore émis », et les cinq écrans « Retour — … ». Au téléphone et au bureau.
  - Les montants de la maquette ont été recalculés par son auteur (rapport maq-f4b) : ils ne font pas foi.
- **Carte de tête, selon `schedule_state`** :
  - **`due`** : « À régler » et le **total**, en grand, puis le détail (« 2 pénalités de retard (oct. et juil.) — à régler à l'agence Dakar Immo »). Un lien « Comment payer à l'agence › » montre les moyens hors ligne et le téléphone de l'agence ;
  - **`up_to_date`** : « Vous êtes à jour ✓ · Prochain loyer : … le … », avec « Payer d'avance » quand l'échéance suivante est payable ;
  - **`none`** : carte neutre, pas verte. « Votre premier loyer n'est pas encore programmé », le bail, « {agence} prépare votre échéancier », et « Contacter l'agence ».
- **Carte « Prochain loyer »** : montant et date, avec « Payer maintenant ». Le bouton est secondaire quand le dû se règle à l'agence.
- **« Payer »** : feuille (téléphone) ou panneau (bureau) pour choisir le moyen parmi les fournisseurs activés.
- **Historique en cartes** :
  - « Novembre · 1 355 000 F · Payé le 10 nov. · Quittance » ;
  - une sous-ligne « Pénalité 67 750 F due » quand c'est le cas ;
  - « Caution · … · versée le … ».
- **Retour de paiement** :
  - **en cours** : « Paiement en cours de confirmation », le fournisseur et le montant, « Vous recevrez un SMS. Vous pouvez fermer cette page. » ;
  - **confirmé** : seulement sur un statut serveur payé, avec « Quittance disponible » et « Télécharger » ;
  - **non abouti** : « Aucun montant n'a été débité », avec « Réessayer » et « Payer à l'agence » ;
  - **remboursement** : TCK-596, l'écran existe ;
  - **lien invalide** : « Ce lien de retour ne correspond à aucun paiement », avec « Voir mes paiements ».
- **Téléphone (360-390 px)** : le total et le geste tiennent dans le premier écran.
- **Bureau (≥ 1280 px)** : colonne centrale de 720 px, et à droite une carte « Mon bail » dès `lg` (bien, loyer, échéance, agence et contact). Le retour en carte centrée de 480 px.

## Contraintes strictes (métier)

- **Les charges** (décision du porteur du 2026-11-10, point 7 b ; TCK-2679) : une échéance de charges est une ligne nommée du détail (« Charges de novembre »), comptée dans le total servi par l'API ; la page ne l'additionne pas elle-même.
- **Décisions d'architecture à respecter** : [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md).

**Rien ne se perd** (audit famille 4, § 5, *Fonctions existantes* 1-3 et 7, lues dans `CustomerPayments.tsx` et `PaymentReturnClient.tsx`) :

- **le montant dû est celui de l'API**, et la page n'additionne rien : le total vient lui aussi de l'API ;
- « Payer en ligne », avec le choix du fournisseur parmi ceux que l'agence a activés ;
- détail loyer + pénalité incluse, ou « à régler auprès de l'agence » ;
- historique en cartes, avec la **quittance PDF par ligne** et le rappel de pénalité ;
- horizon de 6 mois, retards compris (TCK-2169) ;
- retour :
  - « Vérification… » au moins 800 ms ;
  - interrogation toutes les 15 s pendant 2 min ;
  - quatre issues ;
  - « Retour aux paiements ».

Autres contraintes :

- **Le retour de paiement ne croit plus l'URL** (P1 de l'audit, `bucketFor`, `PaymentReturnClient.tsx:20-37`) :
  - **seul un statut serveur payé affiche « confirmé »** ;
  - un statut serveur `pending`, `partially_paid` ou absent affiche « en cours », et l'interrogation continue, quel que soit `status=` dans l'URL ;
  - un paiement introuvable affiche « lien invalide » ;
  - l'indice d'URL peut seulement choisir le texte d'attente (« en cours » plutôt qu'« échoué »), jamais une issue terminale positive.
- **« Vous êtes à jour » n'apparaît que pour `schedule_state=up_to_date`.**
- **Couleurs et icônes** : « Payé » en `--success`. L'icône de reçu ne porte aucun symbole monétaire (P3 de l'audit : « $ »).
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement, montants et dates par `useFormatteurs()`.

## Delta à produire

- [ ] Fonction de décision du retour, réécrite : statut serveur d'abord, l'URL jamais pour un succès. Écrans « en cours », « non abouti » et « lien invalide ».
- [ ] Carte de tête selon `schedule_state`, total et détail, « Comment payer à l'agence ».
- [ ] Carte « Prochain loyer », choix du moyen, historique avec la caution nommée.
- [ ] Carte « Mon bail » au bureau.
- [ ] Tests :
  - table de décision du retour (statut serveur × indice d'URL × paiement introuvable) ;
  - trois états de tête ;
  - total lu sur l'API ;
  - caution nommée ;
  - icône.

## Critères d'acceptation

- [ ] AC1 — `/app/payments/return?payment_type=lease-payments&payment_id=999999&status=success` n'affiche jamais « Paiement confirmé ». Un paiement `pending` côté serveur, avec `status=success` dans l'URL, affiche « en cours de confirmation » et continue d'interroger. Test de la fonction de décision, chaque statut serveur croisé avec chaque indice.
- [ ] AC2 — `locataire-f4` : la carte de tête affiche « À régler », le total servi par l'API (135 500 F sur la démo) et « à régler à l'agence ». Le texte « Vous êtes à jour » n'est pas dans le DOM.
- [ ] AC3 — `locataire-vrai` (bail actif, aucune échéance) : « Votre premier loyer n'est pas encore programmé », sans « à jour ».
- [ ] AC4 — À 390 px, le total et son geste sont visibles sans défilement.
- [ ] AC5 — La caution de la démo s'affiche « Caution · … », et jamais « Loyer du 1 juil. 2026 au 1 juil. 2026 ».

## Hors périmètre

- La page « Loyers » du bailleur (TCK-2651).
- La page de paiement par lien `/pay/[token]` (famille 1, TCK-2505).
- La relance automatique graduée (ambition).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

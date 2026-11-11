---
id: TCK-2645
title: "Fiche du bail : le dossier d'une location, avec les parties nommées, un geste principal par état, la révision en feuille et le contrat pour tous"
status: todo
phase: P1
family: front
estimate: L
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2642, TCK-2644, TCK-2679, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#15-leasepayment-"
tags: [front, leases, mobile, audit-ux, app]
---

## Objectif utilisateur

Qui ouvre un bail sait tout de suite de qui et de quel bien il s'agit, si le loyer est à jour et quel est le geste à faire. Ce geste est :

- pour l'agence : encaisser, envoyer à la signature ou relancer ;
- pour le locataire : payer ou télécharger sa quittance.

Les gestes lourds ne sont pas au premier rang.

## Contrat de données

- `GET /api/leases/{id}` avec `include=tenant,landlord,agent,property`, `next_due`, `overdue_*`, `rent_review_cap_pct` et les `abilities` élargies (TCK-2642).
- Échéancier, caution, garants, chaîne, signature, préavis, résiliation, renouvellement, restitution : les endpoints existants.
- Révision : `PATCH /api/leases/{lease}/rent` avec `new_rent`, `reason` et `effective_date` ; 422 au-delà du plafond ; `force` seulement avec `leases.rent_review_force`.
- Contrat : `GET /api/leases/{lease}/contract/pdf`. L'API l'autorise par `view`, le front le refusait au bailleur et au personnel.
- Relance d'un impayé : l'aide partagée de TCK-2644.
- État des lieux du bail : `GET /api/inventories?filter[lease_id]=`, et la création `/app/inventories/new?lease=`.

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-baux&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écrans « Fiche — dossier du bail » et « Feuille Réviser le loyer », au téléphone et au bureau.
- **En-tête** :
  - « Bail de {locataire} », le bien en lien, les pastilles statut · type ;
  - les parties (locataire, bailleur, agent), chacune avec les boutons ronds Appeler / WhatsApp.
- **Cartes du dossier** :
  - **Loyer** : montant / mois, « échéance le N », état du mois, « Pénalité … due » ;
  - **Charges** (TCK-2679, décision du porteur du 2026-11-10) : « Charges mensuelles : … » sous le loyer, seulement quand le bail en porte ;
  - **Durée** : début → fin, préavis ;
  - **Caution** : montant, « encaissée le … ».
- **Liens du dossier** : « Échéancier (n) › », « État des lieux d'entrée · signé › » (ou « Programmer l'état des lieux »), « Contrat PDF › », « Interventions (n) › », « Documents ».
- **Geste principal** dans la barre collée au téléphone, et dans la carte « Actions » au bureau :

  | Qui, dans quel état | Geste principal |
  |---|---|
  | Gestion, bail actif | « Encaisser » |
  | Brouillon | « Envoyer à la signature » |
  | En attente de signature | « Relancer la signature » |
  | Locataire avec une échéance due | « Payer » |
  | Locataire à jour | « Télécharger ma quittance » |

- **Feuille « Gestes »** (« ⋯ ») pour le reste :
  - Réviser le loyer, Renouveler, Ajouter un document, Restituer la caution ;
  - Générer l'échéancier, **seulement quand il n'existe pas** ;
  - Résilier, dernier et séparé.
- **Feuille « Réviser le loyer »** (dialogue centré au bureau) :
  - loyer actuel ;
  - nouveau loyer, en saisie groupée ;
  - aperçu « +X F · +Y % » ;
  - « À partir du … » ;
  - motif : liste (indexation, travaux, accord des parties) plus texte ;
  - plafond rappelé ;
  - mention « Le locataire et le bailleur sont prévenus ».
- **Échéancier** :
  - l'échéance en cours en tête ;
  - la caution en carte séparée au-dessus des loyers ;
  - la pénalité se lit comme un état (« Pénalité 67 750 F · réglée le 12 oct. » / « due »), et son action « Marquer la pénalité réglée » passe dans le menu de la ligne ;
  - « Payé » en `--success`, jamais en terracotta (la couleur d'action).
- **Locataire : la fiche s'intitule « Mon bail »** :
  - en tête, le prochain loyer et « Payer » ;
  - « Télécharger mon contrat » ;
  - « Donner mon préavis » dans « ⋯ », précédé de son délai et de sa pénalité ;
  - ses états vides parlent de son logement (« Votre agence prépare votre échéancier »), jamais « Générez l'échéancier ».
- **Bureau (≥ 1280 px)** : deux colonnes dès `lg`. À gauche les cartes et l'échéancier (les 6 prochaines échéances) ; à droite une carte collante « Parties » et une carte « Actions ». Onglets « Dossier · Documents · Historique ».

## Contraintes strictes (métier)

**Rien ne se perd** (audit famille 4, § 3, *Fonctions existantes* 5-13, lues dans `components/leases/*`) :

- retour aux baux, référence, statut, type, alerte « N échéances en retard » ;
- tous les gestes selon `abilities` :
  - ajouter un document, générer l'échéancier, réviser, enregistrer un paiement reçu ;
  - renouveler, résilier ;
  - contrat PDF, préavis ;
- chaîne des baux (`LeaseChainTimeline`) ;
- panneau de signature par code (`LeaseSignaturePanel`), avec relance et voie papier ;
- bannière de résiliation anticipée annulable ;
- bannière de restitution de caution ;
- durée, loyer, caution ; conditions générales et particulières ;
- échéancier : période, échéance, montant, pénalité, statut, **quittance PDF**, « Pénalité réglée », encaissement par échéance, lien de paiement ;
- caution : montant initial, remboursements, restitution (montant, retenue, motif) ;
- garants : jusqu'à 3, avec leurs documents ;
- invitation à laisser un avis ;
- dialogues : paiement reçu, renouvellement, préavis ou résiliation, restitution, « passer outre ».

Autres contraintes :

- **Aucun geste ni texte ne dépend de `user.roles`** (P2 de l'audit : écran du mauvais profil pendant le chargement). Tout suit `abilities`, `can_sign_as` et les nouvelles clés de TCK-2642. Tant qu'elles ne sont pas chargées, aucun geste n'est rendu.
- **Le contrat PDF est offert à toute partie qui a `download_contract`** : locataire, bailleur et personnel (§1.4, P1 de l'audit).
- **Aucun `window.prompt`** ne subsiste dans la fiche.
- **Révision** : l'erreur 422 de plafond se pose sur le champ montant, et « passer outre » n'est offert qu'avec la capacité.
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement, montants et dates par `useFormatteurs()`.

## Delta à produire

- [ ] En-tête du dossier, cartes, liens du dossier, et geste principal selon l'état et l'appelant.
- [ ] Feuille « Gestes », et feuille ou dialogue « Réviser le loyer ».
- [ ] Échéancier : caution séparée, pénalité comme état, couleur de statut.
- [ ] Vue « Mon bail » du locataire.
- [ ] Gestes branchés sur les seules capacités.
- [ ] Tests :
  - contrat PDF pour le bailleur et l'admin ;
  - révision (charge utile, 422 de plafond) ;
  - aucun geste rendu avant les capacités ;
  - un geste principal par état ;
  - « Générer l'échéancier » absent quand l'échéancier existe ;
  - préavis dans « ⋯ » chez le locataire.

## Critères d'acceptation

- [ ] AC1 — Le bailleur ouvre le bail 80 : « Contrat PDF » est présent, et son clic fait `GET /api/leases/80/contract/pdf` → 200.
- [ ] AC2 — Réviser à 700 000 F à partir du 1ᵉʳ janvier envoie `PATCH /api/leases/{id}/rent` avec `{new_rent: 700000, reason, effective_date: "…-01-01"}`. Au-delà du plafond, l'erreur s'affiche sous le champ montant. `grep -n "window.prompt" components/leases` ne rend rien.
- [ ] AC3 — Un rendu de la fiche par l'admin, avec un profil encore vide, ne montre à aucun moment « Donner mon préavis » ni « Laisser un avis ». Test qui rend la fiche avant le chargement des capacités.
- [ ] AC4 — À 390 px :
  - le locataire, le bien et l'état du mois sont visibles sans défiler ;
  - la barre collée porte un seul bouton principal ;
  - sur un bail dont l'échéancier existe, « Générer l'échéancier » n'apparaît nulle part.
- [ ] AC5 — La caution s'affiche dans sa carte (« Caution · 2 710 000 F · encaissée le 1 juil. ») et ne figure pas parmi les loyers. Le statut « Payé » porte la couleur `--success`.
- [ ] AC6 — Chez le locataire, le premier écran à 390 px ne contient pas de bouton « Donner mon préavis ». Dans « ⋯ », le geste est précédé de son délai et de sa pénalité.
- [ ] AC7 — Sur un bail en retard, « Relancer » produit la même URL `wa.me` que la file de TCK-2644 (même aide).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2645.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La file et la liste (TCK-2644), la création (TCK-2643).
- Le renouvellement proactif (ambition).
- Le fil d'Ariane et le titre dans l'en-tête de la coque (famille 3).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

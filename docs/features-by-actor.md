# Takussan — Fonctionnalités par acteur

> ## 🤖 FICHIER GÉNÉRÉ — ne pas éditer à la main
>
> Produit par `node docs/gen-features-by-actor.mjs` depuis [`features.md`](./features.md),
> qui reste la **source de vérité**. Toute correction se fait dans la source, puis on régénère.
>
> Ce fichier était maintenu à la main. Il a gelé au 2026-04-14 pendant que sa source évoluait
> six fois, et a porté six semaines un bandeau « miroir désynchronisé » — un aveu, pas un
> correctif. Il est désormais dérivé (TCK-311).

Vue par acteur du catalogue fonctionnel. Chaque ligne provient de la section indiquée en
colonne **Domaine**. Une fonctionnalité portée par plusieurs acteurs apparaît dans la section
de chacun d'eux — le dédoublement est voulu, la source de vérité ne l'est pas.

---

## Légende

| Icône | Acteur |
|-------|--------|
| 👤 | Visiteur anonyme (pas encore de compte) |
| 🏠 | Locataire / Acheteur (Customer) |
| 🏢 | Bailleur / Propriétaire (owner) |
| 🧑‍💼 | Agent immobilier |
| 🛡️ | Admin d'agence / Super-admin |

| Code | Signification |
|------|---------------|
| **P0** | MVP bloquant |
| **P1** | MVP important |
| **P2** | V2 |
| **P3** | Futur / nice-to-have |

---

## Sommaire

1. [👤 Visiteur anonyme (pas encore de compte)](#visiteur-anonyme-pas-encore-de-compte) — 11 fonctionnalités
2. [🏠 Locataire / Acheteur (Customer)](#locataire-acheteur-customer) — 43 fonctionnalités
3. [🏢 Bailleur / Propriétaire (owner)](#bailleur-propriétaire-owner) — 38 fonctionnalités
4. [🧑‍💼 Agent immobilier](#agent-immobilier) — 68 fonctionnalités
5. [🛡️ Admin d'agence / Super-admin](#admin-dagence-super-admin) — 63 fonctionnalités
6. [👥 Tous les utilisateurs authentifiés](#tous-les-utilisateurs-authentifiés) — 55 fonctionnalités
7. [⚠️ 🔧 — acteur non déclaré dans la légende de `features.md`](#acteur-non-déclaré-dans-la-légende-de-featuresmd) — 1 fonctionnalité

---

## 👤 Visiteur anonyme (pas encore de compte)

### §1.2 Recherche & découverte publique

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.2 | Page d'accueil (biens en vedette, derniers ajouts) |
| P0 | §1.2 | Recherche plein-texte sur les biens |
| P0 | §1.2 | Filtres de base (ville, type, prix, chambres, surface, transaction) |
| P0 | §1.2 | Fiche bien publique (galerie, détails, formulaire de contact) |
| P0 | §1.2 | Tri des résultats (prix, récence, pertinence) |
| P1 | §1.2 | Filtres avancés (amenités, disponibilité, étage, meublé) |
| P1 | §1.2 | Partage d'un bien (lien, réseaux sociaux) |

### §1.11 Avis & réputation

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.11 | Consulter les avis publics |
| P2 | §1.11 | Signaler un avis inapproprié (déclenche modération) |

### §1.12 Agence & équipe

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.12 | Auto-création d'une agence `individual` via la CTA "Publier" du header (pattern Airbnb) — wizard 5 steps qui crée simultanément `Agency.kind=individual`, `AgencyAdminProfile`, `OwnerProfile` et un premier `Property` brouillon |

### §2.1 Authentification & comptes

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.1 | Onboarding wizard Customer post-signup — welcome modale (3 slides skippables) + complétion différée du profil minimal (téléphone, ville, type de recherche) au moment de la première action sensible (favoris / réservation / contact) |

---

## 🏠 Locataire / Acheteur (Customer)

### §1.2 Recherche & découverte publique

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.2 | Page d'accueil (biens en vedette, derniers ajouts) |
| P0 | §1.2 | Recherche plein-texte sur les biens |
| P0 | §1.2 | Filtres de base (ville, type, prix, chambres, surface, transaction) |
| P0 | §1.2 | Fiche bien publique (galerie, détails, formulaire de contact) |
| P0 | §1.2 | Tri des résultats (prix, récence, pertinence) |
| P1 | §1.2 | Filtres avancés (amenités, disponibilité, étage, meublé) |
| P1 | §1.2 | Recherche par carte interactive |
| P1 | §1.2 | Favoris (ajout / retrait / liste personnelle) |
| P1 | §1.2 | Recherches sauvegardées avec alertes email |
| P1 | §1.2 | Partage d'un bien (lien, réseaux sociaux) |
| P2 | §1.2 | Comparateur de biens côte à côte |
| P2 | §1.2 | Biens similaires / suggestions personnalisées |
| P2 | §1.2 | Historique local des biens consultés (stockage navigateur) |
| P3 | §1.2 | Recherche vocale / en langage naturel |

### §1.3 Réservations courte durée & visites

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.3 | Demander une réservation (dates, montant, caution) |
| P1 | §1.3 | Paiement d'acompte et solde — **acompte = 30 % du total** (estimation affichée dans le tunnel de réservation, règle stable). Quand le besoin de varier par bien/contrat apparaîtra, déplacer le calcul backend via un endpoint `GET /api/bookings/quote`. |
| P1 | §1.3 | Consultation des paiements liés à la réservation |
| P2 | §1.3 | Expiration automatique des demandes non traitées |
| P2 | §1.3 | Planification de visites : en personne, virtuelle, en autonomie ou hybride ; agent accompagnateur, durée estimée, feedback post-visite |
| P2 | §1.3 | Rappels automatiques avant visite |
| P3 | §1.3 | Annulation avec remboursement partiel automatisé |

### §1.4 Location longue durée (baux)

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.4 | Enregistrer un paiement mensuel |
| P2 | §1.4 | Révision annuelle du loyer (indice ou accord amiable) journalisée via le journal d'activité |
| P3 | §1.4 | Signature électronique du bail |
| P3 | §1.4 | Espace locataire dédié (quittances, factures, maintenance) |
| P1 | §1.4 | Onboarding résident à la signature du bail : notification "Bienvenue chez vous", welcome modale "Espace résident", checklist d'entrée (état des lieux, premier paiement, accès aux documents), suivi de complétion par un `TenantOnboardingChecklist` |

### §1.7 Communication & messagerie

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.7 | Conversation privée 1↔1 entre client et agent / bailleur |
| P1 | §1.7 | Envoyer un message texte avec pièces jointes |
| P1 | §1.7 | Liste des conversations avec statut non lu |
| P1 | §1.7 | Notification en temps réel (in-app + email) |
| P2 | §1.7 | Accusés de lecture individuels (si > 5 participants) |
| P2 | §1.7 | Recherche dans l'historique des messages |
| P3 | §1.7 | Appels audio / vidéo intégrés |
| P3 | §1.7 | Traduction automatique FR ↔ EN ↔ WO |

### §1.8 Maintenance & interventions

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.8 | Signaler un problème avec photos et description |
| P1 | §1.8 | Consulter l'historique des interventions par bien |

### §1.9 État des lieux & inventaires

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.9 | Signature des deux parties (locataire + bailleur) |

### §1.10 Documents & contrats

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.10 | Partage sécurisé par lien temporaire |

### §1.11 Avis & réputation

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.11 | Laisser un avis sur un bien, un agent ou une agence |
| P2 | §1.11 | Signaler un avis inapproprié (déclenche modération) |

### §1.12 Agence & équipe

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.12 | Auto-création d'une agence `individual` via la CTA "Publier" du header (pattern Airbnb) — wizard 5 steps qui crée simultanément `Agency.kind=individual`, `AgencyAdminProfile`, `OwnerProfile` et un premier `Property` brouillon |

### §2.1 Authentification & comptes

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.1 | Onboarding wizard Customer post-signup — welcome modale (3 slides skippables) + complétion différée du profil minimal (téléphone, ville, type de recherche) au moment de la première action sensible (favoris / réservation / contact) |

### §2.5 Reporting & tableaux de bord

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.5 | Dashboard locataire (prochaines échéances, documents) |

---

## 🏢 Bailleur / Propriétaire (owner)

### §1.1 Gestion des biens

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.1 | Créer un bien (type, transaction vente/location, caractéristiques) |
| P1 | §1.1 | Historique de prix automatique à chaque changement |
| P1 | §1.1 | Gérer une hiérarchie de biens (immeuble → étages → lots) |
| P1 | §1.1 | Renseigner le type de titre foncier (bail, titre foncier, délibération, autre) |
| P3 | §1.1 | Marquer un bien comme nécessitant un suivi administratif particulier |

### §1.3 Réservations courte durée & visites

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.3 | Accepter, refuser ou annuler une demande |
| P1 | §1.3 | Paiement d'acompte et solde — **acompte = 30 % du total** (estimation affichée dans le tunnel de réservation, règle stable). Quand le besoin de varier par bien/contrat apparaîtra, déplacer le calcul backend via un endpoint `GET /api/bookings/quote`. |
| P1 | §1.3 | Vue calendrier agrégée à partir des réservations confirmées et des visites planifiées |
| P1 | §1.3 | Consultation des paiements liés à la réservation |

### §1.4 Location longue durée (baux)

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.4 | Créer un bail (locataire, bailleur, durée, loyer, caution) |
| P1 | §1.4 | Générer l'échéancier de loyers mensuels |
| P1 | §1.4 | Enregistrer un paiement mensuel |
| P1 | §1.4 | Appliquer automatiquement des pénalités de retard sur les paiements en retard |
| P1 | §1.4 | Consultation de l'historique complet d'un bail |
| P2 | §1.4 | Renouveler un bail ou créer un avenant (loyer, durée, conditions) avec traçabilité du bail parent |
| P2 | §1.4 | Résiliation anticipée avec calcul des pénalités |
| P2 | §1.4 | Révision annuelle du loyer (indice ou accord amiable) journalisée via le journal d'activité |
| P3 | §1.4 | Signature électronique du bail |

### §1.5 Transactions & paiements

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.5 | Générer une facture à un Customer destinataire |
| P1 | §1.5 | Reversement au bailleur après commission (Payout) |

### §1.7 Communication & messagerie

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.7 | Conversation privée 1↔1 entre client et agent / bailleur |
| P1 | §1.7 | Envoyer un message texte avec pièces jointes |
| P1 | §1.7 | Liste des conversations avec statut non lu |
| P1 | §1.7 | Notification en temps réel (in-app + email) |
| P2 | §1.7 | Conversations de groupe (multi-participants) |
| P2 | §1.7 | Accusés de lecture individuels (si > 5 participants) |
| P2 | §1.7 | Recherche dans l'historique des messages |
| P3 | §1.7 | Appels audio / vidéo intégrés |
| P3 | §1.7 | Traduction automatique FR ↔ EN ↔ WO |

### §1.8 Maintenance & interventions

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.8 | Consulter l'historique des interventions par bien |
| P2 | §1.8 | Demande de devis et validation avant travaux |

### §1.9 État des lieux & inventaires

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.9 | Signature des deux parties (locataire + bailleur) |

### §1.10 Documents & contrats

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.10 | Partage sécurisé par lien temporaire |

### §1.11 Avis & réputation

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.11 | Répondre publiquement à un avis |
| P2 | §1.11 | Signaler un avis inapproprié (déclenche modération) |
| P3 | §1.11 | Badges de réputation |

### §2.1 Authentification & comptes

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.1 | Wizard onboarding Owner post-acceptation invitation — vérification téléphone OTP (obligatoire), KYC documentaire (CNI/passeport, RIB, NINEA, statut particulier/société) en `pending_review` non bloquant, tour produit 3 slides, vue "biens déjà associés" si pré-rattachement |

### §2.5 Reporting & tableaux de bord

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.5 | Dashboard bailleur (portefeuille, cashflow, occupation) |

---

## 🧑‍💼 Agent immobilier

### §1.1 Gestion des biens

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.1 | Créer un bien (type, transaction vente/location, caractéristiques) |
| P0 | §1.1 | Associer une adresse géolocalisée |
| P0 | §1.1 | Uploader des photos |
| P0 | §1.1 | Définir le statut (disponible / réservé / vendu / loué / archivé) |
| P0 | §1.1 | Publier et dépublier un bien |
| P0 | §1.1 | Modifier / supprimer un bien (soft delete) |
| P0 | §1.1 | Attribuer automatiquement une référence unique à chaque bien (ex : TK-2025-001) |
| P1 | §1.1 | Uploader plans, vidéos et visites virtuelles 360° |
| P1 | §1.1 | Associer des tags / amenités (piscine, climatisation, meublé…) |
| P1 | §1.1 | Historique de prix automatique à chaque changement |
| P1 | §1.1 | Ajouter des collaborateurs au bien avec part de commission explicite et permissions granulaires |
| P1 | §1.1 | Gérer une hiérarchie de biens (immeuble → étages → lots) |
| P1 | §1.1 | Renseigner le type de titre foncier (bail, titre foncier, délibération, autre) |
| P1 | §1.1 | Compteurs de vues et de favoris |
| P2 | §1.1 | Dupliquer un bien (modèle / template) |
| P2 | §1.1 | Archivage en lot |
| P3 | §1.1 | Import CSV / API externe (MLS, syndication) |
| P3 | §1.1 | Estimation automatique de prix (IA / comparables) |

### §1.3 Réservations courte durée & visites

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.3 | Accepter, refuser ou annuler une demande |
| P2 | §1.3 | Planification de visites : en personne, virtuelle, en autonomie ou hybride ; agent accompagnateur, durée estimée, feedback post-visite |
| P2 | §1.3 | Rappels automatiques avant visite |

### §1.4 Location longue durée (baux)

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.4 | Créer un bail (locataire, bailleur, durée, loyer, caution) |
| P1 | §1.4 | Ajouter un ou plusieurs garants avec documents joints |
| P1 | §1.4 | Générer l'échéancier de loyers mensuels |
| P1 | §1.4 | Relances automatiques en cas d'impayé |
| P1 | §1.4 | Appliquer automatiquement des pénalités de retard sur les paiements en retard |
| P1 | §1.4 | Remboursement de la caution en fin de bail |
| P1 | §1.4 | Consultation de l'historique complet d'un bail |
| P2 | §1.4 | Renouveler un bail ou créer un avenant (loyer, durée, conditions) avec traçabilité du bail parent |
| P2 | §1.4 | Résiliation anticipée avec calcul des pénalités |
| P1 | §1.4 | Onboarding résident à la signature du bail : notification "Bienvenue chez vous", welcome modale "Espace résident", checklist d'entrée (état des lieux, premier paiement, accès aux documents), suivi de complétion par un `TenantOnboardingChecklist` |

### §1.6 CRM & relation client

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.6 | Créer un Customer (avec ou sans compte User) |
| P0 | §1.6 | Liste et recherche de clients |
| P1 | §1.6 | Lier un Customer à un User existant |
| P1 | §1.6 | Définir la relation agent ↔ client (type, période) |
| P1 | §1.6 | Joindre pièces d'identité et documents |
| P1 | §1.6 | Historique d'interactions (via journal d'activité) |
| P1 | §1.6 | Désigner un contact principal parmi les agents liés à un client |
| P1 | §1.6 | Ajouter des notes horodatées et signées par un agent sur un client |
| P2 | §1.6 | Pipeline de prospects (stades, conversion) |
| P2 | §1.6 | Tâches et rappels attachés à un client |
| P2 | §1.6 | Segmentation et tags clients |
| P3 | §1.6 | Campagnes email / SMS ciblées |

### §1.7 Communication & messagerie

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.7 | Conversation privée 1↔1 entre client et agent / bailleur |
| P2 | §1.7 | Conversations de groupe (multi-participants) |

### §1.8 Maintenance & interventions

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.8 | Assigner un prestataire (service provider) |
| P1 | §1.8 | Suivi des statuts (nouveau, en cours, résolu, annulé) |
| P1 | §1.8 | Ajouter photos et rapport après intervention |
| P2 | §1.8 | Demande de devis et validation avant travaux |
| P2 | §1.8 | Priorisation des demandes (urgent, normal, bas) |
| P3 | §1.8 | Contrats de maintenance récurrents |

### §1.9 État des lieux & inventaires

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.9 | Créer un inventaire d'entrée ou de sortie |
| P1 | §1.9 | Photos par pièce et état par élément |
| P1 | §1.9 | Consulter / éditer un inventaire |
| P2 | §1.9 | Export PDF de l'état des lieux |
| P3 | §1.9 | Comparaison automatique entrée ↔ sortie |
| P3 | §1.9 | Reconnaissance IA de dégradations sur photos |

### §1.10 Documents & contrats

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.10 | Uploader un document lié à une entité (bien, bail, client…) |
| P1 | §1.10 | Catégoriser par type (contrat, CNI, RIB, quittance, justificatif) |
| P1 | §1.10 | Recherche dans la bibliothèque de documents |
| P2 | §1.10 | Génération PDF (quittance, facture, bail) depuis templates |
| P2 | §1.10 | Historique des versions d'un document (via medialibrary + journal d'activité) |
| P3 | §1.10 | Signature électronique intégrée |
| P3 | §1.10 | OCR et extraction automatique de données |

### §1.11 Avis & réputation

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.11 | Répondre publiquement à un avis |
| P3 | §1.11 | Badges de réputation |

### §2.1 Authentification & comptes

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.1 | Wizard onboarding Agent post-acceptation invitation — vérification téléphone OTP, KYC (license_number, pièce d'identité, photo profil, spécialisation, zones d'intervention), affichage du périmètre de permissions choisi par l'admin inviteur, lien vers premier lead pré-assigné |

### §2.5 Reporting & tableaux de bord

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.5 | Dashboard agent (pipeline, commissions, tâches) |

---

## 🛡️ Admin d'agence / Super-admin

### §1.1 Gestion des biens

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.1 | Modération et validation avant publication |
| P3 | §1.1 | Marquer un bien comme nécessitant un suivi administratif particulier |

### §1.5 Transactions & paiements

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.5 | Enregistrer un paiement (réservation ou bail) |
| P1 | §1.5 | Générer une facture à un Customer destinataire |
| P1 | §1.5 | Historique des paiements par entité (bien, bail, client) |
| P1 | §1.5 | Suivi des statuts (en attente, payé, remboursé, annulé) |
| P2 | §1.5 | Intégration d'une passerelle de paiement (Wave, Orange Money, Stripe) |
| P2 | §1.5 | Rapprochement bancaire semi-automatique |
| P2 | §1.5 | Relance automatique des factures en retard |
| P2 | §1.5 | Reversement plateforme → agence (commission plateforme retenue à la source, payout périodique agrégé) |
| P3 | §1.5 | Commissions automatiques par agent / collaborateur |
| P3 | §1.5 | Comptabilité exportable (FEC, journaux) |

### §1.8 Maintenance & interventions

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P3 | §1.8 | Facturation directe prestataire → agence |

### §1.11 Avis & réputation

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.11 | Modération (masquer, supprimer) |
| P3 | §1.11 | Détection automatique d'avis suspects |

### §1.12 Agence & équipe

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.12 | Créer et configurer une agence (nom, licence, contact, logo) |
| P0 | §1.12 | Ajouter et retirer des agents |
| P0 | §1.12 | Attribution de rôles aux membres |
| P1 | §1.12 | Statistiques globales d'agence (portefeuille, revenus) |
| P1 | §1.12 | Paramètres de commission par défaut |
| P1 | §1.12 | Dossier KYC documentaire de l'agence (RCCM, NINEA, pièce dirigeant) avec workflow vérification (pending → submitted → verified / rejected) |
| P1 | §1.12 | Upgrade `individual` → `standard` : l'admin de l'agence individuelle soumet une demande (`AgencyUpgradeRequest`) avec compléments légaux (RC, NINEA, RIB pro, statuts) ; un super-admin la review depuis la console ; à l'approbation, `Agency.kind` bascule vers `standard` et débloque les capacités restreintes (invitation collaborateurs internes, multi-admin, custom roles, etc.). Pas d'upgrade self-service direct, pas de rétrogradation `standard` → `individual`. |
| P2 | §1.12 | Plans d'abonnement et quotas par agence (catalogue, période d'essai, limites) |
| P3 | §1.12 | Gestion multi-branches / sous-agences |
| P3 | §1.12 | Gestion des congés / disponibilité des agents |
| P3 | §1.12 | Marketplace inter-agences |

### §2.1 Authentification & comptes

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §2.1 | Déclenchement de l'export RGPD par un super-admin pour le compte d'un utilisateur (support / réquisition) |
| P0 | §2.1 | Toute capacité est résolue dans le scope du profil actif — pour un couple *(utilisateur, agence)*, jamais globalement ([ADR-0003](adr/0003-capacites-enum-code-defined.md)) |
| P1 | §2.1 | Création/désactivation d'un profil par un agency_admin (ex. nouvel agent recruté) |
| P2 | §2.1 | Audit log dédié : changements de profil actif, créations/suspensions de profils |
| P0 | §2.1 | Bootstrap super-admin via commande artisan `takussan:create-super-admin` (1ère installation par environnement) — exige 2FA TOTP au premier login |
| P1 | §2.1 | Cooptation super-admin (super-admin → super-admin) — invitation pair-à-pair via console super-admin avec 2FA TOTP **obligatoire** avant `active` (bloquant), audit log automatique, notification broadcast aux autres super-admins |

### §2.2 Rôles & permissions

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.2 | Rôles prédéfinis : `super_admin` (porté par `PlatformProfile`, hors agence) ; `agency_admin`, `agent`, `owner`, `tenant`, `customer`, `service_provider` (portés par le profil polymorphe correspondant, scopés par son agence) |
| P0 | §2.2 | Permissions granulaires par ressource (view, create, update, delete, update_all…) |
| P0 | §2.2 | Distinction « mes ressources » vs « toutes les ressources » |
| P0 | §2.2 | Résolution des permissions au runtime selon le **profil actif** de la requête (header `X-Profile-Id`, cookie ou auto-bascule) |
| P1 | §2.2 | Attribution et retrait de rôles à un profil (et non à un user global) |
| P1 | §2.2 | Éditeur de rôles personnalisés scopé par agence (réservé aux agences `standard`) — un « rôle personnalisé » est un ensemble de `Capability` nommé, porté par l'agence ; le mécanisme reste à concevoir, `Capability` étant défini en code ([ADR-0003](adr/0003-capacites-enum-code-defined.md)) |
| P2 | §2.2 | Délégation temporaire de permissions |
| P3 | §2.2 | Règles conditionnelles (policies dynamiques) |

### §2.3 Notifications

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §2.3 | Annonces in-app cross-tenant (broadcast) ciblées par rôle / agence / segment, avec dismissal côté utilisateur |

### §2.5 Reporting & tableaux de bord

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.5 | Dashboard agence (biens, vues, revenus, impayés) |
| P2 | §2.5 | Export CSV / Excel (paiements, baux, clients) |
| P2 | §2.5 | Export PDF (quittances, factures, rapports) |
| P2 | §2.5 | Graphiques temporels (revenus, occupation) |
| P2 | §2.5 | Reporting plateforme cross-tenant (croissance agences/users/listings, MRR/ARR, cohortes de rétention, funnel) — strictement super_admin |
| P3 | §2.5 | KPI personnalisables par agence |
| P3 | §2.5 | Alertes sur seuils (taux d'impayés, vacance) |

### §2.6 Audit & traçabilité

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.6 | Journal d'activité automatique sur entités critiques |
| P1 | §2.6 | Consultation du journal par entité |
| P1 | §2.6 | Filtrage par utilisateur, date, action |
| P2 | §2.6 | Export de l'audit trail |
| P3 | §2.6 | Alertes sur actions sensibles |

### §2.9 Administration & configuration

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.9 | Gestion des tags et amenités |
| P0 | §2.9 | Gestion des utilisateurs (activation, blocage) |
| P0 | §2.9 | Onboarding d'une agence par un super-admin (création + admin initial invité, hors auto-inscription) |
| P1 | §2.9 | Gestion des enums métier (types de biens, statuts) |
| P1 | §2.9 | Configuration email (templates, expéditeur) |
| P2 | §2.9 | Paramètres globaux de plateforme |
| P2 | §2.9 | Gestion des intégrations tierces (API keys) |
| P2 | §2.9 | Healthcheck plateforme et supervision des jobs en arrière-plan (file de queue, échecs, rejouer) |
| P3 | §2.9 | Mode maintenance programmé |
| P3 | §2.9 | Feature flags |

---

## 👥 Tous les utilisateurs authentifiés

> Fonctionnalités transverses, marquées « Tous » dans `features.md` : elles valent pour tout utilisateur authentifié, quel que soit son profil. Elles ne sont pas répétées dans les sections par acteur ci-dessus.

### §2.1 Authentification & comptes

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.1 | Inscription par email et mot de passe |
| P0 | §2.1 | Connexion (tokens Sanctum) |
| P0 | §2.1 | Déconnexion et révocation de token |
| P0 | §2.1 | Mot de passe oublié et réinitialisation |
| P0 | §2.1 | Vérification de l'adresse email |
| P0 | §2.1 | Édition de profil (nom, bio, avatar) |
| P1 | §2.1 | Vérification du numéro de téléphone (SMS / OTP) |
| P1 | §2.1 | OAuth Google (Socialite) |
| P1 | §2.1 | Authentification à deux facteurs (TOTP + codes de récupération) |
| P1 | §2.1 | Gestion des sessions actives |
| P2 | §2.1 | Suppression de compte avec anonymisation (RGPD) |
| P2 | §2.1 | Export des données personnelles (portabilité RGPD — déclenché par l'utilisateur) |
| P2 | §2.1 | OAuth Facebook / Apple |
| P3 | §2.1 | Magic link de connexion |
| P0 | §2.1 | Liste des profils du compte (`GET /api/me/profiles`) |
| P0 | §2.1 | Sélection du **profil actif** pour la session (`PATCH /api/me/active-profile`) |
| P0 | §2.1 | Bascule automatique du profil actif si l'utilisateur n'a qu'un seul profil |
| P0 | §2.1 | Switch de profil exposé en UI (header / menu compte) — change l'agence et les permissions sans nouvelle authentification |
| P1 | §2.1 | KYC distinct par profil (pièces d'identité, RIB, license, assurance — un dossier par profil) |
| P2 | §2.1 | Indication visuelle de "profil actif" sur toutes les vues authentifiées |
| P0 | §2.1 | Pattern d'invitation unifié — création par un inviteur autorisé, email d'invitation avec token signé (expiry 7j, rappel automatique J+2, renvoi self-service par l'inviteur, révocation possible avant acceptation) ; à l'acceptation, le profil cible passe en `active` et devient le profil actif |
| P1 | §2.1 | Composant wizard reprenable — chaque step sauvegardé en `draft`, bandeau persistant "Reprenez votre publication / votre onboarding" sur dashboard, reprise depuis le menu compte |
| P1 | §2.1 | Welcome modale générique réutilisable — composant 3 slides max, skippable, paramétrable par parcours (Customer, Host, Owner, Agent, AgencyAdmin, ServiceProvider, Tenant) |

### §2.3 Notifications

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.3 | Centre de notifications in-app (cloche + feed) |
| P0 | §2.3 | Marquer comme lu / non lu |
| P0 | §2.3 | Notifications email transactionnelles |
| P1 | §2.3 | Notifications push web et mobile |
| P1 | §2.3 | Préférences par canal (email, push, SMS) |
| P1 | §2.3 | Templates localisés via fichiers lang/ Laravel |
| P2 | §2.3 | Notifications SMS (événements critiques) |
| P2 | §2.3 | Digest quotidien / hebdomadaire |
| P3 | §2.3 | Notifications WhatsApp |

### §2.4 Recherche & filtres

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.4 | Recherche plein-texte sur les biens (Scout) |
| P0 | §2.4 | Filtres dynamiques via paramètres de requête |
| P0 | §2.4 | Pagination standardisée |
| P1 | §2.4 | Tri dynamique sur toutes les colonnes listables |
| P1 | §2.4 | Recherches sauvegardées par utilisateur |
| P2 | §2.4 | Recherche full-text sur messages et documents |
| P2 | §2.4 | Suggestions d'autocomplétion |
| P3 | §2.4 | Recherche sémantique par embeddings |

### §2.7 Médias & fichiers

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.7 | Upload de fichiers avec validation de type et taille |
| P0 | §2.7 | Conversions d'images (thumbnail, preview, responsive) |
| P0 | §2.7 | Suppression sécurisée |
| P1 | §2.7 | Upload multiple avec drag & drop |
| P1 | §2.7 | Réorganisation des médias par glisser-déposer |
| P2 | §2.7 | Optimisation CDN et formats modernes (webp, avif) |
| P2 | §2.7 | Watermark automatique sur photos de biens |
| P3 | §2.7 | Streaming vidéo adaptatif |

### §2.8 Internationalisation & préférences

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.8 | Langues : FR, EN, WO |
| P0 | §2.8 | Sélection de la langue par utilisateur |
| P1 | §2.8 | Fuseau horaire utilisateur (par défaut Africa/Dakar) |
| P1 | §2.8 | Format de date et nombre localisé |
| P2 | §2.8 | Devise configurable par agence (XOF par défaut, EUR, USD) |
| P3 | §2.8 | Conversion multi-devises avec taux de change |
| P3 | §2.8 | Traduction automatique des contenus utilisateurs |

---

## ⚠️ 🔧 — acteur non déclaré dans la légende de `features.md`

> Ce jeton apparaît dans la colonne « Acteurs » de `features.md` sans figurer dans son tableau `### Acteurs`. Le générateur le remonte plutôt que de le taire : c'est un défaut de la source, pas de la vue.

### §2.1 Authentification & comptes

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.1 | Wizard onboarding Service Provider post-acceptation invitation — vérification téléphone OTP, KYC (pièce d'identité, métiers multi-select, zones, tarifs indicatifs, assurance RC pro optionnelle valorisée), disponibilités hebdomadaires, accès direct à la 1ère intervention si invitation déclenchée par une demande active. Multi-rattachement à plusieurs agences via plusieurs `ServiceProviderAgencyCollaboration` sans dupliquer le compte. |

---

## Provenance

- Source : [`features.md`](./features.md) — **231** lignes de fonctionnalité lues,
  réparties en **279** placements (une ligne multi-acteurs compte une fois par acteur).
- Générateur : `docs/gen-features-by-actor.mjs`.
- Fraîcheur vérifiée en CI par `node docs/gen-features-by-actor.mjs --check`, qui échoue si
  cette sortie ne correspond plus à sa source.

> ⚠️ 1 jeton(s) de la colonne « Acteurs » ne figurent pas dans la légende de `features.md` : 🔧. À corriger dans la source.

# Takussan — Fonctionnalités par acteur

> ## ⚠️ MIROIR DÉSYNCHRONISÉ — gelé au 2026-04-14
>
> Ce document se déclare « vue miroir de `features.md` ». Il ne l'est plus : `features.md` a évolué
> **six fois** depuis, et rien n'a été reporté ici — ni l'onboarding par acteur (2026-05-10), ni la
> gouvernance SaaS super-admin (2026-05-07), ni le canal WhatsApp (2026-06-17).
>
> En cas de désaccord avec [`features.md`](features.md), **c'est `features.md` qui fait foi**.

> Vue miroir de [`features.md`](./features.md) organisée par acteur.
> Chaque feature est classée par priorité (P0 → P3) et référence son domaine d'origine (§x.y).
> Les fonctionnalités transverses applicables à tous les utilisateurs authentifiés sont regroupées dans la section **Tous les utilisateurs** pour éviter la duplication.

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

1. [👤 Visiteur anonyme](#-visiteur-anonyme)
2. [🏠 Locataire / Acheteur](#-locataire--acheteur)
3. [🏢 Bailleur / Propriétaire](#-bailleur--propriétaire)
4. [🧑‍💼 Agent immobilier](#-agent-immobilier)
5. [🛡️ Admin d'agence / Super-admin](#️-admin-dagence--super-admin)
6. [👥 Tous les utilisateurs authentifiés](#-tous-les-utilisateurs-authentifiés)

---

## 👤 Visiteur anonyme

Parcours de découverte sans compte. Le visiteur peut consulter l'offre publique, effectuer des recherches, et interagir minimalement avec les avis publics.

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.2 | Page d'accueil (biens en vedette, derniers ajouts) |
| P0 | §1.2 | Recherche plein-texte sur les biens |
| P0 | §1.2 | Filtres de base (ville, type, prix, chambres, surface, transaction) |
| P0 | §1.2 | Fiche bien publique (galerie, détails, formulaire de contact) |
| P0 | §1.2 | Tri des résultats (prix, récence, pertinence) |
| P1 | §1.2 | Filtres avancés (amenités, disponibilité, étage, meublé) |
| P1 | §1.2 | Partage d'un bien (lien, réseaux sociaux) |
| P2 | §1.11 | Consulter les avis publics |
| P2 | §1.11 | Signaler un avis inapproprié (déclenche modération) |

---

## 🏠 Locataire / Acheteur

Utilisateur authentifié côté demande : recherche avancée, réservations, paiements, messagerie, maintenance, consultation de ses documents.

### Découverte & recherche

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.2 | Page d'accueil, recherche plein-texte, filtres de base, fiche bien, tri (accès public partagé avec 👤) |
| P1 | §1.2 | Recherche par carte interactive |
| P1 | §1.2 | Favoris (ajout / retrait / liste personnelle) |
| P1 | §1.2 | Recherches sauvegardées avec alertes email |
| P2 | §1.2 | Comparateur de biens côte à côte |
| P2 | §1.2 | Biens similaires / suggestions personnalisées |
| P2 | §1.2 | Historique local des biens consultés (stockage navigateur) |
| P3 | §1.2 | Recherche vocale / en langage naturel |

### Réservations & visites

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.3 | Demander une réservation (dates, montant, caution) |
| P1 | §1.3 | Paiement d'acompte et solde |
| P1 | §1.3 | Consultation des paiements liés à la réservation |
| P2 | §1.3 | Expiration automatique des demandes non traitées |
| P2 | §1.3 | Planification de visites (en personne, virtuelle, self-guided, hybride) |
| P2 | §1.3 | Rappels automatiques avant visite |
| P3 | §1.3 | Annulation avec remboursement partiel automatisé |

### Bail & paiements

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.4 | Enregistrer un paiement mensuel |
| P2 | §1.4 | Révision annuelle du loyer (indice ou accord amiable) |
| P3 | §1.4 | Signature électronique du bail |
| P3 | §1.4 | Espace locataire dédié (quittances, factures, maintenance) |

### Communication & maintenance

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.7 | Conversation privée 1↔1 avec agent / bailleur |
| P1 | §1.7 | Envoyer un message texte avec pièces jointes |
| P1 | §1.7 | Liste des conversations avec statut non lu |
| P1 | §1.7 | Notification en temps réel (in-app + email) |
| P1 | §1.8 | Signaler un problème avec photos et description |
| P1 | §1.8 | Consulter l'historique des interventions par bien |
| P2 | §1.7 | Accusés de lecture individuels (si > 5 participants) |
| P2 | §1.7 | Recherche dans l'historique des messages |
| P3 | §1.7 | Appels audio / vidéo intégrés |
| P3 | §1.7 | Traduction automatique FR ↔ EN ↔ WO |

### Documents, avis & tableau de bord

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.10 | Partage sécurisé de documents par lien temporaire |
| P1 | §2.5 | Dashboard locataire (prochaines échéances, documents) |
| P2 | §1.9 | Signature de l'état des lieux (locataire + bailleur) |
| P2 | §1.11 | Laisser un avis sur un bien, un agent ou une agence |
| P2 | §1.11 | Signaler un avis inapproprié |

---

## 🏢 Bailleur / Propriétaire

Propriétaire de biens confiés à une agence : supervise son portefeuille, suit les paiements, communique, approuve les interventions.

### Portefeuille de biens

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.1 | Créer un bien (type, transaction, caractéristiques) |
| P1 | §1.1 | Historique de prix automatique |
| P1 | §1.1 | Gérer une hiérarchie de biens (immeuble → étages → lots) |
| P1 | §1.1 | Renseigner le type de titre foncier |
| P3 | §1.1 | Marquer un bien comme nécessitant un suivi administratif particulier |

### Réservations & baux

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.3 | Accepter, refuser ou annuler une demande de réservation |
| P1 | §1.3 | Paiement d'acompte et solde |
| P1 | §1.3 | Vue calendrier agrégée (réservations + visites) |
| P1 | §1.3 | Consultation des paiements liés à la réservation |
| P1 | §1.4 | Créer un bail (locataire, durée, loyer, caution) |
| P1 | §1.4 | Générer l'échéancier de loyers mensuels |
| P1 | §1.4 | Enregistrer un paiement mensuel |
| P1 | §1.4 | Appliquer automatiquement des pénalités de retard |
| P1 | §1.4 | Consultation de l'historique complet d'un bail |
| P2 | §1.4 | Renouveler un bail ou créer un avenant (traçabilité parent) |
| P2 | §1.4 | Résiliation anticipée avec calcul des pénalités |
| P2 | §1.4 | Révision annuelle du loyer (indice ou accord amiable) |
| P3 | §1.4 | Signature électronique du bail |

### Finances

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.5 | Générer une facture à un Customer destinataire |
| P1 | §1.5 | Reversement au bailleur après commission (Payout) |
| P1 | §2.5 | Dashboard bailleur (portefeuille, cashflow, occupation) |

### Communication, maintenance, avis

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.7 | Conversation privée 1↔1, messages + pièces jointes, liste, notif temps réel |
| P1 | §1.8 | Consulter l'historique des interventions par bien |
| P1 | §1.10 | Partage sécurisé de documents par lien temporaire |
| P2 | §1.7 | Conversations de groupe (multi-participants) |
| P2 | §1.7 | Accusés de lecture, recherche dans l'historique |
| P2 | §1.8 | Demande de devis et validation avant travaux |
| P2 | §1.9 | Signature de l'état des lieux |
| P2 | §1.11 | Répondre publiquement à un avis |
| P2 | §1.11 | Signaler un avis inapproprié |
| P3 | §1.7 | Appels audio / vidéo, traduction automatique |
| P3 | §1.11 | Badges de réputation |

---

## 🧑‍💼 Agent immobilier

Opérateur métier au quotidien : gère les biens, la clientèle, les baux, les réservations, les visites, la maintenance et les documents pour le compte de son agence.

### Gestion des biens

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.1 | Créer un bien |
| P0 | §1.1 | Associer une adresse géolocalisée |
| P0 | §1.1 | Uploader des photos |
| P0 | §1.1 | Définir le statut (disponible, réservé, vendu, loué, archivé) |
| P0 | §1.1 | Publier / dépublier un bien |
| P0 | §1.1 | Modifier / supprimer un bien (soft delete) |
| P0 | §1.1 | Référence unique auto (ex : TK-2025-001) |
| P1 | §1.1 | Uploader plans, vidéos et visites virtuelles 360° |
| P1 | §1.1 | Associer des tags / amenités |
| P1 | §1.1 | Historique de prix automatique |
| P1 | §1.1 | Ajouter des collaborateurs (commission + permissions) |
| P1 | §1.1 | Gérer la hiérarchie de biens |
| P1 | §1.1 | Renseigner le type de titre foncier |
| P1 | §1.1 | Compteurs de vues et favoris |
| P2 | §1.1 | Dupliquer un bien |
| P2 | §1.1 | Archivage en lot |
| P3 | §1.1 | Import CSV / API externe (MLS) |
| P3 | §1.1 | Estimation automatique de prix (IA / comparables) |

### Réservations, baux & visites

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.3 | Accepter, refuser ou annuler une demande |
| P1 | §1.4 | Créer un bail |
| P1 | §1.4 | Ajouter un ou plusieurs garants avec documents |
| P1 | §1.4 | Générer l'échéancier |
| P1 | §1.4 | Relances automatiques d'impayés |
| P1 | §1.4 | Appliquer les pénalités de retard |
| P1 | §1.4 | Remboursement de la caution en fin de bail |
| P1 | §1.4 | Historique complet d'un bail |
| P2 | §1.3 | Planification de visites (types multiples, feedback) |
| P2 | §1.3 | Rappels automatiques avant visite |
| P2 | §1.4 | Renouvellement / avenant avec parent lease |
| P2 | §1.4 | Résiliation anticipée |

### CRM

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.6 | Créer un Customer (avec ou sans compte User) |
| P0 | §1.6 | Liste et recherche de clients |
| P1 | §1.6 | Lier un Customer à un User existant |
| P1 | §1.6 | Définir la relation agent ↔ client (type, période) |
| P1 | §1.6 | Joindre pièces d'identité et documents |
| P1 | §1.6 | Historique d'interactions (journal d'activité) |
| P1 | §1.6 | Désigner un contact principal |
| P1 | §1.6 | Notes horodatées et signées sur un client |
| P2 | §1.6 | Pipeline de prospects (stades, conversion) |
| P2 | §1.6 | Tâches et rappels attachés à un client |
| P2 | §1.6 | Segmentation et tags clients |
| P3 | §1.6 | Campagnes email / SMS ciblées |

### Communication

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.7 | Conversation privée 1↔1 avec clients et bailleurs |
| P2 | §1.7 | Conversations de groupe (multi-participants) |

### Maintenance & inventaires

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.8 | Assigner un prestataire |
| P1 | §1.8 | Suivi des statuts d'intervention |
| P1 | §1.8 | Photos et rapport après intervention |
| P1 | §1.9 | Créer un inventaire d'entrée ou de sortie |
| P1 | §1.9 | Photos par pièce et état par élément |
| P1 | §1.9 | Consulter / éditer un inventaire |
| P2 | §1.8 | Demande de devis et validation avant travaux |
| P2 | §1.8 | Priorisation des demandes |
| P2 | §1.9 | Export PDF de l'état des lieux |
| P3 | §1.8 | Contrats de maintenance récurrents |
| P3 | §1.9 | Comparaison automatique entrée ↔ sortie |
| P3 | §1.9 | Reconnaissance IA de dégradations sur photos |

### Documents & reporting

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.10 | Uploader un document lié à une entité |
| P1 | §1.10 | Catégoriser par type (contrat, CNI, RIB, quittance…) |
| P1 | §1.10 | Recherche dans la bibliothèque de documents |
| P1 | §2.5 | Dashboard agent (pipeline, commissions, tâches) |
| P2 | §1.10 | Génération PDF depuis templates |
| P2 | §1.10 | Historique des versions d'un document (medialibrary + journal d'activité) |
| P2 | §1.11 | Répondre publiquement à un avis |
| P3 | §1.10 | Signature électronique intégrée |
| P3 | §1.10 | OCR et extraction automatique de données |
| P3 | §1.11 | Badges de réputation |

---

## 🛡️ Admin d'agence / Super-admin

Supervision de la plateforme et de l'agence : finances globales, équipe, rôles, modération, audit, configuration.

### Agence & équipe

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.12 | Créer et configurer une agence (nom, licence, contact, logo) |
| P0 | §1.12 | Ajouter et retirer des agents |
| P0 | §1.12 | Attribution de rôles aux membres |
| P1 | §1.12 | Statistiques globales d'agence |
| P1 | §1.12 | Paramètres de commission par défaut |
| P3 | §1.12 | Gestion multi-branches / sous-agences |
| P3 | §1.12 | Gestion des congés / disponibilité des agents |
| P3 | §1.12 | Plan d'abonnement et facturation SaaS |
| P3 | §1.12 | Marketplace inter-agences |

### Finances

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.5 | Enregistrer un paiement (réservation ou bail) |
| P1 | §1.5 | Générer une facture à un Customer |
| P1 | §1.5 | Historique des paiements par entité |
| P1 | §1.5 | Suivi des statuts (en attente, payé, remboursé, annulé) |
| P2 | §1.5 | Intégration d'une passerelle de paiement (Wave, Orange Money, Stripe) |
| P2 | §1.5 | Rapprochement bancaire semi-automatique |
| P2 | §1.5 | Relance automatique des factures en retard |
| P3 | §1.5 | Commissions automatiques par agent / collaborateur |
| P3 | §1.5 | Comptabilité exportable (FEC, journaux) |
| P3 | §1.8 | Facturation directe prestataire → agence |

### Modération & avis

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.1 | Modération et validation des biens avant publication |
| P2 | §1.11 | Modération des avis (masquer, supprimer) |
| P3 | §1.1 | Suivi administratif particulier d'un bien |
| P3 | §1.11 | Détection automatique d'avis suspects |

### Rôles & permissions

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.2 | Rôles prédéfinis (customer, agent, agency_admin, owner, service_provider, super_admin) |
| P0 | §2.2 | Permissions granulaires par ressource |
| P0 | §2.2 | Distinction « mes ressources » vs « toutes les ressources » |
| P1 | §2.2 | Attribution et retrait de rôles |
| P1 | §2.2 | Éditeur de rôles personnalisés scopé par agence |
| P2 | §2.2 | Délégation temporaire de permissions |
| P3 | §2.2 | Règles conditionnelles (policies dynamiques) |

### Reporting & dashboards

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.5 | Dashboard agence (biens, vues, revenus, impayés) |
| P2 | §2.5 | Export CSV / Excel (paiements, baux, clients) |
| P2 | §2.5 | Export PDF (quittances, factures, rapports) |
| P2 | §2.5 | Graphiques temporels (revenus, occupation) |
| P3 | §2.5 | KPI personnalisables par agence |
| P3 | §2.5 | Alertes sur seuils (taux d'impayés, vacance) |

### Audit & traçabilité

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.6 | Journal d'activité automatique sur entités critiques |
| P1 | §2.6 | Consultation du journal par entité |
| P1 | §2.6 | Filtrage par utilisateur, date, action |
| P2 | §2.6 | Export de l'audit trail |
| P3 | §2.6 | Alertes sur actions sensibles |

### Administration & configuration

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.9 | Gestion des tags et amenités |
| P0 | §2.9 | Gestion des utilisateurs (activation, blocage) |
| P1 | §2.9 | Gestion des enums métier (types de biens, statuts) |
| P1 | §2.9 | Configuration email (templates, expéditeur) |
| P2 | §2.9 | Paramètres globaux de plateforme |
| P2 | §2.9 | Gestion des intégrations tierces (API keys) |
| P3 | §2.9 | Mode maintenance programmé |
| P3 | §2.9 | Feature flags |

---

## 👥 Tous les utilisateurs authentifiés

Fonctionnalités transverses qui s'appliquent à chaque rôle identifié (locataire, bailleur, agent, admin).

### Authentification & comptes

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
| P2 | §2.1 | OAuth Facebook / Apple |
| P3 | §2.1 | Magic link de connexion |

### Notifications

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

### Recherche & filtres

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

### Médias & fichiers

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

### Internationalisation & préférences

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

## Notes

- Une feature impliquant plusieurs acteurs apparaît dans chaque section concernée — la **source de vérité** reste [`features.md`](./features.md), organisée par domaine.
- Les fonctionnalités transverses listées dans **👥 Tous les utilisateurs authentifiés** ne sont pas répétées dans les sections par rôle pour éviter la duplication.

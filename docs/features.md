# Takussan — Catalogue fonctionnel

> Vision complète des fonctionnalités de la plateforme Takussan : fonctionnalités métier (immobilier) et applicatives (transverses).
> Ce document ne décrit **pas** l'implémentation — il sert de référence pour prioriser et découper le travail.
> Base : les 28 modèles de [`models-spec.md`](./models-spec.md), enrichis des besoins métier standards.

---

## Légende

### Priorités

| Code | Signification |
|------|---------------|
| **P0** | MVP bloquant — sans ça, l'app n'est pas utilisable |
| **P1** | MVP important — attendu dans la première version publique |
| **P2** | V2 — amélioration significative post-lancement |
| **P3** | Futur / nice-to-have |

### Acteurs

| Icône | Acteur |
|-------|--------|
| 👤 | Visiteur anonyme (pas encore de compte) |
| 🏠 | Locataire / Acheteur (Customer) |
| 🏢 | Bailleur / Propriétaire (owner) |
| 🧑‍💼 | Agent immobilier |
| 🛡️ | Admin d'agence / Super-admin |

---

## Table des matières

### 1. Domaines métier

1.1 [Gestion des biens](#11-gestion-des-biens)
1.2 [Recherche & découverte publique](#12-recherche--découverte-publique)
1.3 [Réservations courte durée & visites](#13-réservations-courte-durée--visites)
1.4 [Location longue durée (baux)](#14-location-longue-durée-baux)
1.5 [Transactions & paiements](#15-transactions--paiements)
1.6 [CRM & relation client](#16-crm--relation-client)
1.7 [Communication & messagerie](#17-communication--messagerie)
1.8 [Maintenance & interventions](#18-maintenance--interventions)
1.9 [État des lieux & inventaires](#19-état-des-lieux--inventaires)
1.10 [Documents & contrats](#110-documents--contrats)
1.11 [Avis & réputation](#111-avis--réputation)
1.12 [Agence & équipe](#112-agence--équipe)

### 2. Domaines applicatifs transverses

2.1 [Authentification & comptes](#21-authentification--comptes)
2.2 [Rôles & permissions](#22-rôles--permissions)
2.3 [Notifications](#23-notifications)
2.4 [Recherche & filtres](#24-recherche--filtres)
2.5 [Reporting & tableaux de bord](#25-reporting--tableaux-de-bord)
2.6 [Audit & traçabilité](#26-audit--traçabilité)
2.7 [Médias & fichiers](#27-médias--fichiers)
2.8 [Internationalisation & préférences](#28-internationalisation--préférences)
2.9 [Administration & configuration](#29-administration--configuration)

---

## 1. Domaines métier

### 1.1 Gestion des biens

Gestion du cycle de vie d'un bien immobilier, de sa création à sa sortie du portefeuille.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🏢🧑‍💼 | Créer un bien (type, transaction vente/location, caractéristiques) |
| P0 | 🧑‍💼 | Associer une adresse géolocalisée |
| P0 | 🧑‍💼 | Uploader des photos |
| P0 | 🧑‍💼 | Définir le statut (disponible / réservé / vendu / loué / archivé) |
| P0 | 🧑‍💼 | Publier et dépublier un bien |
| P0 | 🧑‍💼 | Modifier / supprimer un bien (soft delete) |
| P0 | 🧑‍💼 | Attribuer automatiquement une référence unique à chaque bien (ex : TK-2025-001) |
| P1 | 🧑‍💼 | Uploader plans, vidéos et visites virtuelles 360° |
| P1 | 🧑‍💼 | Associer des tags / amenités (piscine, climatisation, meublé…) |
| P1 | 🏢🧑‍💼 | Historique de prix automatique à chaque changement |
| P1 | 🧑‍💼 | Ajouter des collaborateurs au bien avec part de commission explicite et permissions granulaires |
| P1 | 🏢🧑‍💼 | Gérer une hiérarchie de biens (immeuble → étages → lots) |
| P1 | 🧑‍💼🏢 | Renseigner le type de titre foncier (bail, titre foncier, délibération, autre) |
| P1 | 🧑‍💼 | Compteurs de vues et de favoris |
| P2 | 🧑‍💼 | Dupliquer un bien (modèle / template) |
| P2 | 🛡️ | Modération et validation avant publication |
| P2 | 🧑‍💼 | Archivage en lot |
| P3 | 🛡️🏢 | Marquer un bien comme nécessitant un suivi administratif particulier |
| P3 | 🧑‍💼 | Import CSV / API externe (MLS, syndication) |
| P3 | 🧑‍💼 | Estimation automatique de prix (IA / comparables) |

### 1.2 Recherche & découverte publique

Expérience de découverte pour visiteurs anonymes et clients connectés.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 👤🏠 | Page d'accueil (biens en vedette, derniers ajouts) |
| P0 | 👤🏠 | Recherche plein-texte sur les biens |
| P0 | 👤🏠 | Filtres de base (ville, type, prix, chambres, surface, transaction) |
| P0 | 👤🏠 | Fiche bien publique (galerie, détails, formulaire de contact) |
| P0 | 👤🏠 | Tri des résultats (prix, récence, pertinence) |
| P1 | 👤🏠 | Filtres avancés (amenités, disponibilité, étage, meublé) |
| P1 | 👤🏠 | Recherche « autour de moi » : rayon en kilomètres autour d'un point, plafonné à 500 km, appliqué à la liste comme à la carte |
| P1 | 👤🏠 | Tri des résultats par distance au point de recherche |
| P1 | 🏠 | Recherche par carte interactive |
| P1 | 🏠 | Favoris (ajout / retrait / liste personnelle) |
| P1 | 🏠 | Recherches sauvegardées avec alertes email |
| P1 | 👤🏠 | Partage d'un bien (lien, réseaux sociaux) |
| P2 | 🏠 | Comparateur de biens côte à côte |
| P2 | 🏠 | Biens similaires / suggestions personnalisées |
| P2 | 🏠 | Historique local des biens consultés (stockage navigateur) |
| P3 | 🏠 | Recherche vocale / en langage naturel |

### 1.3 Réservations courte durée & visites

Réservation ponctuelle d'un bien (saisonnier, visite payante, pré-réservation).

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P1 | 🏠 | Demander une réservation (dates, montant, caution) |
| P1 | 🏢🧑‍💼 | Accepter, refuser ou annuler une demande |
| P1 | 🏠🏢 | Paiement d'acompte et solde — **acompte = 30 % du total** (estimation affichée dans le tunnel de réservation, règle stable). Quand le besoin de varier par bien/contrat apparaîtra, déplacer le calcul backend via un endpoint `GET /api/bookings/quote`. |
| P1 | 🏢 | Vue calendrier agrégée à partir des réservations confirmées et des visites planifiées |
| P1 | 🏠🏢 | Consultation des paiements liés à la réservation |
| P2 | 🏠 | Expiration automatique des demandes non traitées |
| P2 | 🏠🧑‍💼 | Planification de visites : en personne, virtuelle, en autonomie ou hybride ; agent accompagnateur, durée estimée, feedback post-visite |
| P2 | 🏠🧑‍💼 | Rappels automatiques avant visite |
| P3 | 🏠 | Annulation avec remboursement partiel automatisé |

### 1.4 Location longue durée (baux)

Gestion complète d'un contrat de bail et de son cycle de vie.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P1 | 🏢🧑‍💼 | Créer un bail (locataire, bailleur, durée, loyer, caution) |
| P1 | 🧑‍💼 | Ajouter un ou plusieurs garants avec documents joints |
| P1 | 🏢🧑‍💼 | Générer l'échéancier de loyers mensuels |
| P1 | 🏠🏢 | Enregistrer un paiement mensuel |
| P1 | 🧑‍💼 | Relances automatiques en cas d'impayé |
| P1 | 🧑‍💼🏢 | Appliquer automatiquement des pénalités de retard sur les paiements en retard |
| P1 | 🧑‍💼 | Remboursement de la caution en fin de bail |
| P1 | 🏢🧑‍💼 | Consultation de l'historique complet d'un bail |
| P2 | 🏢🧑‍💼 | Renouveler un bail ou créer un avenant (loyer, durée, conditions) avec traçabilité du bail parent |
| P2 | 🏢🧑‍💼 | Résiliation anticipée avec calcul des pénalités |
| P2 | 🏠🏢 | Révision annuelle du loyer (indice ou accord amiable) journalisée via le journal d'activité |
| P3 | 🏠🏢 | Signature électronique du bail |
| P3 | 🏠 | Espace locataire dédié (quittances, factures, maintenance) |
| P1 | 🏠🧑‍💼 | Onboarding résident à la signature du bail : notification "Bienvenue chez vous", welcome modale "Espace résident", checklist d'entrée (état des lieux, premier paiement, accès aux documents), suivi de complétion par un `TenantOnboardingChecklist` |

### 1.5 Transactions & paiements

Encaissements, factures et reversements.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🛡️ | Enregistrer un paiement (réservation ou bail) |
| P1 | 🛡️🏢 | Générer une facture à un Customer destinataire |
| P1 | 🏢 | Reversement au bailleur après commission (Payout) |
| P1 | 🛡️ | Historique des paiements par entité (bien, bail, client) |
| P1 | 🛡️ | Suivi des statuts (en attente, payé, remboursé, annulé) |
| P2 | 🛡️ | Intégration d'une passerelle de paiement (Wave, Orange Money, Stripe) |
| P2 | 🛡️ | Rapprochement bancaire semi-automatique |
| P2 | 🛡️ | Relance automatique des factures en retard |
| P2 | 🛡️ | Reversement plateforme → agence (commission plateforme retenue à la source, payout périodique agrégé) |
| P3 | 🛡️ | Commissions automatiques par agent / collaborateur |
| P3 | 🛡️ | Comptabilité exportable (FEC, journaux) |

### 1.6 CRM & relation client

Gestion des contacts (Customer) liés ou non à un compte utilisateur.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🧑‍💼 | Créer un Customer (avec ou sans compte User) |
| P0 | 🧑‍💼 | Liste et recherche de clients |
| P1 | 🧑‍💼 | Lier un Customer à un User existant |
| P1 | 🧑‍💼 | Définir la relation agent ↔ client (type, période) |
| P1 | 🧑‍💼 | Joindre pièces d'identité et documents |
| P1 | 🧑‍💼 | Historique d'interactions (via journal d'activité) |
| P1 | 🧑‍💼 | Désigner un contact principal parmi les agents liés à un client |
| P1 | 🧑‍💼 | Ajouter des notes horodatées et signées par un agent sur un client |
| P2 | 🧑‍💼 | Pipeline de prospects (stades, conversion) |
| P2 | 🧑‍💼 | Tâches et rappels attachés à un client |
| P2 | 🧑‍💼 | Segmentation et tags clients |
| P3 | 🧑‍💼 | Campagnes email / SMS ciblées |

### 1.7 Communication & messagerie

Échanges entre acteurs autour d'un bien, d'une réservation ou d'un bail.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P1 | 🏠🏢🧑‍💼 | Conversation privée 1↔1 entre client et agent / bailleur |
| P1 | 🏠🏢 | Envoyer un message texte avec pièces jointes |
| P1 | 🏠🏢 | Liste des conversations avec statut non lu |
| P1 | 🏠🏢 | Notification en temps réel (in-app + email) |
| P2 | 🏢🧑‍💼 | Conversations de groupe (multi-participants) |
| P2 | 🏠🏢 | Accusés de lecture individuels (si > 5 participants) |
| P2 | 🏠🏢 | Recherche dans l'historique des messages |
| P3 | 🏠🏢 | Appels audio / vidéo intégrés |
| P3 | 🏠🏢 | Traduction automatique FR ↔ EN ↔ WO |

### 1.8 Maintenance & interventions

Signalement et suivi des problèmes techniques sur un bien loué.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P1 | 🏠 | Signaler un problème avec photos et description |
| P1 | 🧑‍💼 | Assigner un prestataire (service provider) |
| P1 | 🧑‍💼 | Suivi des statuts (nouveau, en cours, résolu, annulé) |
| P1 | 🧑‍💼 | Ajouter photos et rapport après intervention |
| P1 | 🏠🏢 | Consulter l'historique des interventions par bien |
| P2 | 🏢🧑‍💼 | Demande de devis et validation avant travaux |
| P2 | 🧑‍💼 | Priorisation des demandes (urgent, normal, bas) |
| P3 | 🛡️ | Facturation directe prestataire → agence |
| P3 | 🧑‍💼 | Contrats de maintenance récurrents |

### 1.9 État des lieux & inventaires

Constats contradictoires entrée / sortie.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P1 | 🧑‍💼 | Créer un inventaire d'entrée ou de sortie |
| P1 | 🧑‍💼 | Photos par pièce et état par élément |
| P1 | 🧑‍💼 | Consulter / éditer un inventaire |
| P2 | 🏠🏢 | Signature des deux parties (locataire + bailleur) |
| P2 | 🧑‍💼 | Export PDF de l'état des lieux |
| P3 | 🧑‍💼 | Comparaison automatique entrée ↔ sortie |
| P3 | 🧑‍💼 | Reconnaissance IA de dégradations sur photos |

### 1.10 Documents & contrats

Centralisation de tous les fichiers liés à une entité.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🧑‍💼 | Uploader un document lié à une entité (bien, bail, client…) |
| P1 | 🧑‍💼 | Catégoriser par type (contrat, CNI, RIB, quittance, justificatif) |
| P1 | 🏠🏢 | Partage sécurisé par lien temporaire |
| P1 | 🧑‍💼 | Recherche dans la bibliothèque de documents |
| P2 | 🧑‍💼 | Génération PDF (quittance, facture, bail) depuis templates |
| P2 | 🧑‍💼 | Historique des versions d'un document (via medialibrary + journal d'activité) |
| P3 | 🧑‍💼 | Signature électronique intégrée |
| P3 | 🧑‍💼 | OCR et extraction automatique de données |

### 1.11 Avis & réputation

Notation et commentaires publics.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P2 | 🏠 | Laisser un avis sur un bien, un agent ou une agence |
| P2 | 👤 | Consulter les avis publics |
| P2 | 🛡️ | Modération (masquer, supprimer) |
| P2 | 🏢🧑‍💼 | Répondre publiquement à un avis |
| P2 | 👤🏠🏢 | Signaler un avis inapproprié (déclenche modération) |
| P3 | 🛡️ | Détection automatique d'avis suspects |
| P3 | 🏢🧑‍💼 | Badges de réputation |

### 1.12 Agence & équipe

Gestion de la structure organisationnelle.

Une agence porte un **`kind`** :

- **`standard`** — agence professionnelle multi-membres : peut inviter des collaborateurs internes (agents, autres admins), créer des rôles personnalisés, assigner biens/leads aux agents, accéder au reporting cross-équipe, customiser les tags/enums plateforme. Créée via le parcours super-admin (§2.9 → §2.1).
- **`individual`** — agence individuelle (host solo) auto-créée par n'importe quel user via la CTA "Publier" (pattern Airbnb). Le user devient simultanément `agency_admin` + `owner` de cette agence. Restrictions par rapport à `standard` : pas d'invitation de collaborateurs internes, un seul `agency_admin`, pas de rôles personnalisés, pas d'assignation de biens/leads à un agent, pas de reporting cross-équipe, **pas de carnet de propriétaires** — ni consultation de la liste, ni invitation d'autres bailleurs : dans une agence individuelle, le propriétaire est le créateur du compte lui-même (TCK-256, confirmé par TCK-284) —, pas de customisation des tags/enums plateforme. Toutes les autres capacités (publication de biens, baux, encaissements, branding, sous-domaine, devise, intégrations, invitation de prestataires externes `ServiceProvider`) restent disponibles. Pas de quota MVP — la monétisation future est `pay-per-listing`.

> **Deux précisions nommées plutôt que déduites (TCK-295).** La liste ci-dessus est **fermée**, et
> la phrase « toutes les autres capacités restent disponibles » suffit logiquement à répondre pour
> tout le reste. Elle n'a pourtant pas suffi en pratique : c'est exactement par ce silence qu'un
> commit (`5d40dd31`) a cadenassé deux écrans qu'aucun ticket ne demandait, et qu'une restriction
> décidée et livrée par TCK-256 a coexisté des mois avec une clause résiduelle qui la niait
> (levé par TCK-284). *Une règle que la spec ne nomme pas finit par être appliquée — ou retirée —
> par quelqu'un qui lit la spec.* D'où ces deux lignes explicites :
>
> - **Les KPI personnalisables et les alertes de seuil de [§2.5](#25-reporting--tableaux-de-bord)
>   sont DISPONIBLES en agence `individual`** — arbitrage produit tranché par TCK-284 le
>   2026-08-15. Ils ne figurent pas dans `PRO_ROUTES`
>   (`takussan-web/src/lib/access/pro-features.ts`), et `scripts/check-pro-routes.mjs` tient
>   l'accord entre cette phrase et le code.
> - **« Reporting cross-équipe » ci-dessus et « Dashboard agence » en §2.5 désignent le même
>   écran** (`/app/overview/agency`), et il est bien restreint. Les deux sections le nommaient
>   différemment sans le dire : §2.5 le liste en P1 sans mention de restriction, et seul un lecteur
>   qui sait déjà qu'il s'agit du même écran pouvait relier les deux. La restriction tient à sa
>   raison d'être — un reporting *cross-équipe* n'a pas d'objet là où il n'y a qu'un collaborateur.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🛡️ | Créer et configurer une agence (nom, licence, contact, logo) |
| P0 | 🛡️ | Ajouter et retirer des agents |
| P0 | 🛡️ | Attribution de rôles aux membres |
| P0 | 👤🏠 | Auto-création d'une agence `individual` via la CTA "Publier" du header (pattern Airbnb) — wizard 5 steps qui crée simultanément `Agency.kind=individual`, `AgencyAdminProfile`, `OwnerProfile` et un premier `Property` brouillon |
| P1 | 🛡️ | Statistiques globales d'agence (portefeuille, revenus) |
| P1 | 🛡️ | Paramètres de commission par défaut |
| P1 | 🛡️ | Dossier KYC documentaire de l'agence (RCCM, NINEA, pièce dirigeant) avec workflow vérification (pending → submitted → verified / rejected) |
| P1 | 🛡️ | Upgrade `individual` → `standard` : l'admin de l'agence individuelle soumet une demande (`AgencyUpgradeRequest`) avec compléments légaux (RC, NINEA, RIB pro, statuts) ; un super-admin la review depuis la console ; à l'approbation, `Agency.kind` bascule vers `standard` et débloque les capacités restreintes (invitation collaborateurs internes, multi-admin, custom roles, etc.). Pas d'upgrade self-service direct, pas de rétrogradation `standard` → `individual`. |
| P2 | 🛡️ | Plans d'abonnement et quotas par agence (catalogue, période d'essai, limites) |
| P3 | 🛡️ | Gestion multi-branches / sous-agences |
| P3 | 🛡️ | Gestion des congés / disponibilité des agents |
| P3 | 🛡️ | Marketplace inter-agences |

---

## 2. Domaines applicatifs transverses

### 2.1 Authentification & comptes

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | Tous | Inscription par email et mot de passe |
| P0 | Tous | Connexion (tokens Sanctum) |
| P0 | Tous | Déconnexion et révocation de token |
| P0 | Tous | Mot de passe oublié et réinitialisation |
| P0 | Tous | Vérification de l'adresse email |
| P0 | Tous | Édition de profil (nom, bio, avatar) |
| P1 | Tous | Vérification du numéro de téléphone (SMS / OTP) |
| P1 | Tous | OAuth Google (Socialite) |
| P1 | Tous | Authentification à deux facteurs (TOTP + codes de récupération) |
| P1 | Tous | Gestion des sessions actives |
| P2 | Tous | Suppression de compte avec anonymisation (RGPD) |
| P2 | Tous | Export des données personnelles (portabilité RGPD — déclenché par l'utilisateur) |
| P2 | 🛡️ | Déclenchement de l'export RGPD par un super-admin pour le compte d'un utilisateur (support / réquisition) |
| P2 | Tous | OAuth Facebook / Apple |
| P3 | Tous | Magic link de connexion |

#### Profils & contexte actif (TCK-138 → TCK-142)

Une **identité = un User**, qui peut porter plusieurs **profils métier** chez plusieurs agences (ex. un même humain peut être propriétaire chez l'agence A, locataire chez l'agence B et courtier indépendant collaborant avec C et D). Email, mot de passe, 2FA et OAuth sont **uniques au user** (pas dupliqués par profil) ; le KYC et les informations administratives sont portés **par chaque profil** (RIB et tax_id par OwnerProfile, license_number par AgentProfile/BrokerProfile, certifications par ServiceProviderProfile).

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | Tous | Liste des profils du compte (`GET /api/me/profiles`) |
| P0 | Tous | Sélection du **profil actif** pour la session (`PATCH /api/me/active-profile`) |
| P0 | Tous | Bascule automatique du profil actif si l'utilisateur n'a qu'un seul profil |
| P0 | Tous | Switch de profil exposé en UI (header / menu compte) — change l'agence et les permissions sans nouvelle authentification |
| P0 | 🛡️ | Toute capacité est résolue dans le scope du profil actif — pour un couple *(utilisateur, agence)*, jamais globalement ([ADR-0003](adr/0003-capacites-enum-code-defined.md)) |
| P1 | Tous | KYC distinct par profil (pièces d'identité, RIB, license, assurance — un dossier par profil) |
| P1 | 🛡️ | Création/désactivation d'un profil par un agency_admin (ex. nouvel agent recruté) |
| P2 | Tous | Indication visuelle de "profil actif" sur toutes les vues authentifiées |
| P2 | 🛡️ | Audit log dédié : changements de profil actif, créations/suspensions de profils |

#### Onboarding parcours

Cartographie complète des parcours d'entrée dans le système (référence : `docs/superpowers/specs/2026-05-10-onboarding-discovery-design.md`). Tous les parcours d'invitation (Owner, Agent, AgencyAdmin, ServiceProvider, super-admin coopté) reposent sur un **pattern d'invitation unifié** (modèle `Invitation`, token signé, expiry 7j, rappel J+2). Tous les profils traversent la même machine à états `draft → pending → active → suspended | expired | archived`.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | Tous | Pattern d'invitation unifié — création par un inviteur autorisé, email d'invitation avec token signé (expiry 7j, rappel automatique J+2, renvoi self-service par l'inviteur, révocation possible avant acceptation) ; à l'acceptation, le profil cible passe en `active` et devient le profil actif |
| P0 | 🛡️ | Bootstrap super-admin via commande artisan `takussan:create-super-admin` (1ère installation par environnement) — exige 2FA TOTP au premier login |
| P0 | 👤🏠 | Onboarding wizard Customer post-signup — welcome modale (3 slides skippables) + complétion différée du profil minimal (téléphone, ville, type de recherche) au moment de la première action sensible (favoris / réservation / contact) |
| P1 | 🛡️ | Cooptation super-admin (super-admin → super-admin) — invitation pair-à-pair via console super-admin avec 2FA TOTP **obligatoire** avant `active` (bloquant), audit log automatique, notification broadcast aux autres super-admins |
| P1 | 🏢 | Wizard onboarding Owner post-acceptation invitation — vérification téléphone OTP (obligatoire), KYC documentaire (CNI/passeport, RIB, NINEA, statut particulier/société) en `pending_review` non bloquant, tour produit 3 slides, vue "biens déjà associés" si pré-rattachement |
| P1 | 🧑‍💼 | Wizard onboarding Agent post-acceptation invitation — vérification téléphone OTP, KYC (license_number, pièce d'identité, photo profil, spécialisation, zones d'intervention), affichage du périmètre de permissions choisi par l'admin inviteur, lien vers premier lead pré-assigné |
| P1 | 🔧 | Wizard onboarding Service Provider post-acceptation invitation — vérification téléphone OTP, KYC (pièce d'identité, métiers multi-select, zones, tarifs indicatifs, assurance RC pro optionnelle valorisée), disponibilités hebdomadaires, accès direct à la 1ère intervention si invitation déclenchée par une demande active. Multi-rattachement à plusieurs agences via plusieurs `ServiceProviderAgencyCollaboration` sans dupliquer le compte. |
| P1 | Tous | Composant wizard reprenable — chaque step sauvegardé en `draft`, bandeau persistant "Reprenez votre publication / votre onboarding" sur dashboard, reprise depuis le menu compte |
| P1 | Tous | Welcome modale générique réutilisable — composant 3 slides max, skippable, paramétrable par parcours (Customer, Host, Owner, Agent, AgencyAdmin, ServiceProvider, Tenant) |

### 2.2 Rôles & permissions

> **TCK-138 → TCK-142, puis TCK-278.** La nature métier (owner / agent / broker / service_provider) est portée par le **profil actif**, et les permissions en **découlent** : `spatie/laravel-permission` a été désinstallé, il n'y a plus ni table de rôles, ni `team_id`. Un « rôle » est un **profil polymorphe** ([ADR-0002](adr/0002-role-est-un-profil-polymorphe.md), [Règle 5 de `models-spec.md`](models-spec.md#règle-5--profil--rôle)) ; une « permission » est un cas de l'enum `Capability` (`<domaine>.<verbe>`), résolu par `MembershipCapabilityResolver` pour un couple *(utilisateur, agence)* et additif entre profils ([ADR-0003](adr/0003-capacites-enum-code-defined.md)). Plus aucun scoping direct par `users.agency_id` — la colonne n'existe plus en base.
>
> ⚠️ **Cette section décrivait le mécanisme spatie au présent jusqu'au 2026-08-15**, plusieurs mois après sa suppression, alors qu'une garde CI casse déjà sur tout import `Spatie\Permission\`. Le **quoi** ci-dessous — rôles prédéfinis, permissions granulaires, éditeur de rôles réservé aux agences — est tranché et n'a pas bougé ; seul le **comment** était périmé. Si une ligne de ce tableau contredit le code, c'est le code qui a raison.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🛡️ | Rôles prédéfinis : `super_admin` (porté par `PlatformProfile`, hors agence) ; `agency_admin`, `agent`, `owner`, `tenant`, `customer`, `service_provider` (portés par le profil polymorphe correspondant, scopés par son agence) |
| P0 | 🛡️ | Permissions granulaires par ressource (view, create, update, delete, update_all…) |
| P0 | 🛡️ | Distinction « mes ressources » vs « toutes les ressources » |
| P0 | 🛡️ | Résolution des permissions au runtime selon le **profil actif** de la requête (header `X-Profile-Id`, cookie ou auto-bascule) |
| P1 | 🛡️ | Attribution et retrait de rôles à un profil (et non à un user global) |
| P1 | 🛡️ | Éditeur de rôles personnalisés scopé par agence (réservé aux agences `standard`) — un « rôle personnalisé » est un ensemble de `Capability` nommé, porté par l'agence ; le mécanisme reste à concevoir, `Capability` étant défini en code ([ADR-0003](adr/0003-capacites-enum-code-defined.md)) |
| P2 | 🛡️ | Délégation temporaire de permissions |
| P3 | 🛡️ | Règles conditionnelles (policies dynamiques) |

### 2.3 Notifications

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | Tous | Centre de notifications in-app (cloche + feed) |
| P0 | Tous | Marquer comme lu / non lu |
| P0 | Tous | Notifications email transactionnelles |
| P1 | Tous | Notifications push web et mobile |
| P1 | Tous | Préférences par canal (email, push, SMS) |
| P1 | Tous | Templates localisés via fichiers lang/ Laravel |
| P2 | Tous | Notifications SMS (événements critiques) |
| P2 | 🛡️ | Annonces in-app cross-tenant (broadcast) ciblées par rôle / agence / segment, avec dismissal côté utilisateur |
| P2 | Tous | Digest quotidien / hebdomadaire |
| P3 | Tous | Notifications WhatsApp |

#### Canal WhatsApp sortant (P3)

Canal de notification **WhatsApp sortant** qui remplace certains SMS pour les familles proactives (transactionnel, rappels d'échéance, relances impayés), routé **WhatsApp d'abord → SMS en secours** :

- **Sélection mutuellement exclusive** : pour une notification supportant les deux, un seul canal mobile part — `whatsapp` s'il est éligible, sinon `sms`. Jamais les deux (pas de double-envoi).
- **Consentement** : `phone_verified_at` + préférence par événement ; le flag d'opt-out est honoré ; jamais d'envoi à un contact `opted_out`.
- **Conformité Meta** : en fenêtre de service 24h (un message entrant récent du contact) → texte libre autorisé ; hors fenêtre → **template approuvé obligatoire**. Catégories `authentication` (OTP) / `utility` (transactionnel, rappels, relances) uniquement — **jamais `marketing`**.
- **Garantie de livraison** : si WhatsApp est inéligible (contact opted-out, hors fenêtre sans template approuvé) ou échoue durement, bascule **automatique vers SMS** (le SMS reste le filet de sécurité).
- **Statuts** : les accusés Meta (delivered/read/failed) mettent à jour le suivi de livraison.

**Hors périmètre de cette fonctionnalité** (tickets/specs ultérieurs) : OTP/2FA sur WhatsApp (flux d'authentification distinct, SMS reste secours obligatoire) et la **mise-en-relation inbound** WhatsApp (webhook entrant, deep links `wa.me`) — voir `docs/backlog/tickets/TCK-282-whatsapp-outbound-channel.md`. Le socle contact + fenêtre 24h (`whatsapp_contacts`) est partagé entre sortant et inbound.

### 2.4 Recherche & filtres

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | Tous | Recherche plein-texte sur les biens (Scout) |
| P0 | Tous | Filtres dynamiques via paramètres de requête |
| P0 | Tous | Pagination standardisée |
| P1 | Tous | Tri dynamique sur toutes les colonnes listables |
| P1 | Tous | Recherches sauvegardées par utilisateur |
| P2 | Tous | Recherche full-text sur messages et documents |
| P2 | Tous | Suggestions d'autocomplétion |
| P3 | Tous | Recherche sémantique par embeddings |

### 2.5 Reporting & tableaux de bord

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P1 | 🛡️ | Dashboard agence (biens, vues, revenus, impayés) — **agences `standard` uniquement** : c'est le « reporting cross-équipe » restreint en [§1.12](#112-agence--équipe), sous un autre nom (TCK-295) |
| P1 | 🏢 | Dashboard bailleur (portefeuille, cashflow, occupation) |
| P1 | 🧑‍💼 | Dashboard agent (pipeline, commissions, tâches) |
| P1 | 🏠 | Dashboard locataire (prochaines échéances, documents) |
| P2 | 🛡️ | Export CSV / Excel (paiements, baux, clients) |
| P2 | 🛡️ | Export PDF (quittances, factures, rapports) |
| P2 | 🛡️ | Graphiques temporels (revenus, occupation) |
| P2 | 🛡️ | Reporting plateforme cross-tenant (croissance agences/users/listings, MRR/ARR, cohortes de rétention, funnel) — strictement super_admin |
| P3 | 🛡️ | KPI personnalisables par agence — **disponibles aussi en agence `individual`** (arbitrage TCK-284, écrit en [§1.12](#112-agence--équipe)) |
| P3 | 🛡️ | Alertes sur seuils (taux d'impayés, vacance) — **disponibles aussi en agence `individual`** (arbitrage TCK-284, écrit en [§1.12](#112-agence--équipe)) |

### 2.6 Audit & traçabilité

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🛡️ | Journal d'activité automatique sur entités critiques |
| P1 | 🛡️ | Consultation du journal par entité |
| P1 | 🛡️ | Filtrage par utilisateur, date, action |
| P2 | 🛡️ | Export de l'audit trail |
| P3 | 🛡️ | Alertes sur actions sensibles |

### 2.7 Médias & fichiers

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | Tous | Upload de fichiers avec validation de type et taille |
| P0 | Tous | Conversions d'images (thumbnail, preview, responsive) |
| P0 | Tous | Suppression sécurisée |
| P1 | Tous | Upload multiple avec drag & drop |
| P1 | Tous | Réorganisation des médias par glisser-déposer |
| P2 | Tous | Optimisation CDN et formats modernes (webp, avif) |
| P2 | Tous | Watermark automatique sur photos de biens |
| P3 | Tous | Streaming vidéo adaptatif |

### 2.8 Internationalisation & préférences

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | Tous | Langues : FR, EN, WO |
| P0 | Tous | Sélection de la langue par utilisateur |
| P1 | Tous | Fuseau horaire utilisateur (par défaut Africa/Dakar) |
| P1 | Tous | Format de date et nombre localisé |
| P2 | Tous | Devise configurable par agence (XOF par défaut, EUR, USD) |
| P3 | Tous | Conversion multi-devises avec taux de change |
| P3 | Tous | Traduction automatique des contenus utilisateurs |

### 2.9 Administration & configuration

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🛡️ | Gestion des tags et amenités |
| P0 | 🛡️ | Gestion des utilisateurs (activation, blocage) |
| P0 | 🛡️ | Onboarding d'une agence par un super-admin (création + admin initial invité, hors auto-inscription) |
| P1 | 🛡️ | Gestion des enums métier (types de biens, statuts) |
| P1 | 🛡️ | Configuration email (templates, expéditeur) |
| P2 | 🛡️ | Paramètres globaux de plateforme |
| P2 | 🛡️ | Gestion des intégrations tierces (API keys) |
| P2 | 🛡️ | Healthcheck plateforme et supervision des jobs en arrière-plan (file de queue, échecs, rejouer) |
| P3 | 🛡️ | Mode maintenance programmé |
| P3 | 🛡️ | Feature flags |

---

## Notes de priorisation

- **MVP = P0 + P1** : une première version publiable couvre la gestion de biens, la recherche, la location longue durée, les paiements de base, la messagerie, la maintenance, l'auth et les notifications essentielles.
- **P2 (V2)** : enrichissement de l'expérience (comparateur, passerelle de paiement, exports, signatures, multi-devises).
- **P3 (futur)** : différenciateurs concurrentiels (IA, signature électronique native, marketplace).

Chaque fonctionnalité fera l'objet d'une spécification détaillée séparée avant implémentation (user stories, maquettes, règles de gestion, endpoints API).

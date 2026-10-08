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
| 🔧 | Prestataire de service (service provider) |
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
2.10 [Pages légales publiques](#210-pages-légales-publiques)

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
| P1 | 🧑‍💼 | Uploader plans, vidéos et visites virtuelles 360° — la visite virtuelle ou vidéo est un **lien https** vers un hébergeur autorisé ; le téléversement de fichiers vidéo reste à décider (TCK-598) |
| P1 | 🏢🧑‍💼 | Renseigner le coût d'entrée d'une location mensuelle : mois de caution, mois d'avance, frais d'agence en mois de loyer, charges mensuelles (TCK-598) |
| P1 | 🧑‍💼 | Associer des tags / amenités (piscine, climatisation, meublé…) |
| P1 | 🏢🧑‍💼 | Historique de prix automatique à chaque changement |
| P1 | 🧑‍💼 | Ajouter des collaborateurs au bien avec part de commission explicite et permissions granulaires — un collaborateur appartient à l'agence du bien (agent ou admin pour les rôles agent / gestionnaire, bailleur de l'agence pour co-propriétaire) ; la part de commission et le rôle ne sont jamais exposés sur le site public (TCK-598, TCK-586) |
| P1 | 🏢 | Bailleur rattaché à une agence : proposer un bien à son agence — brouillon privé, publié par le personnel de l'agence, qui en est notifié (TCK-587) |
| P0 | 🧑‍💼🛡️ | Réattribuer un bien : la cible est un agent ou un admin **actif** de l'agence du bien, jamais un bailleur (TCK-587, réutilisé par l'action en masse de TCK-591) |
| P1 | 🏢🧑‍💼 | Gérer une hiérarchie de biens (immeuble → étages → lots) |
| P1 | 🧑‍💼🏢 | Renseigner le type de titre foncier (bail, titre foncier, délibération, autre) |
| P1 | 🧑‍💼🏢 | Renseigner l'état d'un bien bâti (sur plan, neuf, rénové, bon état, à rénover) ; « neuf » et « sur plan » sont signalés par un badge sur l'annonce publique |
| P1 | 🧑‍💼 | Compteurs de vues et de favoris |
| P1 | 🏢🧑‍💼 | Saisie des montants lisible : chiffres groupés selon la langue de l'écran, décimales selon la devise (aucune en franc CFA) ; la valeur envoyée reste un nombre (TCK-564, TCK-574) |
| P2 | 🧑‍💼 | Dupliquer un bien (modèle / template) |
| P2 | 🛡️ | Modération et validation avant publication, activable par l'admin d'agence : toute mise en ligne d'un bien jamais validé ou refusé (création, publication, changement de statut, modification) attend l'accord de l'admin (TCK-597) |
| P2 | 🛡️ | Une décision sur un signalement d'annonce agit sur l'annonce : masquer (dépubliée, désindexée, verrouillée jusqu'à levée par la plateforme), retirer (supprimée) ou classer sans suite (TCK-597) |
| P2 | 🧑‍💼 | Archivage en lot |
| P2 | 🧑‍💼🛡️ | Dépublier et réattribuer en lot, avec un bilan succès / refus par bien ; réattribuer change l'agent responsable, jamais le propriétaire du bien (TCK-591) |
| P3 | 🛡️🏢 | Marquer un bien comme nécessitant un suivi administratif particulier |
| P3 | 🛡️ | Détection des annonces en double entre agences (photos identiques, même adresse, même surface et prix), versée à la file de modération (TCK-597) |
| P3 | 🧑‍💼 | Import CSV / API externe (MLS, syndication) |
| P3 | 🧑‍💼 | Estimation automatique de prix (IA / comparables) |

### 1.2 Recherche & découverte publique

Expérience de découverte pour visiteurs anonymes et clients connectés.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 👤🏠 | Page d'accueil (biens en vedette, derniers ajouts) |
| P0 | 👤🏠 | Recherche plein-texte sur les biens |
| P0 | 👤🏠 | Filtres de base (ville, type, prix, chambres, surface, transaction) |
| P0 | 👤🏠 | Fiche bien publique (galerie, détails, formulaire de contact — qui nomme le destinataire pour ce qu'il est, agent ou propriétaire, TCK-573 ; téléphone ou e-mail, mention d'information sur les données, accusé de réception, TCK-590) |
| P1 | 👤🏠 | Annuaire « Agents & propriétaires » (`/agents`) et fiche de personne (`/agents/<slug>`) : chacun est présenté pour ce qu'il est — « Agent immobilier » pour un professionnel en exercice, « Propriétaire » pour tout autre publieur (titre, métadonnées, données structurées `Person`, contact) ; l'API l'expose en `public_role` (TCK-573) |
| P0 | 👤🏠 | Tri des résultats (prix, récence, pertinence) |
| P1 | 👤🏠 | Filtres avancés (amenités, disponibilité, étage, meublé, état du bien) |
| P1 | 👤🏠 | Recherche « autour de moi » : rayon en kilomètres autour d'un point, plafonné à 500 km, appliqué à la liste comme à la carte |
| P1 | 👤🏠 | Tri des résultats par distance au point de recherche |
| P1 | 🏠 | Recherche par carte interactive |
| P1 | 🏠 | Favoris (ajout / retrait / liste personnelle) |
| P1 | 🏠 | Recherches sauvegardées avec alerte réglable par recherche (coupée / quotidienne / hebdomadaire — pas d'envoi instantané), appliquant tous les critères de la recherche, dans la langue du destinataire, listant les biens avec photo, prix, quartier et lien, et un lien de désinscription en un clic ; l'alerte obéit à la préférence « Recherche sauvegardée » (TCK-599) |
| P1 | 👤🏠 | Partage d'un bien (lien, réseaux sociaux) — texte traduit (type, prix, quartier) et paramètres de source ; les demandes reçues par un lien partagé sont attribuées à leur source (TCK-590) |
| P1 | 👤🏠 | Contact WhatsApp et appel depuis la fiche : message prérempli dans la langue du visiteur ; boutons absents quand le contact n'a pas de numéro ; le contact affiché est une personne joignable — jamais un compte bloqué ni un agent sorti de l'agence ; à défaut, les admins de l'agence reçoivent la demande (TCK-590) |
| P1 | 👤🏠 | Coût d'entrée affiché sur la fiche et dans le comparateur (« Total à l'entrée ») (TCK-598) |
| P1 | 👤🏠 | Signaux de confiance sur la fiche : téléphone du contact vérifié, agence vérifiée, conseil de prudence (« ne versez jamais d'argent avant la visite ») (TCK-598) |
| P1 | 👤🏠 | Visite virtuelle ou vidéo consultable sur la fiche (TCK-598) |
| P1 | 👤🏠 | Nombre de vues affiché sur la fiche : une vue par visiteur et par heure ; une vue n'est pas une modification du bien (ni date de mise à jour, ni invalidation) (TCK-598) |
| P1 | 👤🏠 | Les limites anti-abus du site public comptent par visiteur, pages rendues côté serveur comprises ; l'adresse du visiteur n'est pas falsifiable par un en-tête (TCK-598) |
| P1 | 👤🏠 | Signaler une annonce, sans compte (motifs, dont l'arnaque) ; un signalement d'utilisateur connecté est rattaché à son compte et lui vaut un retour sur l'issue (TCK-597) |
| P2 | 🏠 | Comparateur de biens côte à côte — sur mobile, tous les biens tiennent dans la largeur, une rangée de titres numérotés reste collée pendant la lecture et le premier critère est visible dès le premier écran ; « Vider » s'annule sans écraser un bien ajouté entre-temps (TCK-561, TCK-577) |
| P2 | 🏠 | Biens similaires / suggestions personnalisées |
| P2 | 🏠 | Historique local des biens consultés (stockage navigateur) |
| P2 | 👤🏠 | Bien loué, vendu ou retiré : page « plus disponible » non indexée, avec biens similaires et recherche du quartier (TCK-598) |
| P2 | 👤🏠 | Pages de recherche indexables par ville et par quartier, présentes au sitemap (TCK-598) |
| P2 | 👤🏠 | Site installable (manifeste) et favoris locaux relisibles hors connexion (TCK-598) |
| P2 | 👤 | Alerte de recherche sans compte, par e-mail ou WhatsApp : active après double confirmation (lien ou code), désinscription en un clic, rattachable plus tard au compte de même e-mail ou téléphone vérifié (TCK-599) |
| P2 | 🏠 | Favoris : pagination, note personnelle, état « plus disponible » (loué, vendu, retiré) sans prix ni localisation d'un bien redevenu non public ; un favori ne s'ajoute que sur un bien public (TCK-599) |
| P2 | 🏠 | Alerte sur un favori : baisse de prix, ou bien loué / vendu / retiré — groupée par jour, désactivable par événement (TCK-599) |
| P3 | 🏠 | Recherche vocale / en langage naturel |

### 1.3 Réservations courte durée & visites

Réservation ponctuelle d'un bien (saisonnier, visite payante, pré-réservation).

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P1 | 🏠 | Demander une réservation (dates, montant, caution) — refusée dès la demande sur des nuits déjà confirmées ; un séjour peut arriver le jour du départ d'un autre (TCK-596) |
| P1 | 🏢🧑‍💼 | Accepter, refuser ou annuler une demande |
| P1 | 🏠🏢 | Paiement d'acompte et solde — **acompte = 30 % du total** (estimation affichée dans le tunnel de réservation, règle stable). Quand le besoin de varier par bien/contrat apparaîtra, déplacer le calcul backend via un endpoint `GET /api/bookings/quote`. |
| P1 | 🏢🧑‍💼🛡️ | Vue calendrier agrégée à partir des réservations confirmées et des visites planifiées (acteurs élargis par TCK-591) |
| P1 | 🏠🏢 | Consultation des paiements liés à la réservation |
| P1 | 🏠 | Télécharger le reçu PDF d'un acompte ou d'un solde de réservation payé (TCK-593) |
| P1 | 🏠 | Annuler sa propre réservation : bailleur et agent du bien prévenus ; un acompte déjà payé est signalé « remboursement à traiter » à l'agence, et le client voit le remboursement en cours (TCK-596) |
| P1 | 🏢🧑‍💼 | Être prévenu de chaque demande de réservation ou offre d'achat sur un bien (bailleur et agent du bien), qu'elle vienne du site public ou de la console (TCK-596) |
| P1 | 🏢🧑‍💼 | Marquer un acompte remboursé : personnel de l'agence titulaire de la capacité de remboursement, ou bailleur du bien — jamais le client ni un autre bailleur de l'agence (TCK-596) |
| P2 | 🏠 | Expiration automatique des demandes non traitées — au seuil de l'agence (`booking_pending_expiry_hours`, 1 à 168 h, 0 = désactivé) ou à l'échéance propre de la demande, la première échue ; l'API l'expose (`response_deadline`) et la confirmation l'affiche, sans promettre de délai quand il n'y en a pas (TCK-575) ; une demande expirée à son échéance propre est datée, journalisée et notifiée au client comme au seuil de l'agence (TCK-596) |
| P2 | 🏠🧑‍💼 | Planification de visites : en personne, virtuelle, en autonomie ou hybride ; agent accompagnateur, durée estimée, feedback post-visite |
| P2 | 🏠🧑‍💼 | Rappels automatiques avant visite — y compris au visiteur sans compte (téléphone de la demande), 24 h et 1 h avant (TCK-588) |
| P2 | 👤🧑‍💼 | Demande de visite sans compte (nom et téléphone), routée vers le contact principal du bien ; le visiteur est prévenu de la confirmation par e-mail ou SMS (TCK-590) |
| P2 | 🧑‍💼🛡️ | Visites non attribuées visibles de l'équipe de l'agence, prise en charge en un geste (TCK-590) |
| P2 | 🧑‍💼 | Planifier une visite pour un client (avec ou sans compte) depuis la console — précise QUI planifie dans la ligne « Planification de visites » (TCK-590) |
| P2 | 👤🏠 | Créneaux de visite proposés hors des visites déjà confirmées, saisis et affichés en heure de Dakar (TCK-590) |
| P2 | 🏠 | Replanification d'une visite par le client, soumise à nouvelle confirmation de l'agent (TCK-590) |
| P2 | 🧑‍💼🛡️ | Une visite n'est rattachée qu'à une fiche client et à un accompagnateur de l'agence du bien (TCK-590) |
| P2 | 🧑‍💼🛡️ | Calendrier : tâches, échéances de bail (fin, renouvellement) et interventions planifiées ; filtre « mes rendez-vous » (TCK-591) |
| P2 | 🔧 | Ses interventions planifiées dans le calendrier (le raccourci « Calendrier » y mène) (TCK-591) |
| P2 | 🏢🧑‍💼 | Bloquer des dates d'un bien en courte durée (usage personnel, travaux) : aucune demande ni confirmation possible sur ces dates, grisées dans le tunnel public (TCK-596) |
| P2 | 🏢🧑‍💼 | Synchroniser le calendrier d'un bien avec Airbnb / Booking.com : export iCal par bien (lien secret révocable) et import d'URL iCal externes rafraîchi périodiquement, conflits signalés (TCK-596) |
| P3 | 🧑‍💼🛡️ | Abonnement personnel au calendrier (iCalendar) par lien secret révocable (TCK-591) |
| P3 | 🏠 | Annulation avec remboursement partiel automatisé |

### 1.4 Location longue durée (baux)

Gestion complète d'un contrat de bail et de son cycle de vie.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P1 | 🏢🧑‍💼 | Créer un bail (locataire, bailleur, durée, loyer, caution) |
| P1 | 🧑‍💼 | Ajouter un ou plusieurs garants avec documents joints |
| P1 | 🏢🧑‍💼 | Générer l'échéancier de loyers mensuels |
| P1 | 🏠🏢 | Enregistrer un paiement mensuel |
| P1 | 🏠🧑‍💼 | Relances de loyer automatiques (J-3, J+1, J+7) au locataire, y compris sans compte (téléphone du client), sur WhatsApp puis SMS en secours, dans sa langue ; un retard est relancé que le bail porte une pénalité ou non, et la relance annonce le solde restant dû (TCK-588) |
| P1 | 🏢🧑‍💼 | Alerte d'impayé au bailleur (J+1, J+7) et récapitulatif quotidien unique des impayés à l'agent (TCK-588) |
| P1 | 🧑‍💼🏢 | Appliquer automatiquement des pénalités de retard sur les paiements en retard |
| P1 | 🧑‍💼🏢 | Choisir, par agence, si les pénalités de retard s'encaissent avec le paiement en ligne du loyer — désactivé par défaut (TCK-593) |
| P1 | 🧑‍💼🏢 | Enregistrer une pénalité de retard réglée à l'agence ; la quittance la dit acquittée ou restant due (TCK-593) |
| P1 | 🏠 | Payer en ligne une échéance de loyer (Wave / Orange Money) pour le montant réellement dû : le restant du loyer, plus la pénalité de retard appliquée **si l'agence l'a choisi** (réglage d'agence, désactivé par défaut — sinon la pénalité reste due et s'affiche à part, « à régler auprès de l'agence ») ; le montant est figé à l'ouverture du paiement ; une échéance payée ou remboursée ne peut pas être repayée (TCK-593) |
| P1 | 🏠🏢 | Télécharger le contrat de bail en PDF depuis le détail du bail (TCK-593) |
| P1 | 🧑‍💼 | Remboursement de la caution en fin de bail |
| P1 | 🏢🧑‍💼 | Consultation de l'historique complet d'un bail |
| P2 | 🏢🧑‍💼 | Renouveler un bail ou créer un avenant (loyer, durée, conditions) avec traçabilité du bail parent ; le bail renouvelé reçoit son échéancier sans geste manuel (TCK-596) |
| P2 | 🏢🧑‍💼 | Résiliation anticipée avec calcul des pénalités |
| P2 | 🏠🏢 | Révision annuelle du loyer (indice ou accord amiable) journalisée via le journal d'activité |
| P2 | 🏠🏢 | Télécharger la quittance d'une échéance de loyer payée — jamais pour une échéance non acquittée (TCK-593) |
| P2 | 🏠 | Donner congé depuis son espace locataire : délai de préavis et pénalité affichés avant l'envoi, retrait possible tant que la fenêtre d'annulation est ouverte ; la clôture reste au gestionnaire (TCK-596) |
| P2 | 🏠🏢🧑‍💼 | Signature du bail par code à usage unique (SMS sur numéro vérifié, sinon e-mail) : empreinte du contrat figé, horodatage et IP de chaque partie ; activation à la seconde signature (TCK-596 — remplace la ligne P3 « Signature électronique du bail ») |
| P3 | 🏠 | Espace locataire dédié (quittances, factures, maintenance) |
| P1 | 🏠🧑‍💼 | Onboarding résident à la signature du bail : notification "Bienvenue chez vous", welcome modale "Espace résident", checklist d'entrée (état des lieux, premier paiement, accès aux documents), suivi de complétion par un `TenantOnboardingChecklist` |

### 1.5 Transactions & paiements

Encaissements, factures et reversements.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🛡️ | Enregistrer un paiement (réservation ou bail) |
| P1 | 🛡️🏢 | Générer une facture à un Customer destinataire |
| P1 | 🛡️🏢 | Facture opposable : numérotation chronologique continue par agence et par an, attribuée à l'émission ; mentions légales de l'agence (raison sociale, NINEA, RCCM, adresse) ; TVA par défaut de l'agence ; une facture émise ne s'annule que par un avoir (TCK-594) |
| P1 | 🏢 | Reversement au bailleur après commission (Payout) |
| P1 | 🏢🏠 | Reversement au bailleur calculé depuis les loyers et réservations encaissés de la période (loyer, charges, pénalités, régularisations ; jamais la caution), commission du bail sinon de l'agence, frais de travaux refacturés déduits ; le brut n'est pas saisi et un paiement n'est reversé qu'une fois (TCK-594) |
| P1 | 🏢🏠 | Un reversement ne cite que des paiements de l'agence et du bailleur concernés ; un remboursement de caution est un versement au locataire, jamais compté comme reversé au bailleur (TCK-594) |
| P1 | 🏢🏠 | Relevé de gérance mensuel (PDF / CSV) par bien et consolidé, et attestation annuelle de revenus locatifs, envoyés au bailleur en début de mois (TCK-594) |
| P1 | 🏢🛡️ | Double validation des sorties d'argent : la même personne ne tient jamais deux gestes consécutifs (préparer, approuver, marquer payé) ni n'approuve un versement dont elle est bénéficiaire. Reversements plateforme : toujours. Reversements d'agence : désactivée par défaut ; l'agence l'active par un seuil, possible seulement avec deux approbateurs (TCK-594) |
| P1 | 🛡️ | Historique des paiements par entité (bien, bail, client) |
| P1 | 🛡️ | Suivi des statuts (en attente, payé, remboursé, annulé) |
| P2 | 🛡️ | Intégration d'une passerelle de paiement (Wave, Orange Money, Free Money, Stripe) ; une intégration de paiement n'est enregistrée qu'avec les identifiants que son pilote exige (TCK-602) |
| P2 | 🏠🏢🧑‍💼 | Lien de paiement en ligne (Wave / Orange Money / Free Money) par échéance de loyer, utilisable sans compte : jeton expirant et révocable envoyé au locataire, quittance remise après paiement (TCK-602) |
| P1 | 🏠🧑‍💼 | Le payeur (locataire, client) voit les fournisseurs de paiement en ligne que l'agence a activés — intégration plateforme comprise — et seulement ceux-là (TCK-602) |
| P2 | 🛡️ | Supervision des paiements (console plateforme) : paiements en échec, en retard et webhooks non appariés, par fournisseur et par agence (TCK-602) |
| P2 | 🛡️ | Rapprochement bancaire semi-automatique |
| P2 | 🛡️ | Régler depuis l'écran le mapping CSV des relevés de l'agence (colonnes, format de date, séparateur décimal déclaré) et voir les lignes ignorées à l'import (TCK-593) — les préréglages Wave Business / Orange Money attendent un export réel (dette D-67) |
| P2 | 🛡️ | Rapprocher les débits d'un relevé avec les reversements (Payout) émis (TCK-593) |
| P2 | 🛡️ | Relance automatique des factures en retard |
| P2 | 🛡️ | Reversement plateforme → agence (commission plateforme retenue à la source, payout périodique agrégé) |
| P2 | 🛡️ | Reversement plateforme refusé vers une agence non active ; une agence `standard` non vérifiée est bloquée à l'approbation (TCK-594) |
| P2 | 🛡️ | Les reversements plateforme d'une agence non active sont gelés, y compris s'ils ont été clôturés avant la suspension ; la clôture globale traite toutes les agences et liste les exclues avec leur motif (TCK-594) |
| P2 | 🏢 | Un reversement programmé échu est rappelé une fois à son émetteur (TCK-594) |
| P2 | 🏠🔧🏢 | Moyens de versement du bénéficiaire (Wave, Orange Money, Free Money, virement), vérifiés par l'agence ; décaissement tracé par une référence de transaction obligatoire ; avis de versement effectué / échoué au bénéficiaire (TCK-594) |
| P3 | 🛡️ | Commissions automatiques par agent / collaborateur |
| P3 | 🛡️🧑‍💼 | Relevé des commissions par agent, avec statut « payée à l'agent » (TCK-595) |
| P3 | 🛡️ | Comptabilité exportable (FEC, journaux) |

### 1.6 CRM & relation client

Gestion des contacts (Customer) liés ou non à un compte utilisateur.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🧑‍💼 | Créer un Customer (avec ou sans compte User) |
| P0 | 🧑‍💼 | Liste et recherche de clients |
| P0 | 🧑‍💼 | Le CRM de l'agence n'est lu et alimenté que par son personnel ; un bailleur ne voit que les fiches qu'il a lui-même ajoutées (TCK-591) |
| P1 | 🧑‍💼 | Lier un Customer à un User existant |
| P1 | 🧑‍💼 | Définir la relation agent ↔ client (type, période) |
| P1 | 🧑‍💼 | Joindre pièces d'identité et documents |
| P1 | 🧑‍💼 | Historique d'interactions (via journal d'activité) |
| P1 | 🧑‍💼 | Désigner un contact principal parmi les agents liés à un client |
| P1 | 🧑‍💼 | Ajouter des notes horodatées et signées par un agent sur un client |
| P1 | 🧑‍💼🛡️ | Boîte des demandes de contact (leads) de l'agence : message complet et coordonnées, prise en charge, attribution à un agent, conversion en client (TCK-590) |
| P2 | 🧑‍💼 | Pipeline de prospects (stades, conversion) — changement d'étape sans glisser-déposer (mobile, clavier) (TCK-591) |
| P2 | 🧑‍💼 | Tâches et rappels attachés à un client ou à un bien, et page « Mes tâches » (en retard / aujourd'hui / à venir) ; une tâche ne s'assigne qu'à soi ou au personnel de l'agence, et seul son créateur la supprime (TCK-591) |
| P2 | 🧑‍💼 | Segmentation et tags clients |
| P2 | 🧑‍💼 | Téléphone du client normalisé (E.164, +221 par défaut) et signalement d'un doublon (téléphone ou e-mail) dans l'agence avant création (TCK-591) |
| P2 | 🧑‍💼 | Joindre un client en un geste depuis la console : appel, ou WhatsApp avec message prérempli (TCK-591) |
| P2 | 🧑‍💼 | Critères de recherche structurés du prospect (contrat, budget, types, villes / quartiers, chambres) et rapprochement biens ↔ prospects de l'agence, avec récapitulatif quotidien au référent (TCK-591) |
| P2 | 🧑‍💼 | Fiche client unique : notes, tâches, activité, visites, réservations et baux du client (TCK-591) |
| P3 | 🧑‍💼 | Campagnes email / SMS ciblées |

### 1.7 Communication & messagerie

Échanges entre acteurs autour d'un bien, d'une réservation ou d'un bail.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P1 | 🏠🏢🧑‍💼 | Conversation privée 1↔1 entre client et agent / bailleur |
| P1 | 🛡️ | Seule la plateforme publie un avis système dans une conversation ; un participant n'écrit que du texte, des pièces jointes et des notes vocales (TCK-592) |
| P1 | 🏠🏢 | Envoyer un message texte avec pièces jointes |
| P1 | 🏠🏢 | Liste des conversations avec statut non lu — messages d'un autre postérieurs à la dernière lecture, hors avis système ; ouvrir un fil le marque lu (TCK-579) |
| P1 | 🏠🏢 | Notification en temps réel (in-app + email) |
| P2 | 🏢🧑‍💼 | Conversations de groupe (multi-participants) — participants choisis par leur nom ; bien et bail rattachés par recherche (titre, référence), dans le périmètre visible de l'acteur ; un bail doit concerner le bien choisi (TCK-565, TCK-576) |
| P2 | 🏠🏢 | Accusés de lecture individuels (si > 5 participants) |
| P2 | 🏠🏢 | Recherche dans l'historique des messages |
| P2 | 🧑‍💼🔧🏠 | Fil de discussion automatique par intervention, avec un message système à chaque étape (TCK-592) |
| P2 | 🔧🏠🏢 | Notes vocales dans la messagerie (≤ 60 s) (TCK-592) |
| P3 | 🏠🏢 | Appels audio / vidéo intégrés |
| P3 | 🏠🏢 | Traduction automatique FR ↔ EN ↔ WO |

### 1.8 Maintenance & interventions

Signalement et suivi des problèmes techniques sur un bien loué.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P1 | 🏠 | Signaler un problème avec photos et description |
| P1 | 🧑‍💼 | Assigner un prestataire (service provider) |
| P1 | 🧑‍💼🔧 | Suivi des statuts (nouveau, en cours, résolu, annulé) |
| P1 | 🧑‍💼🔧 | Ajouter photos et rapport après intervention |
| P1 | 🏠🏢 | Consulter l'historique des interventions par bien |
| P1 | 🔧 | Consulter ses interventions assignées : liste terrain triée par créneau, lieu et agence (delta de TCK-446, TCK-592) |
| P1 | 🔧 | Accepter ou refuser une intervention assignée ; un refus est motivé et la demande revient au donneur d'ordre (TCK-592) |
| P1 | 🏠 | Être notifié de chaque étape de sa demande (prise en charge, assignation, date prévue, fin) (TCK-592) |
| P1 | 🏠🧑‍💼 | Confirmer ou contester la résolution ; clôture automatique sans réponse après 7 jours — le prestataire ne clôt pas (TCK-592) |
| P1 | 🧑‍💼🔧 | Voir les photos du signalement, les photos avant / après et les pièces du devis (TCK-592) |
| P2 | 🏢🧑‍💼🔧 | Demande de devis et validation avant travaux — le donneur d'ordre demande, approuve ou refuse ; le prestataire assigné est seul à soumettre le devis |
| P2 | 🔧🧑‍💼 | Devis structuré (lignes main-d'œuvre / fournitures, validité, durée), devise imposée, PDF (TCK-592) |
| P1 | 🔧🧑‍💼 | Pièces du devis : PDF ou images seulement (TCK-592) |
| P2 | 🏢 | Plafond de travaux sans accord : au-delà, le bailleur approuve ou refuse le devis ; le bailleur est averti de tout devis sur son bien (TCK-592) |
| P2 | 🔧 | Kit d'accès au logement (adresse, itinéraire, téléphone du locataire, consignes) pendant l'intervention acceptée (TCK-592) |
| P2 | 🧑‍💼 | Priorisation des demandes (urgent, normal, bas) |
| P2 | 🏢🧑‍💼🏠 | Noter le prestataire après une intervention terminée (1 à 5 + commentaire) ; note agrégée visible des agences dans le carnet (TCK-597) |
| P3 | 🔧🏢 | Facturation directe prestataire → agence : à la fin d'une intervention, facture du prestataire générée (devis approuvé ou coût réel), validée par l'agence, payée par mobile money et imputable au reversement du bailleur (TCK-594) |
| P3 | 🧑‍💼 | Contrats de maintenance récurrents |
| P3 | 👤🏢 | Annuaire public des prestataires, sur consentement du prestataire, contact via la plateforme |

**Les deux écarts relevés par TCK-420 sont tranchés** (TCK-445) — le premier était un oubli et il
est corrigé, le second était une décision qui n'avait jamais été écrite et elle l'est ci-dessous.
Ils restent écrits plutôt que marqués dans la table : un acteur ajouté dans la colonne *entérine*
un pouvoir, il ne l'explique pas.

- **« Assigner un prestataire » et « Priorisation des demandes » sont bien réservées au donneur
  d'ordre — c'est désormais vrai en code.** `assigned_to` et `priority` exigent l'ability
  `MaintenanceRequestPolicy::actAsPrincipal` : super-admin, propriétaire du bien, ou même agence.
  Un `PATCH` du **prestataire assigné** qui porte l'un des deux est un **403** — pas un champ
  ignoré en silence, pas un 422. Il garde tout le reste de ce que cette table lui accorde :
  rapport et planification. ⚠ **TCK-592 resserre cette phrase** : le statut ne change que par la
  machine d'état, chaque transition autorisée pour un acteur nommé, et le coût réel ne s'écrit que
  par le rapport de fin (`complete`) — jamais par un `PATCH` du prestataire.

  *Ce que l'oubli avait coûté, et pourquoi il était décidable* : `update()` accorde au prestataire
  assigné, `rules()` acceptait les deux champs, les deux sont `$fillable`, et le contrôleur faisait
  un `fill()->save()` sans restriction de champ. La preuve que c'était un oubli et non un arbitrage
  était dans le chemin de CRÉATION, qui s'en protégeait déjà avec sa PROPRE copie de la définition
  du donneur d'ordre. *Une asymétrie entre deux chemins du même contrôleur sur le même champ est la
  signature d'un oubli.* Les deux chemins lisent maintenant la même définition
  (`MaintenanceRequestPolicy::isPrincipalFor()`).
- **« Ajouter photos et rapport après intervention » recouvre deux gestes de garde différente, et
  c'est VOULU.** Le rapport de fin (`PUT …/complete`) et la collection `completion_photos` exigent
  `update`, d'où 🧑‍💼🔧. Mais `POST …/photos` sur la collection `photos` par défaut ne demande que
  `can('view')`, et `view` inclut le **demandeur** : **un locataire 🏠 peut ajouter des photos à sa
  demande** tant qu'elle n'est ni close ni annulée.

  **Décision (TCK-445) : cela reste ouvert au demandeur.** Compléter son propre signalement est
  légitime — c'est la même personne qui l'a ouvert, et c'est elle qui voit la panne. La collection
  qui engage la responsabilité du prestataire, `completion_photos`, reste gardée par `update`.
  La ligne du tableau ne porte pas 🏠 parce que le geste appartient au signalement (P1, 🏠), pas à
  l'intervention.

### 1.9 État des lieux & inventaires

Constats contradictoires entrée / sortie.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P1 | 🧑‍💼 | Créer un inventaire d'entrée ou de sortie |
| P1 | 🧑‍💼 | Photos par pièce et état par élément — chaque pièce montre ses photos, supprimables tant que l'état des lieux est un brouillon ; aucun ajout après soumission (TCK-596) |
| P1 | 🧑‍💼 | Consulter / éditer un inventaire |
| P2 | 🏠🏢 | Signature des deux parties (locataire + bailleur), chacune par un tracé et pour elle-même seulement — un collaborateur du bien ne signe jamais pour le bailleur ; l'empreinte imprimée couvre les photos et est figée à la seconde signature (TCK-596) |
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
| P1 | 🏢🏠 | Lien de partage d'un document : jeton stocké haché, accès public limité en débit, mot de passe envoyé dans le corps de la requête et protégé contre les essais répétés (TCK-602, TCK-587) |
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
| P2 | 👤🏠🏢 | Un signalement range l'avis dans la file de modération sans le masquer ; la note moyenne publiée ne compte que les avis publiés (TCK-597) |
| P2 | 🏢🧑‍💼 | Boîte des avis reçus (sur ses biens, sur soi), filtrée par bien et par réponse, et notification d'un nouvel avis (TCK-597) |
| P2 | 🛡️ | L'admin d'agence modère les avis de ses biens et de ses agents, jamais ceux d'une autre agence ; les avis sur l'agence elle-même et sur un prestataire relèvent de la plateforme (TCK-597) |
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
> - **Les reversements plateforme → agence de [§1.5](#15-transactions--paiements) sont DISPONIBLES
>   en agence `individual`** (TCK-594) — même motif que les KPI ci-dessus : la liste des
>   restrictions ne les nomme pas, et un écran d'argent qu'on cadenasse par analogie prive l'hôte
>   solo de ce qui lui est dû.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🛡️ | Créer et configurer une agence (nom, licence, contact, logo) |
| P0 | 🛡️ | Ajouter et retirer des agents |
| P0 | 🛡️ | Attribution de rôles aux membres |
| P0 | 🛡️ | Suspendre / réactiver l'adhésion d'un membre (agent, bailleur, co-admin) à l'agence, sans toucher au compte ; le blocage d'un compte reste un geste super-admin ; l'administrateur principal ne peut être suspendu ; acte journalisé (TCK-587) |
| P0 | 👤🏠 | Auto-création d'une agence `individual` via la CTA "Publier" du header (pattern Airbnb) — wizard 5 steps qui crée simultanément `Agency.kind=individual`, `AgencyAdminProfile`, `OwnerProfile` et un premier `Property` brouillon |
| P1 | 🛡️ | Statistiques globales d'agence (portefeuille, revenus) |
| P1 | 🛡️ | Paramètres de commission par défaut |
| P1 | 🛡️ | Dossier KYC documentaire de l'agence (RCCM, NINEA, pièce dirigeant) avec workflow vérification (pending → submitted → verified / rejected) |
| P1 | 🛡️ | Upgrade `individual` → `standard` : l'admin de l'agence individuelle soumet une demande (`AgencyUpgradeRequest`) avec compléments légaux (RC, NINEA, RIB pro, statuts) ; un super-admin la review depuis la console ; à l'approbation, `Agency.kind` bascule vers `standard` et débloque les capacités restreintes (invitation collaborateurs internes, multi-admin, custom roles, etc.). Pas d'upgrade self-service direct, pas de rétrogradation `standard` → `individual`. |
| P1 | 🛡️ | Passation du portefeuille d'un agent retiré (tâches, visites, interventions, collaborations, biens dont il est responsable, clients dont il est référent) vers un ou plusieurs repreneurs, en une opération journalisée (TCK-591) |
| P1 | 🛡️🔧 | Mettre en pause ou terminer une collaboration avec un prestataire (agence) ; quitter une agence (prestataire) ; une pause ou une suspension ne se lève que par celui qui l'a posée (TCK-592) |
| P1 | 🛡️ | Retirer de l'agence un agent ou un admin d'agence (capacité `team.remove`), toujours journalisé (TCK-591) |
| P2 | 🛡️🧑‍💼 | Carnet des prestataires de l'agence filtré par statut de collaboration (actifs par défaut), métier et zone (TCK-592) |
| P1 | 🛡️ | Validité des pièces KYC d'agence : date d'expiration de la pièce du dirigeant, relances J-30 / J-7, retour du dossier en attente à l'échéance ; signalement au super-admin d'un NINEA ou d'un RIB professionnel déjà porté par une autre agence — le contrôle de forme du NINEA et du RCCM est différé (D-68) (TCK-601) |
| P2 | 🛡️ | Plans d'abonnement et quotas par agence (catalogue, période d'essai, limites) |
| P2 | 🔧 | Modifier son profil prestataire (métiers, zones, tarifs, disponibilités) après l'onboarding (TCK-592) |
| P3 | 🛡️ | Gestion multi-branches / sous-agences |
| P3 | 🛡️ | Absence datée d'un agent avec remplaçant désigné : les assignations nouvelles sont routées vers lui (TCK-591 — précise « Gestion des congés / disponibilité des agents ») |
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
| P1 | Tous | Vérification du numéro de téléphone (SMS / OTP) — indicatif hors du champ ; l'API refuse partout (profil, envoi du code) un numéro qu'aucun SMS ne peut joindre : longueur sénégalaise fausse, `0` de préfixe national derrière l'indicatif (TCK-566, TCK-574) ; le code part réellement par SMS, n'est jamais rendu par l'API ni accepté sous une forme fixe, et s'invalide après 5 essais ; un numéro vérifié n'appartient qu'à un compte (TCK-589) |
| P1 | Tous | OAuth Google (Socialite) |
| P1 | Tous | Authentification à deux facteurs (TOTP + codes de récupération) |
| P1 | 🛡️ | 2FA TOTP exigée en continu pour tout super-admin : la console refuse un compte sans 2FA active ; la 2FA d'un super-admin ne se désactive pas, elle se renouvelle ; une réinitialisation par le support impose le réenrôlement à la connexion suivante (TCK-589) |
| P1 | 🛡️🏢 | 2FA exigée pour le personnel de l'agence sur les opérations d'argent, d'intégrations, de rôles et d'équipe ; réglage d'agence « 2FA obligatoire pour toute l'équipe » ; statut 2FA visible dans la liste de l'équipe (TCK-589) |
| P1 | Tous | Gestion des sessions actives |
| P1 | Tous | Sessions bornées : jeton à durée absolue et expiration par inactivité ; session super-admin courte (`platform.session_max_minutes`) et confirmation 2FA récente (step-up) avant une action sensible de la console (TCK-589) |
| P1 | Tous | Connexion et inscription par numéro de téléphone + code à usage unique reçu par SMS, sans mot de passe ; le compte est créé au premier code validé ; e-mail facultatif ; limiteurs et verrou par numéro — livrée entière, derrière un drapeau faux par défaut, allumée par environnement après un envoi réel mesuré ; décision par ADR (TCK-589) |
| P1 | Tous | Verrou de compte après échecs de connexion répétés (mot de passe ou code), levé seul au bout de 15 min ou par le support ; un compte bloqué ou supprimé n'ouvre aucune session, par aucun chemin (TCK-589) |
| P1 | Tous | L'inscription ouvre la session aussitôt (TCK-589) |
| P1 | 👤 | L'inscription garde l'intention du visiteur (bien, dates, action) jusqu'au retour sur la fiche, quel que soit le chemin (connexion, inscription, téléphone, OAuth) (TCK-589) |
| P1 | 🏠🛡️ | Données bancaires et d'identité des profils et des demandes de passage en agence (RIB, NINEA, n° de pièce, RIB professionnel) chiffrées au repos et masquées à l'affichage ; valeur complète réservée à l'admin de l'agence et au super-admin, consultation journalisée (TCK-601) |
| P2 | Tous | Suppression de compte avec anonymisation (RGPD) |
| P2 | Tous | Export des données personnelles (portabilité RGPD — déclenché par l'utilisateur) — une demande par 24 h ; statut suivi jusqu'à la fin de la préparation ; e-mail de fin dans la langue du compte (TCK-567, TCK-575) |
| P2 | 🛡️ | Déclenchement de l'export RGPD par un super-admin pour le compte d'un utilisateur (support / réquisition) |
| P2 | Tous | OAuth Facebook / Apple |
| P3 | Tous | Magic link de connexion |

#### Profils & contexte actif (TCK-138 → TCK-142)

Une **identité = un User**, qui peut porter plusieurs **profils métier** chez plusieurs agences (ex. un même humain peut être propriétaire chez l'agence A, locataire chez l'agence B et prestataire collaborant avec C et D).

> ⚠️ **Le courtier n'est plus un profil commutable depuis le 2026-08-31** ([ADR-0027](adr/0027-le-courtier-sort-de-la-surface-commutable.md), TCK-495). Il illustrait l'exemple ci-dessus jusque-là, et l'exemple était juste sur le principe — c'est le produit qui ne l'a jamais suivi : zéro route, zéro écran, aucun chemin qui crée le profil. `BrokerProfile` et `BrokerAgencyCollaboration` restent décrits par [`models-spec.md`](models-spec.md#36-brokerprofile-) et vivent en base ; ils ne sont ni sélectionnables dans le sélecteur d'espaces, ni émis dans `roles`. Email, mot de passe, 2FA et OAuth sont **uniques au user** (pas dupliqués par profil) ; le KYC et les informations administratives sont portés **par chaque profil** (RIB et tax_id par OwnerProfile, license_number par AgentProfile/BrokerProfile, certifications par ServiceProviderProfile).

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
| P0 | Tous | Pattern d'invitation unifié — création par un inviteur autorisé, invitation par e-mail OU par SMS (lien court) quand l'invité n'a qu'un numéro (TCK-589), avec token signé (expiry 7j, rappel automatique J+2, renvoi self-service par l'inviteur, révocation possible avant acceptation) ; à l'acceptation, le profil cible passe en `active` et devient le profil actif |
| P0 | 🛡️ | Bootstrap super-admin via commande artisan `takussan:create-super-admin` (1ère installation par environnement) — exige 2FA TOTP au premier login |
| P0 | 👤🏠 | Onboarding wizard Customer post-signup — welcome modale (3 slides skippables) + complétion différée du profil minimal (téléphone, ville, type de recherche) au moment de la première action sensible (favoris / réservation / contact) |
| P1 | 🛡️ | Cooptation super-admin (super-admin → super-admin) — invitation pair-à-pair via console super-admin avec 2FA TOTP **obligatoire** avant `active` (bloquant), audit log automatique, notification broadcast aux autres super-admins |
| P1 | 🏢 | Wizard onboarding Owner post-acceptation invitation — vérification téléphone OTP (obligatoire), KYC documentaire (CNI/passeport, RIB, NINEA, statut particulier/société) en `pending_review` non bloquant, tour produit 3 slides, vue "biens déjà associés" si pré-rattachement |
| P1 | 🧑‍💼 | Wizard onboarding Agent post-acceptation invitation — vérification téléphone OTP, KYC (license_number, pièce d'identité, photo profil, spécialisation, zones d'intervention), affichage du périmètre de permissions choisi par l'admin inviteur, lien vers premier lead pré-assigné |
| P1 | 🔧 | Wizard onboarding Service Provider post-acceptation invitation — vérification téléphone OTP, KYC (pièce d'identité, métiers multi-select, zones, tarifs indicatifs, assurance RC pro optionnelle valorisée), disponibilités hebdomadaires, accès direct à la 1ère intervention si invitation déclenchée par une demande active. Multi-rattachement à plusieurs agences via plusieurs `ServiceProviderAgencyCollaboration` sans dupliquer le compte. |
| P1 | Tous | Composant wizard reprenable — chaque step sauvegardé en `draft`, bandeau persistant "Reprenez votre publication / votre onboarding" sur dashboard, reprise depuis le menu compte |
| P1 | Tous | Welcome modale générique réutilisable — composant 3 slides max, skippable, paramétrable par parcours (Customer, Host, Owner, Agent, AgencyAdmin, ServiceProvider, Tenant) |
| P1 | 🏢 | Carte « Mise en service » de l'agence sur `/admin` : étapes calculées par l'API (KYC vérifié, logo, taux de commission, intégration de paiement active, premier membre, premier bien publié, 2FA), chacune avec son lien ; disparaît une fois complète (TCK-589) |

### 2.2 Rôles & permissions

> **TCK-138 → TCK-142, puis TCK-278.** La nature métier (owner / agent / service_provider) est portée par le **profil actif**, et les permissions en **découlent** : `spatie/laravel-permission` a été désinstallé, il n'y a plus ni table de rôles, ni `team_id`. Un « rôle » est un **profil polymorphe** ([ADR-0002](adr/0002-role-est-un-profil-polymorphe.md), [Règle 5 de `models-spec.md`](models-spec.md#règle-5--profil--rôle)) ; une « permission » est un cas de l'enum `Capability` (`<domaine>.<verbe>`), résolu par `MembershipCapabilityResolver` pour un couple *(utilisateur, agence)* et additif entre profils ([ADR-0003](adr/0003-capacites-enum-code-defined.md)). Plus aucun scoping direct par `users.agency_id` — la colonne n'existe plus en base.
>
> ⚠️ **Cette section décrivait le mécanisme spatie au présent jusqu'au 2026-08-15**, plusieurs mois après sa suppression, alors qu'une garde CI casse déjà sur tout import `Spatie\Permission\`. Le **quoi** ci-dessous — rôles prédéfinis, permissions granulaires, éditeur de rôles réservé aux agences — est tranché et n'a pas bougé ; seul le **comment** était périmé. Si une ligne de ce tableau contredit le code, c'est le code qui a raison.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🛡️ | Rôles prédéfinis : `super_admin` (porté par `PlatformProfile`, hors agence) ; `agency_admin`, `agent`, `owner`, `tenant`, `customer`, `service_provider` (portés par le profil polymorphe correspondant, scopés par son agence) |
| P0 | 🛡️ | Permissions granulaires par ressource (view, create, update, delete, update_all…) |
| P0 | 🛡️ | Distinction « mes ressources » vs « toutes les ressources » |
| P0 | 🛡️ | Résolution des permissions au runtime selon le **profil actif** de la requête (header `X-Profile-Id`, cookie ou auto-bascule) — l'auto-bascule ne retient que les profils actifs (TCK-587) |
| P0 | 🛡️ | Un profil non actif (suspendu, brouillon, inactif, bloqué) ne confère aucune capacité ni aucun périmètre dans son agence ; la suspension prend effet à la requête suivante (TCK-587) |
| P1 | 🛡️ | Attribution et retrait de rôles à un profil (et non à un user global) |
| P0 | 🛡️🏢 | Cloisonnement des bailleurs d'une même agence : un bailleur ne lit et ne modifie que ses biens, baux, loyers, réservations, versements, factures et documents — jamais ceux d'un autre bailleur de l'agence ; seul le personnel (agent, admin d'agence) a le périmètre de l'agence (TCK-587) |
| P1 | 🛡️ | Éditeur de rôles personnalisés scopé par agence (réservé aux agences `standard`) — un « rôle personnalisé » est un ensemble de `Capability` nommé, porté par l'agence ; le mécanisme reste à concevoir, `Capability` étant défini en code ([ADR-0003](adr/0003-capacites-enum-code-defined.md)) |
| P1 | 🛡️ | L'éditeur de rôles signale les capacités du catalogue qui ne sont encore jugées par aucun geste (« sans effet pour l'instant »), avec le ticket qui les branchera ; une capacité est soit jugée par au moins un geste, soit inscrite à l'inventaire des capacités sans lecteur, qui ne peut que décroître (TCK-587) |
| P2 | 🛡️ | Délégation temporaire de permissions |
| P3 | 🛡️ | Règles conditionnelles (policies dynamiques) |

### 2.3 Notifications

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | Tous | Centre de notifications in-app (cloche + feed) |
| P0 | Tous | Marquer comme lu / non lu |
| P0 | Tous | Notifications email transactionnelles |
| P1 | Tous | Une notification est un code + des paramètres, rendue dans la langue du destinataire sur chaque canal (cloche, e-mail, SMS, WhatsApp) ; les gabarits édités par le super-admin s'appliquent (TCK-588) |
| P1 | Tous | Chaque notification ouvre son objet ; historique complet paginé, filtrable par non-lues (TCK-588) |
| P1 | Tous | Notifications push web et mobile |
| P1 | Tous | Préférences par événement et par canal : chaque interrupteur commande exactement les messages de son événement ; une case qu'aucun envoi ne peut honorer (canal sans transport, canal mobile d'un événement qui ne part pas sur mobile) est verrouillée et dit pourquoi (TCK-588) |
| P1 | 🏠🏢🧑‍💼 | WhatsApp (SMS en secours) activé par défaut, désactivable, pour l'échéance et le retard de loyer, le rappel de visite et le changement de statut d'une réservation, dès que le téléphone est vérifié (TCK-588) |
| P1 | 🛡️🏢 | Les notifications de vérification KYC d'agence sont critiques : in-app et e-mail toujours, non désactivables (TCK-588) |
| P1 | Tous | Templates localisés via fichiers lang/ Laravel |
| P2 | Tous | Notifications SMS (événements critiques) |
| P2 | 🛡️ | Annonces in-app cross-tenant (broadcast) ciblées par rôle / agence / segment, avec dismissal côté utilisateur — le bandeau s'affiche dans le flux de la page, sous la barre du haut (site public comme consoles), jamais sous une barre fixe (TCK-572) |
| P2 | Tous | Digest quotidien / hebdomadaire |
| P3 | Tous | Notifications WhatsApp |

#### Canal WhatsApp sortant (P3)

Canal de notification **WhatsApp sortant** qui remplace certains SMS pour les familles proactives (transactionnel, rappels d'échéance, relances impayés), routé **WhatsApp d'abord → SMS en secours** :

- **Sélection mutuellement exclusive** : pour une notification supportant les deux, un seul canal mobile part — `whatsapp` s'il est éligible, sinon `sms`. Jamais les deux (pas de double-envoi).
- **Consentement** : `phone_verified_at` + préférence par événement ; le flag d'opt-out est honoré ; jamais d'envoi à un contact `opted_out`.
- **Contact sans compte** (client saisi par l'agence, visiteur anonyme — TCK-588) : messages transactionnels seulement ; WhatsApp si le numéro est `opted_in` dans `whatsapp_contacts`, sinon SMS ; heures calmes ARTP ; limite de débit par numéro.
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
| P1 | 🛡️ | Dashboard agence réservé aux détenteurs de `reports.view_agency` (admin d'agence par défaut), jamais à un agent ; effectif « Équipe » = agents et admins actifs, jamais les bailleurs (TCK-595) |
| P1 | 🏢 | Dashboard bailleur (portefeuille, cashflow, occupation) |
| P1 | 🏢 | « Prochains versements » et « Net reversé » du bailleur : seuls les versements dont il est bénéficiaire (TCK-595) |
| P1 | 🏢 | Dashboard hôte : le host solo (agence `individual`) atterrit sur le dashboard bailleur, enrichi des réservations, visites et avis à traiter — jamais sur le dashboard agent ni agence (TCK-595) |
| P1 | 🧑‍💼 | Dashboard agent (pipeline, commissions, tâches) — ses biens, ses clients, ses commissions ; bascule « agence » sous capacité (TCK-595) |
| P1 | 🏠 | Dashboard locataire (prochaines échéances, documents) |
| P1 | 🏠 | Accueil client : toutes ses agences ; une restitution de caution n'est jamais présentée comme une échéance à payer ; dates et montants dans la langue de l'utilisateur (TCK-595) |
| P2 | 🏠 | Accueil client sans dossier : prochaines visites, réservations, échéances, interventions ouvertes, biens de sa ville selon son intention de recherche (TCK-595) |
| P2 | 🏢🛡️ | Occupation mesurée par chevauchement de dates (longue durée : jours-biens ; courte durée : nuitées) sur les biens feuilles en location ; encaissé net des cautions, net reversé (TCK-595) |
| P2 | 🛡️ | Performance de l'équipe par agent (baux / ventes signés, visites réalisées, prospects ajoutés, commissions) — agences `standard` uniquement (TCK-595) |
| P2 | 🛡️🏢 | Balance âgée des impayés (1-30 / 31-60 / 61-90 / > 90 j) par locataire ou bailleur, et cautions détenues (TCK-595) |
| P2 | 🛡️ | Impayé = échéance échue non payée, qu'une pénalité s'applique ou non (TCK-595) |
| P2 | 🛡️ | Export CSV / Excel (paiements, baux, clients) — réservé aux détenteurs de `crm.export` (clients), `payments.export` (paiements), `reports.export` (baux, biens) ; chaque export est journalisé (entité, filtres, nombre de lignes) (TCK-587) |
| P2 | 🛡️ | Exports reversements, factures, commissions, balance âgée, cautions (CSV / Excel) (TCK-595) |
| P2 | 🛡️ | Métriques plateforme historisées chaque jour (flux encaissé, GMV, take rate, MRR hors essais) — strictement super_admin ; MRR hors essais (statut et fin d'essai), comptes en retard de paiement inclus (TCK-595) |
| P2 | 🛡️ | Export PDF (quittances, factures, rapports) |
| P2 | 🛡️ | Graphiques temporels (revenus, occupation) |
| P2 | 🛡️ | Reporting plateforme cross-tenant (croissance agences/users/listings, MRR/ARR, cohortes de rétention, funnel) — strictement super_admin |
| P3 | 🛡️ | KPI personnalisables par agence — **disponibles aussi en agence `individual`** (arbitrage TCK-284, écrit en [§1.12](#112-agence--équipe)) |
| P3 | 🛡️ | Alertes sur seuils (taux d'impayés, vacance) — **disponibles aussi en agence `individual`** (arbitrage TCK-284, écrit en [§1.12](#112-agence--équipe)) |

**Pas de tableau de bord prestataire (🔧), et c'est une décision, pas un oubli** (TCK-379, écrit
ici par TCK-420). Le prestataire n'a ni portefeuille, ni cashflow, ni pipeline : sa vue de travail
est la liste de ses interventions assignées ([§1.8](#18-maintenance--interventions)), pas un écran
d'indicateurs. Tant que cette ligne dit « pas de tableau de bord », l'entrée « Statistiques » ne lui
est pas montrée et `/app/overview` ne l'y envoie pas — *en inventer un serait une fonctionnalité
hors spec*. Ouvrir un ticket avant d'en construire un.

### 2.6 Audit & traçabilité

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🛡️ | Journal d'activité automatique sur entités critiques |
| P0 | 🛡️ | Aucun journal technique ne recopie une saisie, le message d'une exception ni les paramètres d'une requête SQL en échec (TCK-601) |
| P1 | 🛡️ | Consultation du journal par entité |
| P1 | 🛡️ | Filtrage par utilisateur, date, action |
| P1 | 🛡️ | Le journal d'une agence couvre tout ce qui touche ses objets (actes des admins, du système et des webhooks compris) et rien de ce qui touche une autre agence (TCK-601) |
| P1 | 🛡️ | Journal des consultations de données personnelles depuis la console (fiche utilisateur, sessions, dossier et pièces KYC, valeurs bancaires) (TCK-601) |
| P2 | 🛡️ | Export de l'audit trail |
| P3 | 🛡️ | Alertes sur actions sensibles |
| P3 | 🛡️ | Alertes d'exploitation à seuil (pic d'échecs de jobs, file bloquée, santé dégradée), en plus des gestes sensibles (TCK-600) |

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
| P1 | Tous | Erreurs de l'API : un code stable + un message dans la langue négociée de la requête ; jamais le message brut d'une exception du framework (TCK-588) |
| P2 | Tous | Devise configurable par agence (XOF par défaut, EUR, USD) |
| P3 | Tous | Conversion multi-devises avec taux de change |
| P3 | Tous | Traduction automatique des contenus utilisateurs |

**Langue d'une réponse de l'API** (TCK-536) : paramètre `?lang` > en-tête `Accept-Language` >
`preferred_language` de l'utilisateur authentifié (session ou jeton Bearer) > langue par défaut.
L'en-tête passe avant la préférence parce que le front envoie la langue qu'il **affiche** (URL puis
cookie, ADR-0026 §5), y compris depuis ses appels serveur.

### 2.9 Administration & configuration

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🛡️ | Gestion des tags et amenités |
| P0 | 🛡️ | Gestion des utilisateurs (activation, blocage) |
| P0 | 🛡️ | Onboarding d'une agence par un super-admin (création + admin initial invité, hors auto-inscription) |
| P1 | 🛡️ | Gestion des enums métier (types de biens, statuts) |
| P1 | 🛡️ | Configuration email (templates, expéditeur) |
| P1 | 🛡️ | Suspension d'une agence par un super-admin, motif obligatoire : ses biens quittent la surface publique et l'index de recherche, son back-office passe en lecture seule (export permis), ses administrateurs sont prévenus ; la levée de la suspension restaure l'état (TCK-600) |
| P1 | 🛡️ | Niveaux d'opérateur plateforme (`super_admin`, `support`, `viewer`) choisis à la cooptation, chacun borné à une liste de gestes ; retrait d'un opérateur avec motif (jetons révoqués, jamais le dernier `super_admin`) ; la cooptation est le seul chemin d'octroi (TCK-600) |
| P1 | 🛡️ | Effacement d'un compte par un super-admin, par le parcours conforme de [§2.1](#21-authentification--comptes) (obligations ouvertes, délai de grâce, motif, utilisateur prévenu) (TCK-600) |
| P1 | 🛡️ | Registre des demandes de droits (accès, rectification, opposition, effacement, portabilité) : réception, échéance légale, statut, preuve de réponse, export (loi n° 2008-12) (TCK-601) |
| P2 | 🛡️ | Paramètres globaux de plateforme — seules des clés lues par l'application, écrites par une seule voie validée et journalisée (TCK-600) |
| P2 | 🛡️ | Gestion des intégrations tierces (API keys) |
| P2 | 🛡️ | Healthcheck plateforme et supervision des jobs en arrière-plan (file de queue, échecs, rejouer) — par sondes actives et datées (courriel, SMS, moteur de recherche, âge de la file, battement des workers, stockage des médias), statut agrégé exposé à une sonde externe (TCK-600) |
| P2 | 🛡️ | Impersonation d'un utilisateur par un super-admin, pour voir ce qu'il voit : motif obligatoire, confirmation 2FA récente, lecture seule par défaut, durée courte et sortie explicite qui révoque l'accès, jamais un opérateur ni un compte bloqué ; aucun jeton exposé à la page (cookie httpOnly géré par le BFF) ; bannière persistante ; chaque acte journalisé au nom de l'opérateur ; l'utilisateur est informé après coup (TCK-600) |
| P2 | 🛡️ | Recherche globale de la console plateforme (e-mail, téléphone, référence, identifiant de transaction, NINEA), par la base, brouillons et biens privés compris (TCK-600) |
| P2 | 🛡️ | File de modération : prise en charge exclusive avec expiration, motifs types traduits, décision groupée, âge de l'élément (TCK-597) |
| P2 | 🛡️ | Journal des webhooks entrants (paiement, SMS, WhatsApp) écrit avant traitement — reçu / traité / rejeté / échoué —, corps chiffré, vue expurgée, rejeu idempotent, purge planifiée (TCK-602) |
| P3 | 🛡️ | Mode maintenance programmé — l'avis parle la langue du visiteur, s'affiche sous la barre et se ferme pour la session ; il revient quand la fenêtre passe « en cours » ou que sa fin change (TCK-572) |
| P3 | 🛡️ | Feature flags |

### 2.10 Pages légales publiques

Trois documents juridiques lisibles sans compte, sur la surface publique. **Leur texte a été rédigé
le 2026-09-17 à la demande du porteur du produit** (droit sénégalais, OHADA, UEMOA), à partir de ce
que la plateforme fait réellement ; il vit dans `takussan-web/src/content/legal/`, et l'identité de
l'éditeur dans `editeur.ts`, en un seul point. Il reste à compléter (RCCM, NINEA, siège, directeur
de la publication, récépissé CDP) et à faire relire par un avocat avant la production. Un texte
français absent fait toujours afficher l'état « texte à fournir ».

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P1 | Tous | Conditions générales d'utilisation — `/[locale]/legal/terms` |
| P1 | Tous | Politique de confidentialité — `/[locale]/legal/privacy` |
| P1 | Tous | Mentions légales — `/[locale]/legal/notice` |
| P1 | Tous | Toute case de consentement (inscription, assistant hôte, demande de réservation) renvoie à ces mêmes URL, et le pied de page public les porte |
| P1 | Tous | État « texte à fournir » : la page répond, titre du document compris, et annonce que le texte est en cours de rédaction — jamais un texte provisoire |

**Règles de gestion.**

- **Une URL canonique par document**, préfixée de la langue comme toute la surface publique
  (ADR-0026) ; `/legal/terms` sans langue est redirigé vers la langue du visiteur.
- **Le français fait foi ; l'anglais et le wolof sont des traductions de courtoisie** — stipulé à
  l'article 3 des CGU. L'anglais est fourni ; le wolof ne l'est pas, à dessein (une traduction
  juridique demande un traducteur qui en réponde).
  Une traduction absente fait afficher le texte français, avec la mention qu'il n'existe qu'en
  français ; un texte français absent fait afficher l'état « texte à fournir » dans les trois
  langues, même si une traduction existe.
- **Non indexées** (`noindex, follow`) et absentes du sitemap : ce ne sont pas des pages d'entrée
  de recherche.
- **Un texte juridique ne promet que ce que le code fait.** Un engagement que la loi impose et que
  le code ne tient pas encore est suivi par un ticket : TCK-537 porte la preuve du consentement
  (version acceptée, horodatage), l'effacement des profils à la suppression du compte, les purges
  annoncées par la politique de confidentialité et la minimisation de l'auteur d'un avis public.
- **Tout nouveau prestataire, traceur, purge ou changement de commission** se reporte dans le texte
  concerné dans le même changement, et la date de version (`VERSION_DOCUMENTS`) avance.

---

## Notes de priorisation

- **MVP = P0 + P1** : une première version publiable couvre la gestion de biens, la recherche, la location longue durée, les paiements de base, la messagerie, la maintenance, l'auth et les notifications essentielles.
- **P2 (V2)** : enrichissement de l'expérience (comparateur, passerelle de paiement, exports, signatures, multi-devises).
- **P3 (futur)** : différenciateurs concurrentiels (IA, signature électronique native, marketplace).

Chaque fonctionnalité fera l'objet d'une spécification détaillée séparée avant implémentation (user stories, maquettes, règles de gestion, endpoints API).

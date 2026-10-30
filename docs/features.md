# Takussan — Catalogue fonctionnel

> Vision complète des fonctionnalités de la plateforme Takussan : fonctionnalités métier (immobilier) et applicatives (transverses).
> Ce document ne décrit **pas** l'implémentation — il sert de référence pour prioriser et découper le travail.
> Base : les modèles de [`models-spec.md`](./models-spec.md), enrichis des besoins métier standards.

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
2.11 [Socle IA](#211-socle-ia)
2.12 [Radar — acquisition d'annonces](#212-radar--acquisition-dannonces)

---

## 1. Domaines métier

### 1.1 Gestion des biens

Gestion du cycle de vie d'un bien immobilier, de sa création à sa sortie du portefeuille.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🏢🧑‍💼 | Créer un bien (type, transaction vente/location, caractéristiques) |
| P0 | 🧑‍💼 | Associer une adresse géolocalisée — région, ville et quartier choisis dans un référentiel (listes avec recherche) ; un quartier absent se saisit librement et n'est proposé aux autres qu'après validation super-admin ; la position exacte s'affiche en latitude / longitude et se saisit aussi en collant un lien ou une position (lien Google Maps, lien court, position partagée par WhatsApp, degrés, Plus Code) (TCK-633, [ADR-0062](adr/0062-referentiel-geographique-region-ville-quartier.md)) |
| P0 | 🧑‍💼 | Uploader des photos |
| P0 | 🧑‍💼 | Définir le statut (disponible / réservé / vendu / loué / archivé) |
| P0 | 🧑‍💼 | Publier et dépublier un bien |
| P0 | 🧑‍💼 | Modifier / supprimer un bien (soft delete) |
| P0 | 🧑‍💼 | Attribuer automatiquement une référence unique à chaque bien (ex : TK-2025-001) |
| P1 | 🧑‍💼 | Uploader plans, vidéos et visites virtuelles 360° — la visite virtuelle ou vidéo est un **lien https** vers un hébergeur autorisé ; le téléversement de fichiers vidéo reste à décider (TCK-598) |
| P1 | 🏢🧑‍💼 | Renseigner le coût d'entrée d'une location mensuelle : mois de caution, mois d'avance, frais d'agence en mois de loyer, charges mensuelles (TCK-598) ; pas de frais d'agence pour un espace particulier ; le total à l'entrée s'affiche dès l'aperçu de la publication (TCK-633) |
| P1 | 🧑‍💼 | Associer des tags / amenités (piscine, climatisation, meublé…) — une seule liste d'équipements, traduite, en sélection multiple avec recherche ; un équipement absent s'ajoute à l'annonce tel que saisi, sans traduction, et n'est proposé aux autres qu'après validation super-admin (TCK-633) |
| P1 | 🏢🧑‍💼 | Le prix d'un bien se saisit en franc CFA (XOF), seule devise proposée tant que la plateforme ne sert que le Sénégal (TCK-633) |
| P1 | 🏢🧑‍💼 | Chambres, salles de bain, étage, places de parking et année de construction se choisissent dans des listes (TCK-633) |
| P1 | 🏢🧑‍💼 | Contacts sur place : jusqu'à 3 numéros par annonce, sans vérification, chacun avec un titre facultatif (« Gardien »…) et l'indication WhatsApp ; révélés au même geste que le numéro principal (TCK-633) ; un contact sur place qui répète un numéro déjà servi (principal ou second) n'est pas servi deux fois (TCK-2389) |
| P1 | 🏢🧑‍💼 | Publier exige un contact joignable : prénom et numéro vérifié de la personne que les visiteurs appelleront — l'agent principal du bien, à défaut son titulaire — ; ce qui manque se complète au moment de publier (nom, numéro avec code SMS, WhatsApp) ; les CGU sont acceptées par le publieur, et sa première publication vaut acceptation, datée (TCK-633) |
| P1 | 🏢🧑‍💼 | Booster une annonce avec les crédits de l'espace : **Remontée** (le bien repasse en tête du tri par récence, au plus une fois par délai réglé), **En vedette** (emplacements « Sponsorisé » pour une durée), **Badge** (« Urgent », « Prix en baisse ») ; un boost se met en pause quand le bien quitte la surface publique, et ses jours restants sont rendus quand le bien est loué, vendu ou supprimé par l'annonceur (TCK-633, [ADR-0061](adr/0061-credits-d-espace-et-boost-des-annonces.md)) |
| P1 | 🏢🧑‍💼 | Historique de prix automatique à chaque changement |
| P1 | 🧑‍💼 | Ajouter des collaborateurs au bien avec part de commission explicite et un rôle (gestionnaire, co-propriétaire, agent, lecteur), sans permission propre au collaborateur : le rôle fixe qui peut l'occuper et qui peut être l'agent principal, pas ce qu'il peut faire — un collaborateur appartient à l'agence du bien (agent ou admin pour les rôles agent / gestionnaire, bailleur de l'agence pour co-propriétaire) ; la part de commission et le rôle ne sont jamais exposés sur le site public (TCK-598, TCK-586) ; la part de commission ne s'écrit (ajout, modification, copie du bien) et ne se lit que par le personnel de l'agence du bien qui ouvre les baux (`leases.create`) : le bailleur ajoute un collaborateur sans part, reçoit 403 `property.commission_share_forbidden` sur une part, et ne la lit pas (TCK-2364, [ADR-0049](adr/0049-attribution-des-transactions-et-grand-livre-des-commissions.md)) |
| P1 | 🧑‍💼🛡️ | Désigner l'**agent principal** d'un bien parmi ses collaborateurs agents, un seul par bien (TCK-504, [ADR-0053](adr/0053-l-agent-principal-est-une-marque-unique-par-bien.md)). C'est l'**agent responsable** du bien et son **contact principal** : la fiche publique le nomme et révèle son numéro, il reçoit les messages et les demandes de contact et de visite. Sans désignation, ou si l'agent désigné n'est plus actif dans l'agence, c'est l'agent du bien le plus anciennement ajouté ; sans agent, le titulaire du bien ([ADR-0036](adr/0036-l-agent-responsable-est-le-collaborateur-principal.md)) |
| P1 | 🏢 | Bailleur rattaché à une agence : proposer un bien à son agence — brouillon privé, publié par le personnel de l'agence, qui en est notifié (TCK-587) |
| P1 | 🧑‍💼🛡️ | Saisir un bien au nom d'un bailleur de l'agence : le bailleur se choisit à la saisie parmi les bailleurs actifs, facultativement (sans choix, l'agence garde le bien en propre) ; il est prévenu par une notification, voit le bien, ses baux et son relevé, et en reçoit les loyers ; un lot prend le bailleur de son immeuble, une copie celui du bien copié, et un lot ne se rattache qu'à un bien du même titulaire (TCK-997, [ADR-0036](adr/0036-l-agent-responsable-est-le-collaborateur-principal.md)) |
| P1 | 🧑‍💼🛡️ | Inviter un bailleur depuis le formulaire de bien : le bien reste à l'agence et lui passe quand il accepte l'invitation ; une invitation révoquée ou expirée le laisse à l'agence (TCK-1000) |
| P1 | 🛡️ | Changer le titulaire d'un bien saisi au nom du personnel vers un bailleur actif de l'agence : ses baux en brouillon le suivent, les baux signés et les reversements déjà faits ne changent pas, et l'écran le dit avant de confirmer (TCK-999) |
| P0 | 🧑‍💼🛡️ | Réattribuer un bien : la cible est un agent ou un admin **actif** de l'agence du bien, jamais un bailleur (TCK-587, réutilisé par l'action en masse de TCK-591) ; réattribuer désigne la cible comme agent principal et ne change jamais le titulaire du bien (TCK-603) |
| P1 | 🏢🧑‍💼 | Gérer une hiérarchie de biens (immeuble → étages → lots) |
| P1 | 🧑‍💼🏢 | Renseigner le type de titre foncier (bail, titre foncier, délibération, autre) |
| P1 | 🧑‍💼🏢 | Renseigner l'état d'un bien bâti (sur plan, neuf, rénové, bon état, à rénover) ; « neuf » et « sur plan » sont signalés par un badge sur l'annonce publique |
| P1 | 🧑‍💼 | Compteurs de vues et de favoris |
| P1 | 🏢🧑‍💼 | Saisie des montants lisible : chiffres groupés selon la langue de l'écran, décimales selon la devise (aucune en franc CFA) ; la valeur envoyée reste un nombre (TCK-564, TCK-574) |
| P2 | 🧑‍💼 | Dupliquer un bien (modèle / template) |
| P2 | 🛡️ | Modération et validation avant publication, activable par l'admin d'agence : toute mise en ligne d'un bien jamais validé ou refusé (création, publication, changement de statut, modification) attend l'accord de l'admin (TCK-597) |
| P2 | 🛡️ | Une décision sur un signalement d'annonce agit sur l'annonce : masquer (dépubliée, désindexée, verrouillée jusqu'à levée par la plateforme), retirer (supprimée) ou classer sans suite (TCK-597) |
| P2 | 🧑‍💼 | Archivage en lot |
| P2 | 🧑‍💼🛡️ | Dépublier et réattribuer en lot, avec un bilan succès / refus par bien ; réattribuer change l'agent responsable — l'agent principal —, jamais le propriétaire du bien (TCK-591, TCK-603) |
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
| P0 | 👤🏠 | Filtres de base (ville, type, prix, chambres, surface, transaction) — « N+ » veut dire au moins N ; ville et quartier se choisissent dans le référentiel — deux villes du même nom y sont deux options, départagées par leur région (TCK-635, [ADR-0062 §8](adr/0062-referentiel-geographique-region-ville-quartier.md)) ; la carte applique les mêmes filtres que la liste ; les filtres essentiels restent visibles, les autres sont repliés ; la recherche propose « Louer » avant « Acheter », avec un seul vocabulaire partout (TCK-633) |
| P1 | 👤🏠 | Emplacements « Sponsorisé » en tête de chaque page de résultats, et rangée vedette de l'accueil : des biens en vedette qui correspondent à la recherche, par rotation ; en première page, les premières places des résultats (nombre réglable, 0 pour aucune) reviennent aux vedettes qui correspondent, dans l'ordre normal, avec un badge, sans doublon ; au-delà, les résultats gardent leur ordre (TCK-633, [ADR-0061](adr/0061-credits-d-espace-et-boost-des-annonces.md)) |
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
| P1 | 👤🏠 | Contact WhatsApp et appel depuis la fiche : message prérempli dans la langue du visiteur ; boutons absents quand le contact n'a pas de numéro ; WhatsApp vise un numéro déclaré WhatsApp, et disparaît sans lui (TCK-633) ; le contact affiché est une personne joignable — jamais un compte bloqué ni un agent sorti de l'agence ; à défaut, les admins de l'agence reçoivent la demande (TCK-590) |
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
| P1 | 🏢🧑‍💼 | Créer le bail depuis une candidature acceptée (« Créer le bail » sur la réservation confirmée d'un bien à louer) : bien, locataire, dates et loyer préremplis ; le locataire est le client de la réservation, et la réservation passe à « terminée », ce qui libère ses dates (P48.03, TCK-2352) |
| P1 | 🧑‍💼 | Ajouter un ou plusieurs garants avec documents joints |
| P1 | 🏢🧑‍💼 | Générer l'échéancier de loyers mensuels, et l'échéance de caution à l'activation du bail (aucune pour un bail sans caution ni pour un renouvellement) ; elle se paie en ligne ou se marque payée comme un loyer (TCK-2375) |
| P1 | 🏠🏢 | Enregistrer un paiement mensuel |
| P1 | 🏠🧑‍💼 | Relances de loyer automatiques (J-3, J+1, J+7) au locataire, y compris sans compte (téléphone du client), sur WhatsApp puis SMS en secours, dans sa langue ; un retard est relancé que le bail porte une pénalité ou non, et la relance annonce le solde restant dû (TCK-588) ; chaque relance part au plus une fois : celle que tous les fournisseurs SMS refusent n'est pas renvoyée et laisse une activité d'exploitation rattachée à l'échéance, sans le numéro (P207.01) ; pour un locataire sans compte, le SMS ne prend le relais que d'un échec immédiat de WhatsApp, pas d'un échec que Meta rapporte plus tard (P207.02) |
| P1 | 🏢🧑‍💼 | Alerte d'impayé au bailleur (J+1, J+7) et récapitulatif quotidien unique des impayés à l'agent (TCK-588) |
| P1 | 🧑‍💼🏢 | Appliquer automatiquement des pénalités de retard sur les paiements en retard |
| P1 | 🧑‍💼🏢 | Choisir, par agence, si les pénalités de retard s'encaissent avec le paiement en ligne du loyer — désactivé par défaut (TCK-593) |
| P1 | 🧑‍💼🏢 | Enregistrer une pénalité de retard réglée à l'agence ; la quittance la dit acquittée ou restant due (TCK-593) |
| P1 | 🏠 | Payer en ligne une échéance de loyer (Wave / Orange Money) pour le montant réellement dû : le restant du loyer, plus la pénalité de retard appliquée **si l'agence l'a choisi** (réglage d'agence, désactivé par défaut — sinon la pénalité reste due et s'affiche à part, « à régler auprès de l'agence ») ; le montant est figé à l'ouverture du paiement ; une échéance payée ou remboursée ne peut pas être repayée (TCK-593) |
| P1 | 🏠🏢 | Télécharger le contrat de bail en PDF depuis le détail du bail (TCK-593) |
| P1 | 🧑‍💼 | Remboursement de la caution en fin de bail, borné à la caution encaissée (échéances `deposit` payées du bail et des baux qu'il renouvelle, moins le rendu et la retenue) ; une caution jamais encaissée ne se rembourse pas (TCK-2375) |
| P1 | 🏢🧑‍💼 | Consultation de l'historique complet d'un bail |
| P2 | 🏢🧑‍💼 | Renouveler un bail ou créer un avenant (loyer, durée, conditions) avec traçabilité du bail parent ; le bail renouvelé reçoit son échéancier sans geste manuel (TCK-596) ; il naît sans garant, et la réponse et le récapitulatif le disent (TCK-2316) |
| P2 | 🏢🧑‍💼 | Résiliation anticipée avec calcul des pénalités |
| P2 | 🏠🏢 | Révision annuelle du loyer (indice ou accord amiable) journalisée via le journal d'activité |
| P2 | 🏠🏢 | Télécharger la quittance d'une échéance de loyer payée — jamais pour une échéance non acquittée (TCK-593) |
| P2 | 🏠 | Donner congé depuis son espace locataire : délai de préavis et pénalité affichés avant l'envoi, retrait possible tant que la fenêtre d'annulation est ouverte ; la clôture reste au gestionnaire (TCK-596) |
| P2 | 🏠🏢🧑‍💼 | Signature du bail par code à usage unique (SMS sur numéro vérifié, sinon e-mail) : empreinte du contrat figé, horodatage et IP de chaque partie ; activation à la seconde signature (TCK-596 — remplace la ligne P3 « Signature électronique du bail ») |
| P3 | 🏠 | Espace locataire : les factures adressées au client — l'API les lui liste (`GET /api/invoices`), son espace ne les montre pas encore ; le reste y est déjà : baux, échéances et paiement, quittances, interventions, états des lieux, documents (lignes P1/P2 de §1.4, §1.8, §2.5) |
| P1 | 🏠🧑‍💼 | Onboarding résident à la signature du bail : notification "Bienvenue chez vous", welcome modale "Espace résident", checklist d'entrée (état des lieux, premier paiement, accès aux documents), suivi de complétion par un `TenantOnboardingChecklist` ; rien de cela pour un bail renouvelé, et un état des lieux d'entrée contesté rouvre la checklist (TCK-2368) |

### 1.5 Transactions & paiements

Encaissements, factures et reversements.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🛡️ | Enregistrer un paiement (réservation ou bail) |
| P1 | 🛡️🏢 | Générer une facture à un Customer destinataire |
| P1 | 🛡️🏢 | Facture opposable : numérotation chronologique continue par agence et par an, attribuée à l'émission ; mentions légales de l'agence (raison sociale, NINEA, RCCM, adresse) ; TVA par défaut de l'agence ; une facture émise ne s'annule que par un avoir (TCK-594), qui reprend ses lignes et sa désignation (TCK-2316) |
| P1 | 🏢 | Reversement au bailleur après commission (Payout) |
| P1 | 🏢🏠 | Reversement au bailleur calculé depuis les loyers et réservations encaissés de la période (loyer, charges, pénalités — la pénalité réglée est une ligne propre du reversement, P206.01 —, régularisations ; jamais la caution), commission du bail sinon de l'agence, frais de travaux refacturés déduits ; le brut n'est pas saisi et un paiement n'est reversé qu'une fois (TCK-594) |
| P1 | 🏢🏠 | Un reversement ne cite que des paiements de l'agence et du bailleur concernés ; un remboursement de caution est un versement au locataire, jamais compté comme reversé au bailleur (TCK-594) |
| P1 | 🏢🏠 | Remboursement d'une somme déjà reversée au bailleur : le remboursement est constaté comme une sortie d'argent, et la part du bailleur, au net de commission, est reprise sur son reversement suivant, reliquat reporté ; chaque ligne d'un reversement garde le montant, le taux et la commission appliqués à sa création (TCK-2017, TCK-2052, TCK-2151, [ADR-0039](adr/0039-les-sorties-d-argent.md)) |
| P1 | 🏢🏠 | Relevé de gérance mensuel (PDF / CSV) par bien et consolidé, et attestation annuelle de revenus locatifs, envoyés au bailleur en début de mois (TCK-594) ; le relevé mensuel envoyé est conservé tel qu'il a été envoyé, et ce qui a été écrit depuis se montre en rectificatif (TCK-2321) |
| P1 | 🏢🛡️ | Double validation des sorties d'argent : la même personne ne tient jamais deux gestes consécutifs (préparer, approuver, marquer payé) ni n'approuve un versement dont elle est bénéficiaire. Reversements plateforme : toujours. Reversements d'agence : désactivée par défaut ; l'agence l'active par un seuil, possible seulement avec deux approbateurs (TCK-594) |
| P1 | 🛡️ | Historique des paiements par entité (bien, bail, client) |
| P1 | 🛡️ | Suivi des statuts (en attente, payé, remboursé, annulé) |
| P2 | 🛡️ | Intégration d'une passerelle de paiement — pilotes livrés : Wave et Orange Money (XOF), Lemon Squeezy (carte, hors XOF) ; Free Money et Stripe n'ont pas de pilote (Stripe n'a qu'une fiche d'identifiants au registre des intégrations) ; une intégration de paiement n'est enregistrée qu'avec les identifiants que son pilote exige (TCK-602) |
| P2 | 🏠🏢🧑‍💼 | Lien de paiement en ligne (Wave / Orange Money) par échéance de loyer, utilisable sans compte : jeton expirant et révocable envoyé au locataire, quittance remise après paiement (TCK-602) |
| P1 | 🏠🧑‍💼 | Le payeur (locataire, client) voit les fournisseurs de paiement en ligne que l'agence a activés — intégration plateforme comprise — et seulement ceux-là (TCK-602) |
| P2 | 🛡️ | Supervision des paiements (console plateforme) : paiements en échec, en retard et webhooks non appariés, par fournisseur et par agence (TCK-602) |
| P2 | 🛡️ | Rapprochement bancaire semi-automatique — relevés, lignes, mapping CSV et clôture réservés à l'admin d'agence qui détient `payments.reconcile` (son rôle système la porte, jamais celui d'agent ; l'admin principal la garde toujours) (TCK-2260) |
| P2 | 🛡️ | Régler depuis l'écran le mapping CSV des relevés de l'agence (colonnes, format de date, séparateur décimal déclaré) et voir les lignes ignorées à l'import (TCK-593) ; une ligne qui reprend une transaction déjà importée est marquée en doublon de la première, pas ignorée (TCK-1919) — les préréglages Wave Business / Orange Money attendent un export réel (dette D-67) |
| P2 | 🛡️ | Rapprocher les débits d'un relevé avec les reversements (Payout) émis (TCK-593) ; le virement de clôture de la plateforme se rapproche d'un crédit du relevé (TCK-1421) |
| P2 | 🛡️ | Relance automatique des factures en retard |
| P2 | 🛡️ | Reversement plateforme → agence (commission plateforme retenue à la source, payout périodique agrégé) |
| P2 | 🛡️ | Reversement plateforme refusé vers une agence non active ; une agence `standard` non vérifiée est bloquée à l'approbation (TCK-594) |
| P2 | 🛡️ | Les reversements plateforme d'une agence non active sont gelés, y compris s'ils ont été clôturés avant la suspension ; la clôture globale traite toutes les agences et liste les exclues avec leur motif (TCK-594) |
| P2 | 🏢 | Un reversement programmé échu est rappelé une fois à son émetteur (TCK-594) |
| P2 | 🏠🔧🏢 | Moyens de versement du bénéficiaire (Wave, Orange Money, Free Money, virement), vérifiés par l'agence ; décaissement tracé par une référence de transaction obligatoire ; avis de versement effectué / échoué au bénéficiaire (TCK-594) |
| P1 | 🛡️🧑‍💼 | Commissions automatiques par agent / collaborateur : à l'activation d'un bail, le grand livre ventile sa commission entre les collaborateurs agents du bien (leur part) et son négociateur (son taux), puis la fige ; relevé par agent — l'agent voit les siennes, l'admin toutes, qu'il marque « payée à l'agent » ou annule (TCK-595, [ADR-0049](adr/0049-attribution-des-transactions-et-grand-livre-des-commissions.md)) |
| P3 | 🛡️ | Comptabilité exportable (FEC, journaux) |

### 1.6 CRM & relation client

Gestion des contacts (Customer) liés ou non à un compte utilisateur.

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | 🧑‍💼 | Créer un Customer (avec ou sans compte User) |
| P0 | 🧑‍💼 | Liste et recherche de clients |
| P0 | 🧑‍💼 | Le CRM de l'agence n'est lu et alimenté que par son personnel ; un bailleur ne voit que les fiches qu'il a lui-même ajoutées (TCK-591) |
| P1 | 🧑‍💼 | Lier un Customer à un User existant |
| P1 | 🧑‍💼 | Inviter le client d'une fiche sans compte à créer son compte : un lien à usage unique part à l'e-mail de la fiche (ou à son numéro, si le lien par SMS est ouvert), et le compte qui l'accepte est relié à la fiche ; geste du personnel de l'agence de la fiche (TCK-2351) |
| P1 | 🧑‍💼 | La fiche née d'une candidature, d'une offre ou d'une réservation est une fiche de l'agence du bien, reprise ou rattachée (coordonnée vérifiée) dans cette agence seule (TCK-2350) |
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
| P1 | 🏠🏢🧑‍💼 | Périmètre de messagerie — qui l'on peut faire entrer dans une conversation, directe ou de groupe ; une seule règle sert le sélecteur, la création et l'ajout de participants : un correspondant (une conversation déjà partagée), un lien CRM (une même fiche client, ou le compte du client d'une fiche ; une fiche supprimée ne relie plus personne, les fils déjà ouverts restant par la règle du correspondant — TCK-2295), l'équipe active de son agence, et ses propriétaires actifs pour l'équipe seulement ; pour compléter un groupe existant, aussi l'équipe active de l'agence de son bien ou de son bail ; un profil invité pas encore accepté, suspendu ou inactif ne compte pas (TCK-565). À ne pas confondre avec le « contact joignable » qu'exige la publication (§1.1, TCK-633) |
| P1 | 🛡️ | Seule la plateforme publie un avis système dans une conversation ; un participant n'écrit que du texte, des pièces jointes et des notes vocales (TCK-592) |
| P1 | 🏠🏢 | Envoyer un message texte avec pièces jointes |
| P1 | 🏠🏢 | Liste des conversations avec statut non lu — messages d'un autre postérieurs à la dernière lecture, hors avis système ; ouvrir un fil le marque lu (TCK-579) |
| P1 | 🏠🏢 | Notification en temps réel (in-app + email) |
| P2 | 🏢🧑‍💼 | Conversations de groupe (multi-participants) — participants choisis par leur nom ; bien et bail rattachés par recherche (titre, référence), dans le périmètre visible de l'acteur ; un bail doit concerner le bien choisi (TCK-565, TCK-576). Une demande d'intervention ne se rattache pas à un groupe créé à la main (422) : son fil naît de l'assignation (TCK-2372, P250.03) |
| P2 | 🏢🧑‍💼 | Groupe rattaché à un bail — il ne compte que des personnes qui lisent ce bail (`LeasePolicy::view` : parties au bail, personnel actif de l'agence) ; contrôlé à la création du groupe et à l'ajout de participants. Seule exception : le prestataire assigné à une intervention de ce bail reste dans le fil de cette intervention (TCK-592, `SyncMaintenanceConversation`), qu'il ne lise pas le bail. Un autre artisan ou un tiers se joint par un groupe sans bail rattaché (décisions du porteur du 2026-10-23, P191.04 ; TCK-2191) |
| P2 | 🏠🏢 | Accusés de lecture individuels (si > 5 participants) — non livré : la lecture se compte par participant (dernière lecture), aucune par message (`models-spec.md` EF5, refusé pour l'instant) ; le déclencheur d'EF5, des conversations à plus de 5 participants, est désormais atteignable — un groupe compte jusqu'à 20 participants actifs |
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
| P3 | 🔧🏢 | Facturation directe prestataire → agence : à la fin d'une intervention, facture du prestataire générée (devis approuvé ou coût réel), validée par l'agence, payée par mobile money et imputable au reversement du bailleur (TCK-594) ; la contestation ou l'annulation de l'intervention annule la facture encore ouverte et non engagée, une facture déjà payée ou refacturée reste avec un avis à l'agence, et seule une intervention terminée ou close voit sa facture validée, payée ou refacturée (TCK-2270) |
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
- **Le demandeur dont le bail a pris fin lit encore, et n'agit plus** (TCK-2374, ADR-0031,
  amendement du 2026-10-25, P248.01). Il garde la lecture de ses interventions, de leurs pièces et
  de leur fil, comme celle de son bail passé. Confirmer, contester, ajouter des photos au
  signalement et écrire dans le fil exigent un bail en cours du bien (préavis et renouvellement
  compris). Le fil s'affiche alors en lecture seule. Un demandeur qui n'a jamais été locataire du
  bien n'est pas visé.

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
| P2 | 🧑‍💼 | Historique des versions d'un document (via medialibrary + journal d'activité) ; la version active est le fichier servi partout, lien de partage et page publique d'un bien compris, et une nouvelle version repasse le document à « non vérifié », sans échéance sauf une neuve ; une pièce de profil ne se versionne pas (TCK-2300) |
| P3 | 🧑‍💼 | Signature électronique intégrée des documents autres que le bail et l'état des lieux — le bail se signe par code à usage unique (§1.4, [ADR-0042](adr/0042-preuve-de-consentement-a-la-signature-du-bail.md)), l'état des lieux par le tracé de chaque partie (§1.9) (TCK-596) |
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
- **`individual`** — agence individuelle (host solo) auto-créée par n'importe quel user via la CTA "Publier" (pattern Airbnb). Le user devient simultanément `agency_admin` + `owner` de cette agence. Restrictions par rapport à `standard` : pas d'invitation de collaborateurs internes, un seul `agency_admin`, pas de rôles personnalisés, pas d'assignation de biens/leads à un agent, pas de reporting cross-équipe, **pas de carnet de propriétaires** — ni consultation de la liste, ni invitation d'autres bailleurs : dans une agence individuelle, le propriétaire est le créateur du compte lui-même (TCK-256, confirmé par TCK-284) —, pas de customisation des tags/enums plateforme. Toutes les autres capacités (publication de biens, baux, encaissements, branding, sous-domaine, devise, intégrations, invitation de prestataires externes `ServiceProvider`) restent disponibles. Pas de quota MVP — la monétisation passe par les crédits de boost de l'espace ([ADR-0061](adr/0061-credits-d-espace-et-boost-des-annonces.md)).

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
| P0 | 🛡️ | Configurer son agence (nom, licence, contact, logo). Une agence se crée par la console (super-admin) ou par l'espace hôte, jamais par `POST /api/agencies`, retirée (TCK-2311) |
| P0 | 🛡️ | Ajouter et retirer des agents |
| P0 | 🛡️ | Attribution de rôles aux membres |
| P1 | 🛡️ | Fixer le taux de commission d'un agent sur sa fiche de membre, sous `team.assign_role` : sa part de la commission de chaque bail qu'il négocie, que le grand livre lui verse à l'activation (TCK-2364, [ADR-0049](adr/0049-attribution-des-transactions-et-grand-livre-des-commissions.md) « Ventilation » § 2) |
| P0 | 🛡️ | Suspendre / réactiver l'adhésion d'un membre (agent, bailleur, co-admin) à l'agence, sans toucher au compte ; le blocage d'un compte reste un geste super-admin ; l'administrateur principal ne peut être suspendu ; acte journalisé (TCK-587) |
| P0 | 👤🏠 | Auto-création d'une agence `individual` via la CTA "Publier" du header (pattern Airbnb) — **sans aucune question** : `Agency.kind=individual` (nom « Espace de {prénom} », ville déduite de la position, XOF), `AgencyAdminProfile` et `OwnerProfile`, puis la création du bien ; le parcours professionnel passe par la demande de passage en agence. La création automatique est portée par le drapeau `host_auto_space`, allumé à l'installation ; l'éteindre rend le wizard (TCK-633) |
| P1 | 🛡️🧑‍💼 | Crédits de l'espace : un solde par espace, en lots datés ; offre de bienvenue une fois par numéro vérifié, au titulaire de l'espace ; crédits offerts expirant (prévenu avant), consommés en premier ; dépense par boost (capacité `boost.spend`) ; page « Crédits » (solde, lots, historique, boosts) (TCK-633, [ADR-0061](adr/0061-credits-d-espace-et-boost-des-annonces.md)) |
| P1 | 🛡️ | Statistiques globales d'agence (portefeuille, revenus) |
| P1 | 🛡️ | Paramètres de commission par défaut |
| P1 | 🛡️ | Dossier KYC documentaire de l'agence (RCCM, NINEA, pièce dirigeant) avec workflow vérification (pending → submitted → verified / rejected) |
| P1 | 🛡️ | Upgrade `individual` → `standard` : l'admin de l'agence individuelle soumet une demande (`AgencyUpgradeRequest`) avec compléments légaux (RC, NINEA, RIB pro, statuts) ; un super-admin la review depuis la console ; à l'approbation, `Agency.kind` bascule vers `standard` et débloque les capacités restreintes (invitation collaborateurs internes, multi-admin, custom roles, etc.). Pas d'upgrade self-service direct, pas de rétrogradation `standard` → `individual`. |
| P1 | 🛡️ | Passation du portefeuille d'un agent retiré (tâches, visites, interventions, collaborations, biens dont il est l'agent principal ou qu'il a saisis, clients dont il est référent) vers un ou plusieurs repreneurs, en une opération journalisée (TCK-591, TCK-603) |
| P1 | 🛡️🔧 | Mettre en pause ou terminer une collaboration avec un prestataire (agence) ; quitter une agence (prestataire) ; une pause ou une suspension ne se lève que par celui qui l'a posée (TCK-592) |
| P1 | 🛡️ | Retirer de l'agence un agent ou un admin d'agence (capacité `team.remove`), toujours journalisé (TCK-591) |
| P2 | 🛡️🧑‍💼 | Carnet des prestataires de l'agence filtré par statut de collaboration (actifs par défaut), métier et zone (TCK-592) |
| P1 | 🛡️ | Validité des pièces KYC d'agence : date d'expiration de la pièce du dirigeant, relances J-30 / J-7, retour du dossier en attente à l'échéance ; signalement au super-admin d'un NINEA ou d'un RIB professionnel déjà porté par une autre agence — le contrôle de forme du NINEA et du RCCM est différé (D-68) (TCK-601) |
| P2 | 🛡️ | Plans d'abonnement et quotas par agence (catalogue, période d'essai, limites) |
| P2 | 🔧 | Modifier son profil prestataire (métiers, zones, tarifs, disponibilités) après l'onboarding (TCK-592) |
| P3 | 🛡️ | Gestion multi-branches / sous-agences |
| P1 | 🛡️ | Absence datée d'un agent avec remplaçant désigné, révocable et journalisée : pendant la période, les tâches nouvellement confiées à l'absent partent chez le remplaçant, qui voit aussi les siennes ; aucune ligne existante ne change, et le remplaçant ne reçoit aucun droit (TCK-591, [ADR-0035](adr/0035-l-absence-est-une-delegation-qui-n-accorde-rien.md) — précise « Gestion des congés / disponibilité des agents ») |
| P3 | 🛡️ | Marketplace inter-agences |

---

## 2. Domaines applicatifs transverses

### 2.1 Authentification & comptes

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | Tous | Inscription par email et mot de passe |
| P0 | Tous | Connexion (tokens Sanctum) |
| P0 | Tous | Déconnexion et révocation de token ; une déconnexion volontaire ramène à l'accueil, une session expirée à la connexion (TCK-633) |
| P1 | Tous | Second numéro de contact, vérifié par SMS, qui ne sert pas à se connecter ; chaque numéro déclare s'il a WhatsApp (TCK-633) |
| P0 | Tous | Mot de passe oublié et réinitialisation |
| P0 | Tous | Vérification de l'adresse email ; un compte ouvert par téléphone ajoute son adresse depuis le profil et en reçoit le lien, renvoyable ; une adresse non vérifiée se corrige, une adresse vérifiée ne se remplace pas encore (TCK-632) |
| P0 | Tous | Édition de profil (nom, bio, avatar) |
| P1 | Tous | Vérification du numéro de téléphone (SMS / OTP) — indicatif hors du champ ; l'API refuse partout (profil, envoi du code) un numéro qu'aucun SMS ne peut joindre : longueur sénégalaise fausse, `0` de préfixe national derrière l'indicatif (TCK-566, TCK-574) ; le code part réellement par SMS, n'est jamais accepté sous une forme fixe, et s'invalide après 5 essais ; un numéro vérifié n'appartient qu'à un compte (TCK-589) ; hors production seulement (local, préproduction), derrière un drapeau, l'API rend aussi le code et l'écran l'affiche à côté du champ — connexion, inscription, profil, onboardings, suppression de compte, signature de bail (TCK-620, ADR-0060) |
| P1 | Tous | OAuth Google (Socialite) |
| P1 | Tous | Authentification à deux facteurs (TOTP + codes de récupération) |
| P1 | 🛡️ | 2FA TOTP exigée en continu pour tout super-admin : la console refuse un compte sans 2FA active ; la 2FA d'un super-admin ne se désactive pas, elle se renouvelle ; une réinitialisation par le support impose le réenrôlement à la connexion suivante (TCK-589) |
| P1 | 🛡️🏢 | 2FA exigée pour le personnel de l'agence sur les opérations d'argent, d'intégrations, de rôles et d'équipe ; réglage d'agence « 2FA obligatoire pour toute l'équipe » ; statut 2FA visible dans la liste de l'équipe (TCK-589) |
| P1 | Tous | Gestion des sessions actives |
| P1 | Tous | Sessions bornées : jeton à durée absolue et expiration par inactivité ; session super-admin courte (`platform.session_max_minutes`) et confirmation 2FA récente (step-up) avant une action sensible de la console (TCK-589) |
| P1 | Tous | Connexion et inscription par numéro de téléphone + code à usage unique reçu par SMS, sans mot de passe ; le compte est créé au premier code validé ; e-mail facultatif ; limiteurs et verrou par numéro — livrée entière, derrière un drapeau faux par défaut, allumée en production après un envoi réel mesuré ; décision par ADR (TCK-589) ; allumée en local et en préproduction sans fournisseur SMS, le code s'y affichant à l'écran (TCK-620, ADR-0060) ; le compte créé par le Radar pour un annonceur s'ouvre par ce code, et sa page de réclamation (`/claim/{jeton}`) partage les limiteurs et le verrou du numéro (TCK-2389, TCK-2390) ; le compte créé par le Radar accepte les conditions d'utilisation au premier code, avant le second facteur, sans que cette étape coûte un essai au limiteur (TCK-2404) |
| P1 | Tous | Verrou de compte après échecs de connexion répétés (mot de passe ou code), levé seul au bout de 15 min ou par le support ; un compte bloqué ou supprimé n'ouvre aucune session, par aucun chemin (TCK-589) |
| P1 | 🛡️ | Bloquer le seul administrateur d'un espace individuel ne retire pas l'espace : ses biens restent en ligne, et le modérateur suspend l'espace s'il le faut ([§2.9](#29-administration--configuration)) (décision du porteur du 2026-10-29, TCK-2390) |
| P1 | Tous | L'inscription ouvre la session aussitôt (TCK-589) |
| P1 | 👤 | L'inscription garde l'intention du visiteur (bien, dates, action) jusqu'au retour sur la fiche, quel que soit le chemin (connexion, inscription, téléphone, OAuth) (TCK-589) |
| P1 | 🏠🛡️ | Données bancaires et d'identité des profils et des demandes de passage en agence (RIB, NINEA, n° de pièce, RIB professionnel, revenu déclaré), et pièce et revenu du locataire et de la caution, chiffrées au repos et masquées à l'affichage ; valeur complète réservée à l'admin de l'agence et au super-admin, sous second facteur récent, consultation journalisée (TCK-601, TCK-953 à TCK-956, [ADR-0070](adr/0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md)) |
| P2 | Tous | Suppression de compte avec anonymisation (RGPD) |
| P2 | Tous | Export des données personnelles (portabilité RGPD — déclenché par l'utilisateur) — une demande par 24 h ; statut suivi jusqu'à la fin de la préparation ; e-mail de fin dans la langue du compte (TCK-567, TCK-575) |
| P2 | 🛡️ | Déclenchement de l'export RGPD par un super-admin pour le compte d'un utilisateur (support / réquisition) |
| P2 | Tous | OAuth Facebook / Apple |
| P3 | Tous | Magic link de connexion |

#### Profils & contexte actif (TCK-138 → TCK-142)

Une **identité = un User**, qui peut porter plusieurs **profils métier** chez plusieurs agences (ex. un même humain peut être propriétaire chez l'agence A, locataire chez l'agence B et prestataire collaborant avec C et D).

> ⚠️ **Le courtier n'a jamais eu de produit, et il a quitté la plateforme.** Il illustrait l'exemple ci-dessus jusqu'au 2026-08-31, et l'exemple était juste sur le principe — c'est le produit qui ne l'a jamais suivi : zéro route, zéro écran, aucun chemin qui crée le profil. Il a d'abord quitté la surface commutable ([ADR-0027](adr/0027-le-courtier-sort-de-la-surface-commutable.md), TCK-495), puis le code et la base le 2026-10-07 ([ADR-0030](adr/0030-le-courtier-quitte-le-code-et-la-base.md), qui remplace ADR-0027 ; TCK-586) : `BrokerProfile` et `BrokerAgencyCollaboration` n'existent plus, leurs tables sont supprimées. Email, mot de passe, 2FA et OAuth sont **uniques au user** (pas dupliqués par profil) ; le KYC et les informations administratives sont portés **par chaque profil** (RIB et tax_id par OwnerProfile, license_number par AgentProfile, certifications par ServiceProviderProfile).

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

Cartographie complète des parcours d'entrée dans le système (référence : `docs/superpowers/specs/2026-05-10-onboarding-discovery-design.md`). Tous les parcours d'invitation (Owner, Agent, AgencyAdmin, ServiceProvider, super-admin coopté) reposent sur un **pattern d'invitation unifié** (modèle `Invitation`, token signé, expiry 7j, rappel J+2). Les profils n'ont pas une machine à états commune : chacun a la sienne (enums `*ProfileStatus`). L'agent et le bailleur naissent `draft` à l'invitation, passent `active` à l'acceptation, et se suspendent (`suspended` pour l'agent, `blocked` pour le bailleur) ; le prestataire naît `draft` et passe `active` ; l'admin d'agence naît `active` et se suspend (`suspended`). Aucun profil n'a d'état `pending` ni `expired` : c'est l'invitation qui attend et qui expire. `inactive` (agent, bailleur, prestataire), `archived` (admin d'agence) et `suspended` du prestataire existent dans les enums sans qu'aucun chemin ne les pose (TCK-1703).

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P0 | Tous | Pattern d'invitation unifié — création par un inviteur autorisé, invitation par e-mail OU par SMS (lien court) quand l'invité n'a qu'un numéro (TCK-589), avec token signé (expiry 7j, rappel automatique J+2, retenté le lendemain si tous les fournisseurs SMS l'ont refusé, trois essais au plus (TCK-2155), renvoi self-service par l'inviteur, révocation possible avant acceptation) ; à l'acceptation, le profil cible passe en `active` et devient le profil actif |
| P0 | 🛡️ | Un compte existant entre dans l'équipe d'une agence par l'invitation seule, au rôle agent ou administrateur (l'administrateur exige `team.assign_role`) ; aucun rattachement direct (`POST /api/agencies/{id}/members` retirée). Un membre retiré puis réinvité revient au rôle système, jamais à son ancien rôle personnalisé ; l'invitation ne dit pas à l'invitant si l'adresse a un compte (P242, TCK-2365, [ADR-0031](adr/0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md)) |
| P0 | 🛡️ | Bootstrap super-admin via commande artisan `takussan:create-super-admin` (1ère installation par environnement) — exige 2FA TOTP au premier login |
| P0 | 👤🏠 | Onboarding wizard Customer post-signup — welcome modale (3 slides skippables) + complétion différée du profil minimal (téléphone, ville, type de recherche) au moment de la première action sensible (favoris / réservation / contact) |
| P1 | 🛡️ | Cooptation super-admin (super-admin → super-admin) — invitation pair-à-pair via console super-admin avec 2FA TOTP **obligatoire** avant `active` (bloquant), audit log automatique, notification broadcast aux autres super-admins |
| P1 | 🏢 | Wizard onboarding Owner post-acceptation invitation — vérification téléphone OTP (obligatoire), KYC documentaire (CNI/passeport, RIB, NINEA, statut particulier/société) en `pending_review` non bloquant, tour produit 3 slides, vue "biens déjà associés" si pré-rattachement |
| P1 | 🧑‍💼 | Wizard onboarding Agent post-acceptation invitation — vérification téléphone OTP, KYC (license_number, pièce d'identité, photo profil, spécialisation, zones d'intervention), affichage du périmètre de permissions choisi par l'admin inviteur, lien vers premier lead pré-assigné |
| P1 | 🔧 | Wizard onboarding Service Provider post-acceptation invitation — vérification téléphone OTP, KYC (pièce d'identité, métiers multi-select, zones, tarifs indicatifs, assurance RC pro optionnelle valorisée), disponibilités hebdomadaires, accès direct à la 1ère intervention si invitation déclenchée par une demande active. Multi-rattachement à plusieurs agences via plusieurs `ServiceProviderAgencyCollaboration` sans dupliquer le compte. |
| P1 | Tous | Composant wizard reprenable — chaque step sauvegardé en `draft`, bandeau persistant "Reprenez votre publication / votre onboarding" sur dashboard, reprise depuis le menu compte |
| P1 | Tous | Welcome modale générique réutilisable — composant 3 slides max, skippable, paramétrable par parcours (Customer, Host, Owner, Agent, AgencyAdmin, ServiceProvider, Tenant) |
| P1 | 🏢 | Carte « Mise en service » de l'agence sur le tableau de bord d'agence (agences `standard`, [§2.5](#25-reporting--tableaux-de-bord)) : étapes calculées par l'API (KYC vérifié, logo, taux de commission, intégration de paiement active, premier membre, premier bien publié, 2FA), chacune avec son lien ; disparaît une fois complète (TCK-589) |

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
| P0 | 🛡️ | La navigation d'administration n'offre que les pages que le profil actif peut ouvrir, d'après une seule table des pages ; « Administration » mène à la première d'entre elles et disparaît s'il n'y en a aucune ; une page refusée renvoie à la première accessible (TCK-633) |
| P0 | 🛡️🏢 | Cloisonnement des bailleurs d'une même agence : un bailleur ne lit et ne modifie que ses biens, baux, loyers, réservations, versements, factures et documents — jamais ceux d'un autre bailleur de l'agence ; seul le personnel (agent, admin d'agence) a le périmètre de l'agence (TCK-587) |
| P1 | 🛡️ | Éditeur de rôles personnalisés scopé par agence (réservé aux agences `standard`) — un « rôle personnalisé » est un ensemble de `Capability` nommé, porté par l'agence (`AgencyRole`) ; chaque profil agent, admin d'agence et bailleur, et chaque collaboration prestataire, en désigne exactement un. Livré par TCK-279 et TCK-315 : clonage d'un rôle système, édition de ses capacités, réaffectation d'un profil (écran `/app/agency/roles`) ; `Capability` reste défini en code ([ADR-0003](adr/0003-capacites-enum-code-defined.md)) |
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
| P1 | Tous | Un compte bloqué ou supprimé ne reçoit plus que les avis de son compte (blocage, réactivation, fin d'impersonation, effacement, réinitialisation du mot de passe, export de ses données prêt), par aucun canal et par aucun chemin d'envoi : les avis du bail, les rappels et les alertes ne lui parviennent plus (TCK-1350, TCK-2363) |
| P1 | Tous | Une notification urgente n'attend jamais un appel au modèle : les jobs qui appellent la passerelle IA hors d'une requête HTTP (extraction d'une annonce du Radar, vérification d'une réponse de consentement) passent par une file à eux (`ai`), lue par un processus à lui (`worker-ia`) (TCK-2402, [ADR-0078](adr/0078-une-connexion-de-file-pour-les-jobs-longs.md), amendement) |
| P1 | 🏢 | Question de disponibilité d'un bien publié par le Radar dont la source a disparu ([§2.12](#212-radar--acquisition-dannonces)) : interrupteur `property_availability_check` (groupe « Biens »), cloche et e-mail, jamais sur mobile (TCK-2432) |
| P1 | Tous | Templates localisés via fichiers lang/ Laravel |
| P2 | Tous | Notifications SMS (événements critiques) |
| P2 | 🛡️ | Annonces in-app cross-tenant (broadcast) ciblées par rôle / agence / segment, avec dismissal côté utilisateur — le bandeau s'affiche dans le flux de la page, sous la barre du haut (site public comme consoles), jamais sous une barre fixe (TCK-572) |
| P2 | Tous | Digest quotidien / hebdomadaire |
| P3 | Tous | WhatsApp entrant : recevoir les messages des contacts (mise en relation) et code de vérification par WhatsApp — le canal sortant est livré (TCK-282) et activé par défaut par la ligne P1 TCK-588 ci-dessus ; le webhook WhatsApp ne lit aujourd'hui que les accusés de livraison (TCK-283) |

#### Canal WhatsApp sortant (livré — TCK-282 ; activé par défaut par TCK-588)

Canal de notification **WhatsApp sortant** qui remplace certains SMS pour les familles proactives (transactionnel, rappels d'échéance, relances impayés), routé **WhatsApp d'abord → SMS en secours** :

- **Sélection mutuellement exclusive** : pour une notification supportant les deux, un seul canal mobile part — `whatsapp` s'il est éligible, sinon `sms`. Jamais les deux (pas de double-envoi).
- **Consentement** : `phone_verified_at` + préférence par événement ; le flag d'opt-out est honoré ; jamais d'envoi à un contact `opted_out`.
- **Contact sans compte** (client saisi par l'agence, visiteur anonyme — TCK-588) : messages transactionnels seulement ; WhatsApp si le numéro est `opted_in` dans `whatsapp_contacts`, sinon SMS ; heures calmes ARTP ; limite de débit par numéro ; le SMS de secours ne suit qu'un échec immédiat de WhatsApp, la tentative WhatsApp étant journalisée comme pour un compte (P207.02).
- **Émetteur** : un SMS ou un WhatsApp lié à un objet d'agence (bail, visite, réservation, fiche client) part par l'intégration de **cette agence** si elle en a une active, sinon par celle de la plateforme — que le destinataire ait un compte ou non, et quel que soit le nombre de ses profils (P203.01, P203.02).
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
| P1 | 🏢 | Dashboard bailleur (portefeuille, cashflow, occupation) — ouvert au bailleur, et à l'admin d'agence qui détient `reports.view_agency` (TCK-2260) |
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
| P3 | 🛡️ | Les tuiles du dashboard agence lisent les KPI personnalisés : les seuls activés, par rang, avec leur libellé et leur format, valeurs calculées par l'API (`data.kpis` de `GET /api/dashboard/agency`) ; sans configuration, les six tuiles par défaut restent (TCK-2373) |
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
| P1 | 🛡️ | Journal d'audit de l'agence (liste, historique d'un objet, export) réservé à l'admin d'agence qui détient `reports.view_agency` (TCK-2260) |
| P1 | 🛡️ | Filtrage par utilisateur, date, action |
| P1 | 🛡️ | Le journal d'une agence couvre tout ce qui touche ses objets (actes des admins, du système et des webhooks compris) et rien de ce qui touche une autre agence (TCK-601) |
| P1 | 🛡️ | Journal des consultations de données personnelles depuis la console (fiche utilisateur, sessions, dossier et pièces KYC, valeurs bancaires) et des valeurs claires lues dans l'application (pièce, revenu) (TCK-601, TCK-955) |
| P1 | 🛡️ | Le journal d'activité se purge par famille : 12 mois par défaut, 5 ans pour les journaux de sécurité et de preuve (consultations de données personnelles, droits, sécurité, support, KYC, compte, rôles et adhésions, intégrations, exports), 10 ans pour les pièces comptables ; durées écrites dans la politique de confidentialité (TCK-2342) |
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
| P2 | Tous | Watermark automatique sur photos de biens — derrière le drapeau `media_watermark`, éteint (TCK-633) |
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
| P0 | 🛡️ | Gestion des tags et amenités — dont la validation, le renommage et la fusion des équipements proposés par les annonceurs (TCK-633) |
| P1 | 🛡️ | Référentiel géographique : validation, renommage et fusion des quartiers proposés (TCK-633, [ADR-0062](adr/0062-referentiel-geographique-region-ville-quartier.md)) ; un ancien nom continue de désigner le quartier ou la ville renommés dans la recherche, les alertes et le rapprochement CRM (TCK-1080, TCK-1169) |
| P1 | 🛡️ | Crédits et boost : réglages (offre de bienvenue, validité, délai entre remontées, emplacements par page, places réservées en tête de la première page), catalogue des boosts, portefeuilles des espaces (octroi ou retrait motivé, sous 2FA récente, journalisé), boosts actifs (annulation avec ou sans remboursement, mise en avant offerte), statistiques (TCK-633, [ADR-0061](adr/0061-credits-d-espace-et-boost-des-annonces.md)) |
| P0 | 🛡️ | Gestion des utilisateurs (activation, blocage) |
| P0 | 🛡️ | Onboarding d'une agence par un super-admin (création + admin initial invité, hors auto-inscription) ; le numéro du gérant, facultatif, est cherché parmi les numéros vérifiés : s'il appartient à un compte, la création est refusée comme pour l'e-mail (409, P251.02, TCK-2365) |
| P1 | 🛡️ | Gestion des enums métier (types de biens, statuts) |
| P1 | 🛡️ | Configuration email (templates, expéditeur) |
| P1 | 🛡️ | Suspension d'une agence par un super-admin, motif obligatoire : ses biens quittent la surface publique et l'index de recherche, son back-office passe en lecture seule (export permis), ses administrateurs sont prévenus ; la levée de la suspension restaure l'état (TCK-600) |
| P1 | 🛡️ | Niveaux d'opérateur plateforme (`super_admin`, `support`, `viewer`) choisis à la cooptation, chacun borné à une liste de gestes ; retrait d'un opérateur avec motif (jetons révoqués, jamais le dernier `super_admin`) ; la cooptation est le seul chemin d'octroi (TCK-600) |
| P1 | 🛡️ | Effacement d'un compte par un super-admin, par le parcours conforme de [§2.1](#21-authentification--comptes) (obligations ouvertes, délai de grâce, motif, utilisateur prévenu) (TCK-600) |
| P1 | 🛡️ | Registre des demandes de droits (accès, rectification, opposition, effacement, portabilité) : réception, échéance légale, statut, preuve de réponse, export (loi n° 2008-12) (TCK-601) |
| P2 | 🛡️ | Paramètres globaux de plateforme — seules des clés lues par l'application, écrites par une seule voie validée et journalisée (TCK-600) |
| P2 | 🛡️ | Gestion des intégrations tierces (API keys) — chaque intégration de paiement reçoit ses webhooks sur une URL propre, porteuse d'un jeton secret (empreinte en base, clair chiffré) ; l'admin la relit et la régénère d'un geste sous double authentification, journalisé sans le jeton ; la signature du fournisseur reste exigée, et un webhook ne rapproche que des paiements de l'agence de son intégration ; l'ancienne URL commune par fournisseur rend 410 (TCK-293, [ADR-0046](adr/0046-un-webhook-de-paiement-par-integration.md)) |
| P2 | 🛡️ | Healthcheck plateforme et supervision des jobs en arrière-plan (file de queue, échecs, rejouer) — par sondes actives et datées (courriel, SMS, moteur de recherche, âge de la file, battement des workers, stockage des médias), statut agrégé exposé à une sonde externe (TCK-600) ; la sonde des workers surveille la file des appels IA (`ai`) comme les autres files (TCK-2402) |
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

### 2.11 Socle IA

Toute fonctionnalité qui fait appel à un modèle d'IA passe par un socle commun : elle **déclare un
usage**, et le socle choisit le modèle, tient le budget, masque les données, journalise l'appel et
le rend évaluable ([ADR-0076](adr/0076-le-socle-ia.md)). Le Radar ([§2.12](#212-radar--acquisition-dannonces))
en est le premier usager. Vision et lots : [plan du 2026-10-26](plans/2026-10-26-radar-et-socle-ia.md).

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P1 | 🛡️ | Affecter à chaque rôle de modèle (`extraction`, `redaction`, `raisonnement`, `vision`, `embedding`) une chaîne ordonnée de modèles depuis la console super-admin, avec bascule automatique à la panne ; forcer un modèle pour un usage ; sous second facteur récent, journalisé |
| P1 | 🛡️ | Évaluer un modèle candidat avant de l'affecter : score par champ et coût, comparés au modèle en place sur le jeu d'évaluation de chaque usage concerné ; un score sous le cliquet bloque l'affectation, sauf dérogation journalisée |
| P1 | 🛡️ | Voir, par fournisseur, si sa clé est présente (jamais sa valeur) et tester la connexion ; seuls les fournisseurs nommés par la politique de confidentialité sont sélectionnables |
| P1 | 🛡️ | Plafonds journaliers en XOF : par usage, réglable depuis la console avec le coupe-circuit de l'usage ; global et par agence, fixés par la configuration du déploiement et non réglables depuis la console, qui affiche le global sans le modifier. Un appel d'évaluation n'y compte pas (TCK-2383) |
| P1 | 🛡️ | Tableau de bord IA : coût et latence par usage et par jour, erreurs, taux d'acceptation des suggestions, dernier score d'évaluation |

**Règles de gestion.**

- **Aucun nom de modèle dans le code applicatif** : le code demande un rôle, l'affectation vit en
  base avec un repli sur la configuration.
- **Les clés des fournisseurs restent dans l'environnement**, jamais en base ni dans la console.
- **L'IA propose, un humain décide** : une sortie qui modifierait une donnée est une suggestion
  acceptée, corrigée ou rejetée, et la correction est conservée.
- **Une donnée sensible** (pièce d'identité, revenu) **ne part jamais vers un fournisseur.**
- **Un numéro de téléphone, sénégalais ou étranger, ne part jamais en clair vers un fournisseur**
  (usage `publique`) **et ne s'écrit en clair dans aucun jeu d'évaluation**, liens WhatsApp compris
  (`wa.me/…`, `?phone=…`) : le socle le masque (`+221`, `00221`, `+33`, `+225`, `00…`, forme nationale
  `0X XX XX XX XX`), et la garde des jeux d'évaluation le signale (TCK-2400, TCK-2410). Le préfixe
  `+221 74`, qu'aucun opérateur n'attribue, est celui des numéros fictifs des jeux d'évaluation : il
  n'est pas masqué. Un test qui a besoin d'un numéro lu comme réel (masqué, extrait, apparié) prend
  un numéro en `+221 77` — dans les tests du Radar, le plus souvent `+221 77 123 45 67` (décision du
  porteur du 2026-10-30). Le `+` d'un étage (`R+0` à `R+19`, derrière un `R` isolé) n'est pas un
  indicatif : le prix ou le numéro qui le suit reste lu (TCK-2428).
- **Seul le jeu d'évaluation de l'extraction du Radar part de vraies annonces** : 20 annonces
  relevées le 2026-10-29 sur Expat-Dakar et CoinAfrique, anonymisées puis réécrites (titres
  reformulés, prix et surfaces décalés, adresses ramenées au quartier ; provenance dans
  `provenance.json`), et 10 cas synthétiques (4 messages, 6 captures) ; aucune capture réelle, qui
  porte l'identité de l'annonceur dans l'image (TCK-2403). **Celui de la vérification d'une réponse
  est entièrement synthétique** : 16 captures dessinées par `render-captures.php`, jamais prises sur
  une vraie conversation, et 14 réponses texte inventées (`text-cases.php`) ; il mesure la lecture de formes
  connues et ne dit rien de la distribution réelle des réponses. Il note le classement, la
  concordance du numéro, le numéro transcrit et les clauses lisibles (TCK-2388, TCK-2427).
- **Le schéma de sortie d'un usage tient sous les limites publiées du fournisseur** (16 paramètres à
  union, 24 optionnels) ; un test le vérifie pour chaque agent. Une sortie stricte (grammaire du
  fournisseur) ne dépasse pas la taille de schéma qu'un vrai appel a attestée. Un usage dont le
  schéma la dépasse (aujourd'hui l'extraction du Radar) le déclare dans son agent
  (`SocleAgent::usesStrictSchema()` faux) et passe par l'outil de sortie non strict, dont le
  normaliseur et la relecture humaine valident la forme : c'est un choix par agent, pas un repli à
  l'exécution (TCK-2411, TCK-2433).
- **Tout job qui appelle le modèle hors d'une requête HTTP déclare la file des appels IA** (`ai`) ;
  un appel plus long que le délai de reprise de la file par défaut (85 s au plus) prend la file des
  jobs longs. Une règle de CI le vérifie (`scripts/check-queues.mjs`, TCK-2402).
- **L'agence reste la frontière d'isolation** pour tout outil qu'un agent IA appelle.
- **Un contenu externe est une donnée, jamais une consigne** : il arrive au modèle dans un bloc
  délimité, dont la balise n'est pas prévisible et qu'il ne peut pas refermer, et l'usage qui le lit
  n'a aucun outil, pas même de lecture, et ne rend qu'une sortie structurée (TCK-2398) — stricte
  (grammaire du fournisseur) par défaut, ou par l'outil de sortie non strict du SDK pour un agent qui
  le déclare ; ce canal n'est pas un outil : rien ne s'y exécute
  (TCK-2433).
- La suite de tests n'appelle jamais un vrai modèle ; les évaluations se lancent à part.

### 2.12 Radar — acquisition d'annonces

Un outil de la console super-admin qui relève des annonces immobilières publiées ailleurs, en
extrait les biens par IA, aide à contacter leurs annonceurs et publie leurs biens sur Takussan **sur
leur accord prouvé** ([ADR-0077](adr/0077-le-radar.md)). Une annonce relevée vit hors du
catalogue tant que cet accord n'existe pas. Vision et lots : [plan du 2026-10-26](plans/2026-10-26-radar-et-socle-ia.md).

| Prio | Acteurs | Fonctionnalité |
|------|---------|----------------|
| P1 | 🛡️ | Saisir une annonce par URL (plusieurs à la fois), par texte collé ou par captures d'écran ; une lecture d'URL impossible le dit et propose les deux autres voies |
| P1 | 🛡️ | Extraction IA des caractéristiques du bien, chaque champ avec sa confiance et le passage de la source qui le justifie ; quartier rapproché du référentiel géographique ; nature présumée de l'annonceur (propriétaire, intermédiaire, agence) et ses indices |
| P1 | 🛡️ | Relecture : corriger, valider, marquer en doublon ou écarter ; rapprochements avec les biens publiés et les autres annonces relevées (téléphone, quartier, prix, pièces, empreinte des photos source, texte de l'annonce (TCK-2392)) |
| P1 | 🛡️ | Fiche annonceur, une par numéro : ses annonces, ses messages, ses accords ; prise en charge exclusive de 10 minutes |
| P1 | 🛡️ | Préparer le message d'accord pour une ou plusieurs annonces d'un annonceur (clauses fixes, salutation et résumé personnalisés par l'IA) et l'ouvrir dans WhatsApp ; relances après un délai sans réponse |
| P1 | 🛡️ | Déposer la capture de la réponse : l'IA la transcrit, vérifie le numéro et les clauses et classe la réponse (accord, refus, STOP, question, ambigu) ; un opérateur confirme ; refus et STOP s'enregistrent aussi sans capture |
| P1 | 🛡️ | « Publier pour lui » (`super_admin` seulement) : sur un accord confirmé, crée l'espace individuel de l'annonceur (compte sans mot de passe à son numéro) et y publie les annonces couvertes, après un écran de vérification (compte, biens, photos, doublons) ; une annonce relue sans titre se publie sous un titre construit de ses champs (type, chambres, contrat, quartier), que l'écran de vérification montre (TCK-2389) |
| P1 | 👤🏢 | Réclamer ses annonces depuis le lien signé du message (`/claim/{jeton}`, 30 jours, mort après un STOP ou une révocation, refusé sous mandat jusqu'à la reprise, TCK-2421) : annonces en cartes à cocher et à corriger (titre, prix, description), prénom et nom de l'espace, acceptation des conditions avec leur version, code SMS envoyé au seul numéro de l'annonceur (affiché masqué), publication dans son espace individuel dès les photos prêtes ; un numéro déjà inscrit se connecte d'abord à son compte ; la même page active le compte créé par « publier pour lui » (TCK-2390) ; une annonce que la publication automatique ne peut pas mettre en ligne (photo, champ, refus) attend la vérification de l'équipe, et l'opérateur la reprend depuis la file « À reprendre », qui montre l'échéance de purge (TCK-2413) |
| P1 | 🛡️ | Retrait de l'accord (STOP, ou révocation par la plateforme, `POST /api/admin/radar/advertisers/{id}/revoke`, `super_admin` seulement, motif obligatoire) : les biens publiés quittent la surface publique et l'index de recherche sur-le-champ, l'annonceur n'est plus jamais contacté (TCK-2391) |
| P1 | 🛡️ | Purge des annonces jamais publiées à 90 jours ou dès un STOP, en conservant l'empreinte du numéro qui a refusé ; purge quotidienne (`radar:purge`, 04:15 Dakar), doublée d'un job lancé dès la révocation (TCK-2391) |
| P2 | 🛡️ | Collecte automatique planifiée sur Expat-Dakar et CoinAfrique, **éteinte par défaut** : le `super_admin` allume chaque site, règle sa fréquence et ses pages, lance un passage (`/super-admin/radar/collecte`) ; chaque passage lit la liste (`robots.txt` respecté, un seul passage actif par site), saisit les annonces nouvelles et date leurs instantanés (prix, surface, quartier, présence) ; la même annonce vue sur deux sites peut être fusionnée d'office en une fiche à deux provenances, que l'opérateur peut séparer — fusion **éteinte par défaut** (`RADAR_MERGE_AUTO`) (TCK-2392, [ADR-0080](adr/0080-la-collecte-automatique-du-radar.md)) |
| P2 | 🛡️ | Annonceurs et observatoire du marché (`/super-admin/radar/observatory`) : classement des annonceurs par volume d'annonces vivantes (quartiers principaux, gammes de prix, sites, nature présumée, piste commerciale jusqu'à la demande de passage en agence) ; prix au m² par quartier, type et contrat ; temps de mise sur le marché ; quartiers où Takussan manque d'annonces ; part d'intermédiaires probables ; alerte quand l'annonce source d'un bien publié disparaît (TCK-2393, [ADR-0083](adr/0083-l-observatoire-du-marche.md)) |
| P2 | 🛡️ | Relance d'activation d'un compte créé par « publier pour lui » et jamais activé : texte fixe versionné (`activation.v1`) avec les chiffres réels de la période — vues, demandes de contact et de visite, crédits offerts à l'activation —, ouvert dans WhatsApp puis marqué envoyé ; une relance par semaine au plus (`radar.activation.min_interval_days`) (TCK-2394) |
| P2 | 🛡️ | Publication sous mandat Takussan (`super_admin`, drapeau `radar_mandate`, [ADR-0079](adr/0079-la-publication-sous-mandat-takussan.md), accepté sur le principe ; drapeau éteint jusqu'à l'avis de l'avocat et la livraison de TCK-2421) : sur un accord confirmé, l'annonceur qui ne veut pas de compte voit ses annonces publiées dans l'espace des mandats (réglage `radar.mandate_agency_id`), son numéro en contact, sans compte créé ; second message `mandat.v1`, sans lien d'activation (TCK-2394) |
| P3 | 🛡️ | Démarchage par l'API WhatsApp Cloud sur un numéro dédié au Radar, réception des réponses par webhook signé et preuve par identifiant de message (TCK-2395, [ADR-0081](adr/0081-le-radar-prospecte-par-l-api-whatsapp-sur-son-propre-numero.md)) ; depuis la fiche annonceur, envoi confirmé, canal de chaque message, réponse reçue lue en texte (TCK-2426) ; état de remise suivi par les accusés de WhatsApp et journalisé, pas encore affiché (TCK-2427, TCK-2437) |

**Règles de gestion.**

- **Aucun bien n'entre au catalogue sans un accord confirmé** qui le couvre ; l'API le refuse, pas
  seulement l'écran.
- **Un accord couvre toutes les annonces que le message listait**, et se rattache à l'annonceur.
- **Les clauses du message d'accord sont un texte fixe**, jamais une génération.
- **Chaque message garde la version de ses clauses** (`accord.v1`, `accord.v2`, `accord.v3`…) : une
  version nouvelle ne réécrit jamais un message déjà envoyé. `accord.v3`, la version courante, reprend
  `accord.v2` mot pour mot derrière l'ouverture « Takussan — » : c'est le corps du gabarit que Meta
  approuve pour le démarchage par l'API (TCK-2395).
- **Le lien de réclamation est signé, propre à l'annonceur et sans stockage** : il expire
  (`radar.claim.link_ttl_days`, 30 jours) et ne sert plus après un STOP, un accord révoqué ou un
  numéro purgé. `accord.v2`, `accord.v3`, `publie.v2` et `activation.v1` le portent. La page ne révèle ni le numéro complet, ni
  rien du Radar (TCK-2390 ; `accord.v3` : TCK-2395 ; `activation.v1` : TCK-2394).
- **Réclamer, c'est donner un accord prouvé** : preuve `otp` rattachée au dernier message envoyé qui
  couvre les annonces retenues, acceptation des conditions avec leur version. Une annonce décochée
  est refusée (`radar.claim.declined`). Le code part au seul numéro de l'annonceur, sous les
  limiteurs de la connexion par téléphone (TCK-2390).
- **Un numéro déjà vérifié sur un compte ne se réclame que connecté à ce compte** : les annonces vont
  dans son espace existant ; les biens qu'un compte du Radar **jamais activé** portait pour ce numéro
  y sont rattachés, avec leurs demandes, prospects et conversations, puis ce compte est supprimé ; un
  compte du Radar qui a servi renvoie au support (`radar.claim.support_required`). « Publier pour
  lui » refuse de verser encore dans ce compte (décision 5a du porteur, 2026-10-29, TCK-2390).
- **Un compte rattaché à un annonceur, puis supprimé, se délie** (`super_admin`, motif facultatif,
  journalisé) : que le Radar l'ait créé ou que l'annonceur ait réclamé avec. L'annonceur réclame
  ensuite par un compte neuf, ou par celui qui a vérifié son numéro. Jamais après un STOP ou une
  révocation ; un compte bloqué ne se délie pas (TCK-2413).
- **Écrire sur un annonceur exige d'en tenir la prise en charge** (10 minutes, renouvelée tant que
  la fiche est ouverte) ; un second opérateur est refusé.
- **Une réponse classée par l'IA n'est jamais un accord** tant qu'un opérateur ne l'a pas confirmée ;
  confirmer un accord contre un verdict discordant (numéro, clauses) ou absent exige un motif écrit.
- **STOP est définitif** : l'annonceur passe « ne plus contacter », ses accords sont révoqués, ses
  annonces fermées, ses biens publiés retirés du public, et aucun message ne peut plus lui être
  préparé. La révocation par la plateforme fait exactement la même chose (`AdvertiserRevocation`) ;
  elle ne demande pas la prise en charge de l'annonceur, et elle laisse son compte : le support le
  supprime par la voie de [§2.1](#21-authentification--comptes), il ne le bloque pas (TCK-2391).
- **Relances** : après un délai sans réponse (3 jours par défaut, en configuration), deux au plus ;
  ensuite l'outil propose de classer « sans réponse ».
- **Le compte créé pour un annonceur est l'espace individuel de [§1.12](#112-agence--équipe)** : pas
  de mot de passe, première connexion par code SMS, aucun crédit de bienvenue avant la vérification
  du numéro ; un numéro déjà inscrit n'autorise que la réclamation. Tant qu'il n'a pas accepté les
  conditions d'utilisation, la connexion par code les lui présente avant l'entrée dans l'espace, et
  avant le second facteur, puis date leur acceptation, version comprise, avec une trace d'audit
  (`radar_terms_accepted`). Une acceptation déjà datée (réclamation, publication) ne se redemande pas
  (TCK-2404).
- **La relance d'activation cite les chiffres d'une période** : depuis la dernière relance envoyée,
  sinon depuis la mise en ligne. Les vues dépassent la ligne de base posée à l'envoi précédent
  (`views_count` n'est pas daté) ; les demandes sont datées de la période ; les crédits sont ceux que
  l'activation accordera encore. Aucune relance pour un annonceur STOP, révoqué, purgé, déjà activé,
  au compte indisponible, sans bien en ligne ou sous mandat, ni tant que la connexion par téléphone
  est éteinte (`radar.publish.activation_unavailable`) ou que l'aperçu des codes est actif hors
  `local` (`radar.publish.otp_preview_active`) — donc aucune en préproduction, où `OTP_PREVIEW_ENABLED`
  est allumé en `staging` ([hébergement](infra/hebergement.md)) ; l'envoi rejuge sous verrou et
  journalise les chiffres cités (`radar_activation_reminder_sent`) (TCK-2394).
- **Un annonceur est publié pour lui OU sous mandat, jamais les deux** : le mandat refuse un
  annonceur rattaché à un compte (`radar.mandate.account_exists`), « publier pour lui » refuse un
  annonceur sous mandat (`radar.publish.under_mandate`). Le mandat garde les gardes de « publier pour
  lui » sauf celles du compte ; il est refusé drapeau `radar_mandate` éteint (`radar.mandate.disabled`)
  ou sans espace des mandats (`radar.mandate.space_missing`). **Sous mandat, la réclamation par le
  lien est refusée** (409, `radar.claim.under_mandate`) : avant l'envoi du code SMS, puis sous le
  verrou de l'annonceur à la confirmation, et la publication d'une réclamation aussi ; un lien encore
  valide cesse donc de servir dès le mandat, jusqu'à la reprise des biens sous mandat (TCK-2421)
  (TCK-2394, [ADR-0079](adr/0079-la-publication-sous-mandat-takussan.md)).
- **La nature de l'annonceur reste dans le Radar**, jamais dans les profils.
- **Le numéro WhatsApp des notifications ne sert jamais à prospecter.**
- **Le démarchage par l'API part d'un numéro WhatsApp dédié au Radar, configuré à part** : le code
  refuse le numéro et le jeton des notifications (`radar.whatsapp.same_number`). Le message envoyé
  par l'API est le texte enregistré, ou rien ; son résumé ne dépasse pas 120 caractères. Une réponse
  reçue devient une preuve à confirmer, identifiée par l'identifiant du message, jamais un accord ;
  une réponse qui vaut « STOP », aux espaces, à la casse et à la ponctuation finale près, révoque
  l'annonceur dès sa réception
  (`RADAR_WHATSAPP_AUTO_STOP`, allumé par défaut). Tant qu'une réponse
  reçue par l'API d'un annonceur n'est pas tranchée, sur n'importe laquelle de ses annonces, rien ne
  se prépare ni ne part vers lui, par l'API ou à la main (`radar.outreach.reply_pending`) ; l'issue
  reste posable (TCK-2395, [ADR-0081](adr/0081-le-radar-prospecte-par-l-api-whatsapp-sur-son-propre-numero.md)).
- **La fiche annonceur offre « Envoyer par l'API WhatsApp »** quand l'envoi par l'API est configuré
  (`whatsapp_api_available`), aux mêmes conditions que le lien `wa.me` et après une confirmation ;
  chaque message envoyé dit son canal (à la main, par l'API, ou par l'API sans confirmation de
  Meta). Une réponse reçue par l'API se lit en texte, sans capture, et son issue se pose comme celle
  d'une capture ; une réponse sans texte (vocal, image) se dit illisible à la console. Tant qu'une
  réponse reçue de l'annonceur n'est pas tranchée, la fiche le dit et ferme le démarchage (TCK-2426).
- **L'état de remise d'un message envoyé par l'API suit les accusés de WhatsApp** : envoyé, remis,
  lu, ou non remis. Il n'avance que dans cet ordre, quels que soient l'ordre et le nombre des accusés
  reçus, et un message remis ne devient jamais « non remis ». Un accusé n'est jamais une preuve
  d'accord : il ne change ni l'envoi, ni l'issue, ni les annonces. Un message non remis est
  journalisé avec le code de WhatsApp (`radar_whatsapp_delivery_failed`), sans texte ni numéro ; il
  reste envoyé, et l'opérateur juge de la suite. Un accusé d'identifiant inconnu est ignoré, jamais
  rattaché par inférence (TCK-2427). **La console n'affiche pas encore cet état** : la fiche
  annonceur ne distingue que le canal (à la main, par l'API, par l'API sans confirmation de Meta), si
  bien qu'un message non remis s'y lit « par l'API », comme un message remis (TCK-2437).
- **Les photos ne sont conservées qu'à partir de l'accord confirmé** : avant, seule leur empreinte (dHash, calculée à la volée sur la photo source, qui n'est jamais écrite) est gardée pour les rapprochements (TCK-2387). L'accord confirmé, qui autorise la publication avec les photos, fait télécharger les photos source dans une réserve **privée** de l'annonce ; l'opérateur peut y en retirer ou y en déposer à la main. La publication verse cette réserve au bien, sans appel réseau ; une annonce sans aucune photo en réserve ne se publie pas (TCK-2389). La réserve d'une annonce jamais publiée est purgée avec elle (TCK-2391).
- **Révocation et purge** (TCK-2391, [ADR-0077 §8, §9](adr/0077-le-radar.md)). Une purge quotidienne
  (`radar:purge`, 04:15 Dakar), doublée d'un job lancé dès la révocation (`PurgeRadarAdvertiser`),
  efface le texte brut, l'URL, l'extraction, la réserve de photos et les captures des annonces
  jamais publiées, à 90 jours ou dès un STOP ; l'annonce passe « purgée », et ses instantanés de
  collecte sont supprimés (TCK-2392). Une annonce publiée ne l'est qu'avec la dernière preuve qui la
  couvre, une fois son bien hors vitrine (ou supprimé), et seulement drapeau
  `radar.purge_published_material` allumé (voir plus bas). Les suggestions de l'IA qui portaient sur elle perdent leurs champs, pas leur ligne :
  le taux d'acceptation ne bouge pas. Un message dont toutes les annonces sont purgées perd son
  texte, sauf s'il porte une preuve conservée ; une réponse non confirmée, ses captures, sa transcription et son verdict — une
  vérification encore en cours finit en échec, motif `radar.verification.purged`. Un annonceur sans
  annonce restante perd son numéro, son nom et ses indices ; l'empreinte du numéro qui a refusé est
  conservée. Les copies de photos qu'une publication coupée a écrites sans ligne `media` (sous
  `publications/`, sur les deux disques) sont balayées au même passage, au-delà d'une heure. La
  purge de la matière d'une annonce publiée, avec la preuve de l'accord trois ans après le retrait du
  dernier bien qu'il couvre, est codée et éteinte (`radar.purge_published_material`) : elle attend la
  décision du porteur et la relecture du texte légal (TCK-2406).
- **Clé de l'empreinte des refus** (TCK-2414, [ADR-0082](adr/0082-l-empreinte-des-refus-du-radar-a-sa-propre-cle.md)).
  L'empreinte du numéro d'un annonceur qui a dit STOP se calcule sous une clé dédiée
  (`RADAR_PHONE_HMAC_KEY`), indépendante de la clé de l'application : faire tourner celle-ci ne fait
  oublier aucun refus. Les anciennes clés restent reconnues (`RADAR_PHONE_HMAC_PREVIOUS_KEYS`, repli
  sur la clé de l'application) ; la page Santé signale la clé absente hors développement.
- **La preuve d'un accord confirmé est conservée tant qu'une annonce qu'il couvre est en ligne ou
  attend sa publication, puis trois ans** (`radar.consent_retention_years`, politique de
  confidentialité § 6). Les trois ans courent du dernier retrait, observé par la purge quotidienne ;
  un bien qui revient en ligne les remet à zéro.
- **Les journaux `radar_purged` (des comptes) et `radar_advertiser_revoked` (des identifiants et
  le motif de l'opérateur) suivent la rétention par défaut du journal d'activité**, 12 mois
  ([§2.6](#26-audit--traçabilité)), sans famille dédiée (décision du porteur du 2026-10-29).
- **La lecture d'une URL refuse les adresses privées et de métadonnées**, respecte le `robots.txt`
  et limite sa fréquence par domaine. Airbnb est hors périmètre.
- **Le Radar lit les numéros que le socle IA masque, et ne garde que les sénégalais** : toute
  écriture que le masquage reconnaît (groupements libres, `_`, `,`, préfixe entre parenthèses, tirets
  Unicode, `(0)` derrière `+221`) donne `+221…`. Un numéro étranger (un indicatif étranger écrit
  devant) n'est jamais un numéro de l'annonce. Le refus STOP, la preuve qu'un numéro rendu par le
  modèle est dans la source, et le choix de l'opérateur se jugent sur tous les numéros lus. Le contact
  choisi d'office, sans humain (le modèle n'a rendu aucun numéro), écarte en plus une forme précédée
  d'un `+` / `00` nu, suivie d'une unité, ou précédée d'un mot de prix ou de liste. L'étage `R+1`
  n'est pas un indicatif, et aucun nombre qui fait partie d'un numéro n'est lu comme un prix
  (TCK-2412). Un nombre nu de moins de 100, sans monnaie, période ni multiplicateur, n'est jamais
  choisi comme prix (un compte, un horaire `H24/7`, le reste d'un numéro) (TCK-2428).
- **La collecte ne part que d'un geste du porteur** : une source naît éteinte ; celui qui l'allume en
  devient l'opérateur, au nom duquel l'extraction est jugée et comptée sur le budget d'IA. Une
  annonce déjà connue n'est jamais relancée par un passage (TCK-2392).
- **Une fusion d'office désigne le bien, jamais l'annonceur, et elle est éteinte par défaut**
  (`RADAR_MERGE_AUTO`, [ADR-0080](adr/0080-la-collecte-automatique-du-radar.md)) : allumée,
  seulement une annonce trouvée par la collecte, vers une annonce plus ancienne d'un autre site, sur
  un rapprochement fort dont la photo fait partie, ou le lieu (quartier, chambres, prix à 3 % près)
  corroboré par un autre signal que le téléphone. Le même numéro ou le même texte ne suffisent pas.
  Une fusion séparée n'est jamais retentée (TCK-2392).
- **La collecte ne relit pas ce que la purge a fait taire** : une annonce purgée, `do_not_contact`,
  ou d'un annonceur qui a dit STOP n'est plus observée ; toute purge supprime ses instantanés. Un
  historique de marché au-delà de la rétention passera par des compteurs anonymes agrégés (TCK-2434,
  à valider juridiquement) (TCK-2392, ADR-0080).
- **Quatrième signal de rapprochement, le texte** : similarité des descriptions par trigrammes
  (`pg_trgm`), sans aucun chiffre ; il ne rend jamais un rapprochement fort à lui seul. Un pilote
  d'embeddings le remplacera (TCK-2423).
- **Les agrégats de marché de l'observatoire ne lisent que des données anonymes** (prix au m²,
  temps de mise sur le marché, écart d'offre, sources disparues : instantanés, site, rattachement au
  catalogue, disparition) ; une annonce vue sur plusieurs sites compte une fois
  ([ADR-0083](adr/0083-l-observatoire-du-marche.md)). Deux lectures ne le sont pas : la part
  d'intermédiaires lit la nature présumée de l'annonceur (`radar_advertisers.nature`), et le
  classement des annonceurs, outil commercial du démarchage, ne prétend pas être anonyme
  (ADR-0083 § 5). Ses chiffres portent sur les annonces
  conservées : une annonce purgée n'y est plus, et la période couverte ne remonte pas au-delà de la
  rétention de 90 jours. La part d'intermédiaires ne porte que sur les annonceurs encore porteurs
  d'annonces non purgées (TCK-2393).
- **Une annonce collectée n'a disparu qu'après deux passages complets d'affilée de son site** (qui
  ont lu toute la liste) **sans l'avoir revue** (`radar.observe.confirm_runs`) : un seul ne suffit
  pas, la liste glisse pendant la lecture. Revue plus tard, elle redevient présente. Une annonce que
  la collecte ne suit plus (purgée, `do_not_contact`, annonceur STOP) n'est plus jugée. La disparition
  de la source d'un bien lève l'alerte `radar_source_listing_gone`, que les règles d'alerte de la
  console livrent : un journal de plateforme, dont le sujet est l'annonce collectée et le bien dans
  `properties.property_id`, qu'aucune agence ne lit (TCK-2393).
- **Bien publié dont la source a disparu** (TCK-2432, ADR-0083 amendé). Quand la dernière annonce
  collectée encore en ligne d'un bien que le Radar a publié disparaît, et que le bien est encore en
  vitrine, son titulaire reçoit une notification (« Votre bien est-il toujours disponible ? »), une
  fois par disparition, dans la cloche et selon ses préférences (`property_availability_check`,
  [§2.3](#23-notifications)), jamais par SMS ni WhatsApp ; sous mandat, c'est l'administrateur
  principal de l'espace des mandats. Sur la fiche du bien, qui peut le modifier répond : loué ou vendu
  (le bien passe à ce statut et quitte la vitrine), ou toujours disponible (la réponse est notée).
  Sans réponse après 7 jours (`radar.observe.owner_answer_days`), l'équipe reçoit une proposition de
  retrait par les règles d'alerte de la console (`radar_withdrawal_proposed`) ; le bien n'est jamais
  retiré automatiquement. Le retour de l'annonce efface la question. Une autre source ne compte
  « en ligne » que si la collecte la suit encore, sur un site allumé dont un passage complet est
  récent (`radar.observe.online_horizon_days`, 3 jours, ou la fréquence du site multipliée par
  `radar.observe.confirm_runs` si elle est plus longue).
- Droits : `support` saisit, relit, démarche (relance d'activation comprise), dépose les preuves,
  sépare une fusion d'office et lit la collecte et l'observatoire ; seul `super_admin` publie pour l'annonceur ou sous mandat,
  allume, règle et lance la collecte, et délie un compte supprimé (TCK-2392, TCK-2393, TCK-2394,
  TCK-2413).

---

## Notes de priorisation

- **MVP = P0 + P1** : une première version publiable couvre la gestion de biens, la recherche, la location longue durée, les paiements de base, la messagerie, la maintenance, l'auth et les notifications essentielles.
- **P2 (V2)** : enrichissement de l'expérience (comparateur, passerelle de paiement, exports, signatures, multi-devises).
- **P3 (futur)** : différenciateurs concurrentiels (IA, signature électronique native, marketplace).

Chaque fonctionnalité fera l'objet d'une spécification détaillée séparée avant implémentation (user stories, maquettes, règles de gestion, endpoints API).

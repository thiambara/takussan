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
| 🔧 | Prestataire de service (service provider) |
| 🛡️ | Admin d'agence / Super-admin |

| Code | Signification |
|------|---------------|
| **P0** | MVP bloquant |
| **P1** | MVP important |
| **P2** | V2 |
| **P3** | Futur / nice-to-have |

---

## Sommaire

1. [👤 Visiteur anonyme (pas encore de compte)](#visiteur-anonyme-pas-encore-de-compte) — 27 fonctionnalités
2. [🏠 Locataire / Acheteur (Customer)](#locataire-acheteur-customer) — 76 fonctionnalités
3. [🏢 Bailleur / Propriétaire (owner)](#bailleur-propriétaire-owner) — 65 fonctionnalités
4. [🧑‍💼 Agent immobilier](#agent-immobilier) — 95 fonctionnalités
5. [🔧 Prestataire de service (service provider)](#prestataire-de-service-service-provider) — 16 fonctionnalités
6. [🛡️ Admin d'agence / Super-admin](#admin-dagence-super-admin) — 102 fonctionnalités
7. [👥 Tous les utilisateurs authentifiés](#tous-les-utilisateurs-authentifiés) — 65 fonctionnalités

---

## 👤 Visiteur anonyme (pas encore de compte)

### §1.2 Recherche & découverte publique

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.2 | Page d'accueil (biens en vedette, derniers ajouts) |
| P0 | §1.2 | Recherche plein-texte sur les biens |
| P0 | §1.2 | Filtres de base (ville, type, prix, chambres, surface, transaction) |
| P0 | §1.2 | Fiche bien publique (galerie, détails, formulaire de contact — qui nomme le destinataire pour ce qu'il est, agent ou propriétaire, TCK-573 ; téléphone ou e-mail, mention d'information sur les données, accusé de réception, TCK-590) |
| P1 | §1.2 | Annuaire « Agents & propriétaires » (`/agents`) et fiche de personne (`/agents/<slug>`) : chacun est présenté pour ce qu'il est — « Agent immobilier » pour un professionnel en exercice, « Propriétaire » pour tout autre publieur (titre, métadonnées, données structurées `Person`, contact) ; l'API l'expose en `public_role` (TCK-573) |
| P0 | §1.2 | Tri des résultats (prix, récence, pertinence) |
| P1 | §1.2 | Filtres avancés (amenités, disponibilité, étage, meublé, état du bien) |
| P1 | §1.2 | Recherche « autour de moi » : rayon en kilomètres autour d'un point, plafonné à 500 km, appliqué à la liste comme à la carte |
| P1 | §1.2 | Tri des résultats par distance au point de recherche |
| P1 | §1.2 | Partage d'un bien (lien, réseaux sociaux) — texte traduit (type, prix, quartier) et paramètres de source ; les demandes reçues par un lien partagé sont attribuées à leur source (TCK-590) |
| P1 | §1.2 | Contact WhatsApp et appel depuis la fiche : message prérempli dans la langue du visiteur ; boutons absents quand le contact n'a pas de numéro (TCK-590) |
| P1 | §1.2 | Coût d'entrée affiché sur la fiche et dans le comparateur (« Total à l'entrée ») (TCK-598) |
| P1 | §1.2 | Signaux de confiance sur la fiche : téléphone du contact vérifié, agence vérifiée, conseil de prudence (« ne versez jamais d'argent avant la visite ») (TCK-598) |
| P1 | §1.2 | Visite virtuelle ou vidéo consultable sur la fiche (TCK-598) |
| P1 | §1.2 | Signaler une annonce, sans compte (motifs, dont l'arnaque) ; un signalement d'utilisateur connecté est rattaché à son compte et lui vaut un retour sur l'issue (TCK-597) |
| P2 | §1.2 | Bien loué, vendu ou retiré : page « plus disponible » non indexée, avec biens similaires et recherche du quartier (TCK-598) |
| P2 | §1.2 | Pages de recherche indexables par ville et par quartier, présentes au sitemap (TCK-598) |
| P2 | §1.2 | Site installable (manifeste) et favoris locaux relisibles hors connexion (TCK-598) |
| P2 | §1.2 | Alerte de recherche sans compte, par e-mail ou WhatsApp : active après double confirmation (lien ou code), désinscription en un clic, rattachable plus tard au compte de même e-mail ou téléphone vérifié (TCK-599) |

### §1.3 Réservations courte durée & visites

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.3 | Demande de visite sans compte (nom et téléphone), routée vers le contact principal du bien ; le visiteur est prévenu de la confirmation par e-mail ou SMS (TCK-590) |
| P2 | §1.3 | Créneaux de visite proposés hors des visites déjà confirmées, saisis et affichés en heure de Dakar (TCK-590) |

### §1.8 Maintenance & interventions

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P3 | §1.8 | Annuaire public des prestataires, sur consentement du prestataire, contact via la plateforme |

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
| P1 | §2.1 | L'inscription garde l'intention du visiteur (bien, dates, action) jusqu'au retour sur la fiche, quel que soit le chemin (connexion, inscription, téléphone, OAuth) (TCK-589) |
| P0 | §2.1 | Onboarding wizard Customer post-signup — welcome modale (3 slides skippables) + complétion différée du profil minimal (téléphone, ville, type de recherche) au moment de la première action sensible (favoris / réservation / contact) |

---

## 🏠 Locataire / Acheteur (Customer)

### §1.2 Recherche & découverte publique

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.2 | Page d'accueil (biens en vedette, derniers ajouts) |
| P0 | §1.2 | Recherche plein-texte sur les biens |
| P0 | §1.2 | Filtres de base (ville, type, prix, chambres, surface, transaction) |
| P0 | §1.2 | Fiche bien publique (galerie, détails, formulaire de contact — qui nomme le destinataire pour ce qu'il est, agent ou propriétaire, TCK-573 ; téléphone ou e-mail, mention d'information sur les données, accusé de réception, TCK-590) |
| P1 | §1.2 | Annuaire « Agents & propriétaires » (`/agents`) et fiche de personne (`/agents/<slug>`) : chacun est présenté pour ce qu'il est — « Agent immobilier » pour un professionnel en exercice, « Propriétaire » pour tout autre publieur (titre, métadonnées, données structurées `Person`, contact) ; l'API l'expose en `public_role` (TCK-573) |
| P0 | §1.2 | Tri des résultats (prix, récence, pertinence) |
| P1 | §1.2 | Filtres avancés (amenités, disponibilité, étage, meublé, état du bien) |
| P1 | §1.2 | Recherche « autour de moi » : rayon en kilomètres autour d'un point, plafonné à 500 km, appliqué à la liste comme à la carte |
| P1 | §1.2 | Tri des résultats par distance au point de recherche |
| P1 | §1.2 | Recherche par carte interactive |
| P1 | §1.2 | Favoris (ajout / retrait / liste personnelle) |
| P1 | §1.2 | Recherches sauvegardées avec alerte réglable par recherche (coupée / quotidienne / hebdomadaire), dans la langue du destinataire, listant les biens avec photo, prix, quartier et lien, et un lien de désinscription en un clic (TCK-599) |
| P1 | §1.2 | Partage d'un bien (lien, réseaux sociaux) — texte traduit (type, prix, quartier) et paramètres de source ; les demandes reçues par un lien partagé sont attribuées à leur source (TCK-590) |
| P1 | §1.2 | Contact WhatsApp et appel depuis la fiche : message prérempli dans la langue du visiteur ; boutons absents quand le contact n'a pas de numéro (TCK-590) |
| P1 | §1.2 | Coût d'entrée affiché sur la fiche et dans le comparateur (« Total à l'entrée ») (TCK-598) |
| P1 | §1.2 | Signaux de confiance sur la fiche : téléphone du contact vérifié, agence vérifiée, conseil de prudence (« ne versez jamais d'argent avant la visite ») (TCK-598) |
| P1 | §1.2 | Visite virtuelle ou vidéo consultable sur la fiche (TCK-598) |
| P1 | §1.2 | Signaler une annonce, sans compte (motifs, dont l'arnaque) ; un signalement d'utilisateur connecté est rattaché à son compte et lui vaut un retour sur l'issue (TCK-597) |
| P2 | §1.2 | Comparateur de biens côte à côte — sur mobile, tous les biens tiennent dans la largeur, une rangée de titres numérotés reste collée pendant la lecture et le premier critère est visible dès le premier écran ; « Vider » s'annule sans écraser un bien ajouté entre-temps (TCK-561, TCK-577) |
| P2 | §1.2 | Biens similaires / suggestions personnalisées |
| P2 | §1.2 | Historique local des biens consultés (stockage navigateur) |
| P2 | §1.2 | Bien loué, vendu ou retiré : page « plus disponible » non indexée, avec biens similaires et recherche du quartier (TCK-598) |
| P2 | §1.2 | Pages de recherche indexables par ville et par quartier, présentes au sitemap (TCK-598) |
| P2 | §1.2 | Site installable (manifeste) et favoris locaux relisibles hors connexion (TCK-598) |
| P2 | §1.2 | Favoris : pagination, note personnelle, état « plus disponible » (loué, vendu, retiré) sans prix ni localisation d'un bien redevenu non public (TCK-599) |
| P2 | §1.2 | Alerte sur un favori : baisse de prix, ou bien loué / vendu / retiré — groupée par jour, désactivable par événement (TCK-599) |
| P3 | §1.2 | Recherche vocale / en langage naturel |

### §1.3 Réservations courte durée & visites

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.3 | Demander une réservation (dates, montant, caution) |
| P1 | §1.3 | Paiement d'acompte et solde — **acompte = 30 % du total** (estimation affichée dans le tunnel de réservation, règle stable). Quand le besoin de varier par bien/contrat apparaîtra, déplacer le calcul backend via un endpoint `GET /api/bookings/quote`. |
| P1 | §1.3 | Consultation des paiements liés à la réservation |
| P1 | §1.3 | Télécharger le reçu PDF d'un acompte ou d'un solde de réservation payé (TCK-593) |
| P1 | §1.3 | Annuler sa propre réservation : bailleur et agent du bien prévenus ; un acompte déjà payé est signalé « remboursement à traiter » à l'agence, et le client voit le remboursement en cours (TCK-596) |
| P2 | §1.3 | Expiration automatique des demandes non traitées — au seuil de l'agence (`booking_pending_expiry_hours`, 1 à 168 h, 0 = désactivé) ou à l'échéance propre de la demande, la première échue ; l'API l'expose (`response_deadline`) et la confirmation l'affiche, sans promettre de délai quand il n'y en a pas (TCK-575) |
| P2 | §1.3 | Planification de visites : en personne, virtuelle, en autonomie ou hybride ; agent accompagnateur, durée estimée, feedback post-visite |
| P2 | §1.3 | Rappels automatiques avant visite — y compris au visiteur sans compte (téléphone de la demande), 24 h et 1 h avant (TCK-588) |
| P2 | §1.3 | Créneaux de visite proposés hors des visites déjà confirmées, saisis et affichés en heure de Dakar (TCK-590) |
| P2 | §1.3 | Replanification d'une visite par le client, soumise à nouvelle confirmation de l'agent (TCK-590) |
| P3 | §1.3 | Annulation avec remboursement partiel automatisé |

### §1.4 Location longue durée (baux)

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.4 | Enregistrer un paiement mensuel |
| P1 | §1.4 | Relances de loyer automatiques (J-3, J+1, J+7) au locataire, y compris sans compte (téléphone du client), sur WhatsApp puis SMS en secours, dans sa langue (TCK-588) |
| P1 | §1.4 | Payer en ligne une échéance de loyer (Wave / Orange Money) pour le montant réellement dû : restant du loyer + pénalité de retard appliquée ; le montant est figé à l'ouverture du paiement ; une échéance payée ou remboursée ne peut pas être repayée (TCK-593) |
| P1 | §1.4 | Télécharger le contrat de bail en PDF depuis le détail du bail (TCK-593) |
| P2 | §1.4 | Révision annuelle du loyer (indice ou accord amiable) journalisée via le journal d'activité |
| P2 | §1.4 | Télécharger la quittance d'une échéance de loyer payée — jamais pour une échéance non acquittée (TCK-593) |
| P2 | §1.4 | Donner congé depuis son espace locataire : délai de préavis et pénalité affichés avant l'envoi, retrait possible tant que la fenêtre d'annulation est ouverte ; la clôture reste au gestionnaire (TCK-596) |
| P2 | §1.4 | Signature du bail par code à usage unique (SMS sur numéro vérifié, sinon e-mail) : empreinte du contrat figé, horodatage et IP de chaque partie ; activation à la seconde signature (TCK-596 — remplace la ligne P3 « Signature électronique du bail ») |
| P3 | §1.4 | Espace locataire dédié (quittances, factures, maintenance) |
| P1 | §1.4 | Onboarding résident à la signature du bail : notification "Bienvenue chez vous", welcome modale "Espace résident", checklist d'entrée (état des lieux, premier paiement, accès aux documents), suivi de complétion par un `TenantOnboardingChecklist` |

### §1.5 Transactions & paiements

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.5 | Reversement au bailleur calculé depuis les loyers et réservations encaissés de la période (loyer, charges, pénalités, régularisations ; jamais la caution), commission du bail sinon de l'agence, frais de travaux refacturés déduits ; le brut n'est pas saisi et un paiement n'est reversé qu'une fois (TCK-594) |
| P1 | §1.5 | Relevé de gérance mensuel (PDF / CSV) par bien et consolidé, et attestation annuelle de revenus locatifs, envoyés au bailleur en début de mois (TCK-594) |
| P2 | §1.5 | Lien de paiement en ligne (Wave / Orange Money) par échéance de loyer, utilisable sans compte : jeton expirant et révocable envoyé au locataire, quittance remise après paiement (TCK-602) |
| P2 | §1.5 | Moyens de versement du bénéficiaire (Wave, Orange Money, Free Money, virement), vérifiés par l'agence ; décaissement tracé par une référence de transaction obligatoire ; avis de versement effectué / échoué au bénéficiaire (TCK-594) |

### §1.7 Communication & messagerie

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.7 | Conversation privée 1↔1 entre client et agent / bailleur |
| P1 | §1.7 | Envoyer un message texte avec pièces jointes |
| P1 | §1.7 | Liste des conversations avec statut non lu — messages d'un autre postérieurs à la dernière lecture, hors avis système ; ouvrir un fil le marque lu (TCK-579) |
| P1 | §1.7 | Notification en temps réel (in-app + email) |
| P2 | §1.7 | Accusés de lecture individuels (si > 5 participants) |
| P2 | §1.7 | Recherche dans l'historique des messages |
| P2 | §1.7 | Fil de discussion automatique par intervention, avec un message système à chaque étape (TCK-592) |
| P2 | §1.7 | Notes vocales dans la messagerie (≤ 60 s) (TCK-592) |
| P3 | §1.7 | Appels audio / vidéo intégrés |
| P3 | §1.7 | Traduction automatique FR ↔ EN ↔ WO |

### §1.8 Maintenance & interventions

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.8 | Signaler un problème avec photos et description |
| P1 | §1.8 | Consulter l'historique des interventions par bien |
| P1 | §1.8 | Être notifié de chaque étape de sa demande (prise en charge, assignation, date prévue, fin) (TCK-592) |
| P1 | §1.8 | Confirmer ou contester la résolution ; clôture automatique sans réponse après 7 jours — le prestataire ne clôt pas (TCK-592) |
| P2 | §1.8 | Noter le prestataire après une intervention terminée (1 à 5 + commentaire) ; note agrégée visible des agences dans le carnet (TCK-597) |

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
| P1 | §2.1 | Données bancaires et d'identité des profils (RIB, NINEA, n° de pièce) chiffrées au repos et masquées à l'affichage ; valeur complète réservée à l'admin de l'agence, consultation journalisée (TCK-601) |
| P0 | §2.1 | Onboarding wizard Customer post-signup — welcome modale (3 slides skippables) + complétion différée du profil minimal (téléphone, ville, type de recherche) au moment de la première action sensible (favoris / réservation / contact) |

### §2.5 Reporting & tableaux de bord

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.5 | Dashboard locataire (prochaines échéances, documents) |
| P2 | §2.5 | Accueil client sans dossier : prochaines visites, réservations, échéances, interventions ouvertes, biens de sa ville selon son intention de recherche (TCK-595) |

---

## 🏢 Bailleur / Propriétaire (owner)

### §1.1 Gestion des biens

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.1 | Créer un bien (type, transaction vente/location, caractéristiques) |
| P1 | §1.1 | Renseigner le coût d'entrée d'une location mensuelle : mois de caution, mois d'avance, frais d'agence en mois de loyer, charges mensuelles (TCK-598) |
| P1 | §1.1 | Historique de prix automatique à chaque changement |
| P1 | §1.1 | Bailleur rattaché à une agence : proposer un bien à son agence — brouillon privé, publié par le personnel de l'agence, qui en est notifié (TCK-587) |
| P1 | §1.1 | Gérer une hiérarchie de biens (immeuble → étages → lots) |
| P1 | §1.1 | Renseigner le type de titre foncier (bail, titre foncier, délibération, autre) |
| P1 | §1.1 | Renseigner l'état d'un bien bâti (sur plan, neuf, rénové, bon état, à rénover) ; « neuf » et « sur plan » sont signalés par un badge sur l'annonce publique |
| P1 | §1.1 | Saisie des montants lisible : chiffres groupés selon la langue de l'écran, décimales selon la devise (aucune en franc CFA) ; la valeur envoyée reste un nombre (TCK-564, TCK-574) |
| P3 | §1.1 | Marquer un bien comme nécessitant un suivi administratif particulier |

### §1.3 Réservations courte durée & visites

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.3 | Accepter, refuser ou annuler une demande |
| P1 | §1.3 | Paiement d'acompte et solde — **acompte = 30 % du total** (estimation affichée dans le tunnel de réservation, règle stable). Quand le besoin de varier par bien/contrat apparaîtra, déplacer le calcul backend via un endpoint `GET /api/bookings/quote`. |
| P1 | §1.3 | Vue calendrier agrégée à partir des réservations confirmées et des visites planifiées (acteurs élargis par TCK-591) |
| P1 | §1.3 | Consultation des paiements liés à la réservation |
| P2 | §1.3 | Bloquer des dates d'un bien en courte durée (usage personnel, travaux) : aucune demande ni confirmation possible sur ces dates, grisées dans le tunnel public (TCK-596) |
| P2 | §1.3 | Synchroniser le calendrier d'un bien avec Airbnb / Booking.com : export iCal par bien (lien secret révocable) et import d'URL iCal externes rafraîchi périodiquement, conflits signalés (TCK-596) |

### §1.4 Location longue durée (baux)

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.4 | Créer un bail (locataire, bailleur, durée, loyer, caution) |
| P1 | §1.4 | Générer l'échéancier de loyers mensuels |
| P1 | §1.4 | Enregistrer un paiement mensuel |
| P1 | §1.4 | Alerte d'impayé au bailleur (J+1, J+7) et récapitulatif quotidien unique des impayés à l'agent (TCK-588) |
| P1 | §1.4 | Appliquer automatiquement des pénalités de retard sur les paiements en retard |
| P1 | §1.4 | Télécharger le contrat de bail en PDF depuis le détail du bail (TCK-593) |
| P1 | §1.4 | Consultation de l'historique complet d'un bail |
| P2 | §1.4 | Renouveler un bail ou créer un avenant (loyer, durée, conditions) avec traçabilité du bail parent |
| P2 | §1.4 | Résiliation anticipée avec calcul des pénalités |
| P2 | §1.4 | Révision annuelle du loyer (indice ou accord amiable) journalisée via le journal d'activité |
| P2 | §1.4 | Télécharger la quittance d'une échéance de loyer payée — jamais pour une échéance non acquittée (TCK-593) |
| P2 | §1.4 | Signature du bail par code à usage unique (SMS sur numéro vérifié, sinon e-mail) : empreinte du contrat figé, horodatage et IP de chaque partie ; activation à la seconde signature (TCK-596 — remplace la ligne P3 « Signature électronique du bail ») |

### §1.5 Transactions & paiements

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.5 | Générer une facture à un Customer destinataire |
| P1 | §1.5 | Facture opposable : numérotation chronologique continue par agence et par an, attribuée à l'émission ; mentions légales de l'agence (raison sociale, NINEA, RCCM, adresse) ; TVA par défaut de l'agence ; une facture émise ne s'annule que par un avoir (TCK-594) |
| P1 | §1.5 | Reversement au bailleur après commission (Payout) |
| P1 | §1.5 | Reversement au bailleur calculé depuis les loyers et réservations encaissés de la période (loyer, charges, pénalités, régularisations ; jamais la caution), commission du bail sinon de l'agence, frais de travaux refacturés déduits ; le brut n'est pas saisi et un paiement n'est reversé qu'une fois (TCK-594) |
| P1 | §1.5 | Relevé de gérance mensuel (PDF / CSV) par bien et consolidé, et attestation annuelle de revenus locatifs, envoyés au bailleur en début de mois (TCK-594) |
| P1 | §1.5 | Double validation des sorties d'argent : la même personne ne tient jamais deux gestes consécutifs (préparer, approuver, marquer payé) ni n'approuve un versement dont elle est bénéficiaire ; au-delà d'un seuil réglé par l'agence pour les reversements agence, toujours pour les reversements plateforme (TCK-594) |
| P2 | §1.5 | Lien de paiement en ligne (Wave / Orange Money) par échéance de loyer, utilisable sans compte : jeton expirant et révocable envoyé au locataire, quittance remise après paiement (TCK-602) |
| P2 | §1.5 | Moyens de versement du bénéficiaire (Wave, Orange Money, Free Money, virement), vérifiés par l'agence ; décaissement tracé par une référence de transaction obligatoire ; avis de versement effectué / échoué au bénéficiaire (TCK-594) |

### §1.7 Communication & messagerie

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.7 | Conversation privée 1↔1 entre client et agent / bailleur |
| P1 | §1.7 | Envoyer un message texte avec pièces jointes |
| P1 | §1.7 | Liste des conversations avec statut non lu — messages d'un autre postérieurs à la dernière lecture, hors avis système ; ouvrir un fil le marque lu (TCK-579) |
| P1 | §1.7 | Notification en temps réel (in-app + email) |
| P2 | §1.7 | Conversations de groupe (multi-participants) — participants choisis par leur nom ; bien et bail rattachés par recherche (titre, référence), dans le périmètre visible de l'acteur ; un bail doit concerner le bien choisi (TCK-565, TCK-576) |
| P2 | §1.7 | Accusés de lecture individuels (si > 5 participants) |
| P2 | §1.7 | Recherche dans l'historique des messages |
| P2 | §1.7 | Notes vocales dans la messagerie (≤ 60 s) (TCK-592) |
| P3 | §1.7 | Appels audio / vidéo intégrés |
| P3 | §1.7 | Traduction automatique FR ↔ EN ↔ WO |

### §1.8 Maintenance & interventions

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.8 | Consulter l'historique des interventions par bien |
| P2 | §1.8 | Demande de devis et validation avant travaux — le donneur d'ordre demande, approuve ou refuse ; le prestataire assigné est seul à soumettre le devis |
| P2 | §1.8 | Plafond de travaux sans accord : au-delà, le bailleur approuve ou refuse le devis ; le bailleur est averti de tout devis sur son bien (TCK-592) |
| P2 | §1.8 | Noter le prestataire après une intervention terminée (1 à 5 + commentaire) ; note agrégée visible des agences dans le carnet (TCK-597) |
| P3 | §1.8 | Facturation directe prestataire → agence : à la fin d'une intervention, facture du prestataire générée (devis approuvé ou coût réel), validée par l'agence, payée par mobile money et imputable au reversement du bailleur (TCK-594) |
| P3 | §1.8 | Annuaire public des prestataires, sur consentement du prestataire, contact via la plateforme |

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
| P2 | §1.11 | Boîte des avis reçus (sur ses biens, sur soi), filtrée par bien et par réponse, et notification d'un nouvel avis (TCK-597) |
| P3 | §1.11 | Badges de réputation |

### §2.1 Authentification & comptes

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.1 | 2FA exigée pour le personnel de l'agence sur les opérations d'argent, d'intégrations, de rôles et d'équipe ; réglage d'agence « 2FA obligatoire pour toute l'équipe » ; statut 2FA visible dans la liste de l'équipe (TCK-589) |
| P1 | §2.1 | Wizard onboarding Owner post-acceptation invitation — vérification téléphone OTP (obligatoire), KYC documentaire (CNI/passeport, RIB, NINEA, statut particulier/société) en `pending_review` non bloquant, tour produit 3 slides, vue "biens déjà associés" si pré-rattachement |
| P1 | §2.1 | Carte « Mise en service » de l'agence sur `/admin` : étapes calculées par l'API (KYC vérifié, logo, taux de commission, intégration de paiement active, premier membre, premier bien publié, 2FA), chacune avec son lien ; disparaît une fois complète (TCK-589) |

### §2.2 Rôles & permissions

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.2 | Cloisonnement des bailleurs d'une même agence : un bailleur ne lit et ne modifie que ses biens, baux, loyers, réservations, versements, factures et documents — jamais ceux d'un autre bailleur de l'agence ; seul le personnel (agent, admin d'agence) a le périmètre de l'agence (TCK-587) |

### §2.5 Reporting & tableaux de bord

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.5 | Dashboard bailleur (portefeuille, cashflow, occupation) |
| P1 | §2.5 | Dashboard hôte : le host solo (agence `individual`) atterrit sur le dashboard bailleur, enrichi des réservations, visites et avis à traiter — jamais sur le dashboard agent ni agence (TCK-595) |
| P2 | §2.5 | Occupation mesurée par chevauchement de dates (longue durée : jours-biens ; courte durée : nuitées) sur les biens feuilles en location ; encaissé net des cautions, net reversé (TCK-595) |
| P2 | §2.5 | Balance âgée des impayés (1-30 / 31-60 / 61-90 / > 90 j) par locataire ou bailleur, et cautions détenues (TCK-595) |

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
| P1 | §1.1 | Uploader plans, vidéos et visites virtuelles 360° — la visite virtuelle ou vidéo est un **lien https** vers un hébergeur autorisé ; le téléversement de fichiers vidéo reste à décider (TCK-598) |
| P1 | §1.1 | Renseigner le coût d'entrée d'une location mensuelle : mois de caution, mois d'avance, frais d'agence en mois de loyer, charges mensuelles (TCK-598) |
| P1 | §1.1 | Associer des tags / amenités (piscine, climatisation, meublé…) |
| P1 | §1.1 | Historique de prix automatique à chaque changement |
| P1 | §1.1 | Ajouter des collaborateurs au bien avec part de commission explicite et permissions granulaires — la part de commission et le rôle ne sont jamais exposés sur le site public (TCK-598) |
| P1 | §1.1 | Gérer une hiérarchie de biens (immeuble → étages → lots) |
| P1 | §1.1 | Renseigner le type de titre foncier (bail, titre foncier, délibération, autre) |
| P1 | §1.1 | Renseigner l'état d'un bien bâti (sur plan, neuf, rénové, bon état, à rénover) ; « neuf » et « sur plan » sont signalés par un badge sur l'annonce publique |
| P1 | §1.1 | Compteurs de vues et de favoris |
| P1 | §1.1 | Saisie des montants lisible : chiffres groupés selon la langue de l'écran, décimales selon la devise (aucune en franc CFA) ; la valeur envoyée reste un nombre (TCK-564, TCK-574) |
| P2 | §1.1 | Dupliquer un bien (modèle / template) |
| P2 | §1.1 | Archivage en lot |
| P2 | §1.1 | Dépublier et réattribuer en lot, avec un bilan succès / refus par bien (TCK-591) |
| P3 | §1.1 | Import CSV / API externe (MLS, syndication) |
| P3 | §1.1 | Estimation automatique de prix (IA / comparables) |

### §1.3 Réservations courte durée & visites

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.3 | Accepter, refuser ou annuler une demande |
| P1 | §1.3 | Vue calendrier agrégée à partir des réservations confirmées et des visites planifiées (acteurs élargis par TCK-591) |
| P2 | §1.3 | Planification de visites : en personne, virtuelle, en autonomie ou hybride ; agent accompagnateur, durée estimée, feedback post-visite |
| P2 | §1.3 | Rappels automatiques avant visite — y compris au visiteur sans compte (téléphone de la demande), 24 h et 1 h avant (TCK-588) |
| P2 | §1.3 | Demande de visite sans compte (nom et téléphone), routée vers le contact principal du bien ; le visiteur est prévenu de la confirmation par e-mail ou SMS (TCK-590) |
| P2 | §1.3 | Visites non attribuées visibles de l'équipe de l'agence, prise en charge en un geste (TCK-590) |
| P2 | §1.3 | Planifier une visite pour un client (avec ou sans compte) depuis la console — précise QUI planifie dans la ligne « Planification de visites » (TCK-590) |
| P2 | §1.3 | Calendrier : tâches, échéances de bail (fin, renouvellement) et interventions planifiées ; filtre « mes rendez-vous » (TCK-591) |
| P2 | §1.3 | Bloquer des dates d'un bien en courte durée (usage personnel, travaux) : aucune demande ni confirmation possible sur ces dates, grisées dans le tunnel public (TCK-596) |
| P2 | §1.3 | Synchroniser le calendrier d'un bien avec Airbnb / Booking.com : export iCal par bien (lien secret révocable) et import d'URL iCal externes rafraîchi périodiquement, conflits signalés (TCK-596) |
| P3 | §1.3 | Abonnement personnel au calendrier (iCalendar) par lien secret révocable (TCK-591) |

### §1.4 Location longue durée (baux)

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.4 | Créer un bail (locataire, bailleur, durée, loyer, caution) |
| P1 | §1.4 | Ajouter un ou plusieurs garants avec documents joints |
| P1 | §1.4 | Générer l'échéancier de loyers mensuels |
| P1 | §1.4 | Relances de loyer automatiques (J-3, J+1, J+7) au locataire, y compris sans compte (téléphone du client), sur WhatsApp puis SMS en secours, dans sa langue (TCK-588) |
| P1 | §1.4 | Alerte d'impayé au bailleur (J+1, J+7) et récapitulatif quotidien unique des impayés à l'agent (TCK-588) |
| P1 | §1.4 | Appliquer automatiquement des pénalités de retard sur les paiements en retard |
| P1 | §1.4 | Remboursement de la caution en fin de bail |
| P1 | §1.4 | Consultation de l'historique complet d'un bail |
| P2 | §1.4 | Renouveler un bail ou créer un avenant (loyer, durée, conditions) avec traçabilité du bail parent |
| P2 | §1.4 | Résiliation anticipée avec calcul des pénalités |
| P2 | §1.4 | Signature du bail par code à usage unique (SMS sur numéro vérifié, sinon e-mail) : empreinte du contrat figé, horodatage et IP de chaque partie ; activation à la seconde signature (TCK-596 — remplace la ligne P3 « Signature électronique du bail ») |
| P1 | §1.4 | Onboarding résident à la signature du bail : notification "Bienvenue chez vous", welcome modale "Espace résident", checklist d'entrée (état des lieux, premier paiement, accès aux documents), suivi de complétion par un `TenantOnboardingChecklist` |

### §1.5 Transactions & paiements

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.5 | Lien de paiement en ligne (Wave / Orange Money) par échéance de loyer, utilisable sans compte : jeton expirant et révocable envoyé au locataire, quittance remise après paiement (TCK-602) |
| P3 | §1.5 | Relevé des commissions par agent, avec statut « payée à l'agent » (TCK-595) |

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
| P1 | §1.6 | Boîte des demandes de contact (leads) de l'agence : message complet et coordonnées, prise en charge, attribution à un agent, conversion en client (TCK-590) |
| P2 | §1.6 | Pipeline de prospects (stades, conversion) — changement d'étape sans glisser-déposer (mobile, clavier) (TCK-591) |
| P2 | §1.6 | Tâches et rappels attachés à un client ou à un bien, et page « Mes tâches » (en retard / aujourd'hui / à venir) (TCK-591) |
| P2 | §1.6 | Segmentation et tags clients |
| P2 | §1.6 | Téléphone du client normalisé (E.164, +221 par défaut) et signalement d'un doublon (téléphone ou e-mail) dans l'agence avant création (TCK-591) |
| P2 | §1.6 | Joindre un client en un geste depuis la console : appel, ou WhatsApp avec message prérempli (TCK-591) |
| P2 | §1.6 | Critères de recherche structurés du prospect (contrat, budget, types, villes / quartiers, chambres) et rapprochement biens ↔ prospects de l'agence, avec récapitulatif quotidien au référent (TCK-591) |
| P2 | §1.6 | Fiche client unique : notes, tâches, activité, visites, réservations et baux du client (TCK-591) |
| P3 | §1.6 | Campagnes email / SMS ciblées |

### §1.7 Communication & messagerie

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.7 | Conversation privée 1↔1 entre client et agent / bailleur |
| P2 | §1.7 | Conversations de groupe (multi-participants) — participants choisis par leur nom ; bien et bail rattachés par recherche (titre, référence), dans le périmètre visible de l'acteur ; un bail doit concerner le bien choisi (TCK-565, TCK-576) |
| P2 | §1.7 | Fil de discussion automatique par intervention, avec un message système à chaque étape (TCK-592) |

### §1.8 Maintenance & interventions

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.8 | Assigner un prestataire (service provider) |
| P1 | §1.8 | Suivi des statuts (nouveau, en cours, résolu, annulé) |
| P1 | §1.8 | Ajouter photos et rapport après intervention |
| P1 | §1.8 | Confirmer ou contester la résolution ; clôture automatique sans réponse après 7 jours — le prestataire ne clôt pas (TCK-592) |
| P1 | §1.8 | Voir les photos du signalement, les photos avant / après et les pièces du devis (TCK-592) |
| P2 | §1.8 | Demande de devis et validation avant travaux — le donneur d'ordre demande, approuve ou refuse ; le prestataire assigné est seul à soumettre le devis |
| P2 | §1.8 | Devis structuré (lignes main-d'œuvre / fournitures, validité, durée), devise imposée, PDF (TCK-592) |
| P2 | §1.8 | Priorisation des demandes (urgent, normal, bas) |
| P2 | §1.8 | Noter le prestataire après une intervention terminée (1 à 5 + commentaire) ; note agrégée visible des agences dans le carnet (TCK-597) |
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
| P2 | §1.11 | Boîte des avis reçus (sur ses biens, sur soi), filtrée par bien et par réponse, et notification d'un nouvel avis (TCK-597) |
| P3 | §1.11 | Badges de réputation |

### §2.1 Authentification & comptes

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.1 | Wizard onboarding Agent post-acceptation invitation — vérification téléphone OTP, KYC (license_number, pièce d'identité, photo profil, spécialisation, zones d'intervention), affichage du périmètre de permissions choisi par l'admin inviteur, lien vers premier lead pré-assigné |

### §2.5 Reporting & tableaux de bord

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.5 | Dashboard agent (pipeline, commissions, tâches) — ses biens, ses clients, ses commissions ; bascule « agence » sous capacité (TCK-595) |

---

## 🔧 Prestataire de service (service provider)

### §1.3 Réservations courte durée & visites

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.3 | Ses interventions planifiées dans le calendrier — sous réserve de la décision de TCK-446 (TCK-591) |

### §1.5 Transactions & paiements

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.5 | Moyens de versement du bénéficiaire (Wave, Orange Money, Free Money, virement), vérifiés par l'agence ; décaissement tracé par une référence de transaction obligatoire ; avis de versement effectué / échoué au bénéficiaire (TCK-594) |

### §1.7 Communication & messagerie

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.7 | Fil de discussion automatique par intervention, avec un message système à chaque étape (TCK-592) |
| P2 | §1.7 | Notes vocales dans la messagerie (≤ 60 s) (TCK-592) |

### §1.8 Maintenance & interventions

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.8 | Suivi des statuts (nouveau, en cours, résolu, annulé) |
| P1 | §1.8 | Ajouter photos et rapport après intervention |
| P1 | §1.8 | Consulter ses interventions assignées : liste terrain triée par créneau, lieu et agence (delta de TCK-446, TCK-592) |
| P1 | §1.8 | Accepter ou refuser une intervention assignée ; un refus est motivé et la demande revient au donneur d'ordre (TCK-592) |
| P1 | §1.8 | Voir les photos du signalement, les photos avant / après et les pièces du devis (TCK-592) |
| P2 | §1.8 | Demande de devis et validation avant travaux — le donneur d'ordre demande, approuve ou refuse ; le prestataire assigné est seul à soumettre le devis |
| P2 | §1.8 | Devis structuré (lignes main-d'œuvre / fournitures, validité, durée), devise imposée, PDF (TCK-592) |
| P2 | §1.8 | Kit d'accès au logement (adresse, itinéraire, téléphone du locataire, consignes) pendant l'intervention acceptée (TCK-592) |
| P3 | §1.8 | Facturation directe prestataire → agence : à la fin d'une intervention, facture du prestataire générée (devis approuvé ou coût réel), validée par l'agence, payée par mobile money et imputable au reversement du bailleur (TCK-594) |

### §1.12 Agence & équipe

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.12 | Mettre en pause ou terminer une collaboration avec un prestataire (agence) ; quitter une agence (prestataire) (TCK-592) |
| P2 | §1.12 | Modifier son profil prestataire (métiers, zones, tarifs, disponibilités) après l'onboarding (TCK-592) |

### §2.1 Authentification & comptes

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.1 | Wizard onboarding Service Provider post-acceptation invitation — vérification téléphone OTP, KYC (pièce d'identité, métiers multi-select, zones, tarifs indicatifs, assurance RC pro optionnelle valorisée), disponibilités hebdomadaires, accès direct à la 1ère intervention si invitation déclenchée par une demande active. Multi-rattachement à plusieurs agences via plusieurs `ServiceProviderAgencyCollaboration` sans dupliquer le compte. |

---

## 🛡️ Admin d'agence / Super-admin

### §1.1 Gestion des biens

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.1 | Modération et validation avant publication |
| P2 | §1.1 | Une décision sur un signalement d'annonce agit sur l'annonce : masquer (dépubliée, désindexée, verrouillée jusqu'à levée par la plateforme), retirer (supprimée) ou classer sans suite (TCK-597) |
| P2 | §1.1 | Dépublier et réattribuer en lot, avec un bilan succès / refus par bien (TCK-591) |
| P3 | §1.1 | Marquer un bien comme nécessitant un suivi administratif particulier |
| P3 | §1.1 | Détection des annonces en double entre agences (photos identiques, même adresse, même surface et prix), versée à la file de modération (TCK-597) |

### §1.3 Réservations courte durée & visites

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.3 | Vue calendrier agrégée à partir des réservations confirmées et des visites planifiées (acteurs élargis par TCK-591) |
| P2 | §1.3 | Visites non attribuées visibles de l'équipe de l'agence, prise en charge en un geste (TCK-590) |
| P2 | §1.3 | Calendrier : tâches, échéances de bail (fin, renouvellement) et interventions planifiées ; filtre « mes rendez-vous » (TCK-591) |
| P3 | §1.3 | Abonnement personnel au calendrier (iCalendar) par lien secret révocable (TCK-591) |

### §1.5 Transactions & paiements

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.5 | Enregistrer un paiement (réservation ou bail) |
| P1 | §1.5 | Générer une facture à un Customer destinataire |
| P1 | §1.5 | Facture opposable : numérotation chronologique continue par agence et par an, attribuée à l'émission ; mentions légales de l'agence (raison sociale, NINEA, RCCM, adresse) ; TVA par défaut de l'agence ; une facture émise ne s'annule que par un avoir (TCK-594) |
| P1 | §1.5 | Double validation des sorties d'argent : la même personne ne tient jamais deux gestes consécutifs (préparer, approuver, marquer payé) ni n'approuve un versement dont elle est bénéficiaire ; au-delà d'un seuil réglé par l'agence pour les reversements agence, toujours pour les reversements plateforme (TCK-594) |
| P1 | §1.5 | Historique des paiements par entité (bien, bail, client) |
| P1 | §1.5 | Suivi des statuts (en attente, payé, remboursé, annulé) |
| P2 | §1.5 | Intégration d'une passerelle de paiement (Wave, Orange Money, Stripe) |
| P2 | §1.5 | Supervision des paiements (console plateforme) : paiements en échec, en retard et webhooks non appariés, par fournisseur et par agence (TCK-602) |
| P2 | §1.5 | Rapprochement bancaire semi-automatique |
| P2 | §1.5 | Importer un relevé Wave Business ou Orange Money (préréglage de colonnes choisi à l'import) et régler le mapping CSV de l'agence (TCK-593) |
| P2 | §1.5 | Rapprocher les débits d'un relevé avec les reversements (Payout) émis (TCK-593) |
| P2 | §1.5 | Relance automatique des factures en retard |
| P2 | §1.5 | Reversement plateforme → agence (commission plateforme retenue à la source, payout périodique agrégé) |
| P2 | §1.5 | Reversement plateforme refusé vers une agence non active ; une agence `standard` non vérifiée est bloquée à l'approbation (TCK-594) |
| P3 | §1.5 | Commissions automatiques par agent / collaborateur |
| P3 | §1.5 | Relevé des commissions par agent, avec statut « payée à l'agent » (TCK-595) |
| P3 | §1.5 | Comptabilité exportable (FEC, journaux) |

### §1.6 CRM & relation client

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §1.6 | Boîte des demandes de contact (leads) de l'agence : message complet et coordonnées, prise en charge, attribution à un agent, conversion en client (TCK-590) |

### §1.11 Avis & réputation

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §1.11 | Modération (masquer, supprimer) |
| P2 | §1.11 | L'admin d'agence modère les avis de ses biens et de ses agents, jamais ceux d'une autre agence ; les avis sur l'agence elle-même et sur un prestataire relèvent de la plateforme (TCK-597) |
| P3 | §1.11 | Détection automatique d'avis suspects |

### §1.12 Agence & équipe

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §1.12 | Créer et configurer une agence (nom, licence, contact, logo) |
| P0 | §1.12 | Ajouter et retirer des agents |
| P0 | §1.12 | Attribution de rôles aux membres |
| P0 | §1.12 | Suspendre / réactiver l'adhésion d'un membre (agent, bailleur, co-admin) à l'agence, sans toucher au compte ; le blocage d'un compte reste un geste super-admin ; l'administrateur principal ne peut être suspendu ; acte journalisé (TCK-587) |
| P1 | §1.12 | Statistiques globales d'agence (portefeuille, revenus) |
| P1 | §1.12 | Paramètres de commission par défaut |
| P1 | §1.12 | Dossier KYC documentaire de l'agence (RCCM, NINEA, pièce dirigeant) avec workflow vérification (pending → submitted → verified / rejected) |
| P1 | §1.12 | Upgrade `individual` → `standard` : l'admin de l'agence individuelle soumet une demande (`AgencyUpgradeRequest`) avec compléments légaux (RC, NINEA, RIB pro, statuts) ; un super-admin la review depuis la console ; à l'approbation, `Agency.kind` bascule vers `standard` et débloque les capacités restreintes (invitation collaborateurs internes, multi-admin, custom roles, etc.). Pas d'upgrade self-service direct, pas de rétrogradation `standard` → `individual`. |
| P1 | §1.12 | Passation du portefeuille d'un agent retiré (tâches, visites, interventions, collaborations, biens dont il est responsable, clients dont il est référent) vers un ou plusieurs repreneurs, en une opération journalisée (TCK-591) |
| P1 | §1.12 | Mettre en pause ou terminer une collaboration avec un prestataire (agence) ; quitter une agence (prestataire) (TCK-592) |
| P1 | §1.12 | Validité des pièces KYC d'agence : date d'expiration de la pièce du dirigeant, relances J-30 / J-7, retour du dossier en attente à l'échéance ; contrôle de forme du NINEA et du RCCM ; signalement au super-admin d'un NINEA ou d'un RIB professionnel déjà porté par une autre agence (TCK-601) |
| P2 | §1.12 | Plans d'abonnement et quotas par agence (catalogue, période d'essai, limites) |
| P3 | §1.12 | Gestion multi-branches / sous-agences |
| P3 | §1.12 | Absence datée d'un agent avec remplaçant désigné : les assignations nouvelles sont routées vers lui (TCK-591 — précise « Gestion des congés / disponibilité des agents ») |
| P3 | §1.12 | Marketplace inter-agences |

### §2.1 Authentification & comptes

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.1 | 2FA TOTP exigée en continu pour tout super-admin : la console refuse un compte sans 2FA active ; la 2FA d'un super-admin ne se désactive pas, elle se renouvelle ; une réinitialisation par le support impose le réenrôlement à la connexion suivante (TCK-589) |
| P1 | §2.1 | 2FA exigée pour le personnel de l'agence sur les opérations d'argent, d'intégrations, de rôles et d'équipe ; réglage d'agence « 2FA obligatoire pour toute l'équipe » ; statut 2FA visible dans la liste de l'équipe (TCK-589) |
| P1 | §2.1 | Données bancaires et d'identité des profils (RIB, NINEA, n° de pièce) chiffrées au repos et masquées à l'affichage ; valeur complète réservée à l'admin de l'agence, consultation journalisée (TCK-601) |
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
| P0 | §2.2 | Cloisonnement des bailleurs d'une même agence : un bailleur ne lit et ne modifie que ses biens, baux, loyers, réservations, versements, factures et documents — jamais ceux d'un autre bailleur de l'agence ; seul le personnel (agent, admin d'agence) a le périmètre de l'agence (TCK-587) |
| P1 | §2.2 | Éditeur de rôles personnalisés scopé par agence (réservé aux agences `standard`) — un « rôle personnalisé » est un ensemble de `Capability` nommé, porté par l'agence ; le mécanisme reste à concevoir, `Capability` étant défini en code ([ADR-0003](adr/0003-capacites-enum-code-defined.md)) |
| P1 | §2.2 | L'éditeur de rôles signale les capacités du catalogue qui ne sont encore jugées par aucun geste (« sans effet pour l'instant »), avec le ticket qui les branchera ; une capacité est soit jugée par au moins un geste, soit inscrite à l'inventaire des capacités sans lecteur, qui ne peut que décroître (TCK-587) |
| P2 | §2.2 | Délégation temporaire de permissions |
| P3 | §2.2 | Règles conditionnelles (policies dynamiques) |

### §2.3 Notifications

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P2 | §2.3 | Annonces in-app cross-tenant (broadcast) ciblées par rôle / agence / segment, avec dismissal côté utilisateur — le bandeau s'affiche dans le flux de la page, sous la barre du haut (site public comme consoles), jamais sous une barre fixe (TCK-572) |

### §2.5 Reporting & tableaux de bord

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.5 | Dashboard agence (biens, vues, revenus, impayés) — **agences `standard` uniquement** : c'est le « reporting cross-équipe » restreint en [§1.12](#112-agence--équipe), sous un autre nom (TCK-295) |
| P2 | §2.5 | Occupation mesurée par chevauchement de dates (longue durée : jours-biens ; courte durée : nuitées) sur les biens feuilles en location ; encaissé net des cautions, net reversé (TCK-595) |
| P2 | §2.5 | Performance de l'équipe par agent (baux / ventes signés, visites réalisées, prospects ajoutés, commissions) — agences `standard` uniquement (TCK-595) |
| P2 | §2.5 | Balance âgée des impayés (1-30 / 31-60 / 61-90 / > 90 j) par locataire ou bailleur, et cautions détenues (TCK-595) |
| P2 | §2.5 | Export CSV / Excel (paiements, baux, clients) — réservé aux détenteurs de `crm.export` (clients), `payments.export` (paiements), `reports.export` (baux, biens) ; chaque export est journalisé (entité, filtres, nombre de lignes) (TCK-587) |
| P2 | §2.5 | Exports reversements, factures, commissions, balance âgée, cautions (CSV / Excel) (TCK-595) |
| P2 | §2.5 | Métriques plateforme historisées chaque jour (flux encaissé, GMV, take rate, MRR hors essais) — strictement super_admin (TCK-595) |
| P2 | §2.5 | Export PDF (quittances, factures, rapports) |
| P2 | §2.5 | Graphiques temporels (revenus, occupation) |
| P2 | §2.5 | Reporting plateforme cross-tenant (croissance agences/users/listings, MRR/ARR, cohortes de rétention, funnel) — strictement super_admin |
| P3 | §2.5 | KPI personnalisables par agence — **disponibles aussi en agence `individual`** (arbitrage TCK-284, écrit en [§1.12](#112-agence--équipe)) |
| P3 | §2.5 | Alertes sur seuils (taux d'impayés, vacance) — **disponibles aussi en agence `individual`** (arbitrage TCK-284, écrit en [§1.12](#112-agence--équipe)) |

### §2.6 Audit & traçabilité

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.6 | Journal d'activité automatique sur entités critiques |
| P1 | §2.6 | Consultation du journal par entité |
| P1 | §2.6 | Filtrage par utilisateur, date, action |
| P1 | §2.6 | Le journal d'une agence couvre tout ce qui touche ses objets (actes des admins, du système et des webhooks compris) et rien de ce qui touche une autre agence (TCK-601) |
| P1 | §2.6 | Journal des consultations de données personnelles depuis la console (fiche utilisateur, sessions, dossier et pièces KYC, valeurs bancaires) (TCK-601) |
| P2 | §2.6 | Export de l'audit trail |
| P3 | §2.6 | Alertes sur actions sensibles |
| P3 | §2.6 | Alertes d'exploitation à seuil (pic d'échecs de jobs, file bloquée, santé dégradée), en plus des gestes sensibles (TCK-600) |

### §2.9 Administration & configuration

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.9 | Gestion des tags et amenités |
| P0 | §2.9 | Gestion des utilisateurs (activation, blocage) |
| P0 | §2.9 | Onboarding d'une agence par un super-admin (création + admin initial invité, hors auto-inscription) |
| P1 | §2.9 | Gestion des enums métier (types de biens, statuts) |
| P1 | §2.9 | Configuration email (templates, expéditeur) |
| P1 | §2.9 | Suspension d'une agence par un super-admin, motif obligatoire : ses biens quittent la surface publique et l'index de recherche, son back-office passe en lecture seule (export permis), ses administrateurs sont prévenus ; la levée de la suspension restaure l'état (TCK-600) |
| P1 | §2.9 | Niveaux d'opérateur plateforme (`super_admin`, `support`, `viewer`) choisis à la cooptation, chacun borné à une liste de gestes ; retrait d'un opérateur avec motif (jetons révoqués, jamais le dernier `super_admin`) ; la cooptation est le seul chemin d'octroi (TCK-600) |
| P1 | §2.9 | Effacement d'un compte par un super-admin, par le parcours conforme de [§2.1](#21-authentification--comptes) (obligations ouvertes, délai de grâce, motif, utilisateur prévenu) (TCK-600) |
| P1 | §2.9 | Registre des demandes de droits (accès, rectification, opposition, effacement, portabilité) : réception, échéance légale, statut, preuve de réponse, export (loi n° 2008-12) (TCK-601) |
| P2 | §2.9 | Paramètres globaux de plateforme |
| P2 | §2.9 | Gestion des intégrations tierces (API keys) |
| P2 | §2.9 | Healthcheck plateforme et supervision des jobs en arrière-plan (file de queue, échecs, rejouer) — par sondes actives et datées (courriel, SMS, moteur de recherche, âge de la file, battement des workers, stockage des médias), statut agrégé exposé à une sonde externe (TCK-600) |
| P2 | §2.9 | Recherche globale de la console plateforme (e-mail, téléphone, référence, identifiant de transaction, NINEA), par la base, brouillons et biens privés compris (TCK-600) |
| P2 | §2.9 | File de modération : prise en charge exclusive avec expiration, motifs types traduits, décision groupée, âge de l'élément (TCK-597) |
| P2 | §2.9 | Journal des webhooks entrants (paiement, SMS, WhatsApp) écrit avant traitement — reçu / traité / rejeté / échoué —, corps chiffré, vue expurgée, rejeu idempotent, purge planifiée (TCK-602) |
| P3 | §2.9 | Mode maintenance programmé — l'avis parle la langue du visiteur, s'affiche sous la barre et se ferme pour la session ; il revient quand la fenêtre passe « en cours » ou que sa fin change (TCK-572) |
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
| P1 | §2.1 | Vérification du numéro de téléphone (SMS / OTP) — indicatif hors du champ ; l'API refuse partout (profil, envoi du code) un numéro qu'aucun SMS ne peut joindre : longueur sénégalaise fausse, `0` de préfixe national derrière l'indicatif (TCK-566, TCK-574) |
| P1 | §2.1 | OAuth Google (Socialite) |
| P1 | §2.1 | Authentification à deux facteurs (TOTP + codes de récupération) |
| P1 | §2.1 | Gestion des sessions actives |
| P1 | §2.1 | Sessions bornées : jeton à durée absolue et expiration par inactivité ; session super-admin courte (`platform.session_max_minutes`) et confirmation 2FA récente (step-up) avant une action sensible de la console (TCK-589) |
| P1 | §2.1 | Connexion et inscription par numéro de téléphone + code à usage unique reçu par SMS, sans mot de passe ; le compte est créé au premier code validé ; e-mail facultatif ; limiteurs et verrou par numéro — derrière un drapeau tant qu'aucun fournisseur SMS n'est actif, décision par ADR (TCK-589) |
| P2 | §2.1 | Suppression de compte avec anonymisation (RGPD) |
| P2 | §2.1 | Export des données personnelles (portabilité RGPD — déclenché par l'utilisateur) — une demande par 24 h ; statut suivi jusqu'à la fin de la préparation ; e-mail de fin dans la langue du compte (TCK-567, TCK-575) |
| P2 | §2.1 | OAuth Facebook / Apple |
| P3 | §2.1 | Magic link de connexion |
| P0 | §2.1 | Liste des profils du compte (`GET /api/me/profiles`) |
| P0 | §2.1 | Sélection du **profil actif** pour la session (`PATCH /api/me/active-profile`) |
| P0 | §2.1 | Bascule automatique du profil actif si l'utilisateur n'a qu'un seul profil |
| P0 | §2.1 | Switch de profil exposé en UI (header / menu compte) — change l'agence et les permissions sans nouvelle authentification |
| P1 | §2.1 | KYC distinct par profil (pièces d'identité, RIB, license, assurance — un dossier par profil) |
| P2 | §2.1 | Indication visuelle de "profil actif" sur toutes les vues authentifiées |
| P0 | §2.1 | Pattern d'invitation unifié — création par un inviteur autorisé, invitation par e-mail OU par SMS (lien court) quand l'invité n'a qu'un numéro (TCK-589), avec token signé (expiry 7j, rappel automatique J+2, renvoi self-service par l'inviteur, révocation possible avant acceptation) ; à l'acceptation, le profil cible passe en `active` et devient le profil actif |
| P1 | §2.1 | Composant wizard reprenable — chaque step sauvegardé en `draft`, bandeau persistant "Reprenez votre publication / votre onboarding" sur dashboard, reprise depuis le menu compte |
| P1 | §2.1 | Welcome modale générique réutilisable — composant 3 slides max, skippable, paramétrable par parcours (Customer, Host, Owner, Agent, AgencyAdmin, ServiceProvider, Tenant) |

### §2.3 Notifications

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P0 | §2.3 | Centre de notifications in-app (cloche + feed) |
| P0 | §2.3 | Marquer comme lu / non lu |
| P0 | §2.3 | Notifications email transactionnelles |
| P1 | §2.3 | Une notification est un code + des paramètres, rendue dans la langue du destinataire sur chaque canal (cloche, e-mail, SMS, WhatsApp) ; les gabarits édités par le super-admin s'appliquent (TCK-588) |
| P1 | §2.3 | Chaque notification ouvre son objet ; historique complet paginé, filtrable par non-lues (TCK-588) |
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
| P1 | §2.8 | Erreurs de l'API : un code stable + un message dans la langue négociée de la requête ; jamais le message brut d'une exception du framework (TCK-588) |
| P2 | §2.8 | Devise configurable par agence (XOF par défaut, EUR, USD) |
| P3 | §2.8 | Conversion multi-devises avec taux de change |
| P3 | §2.8 | Traduction automatique des contenus utilisateurs |

### §2.10 Pages légales publiques

| Prio | Domaine | Fonctionnalité |
|------|---------|----------------|
| P1 | §2.10 | Conditions générales d'utilisation — `/[locale]/legal/terms` |
| P1 | §2.10 | Politique de confidentialité — `/[locale]/legal/privacy` |
| P1 | §2.10 | Mentions légales — `/[locale]/legal/notice` |
| P1 | §2.10 | Toute case de consentement (inscription, assistant hôte, demande de réservation) renvoie à ces mêmes URL, et le pied de page public les porte |
| P1 | §2.10 | État « texte à fournir » : la page répond, titre du document compris, et annonce que le texte est en cours de rédaction — jamais un texte provisoire |

---

## Provenance

- Source : [`features.md`](./features.md) — **338** lignes de fonctionnalité lues,
  réparties en **446** placements (une ligne multi-acteurs compte une fois par acteur).
- Générateur : `docs/gen-features-by-actor.mjs`.
- Fraîcheur vérifiée en CI par `node docs/gen-features-by-actor.mjs --check`, qui échoue si
  cette sortie ne correspond plus à sa source.

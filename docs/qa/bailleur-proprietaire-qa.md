# QA — Bailleur / Propriétaire 🏢

**Acteur :** Propriétaire de biens confiés à une agence (rôle `owner`)
**Précondition :** Compte avec rôle `owner` rattaché à au moins une agence, avec au moins un bien dans le portefeuille (créer si besoin via TC-OWN-04 avant les autres tests).
**Environnement :** `http://localhost:3000` · `http://localhost:8002`
**Testeur :**
**Date :**
**Version :** dev branch

> Les fonctionnalités transverses (auth, profil, notifications, i18n, médias, recherche de base) sont couvertes dans [`utilisateurs-authentifies-qa.md`](./utilisateurs-authentifies-qa.md).
> Les actions partagées avec les agents (création de bail détaillée, échéancier, garants, médias avancés) peuvent être consultées dans [`agent-qa.md`](./agent-qa.md).

---

## Légende

| Statut | Signification |
|--------|---------------|
| ✅ Pass | Fonctionne comme attendu |
| ❌ Fail | Bug ou comportement incorrect |
| ⚠️ Partiel | Fonctionne avec réserves |
| 🔲 Non testé | Pas encore vérifié |

---

## Ordre de test optimisé

> Suivre cet ordre pour parcourir le quotidien d'un propriétaire en limitant les retours.

1. **Connexion** + **Dashboard owner** (`/app/overview/owner`)
2. **Sidebar / nav** — vérification des entrées par rôle
3. **Mes biens** (`/app/properties`) — liste, fiche, hiérarchie, prix history, titre foncier
4. **Création / édition d'un bien**
5. **Réservations** (`/app/bookings`) — accept / refuser / annuler
6. **Calendrier** (`/app/calendar`) — visualisation
7. **Visites** (`/app/visits`) — accept / planifier
8. **Baux** (`/app/leases`) — créer, activer, échéancier, paiements, renouveler, résilier
9. **Finances** (`/app/payments`) — factures, payouts, commissions
10. **Maintenance** (`/app/maintenance`) — devis, validation
11. **Inventaires / état des lieux** (`/app/inventories`)
12. **Messagerie** (`/app/messages`)
13. **Documents** (`/app/documents`)
14. **Avis** (`/app/profile/reviews`) — répondre / signaler

---

## 1. Connexion & Dashboard owner

### TC-OWN-01 — Connexion et accès

**Étape 1 :** Naviguer vers `/auth/login`. Saisir un compte owner (ex: `proprietaire1@example.com` / `password`). Cliquer "Se connecter".

**Q1 :** Après connexion, l'URL est `/app` ; pas de redirection vers une page admin ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La sidebar gauche contient au minimum : Tableau de bord, Mes biens, Mes favoris, Recherches sauvegardées, Réservations, Baux, Finances, Maintenance, Messagerie, États des lieux, Documents, Statistiques, Clients (CRM), Exports ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Aucun lien "Administration" / "Publier un bien" / "Modération" n'apparaît (réservés à agent/admin) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-02 — Dashboard owner (`/app/overview/owner`)

**Étape 1 :** Naviguer vers `/app/overview/owner`.

**Q1 :** Un widget "Mon portefeuille" affiche : nombre de biens (par type), nombre de biens loués / disponibles / vendus / archivés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un widget "Cashflow" affiche : revenus du mois en cours, revenus année cumulés, montant des impayés, prochains payouts ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un widget "Taux d'occupation" affiche le ratio biens loués / biens en gestion (en %) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Un widget "Demandes en attente" liste les réservations à valider en priorité ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Un widget "Maintenance" indique les interventions ouvertes nécessitant une approbation (ex: validation de devis) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Si le compte n'a pas de bien, des états vides clairs sont affichés (et un CTA "Créer mon premier bien") ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 2. Mes biens

### TC-OWN-03 — Liste des biens (`/app/properties`)

**Étape 1 :** Cliquer "Mes biens" dans la sidebar.

**Q1 :** La liste affiche en tableau (ou cartes) : référence (TK-...), titre, type, transaction, statut (disponible / réservé / loué / vendu / archivé), prix, ville, date d'ajout ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un filtre par statut, type, transaction et une recherche par titre/référence sont disponibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le tri par colonnes (date, prix, vues) fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** L'utilisateur ne voit **que** les biens dont il est propriétaire (isolation correcte) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-04 — Créer un bien (P0)

**Étape 1 :** Cliquer "Créer un bien" / naviguer vers `/app/properties/new`.

**Q1 :** Le formulaire est multi-étapes ou un seul écran avec : Type de bien, Type de transaction, Titre, Description, Adresse + carte, Prix, Surface, Chambres, SDB, Année de construction, Étage, Amenités/tags, Médias ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sélectionner Type = Appartement, Transaction = Location longue durée, Titre = `Appart QA test`, Adresse = `Plateau, Dakar`, Prix = `350000`, Surface = `60`, Chambres = `2`, SDB = `1`. Soumettre.

**Q2 :** Le bien est créé en statut initial "Brouillon" / "Non publié" ; redirection vers la fiche `/app/properties/[id]` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Une référence unique (ex: TK-2026-NNN) est générée automatiquement et affichée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Tenter de publier sans média déclenche un avertissement ("Aucune photo — la fiche ne sera pas attractive") ou est bloqué selon politique ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-05 — Adresse géolocalisée

**Étape 1 :** Sur la fiche `/app/properties/[id]`, ouvrir l'onglet "Adresse" / "Localisation".

**Q1 :** Un champ d'adresse avec auto-complétion (Mapbox / Nominatim) est présent ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Saisir une adresse, sélectionner une suggestion.

**Q2 :** Les coordonnées GPS (lat/lng) sont remplies automatiquement et un marqueur est positionné sur la carte intégrée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Repositionner le marqueur en le glissant.

**Q3 :** Les coordonnées sont mises à jour. Sauvegarder met à jour l'adresse sur la fiche publique aussi ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-06 — Médias (photos)

**Étape 1 :** Sur la fiche du bien, ouvrir l'onglet "Médias".

**Q1 :** Une zone de drag & drop est visible ; les formats acceptés sont indiqués (JPG, PNG, WEBP) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Glisser-déposer 3 photos JPG (chacune < 5 Mo).

**Q2 :** Les 3 photos sont uploadées en parallèle avec une barre de progression individuelle ; des miniatures sont générées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Glisser-déposer pour réordonner les photos.

**Q3 :** L'ordre est sauvegardé (persisté après rechargement) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Marquer une photo comme "Photo de couverture".

**Q4 :** La fiche publique du bien (`/properties/[slug]`) utilise cette photo en couverture ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 5 :** Tenter d'uploader une image > 10 Mo.

**Q5 :** Erreur claire "Fichier trop volumineux" ; l'upload est refusé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-07 — Plans, vidéos, visite 360° (P1)

**Étape 1 :** Tenter d'uploader un PDF (plan), une vidéo MP4 (< 50 Mo), un lien YouTube/Matterport pour la visite virtuelle.

**Q1 :** Les types de média avancés sont supportés et organisés en onglets distincts (Photos / Plans / Vidéos / 360°) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-08 — Tags / amenités

**Étape 1 :** Sur la fiche du bien, onglet "Caractéristiques" ou "Amenités".

**Q1 :** Une liste de tags/amenités prédéfinis est sélectionnable (piscine, parking, gardiennage, climatisation, ascenseur, etc.) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les amenités sélectionnées apparaissent sur la fiche publique ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-09 — Statut & publication

**Étape 1 :** Sur la fiche du bien, repérer un bouton "Publier".

**Q1 :** Cliquer "Publier" déclenche une validation (champs obligatoires complets, au moins une photo) ; le statut passe à "Publié" et le bien devient visible sur `/properties` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Dépublier".

**Q2 :** Le bien disparaît du site public mais reste accessible via l'admin du propriétaire ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Changer le statut entre disponible / réservé / loué / vendu / archivé.

**Q3 :** Chaque transition est tracée dans le journal d'activité (audit log) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Un bien archivé n'apparaît plus dans la liste publique ni dans la liste par défaut de l'owner (mais peut être rappelé via filtre "Inclure les archivés") ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-10 — Modération admin (P2)

**Précondition :** Configuration agence avec modération activée.

**Q1 :** Quand le propriétaire publie, le bien passe en statut "Soumis à modération" plutôt que directement publié ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Une notification est envoyée au propriétaire en cas de validation ou de rejet (avec motif) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-11 — Historique de prix (P1)

**Étape 1 :** Modifier le prix du bien (ex: passer de 350 000 à 380 000 F CFA). Sauvegarder.

**Q1 :** L'ancien prix est conservé dans un onglet "Historique de prix" avec date et utilisateur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un graphique d'évolution du prix est affiché si > 2 changements ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-12 — Hiérarchie de biens (P1)

**Étape 1 :** Créer un bien parent de type "Immeuble" avec adresse `Sicap Liberté, Dakar`.

**Q1 :** Sur la fiche du bien parent, un onglet "Lots" / "Sous-biens" permet de créer des biens enfants (étage, appartement) liés au parent ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Créer 2 lots (Appart 1, Appart 2) rattachés au parent.

**Q2 :** Sur la fiche de chaque lot, un breadcrumb / lien vers le bien parent est affiché ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Sur la liste `/app/properties`, un filtre "Hiérarchie" permet d'afficher uniquement les biens parents ou tout déplier ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-13 — Titre foncier (P1)

**Étape 1 :** Sur la fiche du bien, ouvrir l'onglet "Titre foncier" / "Légal".

**Q1 :** Un champ "Type de titre" propose : TF (Titre Foncier), Bail emphytéotique, Permis d'occuper, Affectation, Autre ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un champ libre "Numéro de titre" et un upload de document (PDF du TF) sont disponibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-14 — Compteur de vues / favoris (P1)

**Étape 1 :** Sur la fiche `/app/properties/[id]`.

**Q1 :** Un compteur "X vues" et "Y favoris" est affiché ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le compteur s'incrémente quand un visiteur ouvre la fiche publique ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 3. Réservations (`/app/bookings`)

### TC-OWN-15 — Liste des réservations

**Étape 1 :** Naviguer vers `/app/bookings`.

**Q1 :** La liste affiche les réservations sur ses biens : bien, demandeur (Customer), dates, montant total, acompte, statut, date de demande ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Des onglets/filtres "En attente / Confirmées / Refusées / Annulées / Expirées" sont disponibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-16 — Accepter une demande

**Étape 1 :** Ouvrir une réservation au statut "En attente". Cliquer "Accepter".

**Q1 :** Une confirmation est demandée ; un message optionnel pour le client est proposé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Confirmer.

**Q2 :** Le statut passe à "Confirmée" ; le client reçoit une notification + email avec instructions de paiement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-17 — Refuser une demande

**Étape 1 :** Sur une demande, cliquer "Refuser". Saisir un motif optionnel ("Bien déjà réservé pour cette période"). Confirmer.

**Q1 :** Statut passe à "Refusée" ; le client reçoit une notification avec le motif ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-18 — Annuler une réservation acceptée

**Étape 1 :** Sur une réservation "Confirmée", cliquer "Annuler". Confirmation + motif requis.

**Q1 :** Statut passe à "Annulée" ; si paiements existants → le système propose un remboursement (P3) ; le client est notifié ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-19 — Suivi des paiements de réservation

**Étape 1 :** Sur la fiche d'une réservation confirmée et payée.

**Q1 :** L'onglet "Paiements" liste : acompte, solde, statut de chaque paiement, méthode, référence ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un bouton "Rembourser" est disponible sur les paiements reçus (avec montant partiel possible) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-20 — Vue calendrier (P1) (`/app/calendar`)

**Étape 1 :** Naviguer vers `/app/calendar`.

**Q1 :** Le calendrier affiche, par mois/semaine/jour : réservations confirmées (couleur 1), visites (couleur 2), périodes de location actives (couleur 3) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un filtre par bien permet de réduire à un seul bien dans le portefeuille ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Cliquer un événement ouvre la fiche correspondante (booking, visite, bail) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 4. Visites (`/app/visits`)

### TC-OWN-21 — Gérer les demandes de visite

**Étape 1 :** Naviguer vers `/app/visits`.

**Q1 :** La page liste les visites planifiées sur ses biens avec : bien, demandeur, date, type (présentielle / virtuelle / self-guided / hybride), statut ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sur une visite "En attente", cliquer "Confirmer".

**Q2 :** Le statut passe à "Confirmée" ; le visiteur reçoit une notification + email avec rappel automatique J-1 ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Sur une visite passée, cliquer "Marquer effectuée".

**Q3 :** Statut passe à "Effectuée" ; le visiteur peut laisser un feedback ; le bailleur peut aussi noter la qualité du contact ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 5. Baux (`/app/leases`)

### TC-OWN-22 — Liste des baux

**Étape 1 :** Naviguer vers `/app/leases`.

**Q1 :** La liste affiche : bien, locataire, durée, loyer, caution, statut (brouillon / actif / expiré / résilié / renouvelé), prochaine échéance ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un filtre par statut et par bien est disponible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-23 — Créer un bail

**Étape 1 :** Cliquer "Nouveau bail" → `/app/leases/new`.

**Q1 :** Le formulaire propose : sélecteur de bien, sélecteur de locataire (recherche dans `Customer`), date de début, durée (mois ou date de fin), loyer mensuel, jour d'échéance (1-28), caution (montant + devise), garants (P1) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Remplir les champs et créer le bail.

**Q2 :** Le bail est créé au statut "Brouillon" ; l'utilisateur est redirigé vers `/app/leases/[id]` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-24 — Activer le bail

**Étape 1 :** Sur la fiche d'un bail brouillon, cliquer "Activer".

**Q1 :** Le statut passe à "Actif" ; l'échéancier est généré automatiquement (paiements mensuels jusqu'à la fin du bail) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le locataire reçoit une notification + email avec le lien vers son bail et son échéancier ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-25 — Échéancier & enregistrer un paiement reçu

**Étape 1 :** Sur la fiche du bail, ouvrir l'onglet "Échéancier".

**Q1 :** Tous les mois sont listés avec : montant, date d'échéance, statut, pénalités cumulées si retard ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sur l'échéance du mois en cours, cliquer "Enregistrer un paiement reçu".

**Q2 :** Un formulaire propose : montant (pré-rempli), méthode (espèces / virement / chèque / mobile money), référence, date effective, pièce justificative (PDF/image) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Saisir et valider.

**Q3 :** L'échéance passe à "Payée" ; le locataire est notifié ; une quittance PDF est générée et accessible côté locataire et bailleur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-26 — Pénalités de retard automatiques

**Étape 1 :** Avancer la date système (ou utiliser une seed) pour avoir une échéance dépassée.

**Q1 :** Au-delà de la date limite, l'échéance passe à "En retard" et des pénalités sont calculées automatiquement (selon le pourcentage configuré dans l'agence) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Une notification automatique est envoyée au locataire ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-27 — Renouvellement (P2)

**Étape 1 :** Sur un bail proche de l'expiration (J-90), cliquer "Renouveler".

**Q1 :** Un formulaire de renouvellement propose : nouvelle durée, loyer (option de révision), caution, conditions ; le nouveau bail est lié à l'ancien (parent_lease_id) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Sur la fiche du nouveau bail, un encart "Bail parent" est visible avec lien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-28 — Résiliation anticipée (P2)

**Étape 1 :** Sur un bail actif, cliquer "Résilier".

**Q1 :** Un formulaire propose : date de résiliation, motif (Mutation / Achat / Manquement / Autre), calcul automatique des pénalités/préavis dus ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Confirmer la résiliation.

**Q2 :** Statut passe à "Résilié" ; les échéances futures sont annulées ; un récapitulatif financier final est généré ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-29 — Révision annuelle de loyer (P2)

**Étape 1 :** Sur un bail dépassant 12 mois, cliquer "Réviser le loyer".

**Q1 :** Un formulaire propose : indice de référence (sélecteur), nouveau montant, accord amiable (texte libre) ; une notification est envoyée au locataire qui doit accepter/refuser ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'historique des révisions est visible dans un onglet dédié ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-30 — Caution (remboursement en fin de bail)

**Étape 1 :** Sur un bail terminé, ouvrir l'onglet "Caution".

**Q1 :** Le formulaire de remboursement permet : montant remboursé, retenues (avec motifs et photos), date, méthode de versement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un PDF de décompte de caution est généré et envoyé au locataire ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-31 — Téléchargement contrat PDF

**Étape 1 :** Sur la fiche d'un bail, cliquer "Télécharger le contrat PDF".

**Q1 :** Le PDF est généré avec les clauses standard, parties, bien, durée, loyer, caution, signatures (si signé électroniquement) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 6. Finances

### TC-OWN-32 — Vue finances (`/app/payments`)

**Étape 1 :** Naviguer vers `/app/payments`.

**Q1 :** La page distingue : Loyers reçus / Acomptes-soldes de réservations / Factures émises / Payouts à recevoir / Frais et commissions ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un graphique mensuel des revenus est affiché (12 derniers mois) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-33 — Émettre une facture (P1)

**Étape 1 :** Cliquer "Nouvelle facture".

**Q1 :** Le formulaire propose : Customer destinataire, lignes (description, quantité, prix unitaire), TVA si applicable, conditions, échéance ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Saisir une facture, cliquer "Envoyer".

**Q2 :** Le PDF est généré ; le destinataire reçoit un email avec lien direct ; le statut est "Envoyée" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Sur la facture, cliquer "Marquer comme payée".

**Q3 :** Le statut passe à "Payée" ; un reçu est généré ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Annuler une facture envoyée mais non payée.

**Q4 :** Le statut passe à "Annulée" et le client est notifié ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-34 — Payouts (P1)

**Étape 1 :** Sur `/app/payments`, ouvrir l'onglet "Payouts".

**Q1 :** Les payouts à recevoir affichent : période, montant brut, commission agence (déduite), montant net, statut (en attente / traité / échec / annulé), date prévue ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le détail d'un payout permet de voir les paiements de loyer/réservation qui l'ont composé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Une notification est reçue à chaque payout traité ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-35 — Export CSV / PDF (P2)

**Étape 1 :** Sur `/app/payments`, cliquer "Exporter".

**Q1 :** Les options proposent : période, type d'entité (loyers / factures / payouts), format (CSV / Excel / PDF) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le téléchargement fonctionne et le fichier est correctement structuré ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 7. Maintenance (`/app/maintenance`)

### TC-OWN-36 — Liste des interventions

**Étape 1 :** Naviguer vers `/app/maintenance`.

**Q1 :** La liste affiche les interventions sur ses biens : bien, demandeur (locataire), catégorie, urgence, statut (Ouverte / En cours / Devis / Approuvée / Résolue / Annulée), prestataire assigné ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-37 — Demande de devis & approbation (P2)

**Étape 1 :** Sur une demande "En cours", l'agent demande un devis. Le devis est soumis par le prestataire.

**Q1 :** Le bailleur reçoit une notification "Devis à valider" ; sur la fiche, le devis est affiché (montant, détail, conditions) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Approuver" / "Rejeter" sur le devis.

**Q2 :** L'approbation déclenche le démarrage des travaux ; le rejet renvoie le devis pour révision ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le seuil au-delà duquel l'approbation bailleur est obligatoire est paramétrable au niveau agence (P3) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-38 — Historique d'interventions par bien

**Étape 1 :** Depuis la fiche d'un bien, ouvrir l'onglet "Maintenance".

**Q1 :** Toutes les interventions passées et en cours sont listées avec leurs photos, rapports et coûts ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 8. Inventaires / État des lieux (`/app/inventories`)

### TC-OWN-39 — Liste des inventaires

**Étape 1 :** Naviguer vers `/app/inventories`.

**Q1 :** La liste affiche les états des lieux d'entrée et de sortie sur ses biens, avec statut (Brouillon / Soumis / Signé / Contesté) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-40 — Consulter un état des lieux

**Étape 1 :** Ouvrir un état des lieux.

**Q1 :** L'inventaire est consultable pièce par pièce avec : photos, état (neuf / bon / moyen / dégradé) par élément, commentaires ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le PDF est exportable (P2) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-41 — Signer un état des lieux

**Étape 1 :** Sur un état des lieux soumis, cliquer "Signer".

**Q1 :** Une confirmation (mot de passe ou OTP) est demandée ; après signature, le PDF est régénéré avec la signature horodatée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-42 — Contestation par le locataire

**Précondition :** Le locataire a contesté un point de l'état des lieux.

**Q1 :** Une notification informe le bailleur ; sur la fiche, le point contesté est marqué et le commentaire/photos du locataire sont visibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 9. Messagerie (`/app/messages`)

### TC-OWN-43 — Conversations

**Étape 1 :** Naviguer vers `/app/messages`.

**Q1 :** Les conversations 1↔1 avec agents et locataires sont listées ; statut "non lu" visible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Démarrer une conversation depuis la fiche d'un bail (bouton "Contacter le locataire") ou depuis un agent.

**Q2 :** La conversation s'ouvre, l'envoi de messages texte + pièces jointes (image/PDF) fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-44 — Conversations de groupe (P2)

**Étape 1 :** Créer un groupe avec agent + locataire + propriétaire pour discuter d'une intervention.

**Q1 :** Le groupe se crée correctement ; tous les participants reçoivent les messages ; les accusés de lecture par participant sont visibles si > 5 participants ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 10. Documents (`/app/documents`)

### TC-OWN-45 — Liste des documents

**Étape 1 :** Naviguer vers `/app/documents`.

**Q1 :** La liste regroupe : contrats de bail, titres fonciers, factures, quittances, CNI, RIB, photos administratives ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Filtrage par type et recherche par mot-clé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-46 — Partage temporaire (P1)

**Étape 1 :** Sur un document, cliquer "Partager".

**Q1 :** Une URL temporaire (1h / 24h / 7j / 30j) est générée avec mot de passe optionnel ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Tester le lien dans un onglet incognito : téléchargement possible avant expiration, refusé après expiration ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 11. Avis (P2) (`/app/profile/reviews`)

### TC-OWN-47 — Répondre publiquement à un avis

**Étape 1 :** Sur la fiche d'un de ses biens, repérer un avis. Cliquer "Répondre publiquement".

**Q1 :** Le formulaire de réponse permet de rédiger un message courtois (max 500 caractères) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Soumettre la réponse.

**Q2 :** La réponse apparaît sous l'avis sur la fiche publique avec mention "Réponse du propriétaire" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Modifier ou supprimer la réponse.

**Q3 :** Les actions modifier / supprimer sont disponibles tant que la réponse n'a pas été modérée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-48 — Signaler un avis inapproprié

**Étape 1 :** Sur un avis, cliquer "Signaler".

**Q1 :** Le formulaire propose un motif (Diffamation / Spam / Hors-sujet / Autre) avec libellés français ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Après signalement, l'avis est marqué pour modération admin ; le bailleur reçoit une confirmation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 12. CRM customers (vu côté owner)

### TC-OWN-49 — Mes clients

**Étape 1 :** Naviguer vers `/app/customers`.

**Q1 :** Le bailleur voit les Customers liés à ses propres baux/réservations uniquement (isolation) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le détail d'un Customer affiche : ses contrats avec ce propriétaire, ses paiements, son historique de communication ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 13. Restrictions de rôle

### TC-OWN-50 — Vérification de l'isolation

**Étape 1 :** Tenter d'accéder aux routes admin/agent depuis un compte owner :

| Route | Comportement attendu | Observé | Statut |
|-------|----------------------|---------|--------|
| `/admin` | Redirection ou 403 | _______ | ✅ ❌ ⚠️ 🔲 |
| `/admin/team` | Redirection ou 403 | _______ | ✅ ❌ ⚠️ 🔲 |
| `/admin/finances` | Redirection ou 403 | _______ | ✅ ❌ ⚠️ 🔲 |
| `/admin/users` | Redirection ou 403 | _______ | ✅ ❌ ⚠️ 🔲 |
| `/super-admin` | Redirection ou 403 | _______ | ✅ ❌ ⚠️ 🔲 |
| `/app/properties/[id-d-un-autre-owner]` | 403 | _______ | ✅ ❌ ⚠️ 🔲 |

**Étape 2 :** API directe avec token owner :
- `GET /api/dashboard/agency` → 403
- `GET /api/customers/{id-other-agency}` → 403
- `POST /api/agencies` (création d'agence) → 403

**Q1 :** Toutes les tentatives ci-dessus sont correctement bloquées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 14. Récapitulatif — Bugs trouvés

| # | Sévérité | TC | Page | Description | Statut |
|---|----------|----|------|-------------|--------|
| 1 |   |   |   |   |  |
| 2 |   |   |   |   |  |
| 3 |   |   |   |   |  |

---

## 15. Notes du testeur

```
_______________________________________________________________

_______________________________________________________________

_______________________________________________________________
```

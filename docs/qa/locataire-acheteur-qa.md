# QA — Locataire / Acheteur 🏠

**Acteur :** Utilisateur authentifié côté demande (Customer)
**Précondition :** Être connecté avec un compte de rôle `customer`
**Environnement :** `http://localhost:3000` · `http://localhost:8002`
**Testeur :**
**Date :**
**Version :**

> Les fonctionnalités transverses (authentification, notifications, i18n, médias, recherche de base) sont couvertes dans [`utilisateurs-authentifies-qa.md`](./utilisateurs-authentifies-qa.md).

---

## Légende

| Statut | Signification |
|--------|---------------|
| ✅ Pass | Fonctionne comme attendu |
| ❌ Fail | Bug ou comportement incorrect |
| ⚠️ Partiel | Fonctionne avec réserves |
| 🔲 Non testé | Pas encore vérifié |

---

## 1. Découverte & recherche avancée

### TC-LOC-01 — Recherche par carte interactive

**URL :** `/properties` (onglet carte)

**Q1 :** Un bouton/onglet pour basculer en "Vue carte" est disponible sur la page de recherche ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La carte Leaflet se charge correctement (sans erreur console, tuiles visibles) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les biens sont représentés par des marqueurs sur la carte avec leur prix ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Cliquer un marqueur affiche une mini-fiche (titre, prix, photo) du bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Zoomer/dézoomer sur la carte rafraîchit les marqueurs affichés dans la zone visible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Les filtres appliqués en vue liste s'appliquent aussi en vue carte ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-02 — Favoris

**URL :** `/app/favorites`

**Q1 :** Un bouton cœur (♡) est visible sur chaque carte de bien dans la recherche ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Cliquer le cœur ajoute le bien aux favoris et change l'icône (♥ plein) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La page `/app/favorites` liste tous les biens mis en favoris ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Cliquer le cœur une deuxième fois retire le bien des favoris ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Les favoris sont persistés entre les sessions (présents après déconnexion/reconnexion) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-03 — Comparateur de biens (P2)

**URL :** `/compare`

**Q1 :** Il est possible de sélectionner plusieurs biens pour les comparer (depuis la liste ou les fiches) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La page de comparaison affiche les biens côte à côte avec leurs caractéristiques ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les différences entre biens sont mises en évidence visuellement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 2. Dashboard locataire (`/app/overview/tenant`)

### TC-LOC-04 — Vue d'ensemble

**Q1 :** Le dashboard affiche les prochaines échéances de loyer (date + montant) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les documents récents sont accessibles depuis le dashboard ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les réservations en cours sont visibles depuis le dashboard ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 3. Réservations & visites

### TC-LOC-05 — Demander une réservation

**URL :** `/properties/[slug]` → bouton "Réserver"

**Q1 :** Le bouton "Réserver" sur la fiche d'un bien disponible est accessible (non grisé) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un formulaire ou une modale s'ouvre pour choisir les dates et voir le montant total ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le montant de l'acompte et le solde restant sont clairement affichés avant confirmation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Confirmer la demande crée une réservation au statut "En attente" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Une notification (in-app + email) confirme que la demande a été envoyée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** La réservation apparaît dans `/app/bookings` avec le bon statut ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-06 — Page des réservations (`/app/bookings`)

**Q1 :** La liste des réservations affiche le bien, les dates, le montant et le statut ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Il est possible de voir le détail d'une réservation (`/app/bookings/[id]`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les paiements liés à la réservation (acompte, solde) sont visibles dans le détail ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Le statut de la réservation se met à jour en temps réel quand l'agent accepte/refuse ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-07 — Paiements de réservation (P1)

**Q1 :** Un bouton "Payer l'acompte" ou "Payer le solde" est disponible selon le stade de la réservation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le flux de paiement redirige vers la passerelle ou une confirmation de paiement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Après paiement réussi, le statut de la réservation est mis à jour ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** La page `/app/payments` liste les paiements effectués avec date, montant et statut ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-08 — Planification de visites (P2)

**URL :** `/app/visits`

**Q1 :** Il est possible de demander une visite depuis la fiche bien (en personne, virtuelle, etc.) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La liste des visites planifiées est visible dans `/app/visits` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un rappel est envoyé avant l'heure de la visite (email ou notification push) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 4. Bail & paiements de loyer

### TC-LOC-09 — Consultation du bail

**URL :** `/app/leases`

**Q1 :** La liste des baux (actif, terminé) est accessible dans `/app/leases` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La fiche d'un bail (`/app/leases/[id]`) affiche les informations clés (loyer, durée, caution, statut) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'échéancier des paiements mensuel est visible dans le détail du bail ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Les paiements passés (payés, en retard, en attente) sont distingués visuellement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-10 — Enregistrer un paiement mensuel

**Q1 :** Un bouton "Enregistrer un paiement" est disponible dans le détail du bail ou l'échéancier ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le formulaire de paiement permet de saisir le montant et la date ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Après enregistrement, le paiement apparaît dans l'historique avec le statut correct ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Le téléchargement d'une quittance PDF est possible après un paiement confirmé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 5. Messagerie (`/app/messages`)

### TC-LOC-11 — Conversation privée

**Q1 :** La page `/app/messages` liste les conversations actives avec statut "non lu" visible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Il est possible d'initier une nouvelle conversation avec un agent ou bailleur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'envoi d'un message texte fonctionne et apparaît dans la conversation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Il est possible de joindre un fichier (photo, document) à un message ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Une notification in-app + email arrive quand un nouveau message est reçu ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** La conversation se marque automatiquement comme lue à l'ouverture ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 6. Signalement de problèmes / Maintenance (`/app/maintenance`)

### TC-LOC-12 — Signaler un problème

**Q1 :** Un bouton "Signaler un problème" est disponible (depuis le dashboard ou la fiche bien) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le formulaire de signalement permet de décrire le problème et joindre des photos ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Après soumission, le signalement apparaît dans `/app/maintenance` avec un statut ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Il est possible de consulter l'historique des interventions liées à son bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Le statut de l'intervention (ouvert, en cours, résolu) est visible et mis à jour ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 7. Documents (`/app/documents`)

### TC-LOC-13 — Partage sécurisé de documents

**Q1 :** La page `/app/documents` liste les documents liés au compte (contrats, quittances, CNI) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un document peut être téléchargé directement depuis la liste ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'option "Partager via lien temporaire" génère une URL sécurisée avec expiration ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Le lien de partage fonctionne sans authentification pendant la durée de validité ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Un lien expiré affiche bien une erreur "lien invalide ou expiré" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 8. Avis (P2)

### TC-LOC-14 — Laisser un avis

**URL :** `/app/profile/reviews`

**Q1 :** Il est possible de laisser un avis sur un bien (note + texte) après y avoir séjourné ou visité ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Il est possible de laisser un avis sur un agent ou une agence ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La note (étoiles 1 à 5) est obligatoire pour soumettre l'avis ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** L'avis soumis apparaît publiquement sur la fiche correspondante (après modération éventuelle) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Il est possible de signaler un avis inapproprié depuis la fiche bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 9. État des lieux — Signature (P2)

### TC-LOC-15

**Q1 :** Le locataire reçoit une notification quand un état des lieux est créé pour son bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Il est possible de consulter l'état des lieux (entrée / sortie) depuis l'application ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La signature électronique de l'état des lieux est disponible et fonctionnelle ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 10. Récapitulatif des bugs trouvés

| # | Sévérité | Fonctionnalité | Description | Statut |
|---|----------|---------------|-------------|--------|
| | P0 | | | |
| | P1 | | | |
| | P2 | | | |
| | P3 | | | |

---

## 11. Notes du testeur

> _______________________________________________
> _______________________________________________
> _______________________________________________

# QA — Locataire / Acheteur 🏠

**Acteur :** Utilisateur authentifié côté demande (rôle `customer` ou `tenant`)
**Précondition :** Être connecté avec un compte de rôle `customer` (ex: `customer@agency3.demo.takussan.sn` / `password`).
**Environnement :** `http://localhost:3000` · `http://localhost:8002`
**Testeur :**
**Date :**
**Version :** dev branch

> Les fonctionnalités transverses (auth, profil, notifications, i18n, médias, recherche de base) sont couvertes dans [`utilisateurs-authentifies-qa.md`](./utilisateurs-authentifies-qa.md).
> La découverte publique (homepage, liste, fiche, partage) est aussi couverte dans [`visiteur-anonyme-qa.md`](./visiteur-anonyme-qa.md) — ces TC restent valides en mode connecté.

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

> Ordre conçu pour suivre le parcours métier réel d'un locataire/acheteur, en minimisant les retours.

1. **Connexion** + **Dashboard tenant** (`/app` puis `/app/overview/tenant`)
2. **Sidebar / nav** — vérifier les entrées disponibles selon rôle
3. **Découverte avancée** — favoris (`/app/favorites`), comparateur, recherches sauvegardées (`/app/saved-searches`), recherche carte
4. **Demande de visite** depuis fiche bien
5. **Demande de réservation** depuis fiche bien
6. **Mes réservations** (`/app/bookings`) — détail + paiement acompte/solde
7. **Mes visites** (`/app/visits`) — détail + feedback
8. **Mes baux** (`/app/leases`) — détail, échéancier, paiement loyer, quittance
9. **Paiements** (`/app/payments`) — historique + retour passerelle
10. **Messagerie** (`/app/messages`)
11. **Maintenance** (`/app/maintenance`) — signaler un problème
12. **Documents** (`/app/documents`) — partage temporaire
13. **Avis** (`/app/profile/reviews`)
14. **État des lieux** signature

---

## 1. Connexion & Dashboard tenant

### TC-LOC-01 — Connexion et redirection

**Étape 1 :** Naviguer vers `http://localhost:3000/auth/login`. Saisir un compte customer (ex: `client1@example.com` / `password`). Cliquer "Se connecter".

**Q1 :** Après connexion, l'URL est `/app` (ou la racine du dashboard) — pas un 404 ni un dashboard admin ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La sidebar de gauche est visible avec au minimum : Tableau de bord, Mes favoris, Recherches sauvegardées, Mes réservations, Mes baux, Paiements, Messagerie, Documents, Statistiques ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Aucun lien "Administration" / "Publier un bien" / "Mes biens" / "Clients (CRM)" n'apparaît dans la sidebar (réservés aux rôles agent/owner/admin) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** L'avatar / nom de l'utilisateur est affiché en haut à droite ; un menu utilisateur (déconnexion, profil) s'ouvre au clic ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-02 — Dashboard tenant (`/app/overview/tenant`)

**Étape 1 :** Cliquer "Statistiques" dans la sidebar puis "Tenant" — ou naviguer directement à `/app/overview/tenant`.

**Q1 :** Le dashboard affiche un widget "Prochaines échéances de loyer" listant les 3-5 prochains paiements (montant + date) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un widget "Mes réservations" liste les réservations en cours avec leur statut (en attente, confirmée, refusée) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un widget "Mes documents récents" affiche les derniers documents (contrat, quittance, CNI) avec lien rapide ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Un widget "Visites planifiées" liste les prochaines visites avec date/heure et bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Si le compte est neuf (sans bail/réservation), des états vides clairs sont affichés (et non des erreurs ou des spinners infinis) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 2. Découverte avancée

### TC-LOC-03 — Mes favoris (`/app/favorites`)

**Étape 1 :** Depuis la sidebar, cliquer "Mes favoris".

**Q1 :** L'URL devient `/app/favorites` et la liste des biens favoris s'affiche en grille (cartes type `PropertyCard`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Si l'utilisateur a un compte tout neuf, un état vide explicite ("Vous n'avez pas encore de favoris — explorez les biens disponibles") avec un CTA vers `/properties` est affiché ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer le CTA pour aller sur `/properties` (en restant connecté).

**Q3 :** Sur `/properties`, cliquer le cœur ♥ d'un bien — un toast "Ajouté aux favoris" apparaît ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Retourner sur `/app/favorites`.

**Q4 :** Le bien que l'on vient d'ajouter est présent en liste ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Cliquer le ♥ rempli sur la carte d'un favori pour le retirer.

**Q5 :** Le bien disparaît de la liste, le compteur (badge cœur dans la navbar) diminue, et le toast "Retiré des favoris" apparaît ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 5 :** Se déconnecter puis se reconnecter.

**Q6 :** Les favoris sont conservés serveur (visibles à nouveau) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-04 — Recherches sauvegardées (`/app/saved-searches`)

**Étape 1 :** Naviguer vers `/properties`. Appliquer 3 filtres (ex: Vente / Appartement / Dakar / 30M-100M FCFA).

**Q1 :** Un bouton "Sauvegarder cette recherche" / "Créer une alerte" est visible (en haut de la liste de résultats ou dans le panneau de filtres) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Sauvegarder cette recherche". Saisir le nom `Appart Dakar 30-100M`.

**Q2 :** Une option "Recevoir des alertes par email" (toggle) est proposée ; cocher OUI ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Valider. Naviguer vers `/app/saved-searches`.

**Q3 :** La recherche `Appart Dakar 30-100M` apparaît dans la liste avec les filtres actifs et le statut "Alertes activées" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Cliquer la recherche sauvegardée.

**Q4 :** L'utilisateur est ramené sur `/properties?...` avec tous les filtres pré-appliqués ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 5 :** Retourner sur `/app/saved-searches`. Désactiver les alertes (toggle), puis renommer la recherche.

**Q5 :** Modifications persistées après rafraîchissement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 6 :** Supprimer la recherche.

**Q6 :** Une confirmation est demandée. La recherche disparaît après confirmation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-05 — Comparateur (`/compare`)

**Étape 1 :** Aller sur `/properties`. Cocher 2 biens (case "Comparer" sur chaque carte).

**Q1 :** Une barre flottante "X biens sélectionnés" apparaît en bas avec un bouton "Comparer" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cocher 2 autres biens (4 au total).

**Q2 :** La sélection est plafonnée à 4 ; un toast d'avertissement empêche d'ajouter un 5e bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Cliquer "Comparer".

**Q3 :** L'URL devient `/compare?ids=...` ; un tableau présente les biens en colonnes : prix, surface, chambres, SDB, transaction, type, ville, équipements ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Les différences entre biens (ex: surface différente, équipement présent vs absent) sont mises en évidence visuellement (gras, couleur, ou icône) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Chaque colonne propose un lien "Voir la fiche" et une croix pour retirer le bien du comparatif ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-06 — Recherche par carte (P1)

**Étape 1 :** Sur `/properties`, basculer en "Vue carte".

**Q1 :** La carte Leaflet se charge (fond carto visible) sans erreur console ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les marqueurs des biens portent leur prix résumé (ex: "120M F") ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer un marqueur.

**Q3 :** Une mini-fiche apparaît (photo, titre, prix, lien "Voir") ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Zoomer/dézoomer puis déplacer la carte.

**Q4 :** Les marqueurs visibles sont rafraîchis selon la vue ; un compteur "X biens dans cette zone" est mis à jour ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Activer un filtre (ex: chambres = 2+) en mode carte.

**Q5 :** Les marqueurs sont filtrés cohéremment ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-07 — Biens consultés récemment (P2)

**Étape 1 :** Visiter 3 fiches biens distinctes successivement. Retourner sur `/`.

**Q1 :** Une section "Récemment consultés" / carrousel s'affiche avec les 3 biens visités ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Cette liste est conservée après rechargement (cookie / localStorage) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 3. Demande de visite

### TC-LOC-08 — Demander une visite

**Étape 1 :** Depuis `/properties`, ouvrir la fiche d'un bien disponible. Repérer le bouton "Demander une visite" / "Planifier une visite".

**Q1 :** Le bouton est visible et actif (non grisé) sur un bien `available` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Demander une visite".

**Q2 :** Un formulaire/modal s'ouvre avec : sélecteur de date, créneau horaire, type de visite (en personne / virtuelle / self-guided / hybride), message libre ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Choisir une date dans 3 jours, créneau 14h, type "En personne", message "Je souhaite une visite". Soumettre.

**Q3 :** Un toast/banner de succès confirme la soumission ; la visite apparaît dans `/app/visits` au statut "En attente" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Une notification (cloche + email) confirme la demande envoyée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-09 — Mes visites (`/app/visits`)

**Étape 1 :** Naviguer vers `/app/visits`.

**Q1 :** La page liste les visites avec colonnes : bien (titre + lien), date/heure, type, statut, agent/contact ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Des onglets "Demandées / Confirmées / Passées / Annulées" filtrent la liste ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer sur la visite TC-LOC-08.

**Q3 :** La fiche `/app/visits/[id]` affiche tous les détails et un bouton "Annuler la visite" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Cliquer "Annuler la visite". Confirmer.

**Q4 :** Le statut passe à "Annulée" ; un toast confirme et la liste reflète la modification ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Pour une visite passée (statut "Effectuée"), repérer un formulaire "Donner mon feedback" (note + commentaire).

**Q5 :** Le feedback est saisissable et enregistré (statut "Feedback fourni") ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-10 — Rappel automatique avant visite (P2)

**Précondition :** Visite confirmée prévue dans moins de 24h.

**Q1 :** Une notification in-app + email "Rappel : visite prévue demain à HH:MM" est reçue à J-1 ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 4. Demande de réservation & paiements

### TC-LOC-11 — Soumettre une réservation

**Étape 1 :** Sur la fiche d'un bien `available` (location courte ou vente), cliquer "Réserver" / "Faire une offre".

**Q1 :** Le formulaire de réservation s'ouvre avec : dates de séjour (location), montant total auto-calculé, montant d'acompte, montant de la caution, délai de validité de l'offre ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Choisir des dates valides (ex: arrivée dans 1 mois, durée 3 jours pour location), accepter les CGU. Soumettre.

**Q2 :** Un toast confirme "Demande envoyée" et la réservation apparaît dans `/app/bookings` au statut "En attente" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un email de confirmation est envoyé au client ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Tenter une seconde réservation sur le même bien et même créneau.

**Q4 :** Un message d'erreur explicite indique le conflit / la non-disponibilité ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-12 — Mes réservations (`/app/bookings`)

**Étape 1 :** Naviguer vers `/app/bookings`.

**Q1 :** La page liste les réservations en colonnes : bien, dates, montant, statut, date de la demande ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Des onglets/filtres permettent de filtrer par statut (En attente, Confirmée, Refusée, Annulée, Expirée) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Ouvrir le détail de la réservation TC-LOC-11.

**Q3 :** La fiche `/app/bookings/[id]` affiche : récapitulatif (bien, dates, montant), historique d'événements (créée, message, etc.), liste des paiements (vide initialement), boutons d'action (Annuler, Payer l'acompte si confirmée) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Cliquer "Annuler la réservation" sur une réservation en attente. Confirmer.

**Q4 :** Statut passe à "Annulée" ; aucune charge n'est appliquée si avant confirmation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-13 — Paiement de l'acompte

**Précondition :** Avoir une réservation au statut "Confirmée" (l'agent / propriétaire l'a acceptée).

**Étape 1 :** Sur `/app/bookings/[id]`, cliquer "Payer l'acompte".

**Q1 :** Un récapitulatif s'affiche : montant exact, méthodes disponibles (Wave, Orange Money, Stripe / CB, Virement) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Choisir une méthode (ex: Wave). Confirmer.

**Q2 :** L'utilisateur est redirigé vers la passerelle de paiement (URL externe) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Compléter le paiement côté passerelle (sandbox).

**Q3 :** Le retour sur `/app/payments/return` affiche un succès clair ; après quelques secondes, le statut de la réservation passe à "Acompte payé" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Le paiement apparaît dans la timeline de la réservation et dans `/app/payments` (historique) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Un téléchargement de quittance/reçu PDF est proposé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-14 — Paiement du solde

**Précondition :** Réservation confirmée + acompte payé.

**Étape 1 :** Sur `/app/bookings/[id]`, cliquer "Payer le solde".

**Q1 :** Le montant proposé = montant total − acompte déjà versé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Compléter le paiement.

**Q2 :** Le statut passe à "Soldée" / "Payée intégralement" ; le solde restant affiché = 0 ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-15 — Échec / annulation de paiement

**Étape 1 :** Initier un paiement et l'annuler côté passerelle.

**Q1 :** Le retour affiche "Paiement annulé" ; aucun débit n'est enregistré ; possibilité de réessayer ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Initier un paiement avec une carte refusée (sandbox).

**Q2 :** Message d'erreur clair, statut paiement = "Échec", la réservation reste au statut précédent ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-16 — Expiration automatique (P2)

**Précondition :** Réservation en attente depuis longtemps.

**Q1 :** Au-delà du délai (configurable, ex: 48h), la réservation passe automatiquement en statut "Expirée" et l'utilisateur est notifié ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-17 — Historique de paiements (`/app/payments`)

**Étape 1 :** Naviguer vers `/app/payments`.

**Q1 :** Tous les paiements (réservation, loyer, frais) sont listés avec : entité (bien / bail), montant, devise, statut, date, méthode, lien vers le reçu PDF ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un export CSV de l'historique est disponible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 5. Bail & paiements de loyer

### TC-LOC-18 — Mes baux (`/app/leases`)

**Étape 1 :** Naviguer vers `/app/leases`.

**Q1 :** La page liste les baux liés au compte avec : bien, période (début / fin), loyer mensuel, caution, statut (actif / terminé / résilié) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un onglet "Actifs / Terminés / Résiliés" est disponible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Ouvrir un bail actif (`/app/leases/[id]`).

**Q3 :** La fiche affiche : récapitulatif (bien, parties, durée, loyer, caution), boutons "Télécharger le contrat PDF" et "Voir le bail parent" si renouvellement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Un bouton "Télécharger le contrat" produit un PDF formaté ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-19 — Échéancier de loyers

**Étape 1 :** Sur la fiche du bail, repérer la section "Échéancier".

**Q1 :** L'échéancier liste mois par mois : montant, date d'échéance, statut (à venir / dû / payé / en retard), pénalités si applicables ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les paiements en retard sont mis en évidence visuellement (rouge/orange) avec calcul des pénalités automatique ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-20 — Payer un loyer mensuel

**Étape 1 :** Sur l'échéancier, cliquer "Payer" sur l'échéance du mois en cours.

**Q1 :** Le formulaire propose : montant pré-rempli, méthode de paiement, possibilité d'inclure les pénalités si retard ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Confirmer le paiement (sandbox).

**Q2 :** L'échéance passe à "Payé" ; un téléchargement de la quittance PDF est proposé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La quittance PDF contient : entête agence/bailleur, locataire, période, montant, mention "acquittée" + référence ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-21 — Historique des paiements de loyer

**Étape 1 :** Sur la fiche du bail, ouvrir l'onglet "Paiements".

**Q1 :** Tous les paiements (passés et à venir) sont listés avec téléchargement de quittance pour chaque paiement reçu ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-22 — Révision annuelle du loyer (P2)

**Précondition :** Bail dont la révision annuelle est due.

**Q1 :** Une notification informe le locataire d'une proposition de révision (montant + référence d'indice) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le locataire peut consulter l'historique des révisions sur la fiche bail ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 6. Messagerie (`/app/messages`)

### TC-LOC-23 — Liste des conversations

**Étape 1 :** Naviguer vers `/app/messages`.

**Q1 :** La page affiche un panneau gauche (liste des conversations) et un panneau droit (sélectionnée ou état vide) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Chaque conversation montre : nom de l'interlocuteur (agent / bailleur), dernier message tronqué, horodatage, badge "non lu" si applicable ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Une barre de recherche en haut permet de filtrer les conversations par nom ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-24 — Démarrer une nouvelle conversation

**Étape 1 :** Depuis la fiche d'un bien (`/properties/[slug]`), cliquer "Contacter l'agent".

**Q1 :** Une conversation est créée (ou ré-utilisée si elle existait) et l'utilisateur est redirigé vers `/app/messages?conversation=[id]` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Saisir `Bonjour, je suis intéressé par ce bien.` dans le champ de message. Cliquer envoyer (ou Entrée).

**Q2 :** Le message apparaît dans la conversation avec un horodatage et un avatar ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le message est marqué "Envoyé" puis "Lu" quand l'agent l'ouvre (accusé de lecture) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-25 — Pièce jointe

**Étape 1 :** Cliquer l'icône trombone dans une conversation. Sélectionner une image PNG (< 5 Mo).

**Q1 :** L'image est uploadée et affichée comme miniature dans le message ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Cliquer la miniature ouvre l'image en grand (lightbox) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Tester l'envoi d'un PDF (< 10 Mo).

**Q3 :** Le PDF est envoyé avec une icône de fichier et un bouton "Télécharger" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-26 — Archiver / désarchiver / muter

**Étape 1 :** Ouvrir une conversation, cliquer le menu contextuel (⋮).

**Q1 :** Les options "Archiver", "Couper le son (mute)", "Marquer comme non lu" sont disponibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Archiver une conversation. Vérifier qu'elle disparaît de la liste principale.

**Q2 :** Un onglet "Archivées" permet de la retrouver et de la désarchiver ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-27 — Notifications temps réel

**Précondition :** Ouvrir 2 navigateurs (ou 2 onglets en mode privé) avec deux comptes distincts qui partagent une conversation.

**Étape 1 :** Depuis le compte agent, envoyer un message au customer.

**Q1 :** Côté customer, le badge "non lu" sur la conversation et le badge cloche dans la navbar augmentent dans les ~10 secondes (sans rechargement) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le toast "Nouveau message de [Agent]" apparaît si l'utilisateur n'est pas sur la page messagerie ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-28 — Recherche dans l'historique des messages (P2)

**Étape 1 :** Dans une conversation, cliquer une icône de recherche.

**Q1 :** Un champ permet de rechercher du texte dans l'historique de la conversation et met en surbrillance les résultats ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 7. Maintenance (`/app/maintenance`)

### TC-LOC-29 — Signaler un problème

**Étape 1 :** Naviguer vers `/app/maintenance`.

**Q1 :** La page affiche la liste des demandes existantes et un bouton "Signaler un problème" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Signaler un problème" → `/app/maintenance/new`.

**Q2 :** Le formulaire propose : sélection du bien (parmi mes baux), catégorie (plomberie / électricité / chauffage / serrurerie / autre), description, urgence (basse / normale / haute / urgente), upload de photos ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Remplir : bien = bail actif, catégorie = Plomberie, description = "Fuite sous évier", urgence = haute, joindre 2 photos. Soumettre.

**Q3 :** Un toast confirme ; redirection vers `/app/maintenance/[id]` ; la demande apparaît dans la liste au statut "Ouverte" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Une notification est envoyée à l'agent / propriétaire ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-30 — Suivi de l'intervention

**Étape 1 :** Sur la fiche `/app/maintenance/[id]`.

**Q1 :** L'historique des statuts (Ouverte → En cours → Résolue) est affiché en timeline ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les commentaires/messages échangés (entre locataire / agent / prestataire) sont affichés chronologiquement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le rapport d'intervention final (photos + texte du prestataire) est consultable une fois l'intervention résolue ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-31 — Historique par bien

**Étape 1 :** Depuis la fiche d'un bail, ouvrir l'onglet "Maintenance".

**Q1 :** Toutes les interventions passées et en cours pour ce bien sont listées avec leurs statuts ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 8. Documents (`/app/documents`)

### TC-LOC-32 — Liste des documents

**Étape 1 :** Naviguer vers `/app/documents`.

**Q1 :** La page liste les documents accessibles : contrats de bail, quittances, factures, CNI / passeport, justificatifs, RIB, autres ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Une recherche par mot-clé (titre, type) et un filtre par catégorie sont disponibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Chaque ligne affiche : titre, type, taille, date d'ajout, propriétaire, actions (Télécharger, Partager) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-33 — Télécharger un document

**Étape 1 :** Cliquer "Télécharger" sur un document.

**Q1 :** Le fichier se télécharge correctement avec un nom explicite ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-34 — Partage temporaire (P1)

**Étape 1 :** Cliquer "Partager" sur un document.

**Q1 :** Une modale propose : durée d'expiration (1h / 24h / 7j / 30j), mot de passe optionnel, limite de téléchargements optionnelle ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Choisir 24h sans mot de passe. Générer le lien.

**Q2 :** Une URL `/api/share/[token]` est générée et copiable ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Ouvrir le lien dans un onglet incognito.

**Q3 :** Le téléchargement est possible sans authentification durant la validité ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Sur `/app/documents/[id]`, ouvrir l'onglet "Liens partagés" et révoquer le lien.

**Q4 :** Le lien est marqué comme révoqué ; tenter de le ré-ouvrir donne une erreur "Lien expiré ou révoqué" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-35 — Versions de document (P2)

**Étape 1 :** Sur `/app/documents/[id]`, ouvrir "Versions".

**Q1 :** L'historique des versions liste chaque révision avec date, auteur, taille, et un bouton de téléchargement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 9. Avis (P2) (`/app/profile/reviews`)

### TC-LOC-36 — Laisser un avis sur un bien

**Précondition :** Avoir terminé une location ou avoir effectué une visite.

**Étape 1 :** Sur la fiche du bien (en mode connecté), repérer "Laisser un avis".

**Q1 :** Le bouton apparaît uniquement pour les utilisateurs ayant un historique éligible (visite ou bail) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Laisser un avis". Renseigner note 4/5, commentaire `Bien situé, bon rapport qualité/prix.`. Soumettre.

**Q2 :** Un toast confirme la soumission ; l'avis apparaît dans `/app/profile/reviews` au statut "En attente de modération" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Une fois modéré, l'avis apparaît publiquement sur la fiche bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-37 — Avis sur un agent / une agence

**Étape 1 :** Sur la fiche d'un agent ou d'une agence, cliquer "Laisser un avis".

**Q1 :** Le formulaire est identique (note + commentaire) et l'avis remonte dans `/app/profile/reviews` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-38 — Signaler un avis inapproprié

**Étape 1 :** Sur un avis publié par un autre utilisateur (fiche bien / agence), cliquer "Signaler".

**Q1 :** Un formulaire propose un motif (Spam, Diffamation, Hors-sujet, Autre) avec libellés français ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Soumettre un signalement.

**Q2 :** Un toast confirme et l'avis est marqué comme "signalé" pour modération ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-39 — Mes avis publiés

**Étape 1 :** Sur `/app/profile/reviews`.

**Q1 :** Tous les avis (publiés / en attente / rejetés) sont listés ; il est possible d'éditer ou supprimer son avis tant qu'il n'est pas modéré ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 10. État des lieux — Signature (P2)

### TC-LOC-40 — Notification de l'état des lieux

**Précondition :** Bail actif. L'agent crée un état des lieux d'entrée pour le bien.

**Q1 :** Une notification (cloche + email) informe le locataire qu'un état des lieux est à signer ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-41 — Consulter et signer

**Étape 1 :** Suivre la notification jusqu'à la fiche état des lieux.

**Q1 :** L'état des lieux est consultable pièce par pièce avec photos et état détaillé (neuf / bon / moyen / dégradé) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un bouton "Signer" demande une confirmation (ou un mot de passe / OTP si configuré) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Signer", confirmer.

**Q3 :** La signature est horodatée ; une copie PDF est téléchargeable ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-LOC-42 — Contestation de l'état des lieux

**Étape 1 :** Sur l'état des lieux, cliquer "Contester" sur un élément.

**Q1 :** Un formulaire permet de joindre une explication + photos ; le statut passe à "Contesté" et l'agent est notifié ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 11. Calendrier personnel (P2)

### TC-LOC-43 — Calendrier des événements

**Étape 1 :** Naviguer vers `/app/calendar` (si le lien est visible pour ce rôle).

**Q1 :** Le calendrier montre : visites, réservations, échéances de loyer, fins de bail ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un export iCal est disponible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 12. Restrictions de rôle

### TC-LOC-44 — Vérification de l'isolation des données

**Étape 1 :** Tenter d'accéder à des routes admin/agent depuis un compte customer en saisissant l'URL :

| Route | Comportement attendu | Observé | Statut |
|-------|----------------------|---------|--------|
| `/admin` | Redirection vers `/app/profile` | _______ | ✅ ❌ ⚠️ 🔲 |
| `/admin/team` | Redirection / 403 | _______ | ✅ ❌ ⚠️ 🔲 |
| `/app/properties/new` | Page non visible / 403 | _______ | ✅ ❌ ⚠️ 🔲 |
| `/app/customers` | Page non visible / 403 | _______ | ✅ ❌ ⚠️ 🔲 |
| `/super-admin` | Redirection ou 403 | _______ | ✅ ❌ ⚠️ 🔲 |

**Étape 2 :** Tenter via API directe (avec le token customer) :
- `GET /api/customers` → attendu 403
- `GET /api/dashboard/agency` → attendu 403
- `GET /api/admin/agencies` → attendu 403

**Q1 :** Toutes les tentatives ci-dessus sont correctement bloquées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 13. Récapitulatif — Bugs trouvés

| # | Sévérité | TC | Page | Description | Statut |
|---|----------|----|------|-------------|--------|
| 1 |   |   |   |   |  |
| 2 |   |   |   |   |  |
| 3 |   |   |   |   |  |

---

## 14. Notes du testeur

```
_______________________________________________________________

_______________________________________________________________

_______________________________________________________________
```

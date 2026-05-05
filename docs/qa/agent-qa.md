# QA — Agent immobilier 🧑‍💼

**Acteur :** Opérateur métier (rôle `agent`)
**Précondition :** Compte `agent` rattaché à une agence avec au moins un bien dans le portefeuille de l'agence.
**Environnement :** `http://localhost:3000` · `http://localhost:8002`
**Testeur :**
**Date :**
**Version :** dev branch

> Les fonctionnalités transverses (auth, profil, notifications, i18n, médias, recherche de base) sont couvertes dans [`utilisateurs-authentifies-qa.md`](./utilisateurs-authentifies-qa.md).
> Les fonctionnalités côté demande (favoris, comparateur, messagerie reçue) sont aussi accessibles à l'agent — voir [`locataire-acheteur-qa.md`](./locataire-acheteur-qa.md) pour la mécanique générique.

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

> L'ordre suit le quotidien d'un agent : ouvrir l'app → check pipeline → traiter → biens → CRM → ops.

1. **Connexion** + **Dashboard agent** (`/app/overview/agent`)
2. **Sidebar** — vérification des entrées disponibles
3. **Mes biens** (`/app/properties`) — liste, CRUD complet, médias, collaborateurs, hiérarchie, duplication
4. **Publier / dépublier / archiver** un bien
5. **Réservations** (`/app/bookings`) — accept / refuser / annuler / suivi paiements
6. **Visites** (`/app/visits`) — planifier, confirmer, feedback
7. **Calendrier** (`/app/calendar`) — vue d'ensemble
8. **Baux** (`/app/leases`) — créer, garants, échéancier, paiements, relances, pénalités, renouvellement, résiliation, caution
9. **CRM** (`/app/customers`, `/app/crm/pipeline`) — création, notes, pipeline, tags, primary contact
10. **Maintenance** (`/app/maintenance`) — assignation prestataire, devis, suivi, rapport
11. **Inventaires** (`/app/inventories`) — créer entrée/sortie, signer, exporter PDF
12. **Documents** (`/app/documents`) — upload, catégorisation, partage, génération depuis template
13. **Messagerie** (`/app/messages`) — 1↔1, groupes, recherche
14. **Avis** — répondre publiquement
15. **Tâches & rappels** — pipeline tâches
16. **Statistiques & exports** (`/app/overview`, `/app/overview/exports`)
17. **Restrictions de rôle** — vérification d'isolation

---

## 1. Connexion & Dashboard agent

### TC-AGT-01 — Connexion

**Étape 1 :** `/auth/login` → compte agent (ex: `agent1@dakarimmo.sn` / `password`).

**Q1 :** Redirection vers `/app` ; sidebar affiche : Tableau de bord, Mes biens, Publier un bien (CTA emphasized), Mes favoris, Recherches sauvegardées, Réservations, Visites, Calendrier, Baux, Messagerie, Maintenance, États des lieux, Documents, Statistiques, Exports, Clients (CRM) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Aucun lien "Administration" / "KPIs" / "Alertes" (réservés à admin) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-02 — Dashboard agent (`/app/overview/agent`)

**Étape 1 :** Naviguer vers `/app/overview/agent`.

**Q1 :** Widget "Pipeline" : nombre de biens actifs, demandes en attente, baux à signer, tâches du jour ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Widget "Commissions" : commissions du mois en cours et cumulées sur l'année ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Widget "Mes tâches" : liste des tâches assignées triées par échéance et priorité, avec lien vers la fiche client ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Widget "Activité récente" : derniers événements (nouveau message, nouvelle réservation, paiement reçu) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Widget "Visites du jour" : liste des visites planifiées aujourd'hui ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 2. Mes biens (`/app/properties`)

### TC-AGT-03 — Liste des biens (P0)

**Étape 1 :** Cliquer "Mes biens".

**Q1 :** La liste affiche tous les biens de l'agence (et ceux dont l'agent est collaborateur) avec : référence (TK-...), titre, type, transaction, statut, prix, ville, agent assigné, date, vues, favoris ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Filtres disponibles : statut, type, transaction, ville, agent assigné, plage de prix, plage de dates, "uniquement les miens" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Sélection multiple (cases à cocher) avec actions en lot : archiver, dépublier, changer d'agent assigné ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-04 — Créer un bien (P0)

**Étape 1 :** Cliquer "Publier un bien" (CTA bleu) → `/app/properties/new`.

**Q1 :** Le formulaire affiche les champs requis : titre, type, transaction, prix, surface, chambres, SDB, description, adresse + carte ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Remplir et soumettre.

**Q2 :** Une référence unique TK-AAAA-NNN est générée automatiquement à la création ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le statut initial est "Brouillon" / "Non publié" ; redirection vers la fiche `/app/properties/[id]` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-05 — Adresse géolocalisée (P0)

**Étape 1 :** Sur la fiche du bien, onglet "Adresse".

**Q1 :** Auto-complétion d'adresse fonctionne (suggestions Mapbox/Nominatim apparaissent) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Sélectionner une suggestion remplit lat/lng et place un marqueur sur la carte ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le marqueur peut être glissé pour ajustement ; l'adresse résultante est mise à jour automatiquement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** L'adresse précise apparaît bien sur la fiche publique avec carte intégrée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-06 — Médias (P0)

**Étape 1 :** Sur la fiche du bien, onglet "Médias".

**Q1 :** Upload de photos JPG/PNG/WEBP avec drag & drop multiple ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Génération automatique de miniatures (thumbnail, preview) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Réorganiser par drag & drop.

**Q3 :** Ordre persisté après rafraîchissement (réorder via API `PUT /api/properties/{id}/media/reorder`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Marquer une image comme "Couverture".

**Q4 :** La fiche publique utilise cette photo en couverture ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Supprimer une image.

**Q5 :** Image retirée de la liste et de la fiche publique après confirmation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 5 :** Tester l'upload de plans PDF, vidéos MP4 et un lien Matterport (visite 360°) (P1).

**Q6 :** Les types avancés sont supportés et organisés dans des onglets distincts ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-07 — Statut et publication (P0)

**Étape 1 :** Sur un brouillon, cliquer "Publier".

**Q1 :** La validation bloque la publication si champs critiques vides (au moins une photo, prix, surface) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Après publication, le bien est visible sur `/properties` (site public) ; statut = "Publié / Disponible" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Dépublier".

**Q3 :** Le bien est immédiatement retiré de la liste publique mais reste accessible côté agence ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Changer le statut entre disponible / réservé / loué / vendu / archivé.

**Q4 :** Un bien archivé n'apparaît plus dans la liste publique ; chaque transition est tracée dans l'audit log ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-08 — Soumettre / Re-soumettre à modération (P2)

**Précondition :** Agence avec modération activée.

**Étape 1 :** Soumettre un bien à modération (`POST /api/properties/{id}/submit-moderation`).

**Q1 :** Le statut passe à "En attente de modération" ; le bien n'est pas encore public ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** En cas de rejet par l'admin, l'agent reçoit une notif ; cliquer "Resoumettre" après corrections.

**Q2 :** Le bien retourne en file de modération ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-09 — Modifier / Supprimer (P0)

**Étape 1 :** Modifier le titre, le prix d'un bien existant. Sauvegarder.

**Q1 :** Les changements sont persistés (rafraîchir confirme) ; le prix précédent est journalisé dans l'historique ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Supprimer" (icône poubelle).

**Q2 :** Une confirmation est demandée. Après confirmation, le bien disparaît mais reste en BDD (soft-delete) ; il n'apparaît ni dans la liste agence ni publique ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-10 — Tags & amenités (P1)

**Étape 1 :** Sur la fiche, onglet "Caractéristiques", section "Amenités".

**Q1 :** Liste de tags prédéfinis (piscine, parking, climatisation, ascenseur, gardiennage, terrasse…) sélectionnables ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les amenités sélectionnées apparaissent sur la fiche publique avec icônes ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La suppression d'un tag fonctionne (`DELETE /api/properties/{id}/tags/{tag}`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-11 — Collaborateurs (P1)

**Étape 1 :** Sur la fiche du bien, onglet "Collaborateurs".

**Q1 :** Liste actuelle des collaborateurs ; bouton "Ajouter un collaborateur" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Ajouter". Recherche par nom/email d'un autre agent de l'agence. Définir : taux de commission (%), permissions (lecture seule / édition).

**Q2 :** Le collaborateur est ajouté ; il apparaît dans sa liste de biens (`/app/properties`) avec un badge "Collaborateur" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Modifier les permissions d'un collaborateur.

**Q3 :** Le collaborateur en lecture seule ne peut pas éditer le bien (champs grisés) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Retirer un collaborateur.

**Q4 :** L'accès est révoqué immédiatement (le bien disparaît de sa liste) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-12 — Hiérarchie (P1)

**Étape 1 :** Créer un bien parent type "Immeuble". Sur sa fiche, créer 2 lots enfants (étages / appartements).

**Q1 :** Les enfants apparaissent dans `/api/properties/{id}/children` et dans l'UI sous l'onglet "Lots" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La fiche d'un lot affiche le breadcrumb avec lien vers le parent ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-13 — Compteurs vues / favoris (P1)

**Q1 :** Le compteur de vues est affiché sur la fiche de gestion ; le compteur de favoris aussi ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les compteurs s'incrémentent en temps quasi réel quand un visiteur ouvre la fiche / l'ajoute en favori ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-14 — Historique de prix (P1)

**Étape 1 :** Modifier deux fois le prix du bien.

**Q1 :** L'onglet "Historique de prix" affiche chaque changement avec date, utilisateur, ancien et nouveau prix ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-15 — Dupliquer un bien (P2)

**Étape 1 :** Sur un bien existant, cliquer "Dupliquer".

**Q1 :** Une copie est créée (nouvelle référence TK-...) avec mêmes caractéristiques mais sans médias ni statistiques (vues / favoris à 0) ; statut = brouillon ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-16 — Archivage en lot (P2)

**Étape 1 :** Sélectionner 3 biens via cases à cocher, cliquer "Archiver" dans le menu d'actions.

**Q1 :** Les 3 biens passent au statut "Archivé" ; ils disparaissent de la liste publique ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 3. Réservations (`/app/bookings`)

### TC-AGT-17 — Liste et traitement

**Étape 1 :** Naviguer vers `/app/bookings`.

**Q1 :** La liste affiche les demandes pour les biens gérés ; filtrage par statut et par bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sur une demande "En attente", cliquer "Confirmer" puis confirmer dans la modale.

**Q2 :** La réservation passe à "Confirmée" ; le client est notifié avec instructions de paiement (acompte) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Sur une autre demande, cliquer "Refuser" avec un motif optionnel.

**Q3 :** Statut "Refusée" + notification au client ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Sur une réservation confirmée et acompte payé, tenter "Annuler".

**Q4 :** Une confirmation explicite est demandée (impact financier mentionné) ; après confirmation, statut = "Annulée" et un workflow de remboursement éventuel est proposé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 5 :** Sur la fiche d'une réservation, tester `Expirer maintenant` (POST `/api/bookings/{id}/expire-now`).

**Q5 :** Le statut passe à "Expirée" et les ressources (créneau bien) sont libérées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-18 — Suivi des paiements de réservation

**Étape 1 :** Sur la fiche d'une réservation confirmée.

**Q1 :** L'onglet "Paiements" liste : acompte, solde, statut, méthode, référence, date ; bouton "Enregistrer un paiement reçu" pour cas hors-passerelle ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Rembourser" sur un paiement reçu, saisir un montant partiel.

**Q2 :** Le remboursement est effectué (sandbox) et tracé ; le client reçoit une notification ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 4. Visites (`/app/visits`)

### TC-AGT-19 — Planifier une visite

**Étape 1 :** Sur la fiche d'un bien, cliquer "Planifier une visite" (ou via `/app/visits` → "Nouvelle visite").

**Q1 :** Le formulaire propose : sélection du bien, sélection du visiteur (Customer existant ou prospect), date/heure, durée, type (présentielle / virtuelle / self-guided / hybride), notes ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Créer la visite avec un Customer existant.

**Q2 :** La visite apparaît dans `/app/visits` et `/app/calendar` ; le visiteur reçoit un email + notif de confirmation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-20 — Confirmation et rappel

**Étape 1 :** Sur une visite "En attente", cliquer "Confirmer".

**Q1 :** Statut "Confirmée" ; un rappel automatique J-1 et H-2 est programmé (notif + email) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-21 — Compte-rendu et feedback

**Étape 1 :** Sur une visite passée, cliquer "Compléter le compte-rendu".

**Q1 :** Champ texte libre + score d'intérêt du visiteur ; possibilité de créer une tâche de suivi ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le feedback du visiteur (note + commentaire) est visible côté agent une fois soumis ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 5. Calendrier (`/app/calendar`)

### TC-AGT-22 — Vue agrégée

**Étape 1 :** Naviguer vers `/app/calendar`.

**Q1 :** Le calendrier (mois / semaine / jour) affiche : visites, réservations, échéances de bail, tâches ; codes couleur par type ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Filtres : par bien, par agent, par type d'événement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Cliquer un événement ouvre la fiche correspondante ; drag & drop pour reprogrammer une visite met à jour la BDD ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Un export iCal est disponible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 6. Baux (`/app/leases`)

### TC-AGT-23 — Liste des baux

**Étape 1 :** Naviguer vers `/app/leases`.

**Q1 :** Tableau avec : bien, locataire, période, loyer, caution, statut, prochaine échéance, alertes (impayés, fin de bail proche) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-24 — Créer un bail

**Étape 1 :** Cliquer "Nouveau bail" → `/app/leases/new`.

**Q1 :** Formulaire complet : bien, locataire (Customer), date de début/fin (ou durée), loyer mensuel, jour d'échéance, caution, conditions particulières, garants (P1) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Saisir un bail et le créer.

**Q2 :** Le bail est créé en statut "Brouillon" ; redirection vers `/app/leases/[id]` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-25 — Garants (P1)

**Étape 1 :** Sur le bail brouillon, onglet "Garants", cliquer "Ajouter un garant".

**Q1 :** Formulaire : nom, lien (parent / employeur / autre), CNI, justificatifs de revenus ; upload de documents ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Ajouter 2 garants.

**Q2 :** Les 2 garants sont listés sur la fiche bail ; possibilité de marquer un garant comme principal ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Supprimer un garant.

**Q3 :** Le garant est retiré ; les documents associés sont conservés ou supprimés selon politique ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-26 — Activation & échéancier

**Étape 1 :** Sur le bail brouillon, cliquer "Activer".

**Q1 :** Statut → "Actif" ; un échéancier mensuel est généré sur la durée du bail (vérifiable via `GET /api/leases/{id}/payments`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le locataire est notifié + email avec lien vers son bail ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-27 — Enregistrer un paiement de loyer

**Étape 1 :** Sur l'échéancier d'un bail actif, cliquer "Enregistrer un paiement reçu" sur l'échéance du mois.

**Q1 :** Formulaire : montant pré-rempli, méthode (espèces / virement / chèque / mobile money), date effective, référence, pièce justificative ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Valider.

**Q2 :** Échéance → "Payée" ; quittance PDF générée ; locataire et bailleur notifiés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-28 — Relances automatiques d'impayés (P1)

**Précondition :** Une échéance dépassée.

**Q1 :** À J+3 puis J+7, J+15, des notifications automatiques (mail + SMS si configuré) sont envoyées au locataire ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'agent voit le statut "En relance niveau N" sur l'échéance ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-29 — Pénalités de retard automatiques (P1)

**Étape 1 :** Une échéance dépassée selon la politique de l'agence.

**Q1 :** Pénalités calculées et ajoutées à l'échéance (visible dans la timeline) ; le montant total dû reflète l'addition ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-30 — Renouvellement (P2)

**Étape 1 :** Sur un bail proche de l'expiration, cliquer "Renouveler".

**Q1 :** Formulaire : nouvelle durée, loyer (avec proposition de révision selon indice), conditions ; le nouveau bail est lié à l'ancien (parent_lease_id) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le locataire reçoit le projet de renouvellement et peut accepter/refuser ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-31 — Résiliation anticipée (P2)

**Étape 1 :** Sur un bail actif, cliquer "Résilier".

**Q1 :** Formulaire : date de résiliation, motif, calcul automatique des pénalités/préavis ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Confirmer.

**Q2 :** Statut "Résilié" ; échéances futures annulées ; récap financier généré ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-32 — Remboursement de caution (P1)

**Étape 1 :** Sur un bail terminé, ouvrir l'onglet "Caution".

**Q1 :** Le formulaire de remboursement permet : montant, retenues détaillées avec photos/justificatifs, date, méthode ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** PDF de décompte généré et envoyé au locataire ; opération tracée dans l'audit log ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-33 — Historique complet du bail

**Étape 1 :** Sur la fiche du bail, onglet "Historique".

**Q1 :** Timeline complète : création, activation, paiements, modifications, relances, révisions, renouvellement éventuel, résiliation/fin ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'historique des révisions de loyer est accessible (`GET /api/leases/{id}/rent-history`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 7. CRM — Customers (`/app/customers`)

### TC-AGT-34 — Liste des clients (P0)

**Étape 1 :** Naviguer vers `/app/customers`.

**Q1 :** La liste affiche les Customers de l'agence avec : nom, type (locataire/acheteur/prospect), email, téléphone, agent assigné, dernière interaction, tags ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Recherche par nom/email/téléphone et filtres (type, agent, tags, stade pipeline) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-35 — Créer un Customer (P0)

**Étape 1 :** Cliquer "Nouveau client" → `/app/customers/new`.

**Q1 :** Formulaire : nom, prénom, email, téléphone, type (Customer / Prospect / Bailleur externe), notes initiales, lien optionnel vers un User existant ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Créer un Customer **sans** lier de User (prospect).

**Q2 :** Le Customer est créé sans compte associé ; il apparaît dans la liste avec un badge "Sans compte" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Sur la fiche, cliquer "Lier à un compte utilisateur".

**Q3 :** Recherche d'un User par email ; après sélection, le Customer est rattaché au User ; le badge disparaît ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-36 — Documents d'identité

**Étape 1 :** Sur la fiche d'un Customer, onglet "Documents".

**Q1 :** Upload de CNI / passeport / justificatifs de revenus ; chaque document est typé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-37 — Notes horodatées (P1)

**Étape 1 :** Sur la fiche, onglet "Notes". Cliquer "Ajouter une note".

**Q1 :** Une note est saisie avec horodatage et auteur automatiques ; les notes sont triées par date desc ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Supprimer une note (avec policy : auteur seulement).

**Q2 :** Seul l'auteur (ou un admin) peut supprimer ; tentative depuis un autre agent → 403 ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-38 — Contact principal (P1)

**Étape 1 :** Sur un Customer ayant plusieurs contacts (ex: couple), désigner un contact principal.

**Q1 :** Le contact principal est utilisé par défaut pour les notifications et la facturation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-39 — Tags clients (P2)

**Étape 1 :** Sur un Customer, ajouter des tags (`POST /api/customers/{id}/tags`).

**Q1 :** Les tags apparaissent en chips colorés sur la fiche et la liste ; un filtre par tag dans la liste fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-40 — Pipeline de prospects (`/app/crm/pipeline`) (P2)

**Étape 1 :** Naviguer vers `/app/crm/pipeline`.

**Q1 :** Vue kanban avec colonnes : Lead / Contact établi / Visite / Offre / Conclu / Perdu ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Glisser-déposer un Customer d'une colonne à l'autre.

**Q2 :** Le stage est mis à jour (`PATCH /api/customers/{id}/pipeline-stage`) ; un événement est ajouté à l'historique du customer ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un widget en haut affiche le taux de conversion par étape ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-41 — Historique d'interactions

**Étape 1 :** Sur la fiche d'un Customer, onglet "Activité".

**Q1 :** Timeline avec : visites, messages, réservations, paiements, baux, notes, changements de stage ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-42 — Tâches & rappels (P2)

**Étape 1 :** Sur la fiche d'un Customer, créer une tâche "Rappeler M. Diop le 12 mai".

**Q1 :** La tâche apparaît dans `/app/overview/agent` (widget tâches), avec rappel le jour J ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Marquer la tâche comme "Terminée" la déplace dans l'archive ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 8. Maintenance (`/app/maintenance`)

### TC-AGT-43 — Liste des interventions

**Étape 1 :** Naviguer vers `/app/maintenance`.

**Q1 :** Liste filtrable par statut, urgence, prestataire, bien ; tri par date ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-44 — Assigner un prestataire

**Étape 1 :** Sur une demande "Ouverte", cliquer "Assigner un prestataire".

**Q1 :** Recherche d'un User avec rôle `service_provider` ; assignation possible avec note interne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le prestataire reçoit une notification ; le statut passe à "Assignée" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-45 — Devis (P2)

**Étape 1 :** Cliquer "Demander un devis" sur l'intervention.

**Q1 :** Le prestataire reçoit la demande ; il peut soumettre un devis (montant + détails) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Une fois le devis soumis, l'agent ou le bailleur peut "Approuver" ou "Rejeter".

**Q2 :** Approbation déclenche le démarrage des travaux ; rejet retourne le devis pour révision ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-46 — Suivi des statuts

**Étape 1 :** Le prestataire passe l'intervention de "En cours" à "Résolue" via `POST /api/maintenance-requests/{id}/start` puis `complete`.

**Q1 :** Chaque transition de statut est tracée et visible dans la timeline ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-47 — Photos et rapport après intervention

**Étape 1 :** Le prestataire (ou l'agent) ajoute photos et rapport via `POST /api/maintenance-requests/{id}/photos`.

**Q1 :** Les photos sont uploadées et visibles ; le rapport texte est sauvegardé ; le locataire et le bailleur sont notifiés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-48 — Priorisation (P2)

**Étape 1 :** Modifier l'urgence d'une demande (basse → haute).

**Q1 :** L'ordre dans la liste reflète la priorité ; les demandes "Urgente" sont mises en évidence (couleur) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 9. Inventaires / État des lieux (`/app/inventories`)

### TC-AGT-49 — Créer un inventaire (P1)

**Étape 1 :** Cliquer "Nouvel inventaire" → `/app/inventories/new`.

**Q1 :** Formulaire : sélection du bien, type (Entrée / Sortie), date prévue, parties (locataire / bailleur), pièces du bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Créer l'inventaire en mode brouillon.

**Q2 :** L'inventaire apparaît dans `/app/inventories` avec statut "Brouillon" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-50 — Détail par pièce

**Étape 1 :** Sur l'inventaire, ajouter pièces (Salon, Cuisine, Chambre 1…) avec leurs éléments (sols, murs, mobilier).

**Q1 :** Pour chaque élément, choisir un état (Neuf / Bon / Moyen / Dégradé) + commentaire libre ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Uploader des photos par pièce via `POST /api/inventories/{id}/room-photos`.

**Q2 :** Les photos sont attachées à la pièce correspondante et visibles en miniatures ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-51 — Soumission et signature

**Étape 1 :** Cliquer "Soumettre" via `POST /api/inventories/{id}/submit`.

**Q1 :** Statut → "Soumis" ; locataire et bailleur reçoivent une notification pour signature ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Quand les deux parties ont signé via `POST /api/inventories/{id}/sign`.

**Q2 :** Statut "Signé" ; le PDF est régénéré avec les signatures horodatées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-52 — Export PDF (P2)

**Étape 1 :** Cliquer "Exporter PDF" sur un inventaire signé.

**Q1 :** PDF complet (parties, pièces, photos, états, signatures) téléchargeable ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-53 — Contestation locataire

**Précondition :** Le locataire a contesté un point.

**Q1 :** L'agent reçoit une notification ; sur la fiche, le point contesté est marqué + commentaire/photos du locataire visibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 10. Documents (`/app/documents`)

### TC-AGT-54 — Upload typé (P0)

**Étape 1 :** Cliquer "Nouveau document". Choisir un fichier PDF, sélectionner un type (Contrat / CNI / RIB / Quittance / Facture / Autre), associer à une entité (bien / customer / bail).

**Q1 :** Le document est uploadé et apparaît dans `/app/documents` avec ses métadonnées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-55 — Recherche dans la bibliothèque (P1)

**Étape 1 :** Utiliser la recherche par nom puis par filtre type.

**Q1 :** Les résultats sont pertinents ; un filtre "Mes documents / Documents agence" est disponible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-56 — Génération depuis template (P2)

**Étape 1 :** Cliquer "Générer un document" / "Depuis modèle". Choisir un template (Quittance / Contrat de bail / Mandat de gestion).

**Q1 :** Un PDF est généré avec les variables de l'entité (bien, locataire, montants) ; il est sauvegardé dans la bibliothèque ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-57 — Versions de document (P2)

**Étape 1 :** Sur la fiche d'un document, onglet "Versions". Uploader une nouvelle version.

**Q1 :** L'historique liste chaque version avec date, auteur, taille ; possibilité de restaurer une version antérieure ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-58 — Partage temporaire (P1)

**Étape 1 :** Sur un document, cliquer "Partager". Choisir 24h, mot de passe, max 5 téléchargements.

**Q1 :** Lien `/api/share/[token]` généré ; vérifier en incognito que les contraintes sont respectées (mot de passe demandé, blocage après 5 dl, expiration) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Révoquer le lien.

**Q2 :** Ré-ouverture du lien → erreur "Lien révoqué" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 11. Messagerie (`/app/messages`)

### TC-AGT-59 — Conversations 1↔1

**Étape 1 :** Initier une conversation depuis la fiche d'un Customer (bouton "Envoyer un message").

**Q1 :** La conversation est créée si elle n'existe pas, sinon réutilisée ; l'envoi de messages texte + pièces jointes fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Statut "non lu" et accusés de lecture par message visibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-60 — Conversations de groupe (P2)

**Étape 1 :** Créer un groupe (bouton "Nouveau groupe"). Ajouter agent + bailleur + locataire.

**Q1 :** Le groupe est créé ; tous les participants peuvent envoyer/recevoir des messages ; un titre / description du groupe est éditable ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Ajouter / retirer un participant.

**Q2 :** Modifications visibles dans la timeline du groupe (`POST /api/conversations/{id}/participants`, `DELETE /...`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-61 — Recherche dans l'historique (P2)

**Étape 1 :** Dans une conversation longue, utiliser la recherche.

**Q1 :** Les messages contenant le mot-clé sont mis en surbrillance et navigables ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-62 — Recherche transverse (`/api/search/messages`) (P2)

**Étape 1 :** Depuis la barre de recherche globale, chercher un mot-clé.

**Q1 :** Les résultats incluent : conversations, documents, biens, customers ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 12. Avis (P2)

### TC-AGT-63 — Répondre à un avis

**Étape 1 :** Sur un avis laissé sur un bien géré, cliquer "Répondre publiquement".

**Q1 :** Le formulaire de réponse (max 500 caractères) est utilisable ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La réponse apparaît sur la fiche publique sous l'avis avec mention "Réponse de l'agent / agence" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-64 — Signaler un avis

**Étape 1 :** Cliquer "Signaler" sur un avis abusif.

**Q1 :** Motif (Diffamation / Spam / Hors-sujet / Autre) avec libellés français ; soumission notifie l'admin pour modération ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 13. Statistiques & exports

### TC-AGT-65 — Statistiques (`/app/overview`)

**Étape 1 :** Naviguer vers `/app/overview`.

**Q1 :** Page d'accueil des statistiques avec liens vers les vues spécifiques (Agent / Tenant / Owner / Agency selon rôles) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les graphiques temporels (revenus, conversions, occupations) se chargent en moins de 3 secondes ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-66 — Exports (`/app/overview/exports`)

**Étape 1 :** Cliquer un export (ex: paiements / baux / clients), choisir période + format CSV.

**Q1 :** Le téléchargement démarre ; le fichier contient toutes les colonnes attendues + en-têtes traduits ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Tester aussi formats Excel et PDF (P2) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 14. Restrictions de rôle

### TC-AGT-67 — Cloisonnement par agence

**Étape 1 :** Tenter d'accéder à des biens / baux / customers d'autres agences :

| Action | Comportement attendu | Observé | Statut |
|--------|----------------------|---------|--------|
| Liste `/app/properties` ne contient QUE biens propre agence | OK | _______ | ✅ ❌ ⚠️ 🔲 |
| `GET /api/properties/{id-other-agency}` | 403 | _______ | ✅ ❌ ⚠️ 🔲 |
| `PUT /api/properties/{id-other-agency}` | 403 | _______ | ✅ ❌ ⚠️ 🔲 |
| `GET /api/leases/{id-other-agency}` | 403 | _______ | ✅ ❌ ⚠️ 🔲 |
| `GET /api/customers/{id-other-agency}` | 403 | _______ | ✅ ❌ ⚠️ 🔲 |
| `/admin/team` (route admin) | Redirection vers `/app/profile` | _______ | ✅ ❌ ⚠️ 🔲 |
| `/admin/finances` | Redirection / 403 | _______ | ✅ ❌ ⚠️ 🔲 |
| `/super-admin` | Redirection / 403 | _______ | ✅ ❌ ⚠️ 🔲 |

**Q1 :** Toutes les tentatives sont correctement bloquées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-68 — Permissions de collaborateur

**Précondition :** Un autre agent vous a ajouté comme collaborateur en lecture seule sur un bien hors de votre périmètre.

**Q1 :** Vous voyez le bien dans votre liste avec un badge "Collaborateur" ; les actions d'édition sont grisées ; les actions de gestion (publication, archivage) ne sont pas disponibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 15. Recherche transverse

### TC-AGT-69 — Suggestions / autocomplete (P2)

**Étape 1 :** Saisir 3 lettres dans la recherche globale (top header).

**Q1 :** L'API `/api/search/suggest` renvoie : biens, customers, baux, documents pertinents ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 16. Récapitulatif — Bugs trouvés

| # | Sévérité | TC | Page | Description | Statut |
|---|----------|----|------|-------------|--------|
| 1 |   |   |   |   |  |
| 2 |   |   |   |   |  |
| 3 |   |   |   |   |  |

---

## 17. Notes du testeur

```
_______________________________________________________________

_______________________________________________________________

_______________________________________________________________
```

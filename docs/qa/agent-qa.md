# QA — Agent immobilier 🧑‍💼

**Acteur :** Opérateur métier au quotidien (rôle `agent`)
**Précondition :** Être connecté avec un compte de rôle `agent`, rattaché à une agence
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

## 1. Dashboard agent (`/app/overview/agent`)

### TC-AGT-01

**Q1 :** Le dashboard affiche le pipeline de l'agent (biens actifs, réservations en attente, tâches) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les commissions perçues ce mois sont visibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les tâches assignées à l'agent sont listées avec leur priorité et échéance ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 2. Gestion des biens (`/app/properties`)

### TC-AGT-02 — Créer un bien (P0)

**URL :** `/app/properties/new`

**Q1 :** Le formulaire de création affiche tous les champs : titre, type, transaction, prix, surface, chambres, SDB, description ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Une référence unique (ex: TK-2025-001) est générée automatiquement à la création ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le statut initial est "brouillon" (non publié) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-03 — Associer une adresse géolocalisée (P0)

**Q1 :** Un champ d'adresse avec autocomplétion est disponible sur le formulaire du bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Saisir une adresse remplit les coordonnées GPS (latitude, longitude) automatiquement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'adresse enregistrée est affichée sur la carte dans la fiche publique ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-04 — Upload de photos (P0)

**Q1 :** L'onglet/section "Médias" du bien permet d'uploader des photos JPG/PNG/WEBP ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le drag & drop multiple fonctionne (plusieurs fichiers simultanément) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les photos uploadées génèrent une miniature visible dans l'interface ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** La réorganisation des photos par glisser-déposer fonctionne (P1) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Il est possible de supprimer une photo individuelle ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** L'upload de plans, vidéos et visites 360° est supporté (P1) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-05 — Statut et publication (P0)

**Q1 :** Le bouton "Publier" rend le bien visible sur le site public (`/properties/[slug]`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le bouton "Dépublier" retire immédiatement le bien de la liste publique ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le statut peut être changé entre : disponible, réservé, loué, vendu, archivé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Un bien archivé n'apparaît plus dans la liste publique ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-06 — Modifier / Supprimer (P0)

**Q1 :** Modifier les informations d'un bien existant et sauvegarder persiste les changements ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La suppression d'un bien effectue un soft-delete (le bien n'est pas visible mais existe en BDD) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un bien supprimé n'apparaît plus dans la liste de gestion ni sur le site public ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-07 — Tags / Amenités (P1)

**Q1 :** Une liste de tags/amenités (piscine, parking, gardiennage, cuisine équipée…) est disponible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'ajout de tags à un bien les fait apparaître sur la fiche publique ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La suppression d'un tag d'un bien fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-08 — Collaborateurs (P1)

**Q1 :** Il est possible d'ajouter un autre agent comme collaborateur sur un bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un taux de commission peut être défini par collaborateur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les permissions du collaborateur (lecture seule, édition) peuvent être définies ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Supprimer un collaborateur retire ses accès au bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-09 — Compteurs et statistiques (P1)

**Q1 :** Le nombre de vues du bien est affiché sur la fiche de gestion ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le nombre de fois où le bien a été mis en favoris est affiché ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-10 — Dupliquer / Archivage en lot (P2)

**Q1 :** L'option "Dupliquer ce bien" crée une copie avec les mêmes caractéristiques (sans médias) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'archivage en lot (sélectionner plusieurs biens et archiver) fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 3. Réservations & baux

### TC-AGT-11 — Gérer les réservations

**Q1 :** Les demandes de réservation apparaissent dans `/app/bookings` avec le statut "En attente" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'action "Accepter" notifie le demandeur et passe le statut à "Confirmée" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'action "Refuser" ou "Rejeter" notifie le demandeur avec un message optionnel ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** L'action "Annuler" une réservation confirmée demande une confirmation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-12 — Créer un bail (`/app/leases/new`)

**Q1 :** Le formulaire de bail permet de sélectionner le bien, le Customer, la durée, le loyer, la caution ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'ajout d'un garant avec ses documents (CNI, justificatif de revenus) est possible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Il est possible d'ajouter plusieurs garants sur un même bail ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** L'activation du bail génère l'échéancier des paiements mensuels ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Les relances automatiques d'impayés sont configurées et se déclenchent correctement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Les pénalités de retard sont appliquées automatiquement après la date limite ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q7 :** Le remboursement de la caution en fin de bail est possible et traçable ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q8 :** L'historique complet du bail (paiements, événements, révisions) est consultable ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-13 — Planification de visites (P2)

**URL :** `/app/visits`

**Q1 :** Il est possible de planifier une visite (en personne, virtuelle, self-guided, hybride) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La visite est visible dans le calendrier `/app/calendar` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un rappel automatique est envoyé au visiteur avant la visite ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Il est possible d'ajouter un feedback post-visite ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 4. CRM (`/app/customers`)

### TC-AGT-14 — Créer et gérer des clients (P0)

**Q1 :** Le formulaire de création d'un Customer est accessible depuis `/app/customers/new` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Il est possible de créer un Customer sans compte utilisateur existant (prospects) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La liste de clients dans `/app/customers` est recherchable par nom/email ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Il est possible de lier un Customer à un User existant (compte sur la plateforme) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Le type de relation agent-client (locataire, acheteur) et la période peuvent être définis ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Les pièces d'identité (CNI, passeport) et documents peuvent être joints au profil client ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q7 :** Le journal d'activité (historique des interactions) est visible sur la fiche client ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q8 :** Il est possible de désigner un contact principal pour les clients avec plusieurs contacts ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q9 :** Des notes horodatées peuvent être ajoutées sur un client ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-AGT-15 — Pipeline de prospects (P2)

**URL :** `/app/crm/pipeline`

**Q1 :** Un pipeline kanban avec des stades (prospect, contact, visite, offre, clôturé) est disponible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Il est possible de glisser-déposer un client d'un stade à l'autre ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Des tâches et rappels peuvent être attachés à un client (P2) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** La segmentation des clients par tags fonctionne (P2) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 5. Communication (`/app/messages`)

### TC-AGT-16

**Q1 :** L'agent peut initier une conversation privée 1↔1 avec un client ou un bailleur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les conversations de groupe (plusieurs participants) peuvent être créées (P2) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Il est possible d'ajouter ou retirer un participant d'une conversation de groupe ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 6. Maintenance & interventions (`/app/maintenance`)

### TC-AGT-17

**Q1 :** La liste des interventions sur les biens gérés est accessible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Il est possible d'assigner un prestataire à une intervention ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le suivi des statuts d'intervention (ouvert → en cours → résolu) fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Des photos et un rapport peuvent être joints après l'intervention ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** La demande de devis avant travaux et sa validation sont disponibles (P2) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Les interventions peuvent être priorisées (urgence, priorité normale) (P2) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 7. Inventaires / État des lieux (`/app/inventories`)

### TC-AGT-18

**Q1 :** Il est possible de créer un inventaire d'entrée ou de sortie depuis `/app/inventories/new` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le formulaire permet d'ajouter des pièces avec des éléments et leur état ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Des photos peuvent être associées à chaque pièce ou élément ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Un inventaire existant peut être consulté et modifié ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** L'export PDF de l'état des lieux est disponible (P2) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 8. Documents (`/app/documents`)

### TC-AGT-19

**Q1 :** Il est possible d'uploader un document lié à une entité (bien, client, bail) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le type de document peut être catégorisé (contrat, CNI, RIB, quittance, etc.) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La recherche dans la bibliothèque de documents (par nom, type, entité) fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** La génération d'un PDF depuis un template (quittance, contrat) est disponible (P2) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** L'historique des versions d'un document est consultable (P2) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Le partage sécurisé par lien temporaire fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 9. Avis (P2)

### TC-AGT-20

**Q1 :** L'agent peut répondre publiquement à un avis laissé sur un de ses biens ou son profil ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La réponse apparaît publiquement sous l'avis correspondant ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La réponse peut être supprimée/retractée par l'agent ou un admin ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 10. Isolation des données (sécurité)

### TC-AGT-21 — Cloisonnement par agence

**Q1 :** Un agent ne voit que les biens de son agence dans sa liste `/app/properties` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un agent ne peut pas accéder à la fiche d'un bail appartenant à une autre agence (erreur 403) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un agent ne peut pas modifier un bien qui ne lui est pas assigné (sauf si collaborateur) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 11. Récapitulatif des bugs trouvés

| # | Sévérité | Fonctionnalité | Description | Statut |
|---|----------|---------------|-------------|--------|
| | P0 | | | |
| | P1 | | | |
| | P2 | | | |
| | P3 | | | |

---

## 12. Notes du testeur

> _______________________________________________
> _______________________________________________
> _______________________________________________

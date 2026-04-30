# QA — Bailleur / Propriétaire 🏢

**Acteur :** Propriétaire de biens confiés à une agence (rôle `owner`)
**Précondition :** Être connecté avec un compte de rôle `owner`, avoir au moins un bien enregistré
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

## 1. Dashboard bailleur (`/app/overview/owner`)

### TC-OWN-01 — Vue d'ensemble

**Q1 :** Le dashboard affiche le nombre de biens dans le portefeuille ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le cashflow (revenus du mois, impayés) est visible sur le dashboard ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le taux d'occupation (biens loués vs disponibles) est affiché ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Les réservations en attente de validation apparaissent en priorité ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 2. Portefeuille de biens (`/app/properties`)

### TC-OWN-02 — Créer un bien (P0)

**URL :** `/app/properties/new`

**Q1 :** Le formulaire de création de bien est accessible depuis le dashboard ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les champs obligatoires (type, transaction, titre, prix) sont identifiés clairement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le type de transaction (Vente / Location) peut être sélectionné ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Le type de bien (Appartement, Villa, Terrain…) peut être sélectionné ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Les caractéristiques (surface, chambres, SDB) peuvent être renseignées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Après création, le bien apparaît dans la liste des biens du propriétaire ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q7 :** Une référence unique (ex: TK-2025-001) est générée automatiquement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-03 — Historique de prix (P1)

**Q1 :** Modifier le prix d'un bien enregistre l'ancien prix dans l'historique ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'historique des prix est consultable depuis la fiche du bien ?
> Réponse : ✅ ❌ ⚠️ 🔲
> Réponse : _______________________________________________

### TC-OWN-04 — Hiérarchie de biens (P1)

**Q1 :** Il est possible de créer un bien "parent" (ex: immeuble) et d'y rattacher des lots (appartements) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La navigation entre biens parent et enfants (ancêtres / enfants) fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le type de titre foncier peut être renseigné sur le bien (TF, bail emphytéotique, etc.) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 3. Réservations (`/app/bookings`)

### TC-OWN-05 — Gérer les demandes de réservation

**Q1 :** Les nouvelles demandes de réservation apparaissent dans `/app/bookings` au statut "En attente" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Une notification est reçue (in-app + email) quand une nouvelle demande arrive ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Cliquer "Accepter" valide la réservation et notifie le locataire/acheteur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Cliquer "Refuser" rejette la demande avec un message optionnel ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Cliquer "Annuler" (sur une réservation acceptée) demande une confirmation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-06 — Paiements de réservation

**Q1 :** Les paiements d'acompte et solde liés à la réservation sont visibles dans le détail ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-07 — Vue calendrier (P1)

**URL :** `/app/calendar`

**Q1 :** Le calendrier affiche l'ensemble des réservations et visites planifiées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les réservations de différents biens sont distinguées (couleurs ou libellés) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Cliquer une entrée du calendrier ouvre le détail de la réservation ou visite ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 4. Gestion des baux (`/app/leases`)

### TC-OWN-08 — Créer un bail (P1)

**URL :** `/app/leases/new`

**Q1 :** Le formulaire de création de bail permet de sélectionner le bien et le locataire (Customer) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les champs durée (début/fin), loyer mensuel et caution sont disponibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Après création, le bail apparaît dans `/app/leases` au statut "draft" ou "actif" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-09 — Gérer le bail actif

**Q1 :** L'action "Activer" le bail le fait passer au statut "actif" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'action "Générer l'échéancier" crée les paiements mensuels attendus sur la durée du bail ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'historique complet du bail (paiements, événements) est consultable ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Les pénalités de retard sont appliquées automatiquement après la date limite ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-10 — Enregistrer un paiement mensuel (P1)

**Q1 :** Un bouton "Enregistrer un paiement" est disponible dans l'échéancier du bail ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Après enregistrement, le statut du paiement mensuel passe à "payé" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le téléchargement de la quittance PDF est possible après confirmation du paiement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-OWN-11 — Renouvellement / résiliation (P2)

**Q1 :** L'option "Renouveler le bail" est disponible et crée un nouveau bail lié à l'ancien (parent lease) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'option "Résiliation anticipée" calcule les pénalités et demande une confirmation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La révision annuelle du loyer est disponible (indice ou accord amiable) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 5. Finances (`/app/overview/owner`)

### TC-OWN-12 — Factures et payouts

**Q1 :** Le bailleur peut générer une facture destinée à un Customer depuis l'interface ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les reversements au bailleur après déduction de la commission (Payout) sont visibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le solde des payouts en attente vs versés est clairement distingué ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 6. Communication (`/app/messages`)

### TC-OWN-13 — Messagerie

**Q1 :** Le bailleur peut initier une conversation avec son agent ou un locataire ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'envoi de messages avec pièces jointes fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les conversations de groupe (plusieurs participants) sont disponibles (P2) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 7. Interventions & maintenance

### TC-OWN-14

**Q1 :** La liste des interventions sur ses biens est consultable ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le statut de chaque intervention (ouvert, en cours, résolu) est visible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La demande de devis et validation avant travaux est disponible (P2) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 8. État des lieux — Signature (P2)

### TC-OWN-15

**Q1 :** Le bailleur peut consulter l'état des lieux (entrée ou sortie) de son bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La signature électronique de l'état des lieux est disponible pour le bailleur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 9. Documents (`/app/documents`)

### TC-OWN-16

**Q1 :** Les documents liés à ses biens (contrats, titres fonciers) sont accessibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'option de partage sécurisé par lien temporaire fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 10. Avis (P2)

### TC-OWN-17

**Q1 :** Le bailleur peut répondre publiquement à un avis laissé sur son bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La réponse apparaît sous l'avis correspondant sur la fiche publique ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le bailleur peut signaler un avis inapproprié ?
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

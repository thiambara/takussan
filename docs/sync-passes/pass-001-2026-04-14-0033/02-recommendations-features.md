# Recommandations — `docs/features.md` (Passe 001)

> Changements proposés au catalogue fonctionnel. Chaque entrée cite la section concernée et précise le type de changement : **Ajout**, **Reformulation**, **Changement de priorité**, **Retrait / report**.

---

## A. Ajouts — capacités du modèle non exploitées par le catalogue

### A1. §1.1 Gestion des biens — « Gestion des biens hiérarchiques »

- **Type :** Ajout.
- **Priorité suggérée :** P1.
- **Acteurs :** 🧑‍💼 🏢
- **Texte proposé :** *« Gérer une hiérarchie de biens (immeuble → étages → appartements/lots) via relation parent-enfant. »*
- **Justification :** `Property.parent_id` + `level` + relations `parent()`/`children()` existent dans `models-spec.md §3` mais aucune feature n'y fait référence.

### A2. §1.1 Gestion des biens — « Référence unique automatique »

- **Type :** Ajout.
- **Priorité suggérée :** P1.
- **Acteurs :** 🧑‍💼
- **Texte proposé :** *« Attribuer automatiquement une référence unique (ex: TK-2025-001) à chaque bien publié. »*
- **Justification :** `Property.reference_number` existe mais n'est pas mentionné côté features.

### A3. §1.1 Gestion des biens — « Type de titre foncier »

- **Type :** Ajout.
- **Priorité suggérée :** P2.
- **Acteurs :** 🧑‍💼 🏢
- **Texte proposé :** *« Renseigner et filtrer les biens par type de titre foncier (bail, titre_foncier, délibération, autre). »*
- **Justification :** `Property.title_type` + enum `TitleType` existent dans `models-spec.md`.

### A4. §1.1 Gestion des biens — « Suivi administratif »

- **Type :** Ajout.
- **Priorité suggérée :** P2.
- **Acteurs :** 🛡️ 🏢
- **Texte proposé :** *« Marquer un bien comme nécessitant un suivi administratif particulier (régularisations, dossiers en cours). »*
- **Justification :** `Property.admin_monitored` (ex `with_administrative_monitoring`) existe.

### A5. §1.3 Réservations & visites — Reformulation du P2 « Planification de visites »

- **Type :** Reformulation.
- **Texte actuel :** *« Planification de visites physiques (PropertyVisit) »*
- **Texte proposé :** *« Planification de visites — types : en personne, virtuelle, en autonomie (self-guided), hybride ; assignation d'un agent accompagnateur, durée estimée, feedback post-visite. »*
- **Justification :** `VisitType` a été élargi à `self_guided` et `hybrid`, et `PropertyVisit` porte `agent_id`, `duration_minutes`, `feedback`, `rating`.

### A6. §1.4 Location longue durée — « Pénalités de retard »

- **Type :** Ajout.
- **Priorité suggérée :** P1.
- **Acteurs :** 🧑‍💼 🏢
- **Texte proposé :** *« Appliquer automatiquement des pénalités de retard sur les paiements en retard. »*
- **Justification :** `LeasePayment.late_fee` existe sans feature miroir.

### A7. §1.6 CRM — « Contact principal »

- **Type :** Ajout.
- **Priorité suggérée :** P1.
- **Acteurs :** 🧑‍💼
- **Texte proposé :** *« Désigner un contact principal pour un client (plusieurs agents peuvent être liés, un seul est "primary"). »*
- **Justification :** `UserCustomerRelationship.is_primary` existe.

### A8. §1.7 Messagerie — « Conversation de support »

- **Type :** Ajout.
- **Priorité suggérée :** P2.
- **Acteurs :** 🏠 🛡️
- **Texte proposé :** *« Ouvrir un ticket de support sous forme de conversation dédiée (type = support) entre un utilisateur et l'équipe plateforme. »*
- **Justification :** `ConversationType.support` existe dans l'enum mais n'est exploité par aucune feature.

### A9. §1.11 Avis & réputation — « Signaler un avis »

- **Type :** Ajout.
- **Priorité suggérée :** P2.
- **Acteurs :** 👤 🏠 🏢
- **Texte proposé :** *« Signaler un avis inapproprié — incrémente `reported_count` et déclenche une modération. »*
- **Justification :** `Review.reported_count` existe sans feature de support.

---

## B. Reformulations / clarifications

### B1. §1.1 Gestion des biens — « Collaborateurs avec % de commission »

- **Type :** Reformulation.
- **Texte actuel :** *« Ajouter des collaborateurs au bien (% de commission) »*
- **Texte proposé :** *« Ajouter des collaborateurs au bien avec permissions granulaires et partage de commission (P2 si partage de commission fin). »*
- **Justification :** `PropertyCollaborator.permissions` (json) existe mais ne formalise pas explicitement une colonne « commission_share ». Cf. recommandation côté `models-spec.md` (R11).

### B2. §1.2 Recherche — « Historique des biens consultés »

- **Type :** Option — soit ajouter un modèle (cf. recommandation models-spec R1), soit reformuler en capacité navigateur.
- **Texte proposé (option A, modèle) :** *« Historique personnel des biens consultés récemment (stockage serveur, accessible multi-appareils). »*
- **Texte proposé (option B, applicatif) :** *« Historique local de consultation (localStorage, côté frontend). »*
- **Justification :** Actuellement ❌ sans modèle. À trancher.

### B3. §1.3 Réservations — « Calendrier de disponibilité par bien »

- **Type :** Reformulation.
- **Texte proposé :** *« Vue calendrier agrégée à partir des `Booking` confirmés et des `PropertyVisit` planifiées. Pas de slot de blocage manuel tant qu'un modèle `PropertyAvailability` n'est pas ajouté (cf. models-spec R2). »*
- **Justification :** Actuellement ⚠️ — la capacité d'agrégation existe via `Booking.start_date/end_date` mais le blocage de créneaux manuels (maintenance, visite privée) nécessite un modèle dédié.

### B4. §1.4 Location longue durée — « Renouvellement ou avenant au bail »

- **Type :** Reformulation.
- **Texte proposé :** *« Renouveler un bail ou créer un avenant modifiant loyer / durée / conditions, avec traçabilité (parent lease). »*
- **Justification :** `LeaseStatus.renewed` existe mais il n'y a ni `renewed_from_lease_id` ni modèle `LeaseAmendment`. Feature ⚠️.

### B5. §1.4 Location longue durée — « Révision annuelle du loyer (indice) »

- **Type :** Reformulation.
- **Texte proposé :** *« Révision annuelle du loyer avec motif (indice, accord amiable) — journalisée via un observer sur `Lease.monthly_rent` (cf. `PropertyPriceHistory` comme inspiration). »*
- **Justification :** Actuellement ⚠️ — pas de journal de révision.

### B6. §1.6 CRM — « Notes libres sur un client »

- **Type :** Reformulation.
- **Texte proposé :** *« Ajouter des notes horodatées et signées par un agent sur un client (historique des échanges). »*
- **Justification :** Actuellement ⚠️ — le `metadata` json ne trace ni auteur ni date, et `UserCustomerRelationship.notes` est unique par relation.

### B7. §1.8 Maintenance — « Devis et validation avant travaux »

- **Type :** Reformulation.
- **Texte proposé :** *« Soumettre un ou plusieurs devis (`estimated_cost`), faire valider par le bailleur avant démarrage (workflow d'approbation). »*
- **Justification :** Le champ existe, le workflow non. ⚠️ — à clarifier ou ajouter un modèle `MaintenanceQuote` (cf. models-spec R9).

### B8. §2.2 Rôles — « Éditeur de rôles personnalisés par agence »

- **Type :** Reformulation.
- **Texte proposé :** *« Éditeur de rôles personnalisés, scopé par `agency_id` (via la feature Teams de spatie/permission ou couche applicative dédiée). »*
- **Justification :** Le scope par agence n'est pas explicite dans `models-spec.md`. ⚠️.

---

## C. Changements de priorité

### C1. §1.10 Documents — « Partage sécurisé par lien temporaire » (P1 → ?)

- **Constat :** feature P1 sans support modèle — risque de glisser le MVP.
- **Option 1 :** maintenir en P1 et ajouter le modèle `DocumentShareLink` côté `models-spec.md` (cf. R5).
- **Option 2 :** rétrograder en P2 en attendant le modèle.
- **Recommandation :** option 1 (garder P1, ajouter modèle) — le partage sécurisé est un besoin récurrent immobilier.

### C2. §1.6 CRM — « Tâches et rappels » (P2)

- **Constat :** P2 sans modèle. Proposer soit d'ajouter `Task` côté models-spec (R6), soit de repousser en P3.
- **Recommandation :** ajouter `Task` en P2 — beaucoup de processus CRM en dépendent.

---

## D. Features à retirer ou expliciter comme « purement applicatif »

Aucune feature n'est à retirer strictement. Les quelques cases marquées ⚠️ applicatives (sessions Sanctum, digest, comparateur, suppression RGPD, export CSV…) ne nécessitent pas de modèle supplémentaire ; il suffirait d'annoter dans `features.md` qu'elles sont portées par la couche applicative sans persistance dédiée.

---

## Synthèse

- **Ajouts :** 9 features à ajouter (A1–A9).
- **Reformulations :** 8 (B1–B8).
- **Changements de priorité :** 2 (C1–C2).
- **Retraits :** 0.

Une fois ces changements appliqués à `features.md` (hors scope de cette passe), relancer `/sync-specs` pour une passe 002 de vérification.

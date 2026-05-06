---
date: 2026-05-06
tester: Codex (browser smoke test)
account: owner1@dakarimmo.sn (Astou Dieng, rôle owner · Dakar Immo)
env: localhost:3000 (web Next.js 16.2.3) + localhost:8002 (api Laravel)
spec: docs/qa/bailleur-proprietaire-qa.md
scope: parcours bailleur/propriétaire — login, dashboard, navigation, biens, réservations, calendrier, visites, baux, finances, maintenance, états des lieux, messagerie, documents, avis
---

# Smoke test — Bailleur / Propriétaire

Test navigateur réalisé sur le scénario `docs/qa/bailleur-proprietaire-qa.md`.

Compte utilisé : `owner1@dakarimmo.sn` / `password`. Le compte exemple du document (`proprietaire1@example.com`) n'existe pas dans la base locale seedée.

## Légende sévérité

- **P0** — bloque l'usage du module ou rend une action métier principale impossible
- **P1** — fonctionnalité importante absente/dégradée, contournable par URL ou autre module
- **P2** — anomalie UX/i18n/données, sans blocage immédiat
- **P3** — polish / amélioration

## Synthèse

| Sévérité | Nombre |
|----------|-------:|
| P0       |      4 |
| P1       |     10 |
| P2       |      9 |
| P3       |      5 |
| **Total** | **28** |

**Verdict** : le parcours propriétaire est utilisable en lecture sur plusieurs modules, mais les actions métier owner ne sont pas encore alignées avec la QA. Les blocages principaux sont : actions accept/refuse absentes sur les réservations, actions de confirmation absentes sur les visites, création de bail trop technique, et page avis orientée "laisser un avis" au lieu de gérer les avis reçus. Le dashboard et les listes chargent sans erreur console visible, mais plusieurs surfaces attendues sont absentes ou incomplètes.

## P0 — Bloquants

### P0-1 · Réservation en attente sans actions Accepter / Refuser

- **Reproduction** : `/app/bookings` → ouvrir une réservation en attente (`/app/bookings/387`).
- **Observé** : la fiche affiche le statut `En attente`, le total, l'acompte et l'historique, mais les seules actions visibles sont `Enregistrer un paiement` et `Annuler la réservation`.
- **Attendu QA** : boutons `Accepter` et `Refuser`, confirmation, message optionnel/motif, changement de statut et notification client.
- **Impact** : TC-OWN-16 et TC-OWN-17 impossibles depuis l'UI.

### P0-2 · Visite demandée sans action Confirmer / Replanifier / Marquer effectuée

- **Reproduction** : `/app/visits` → ouvrir une visite demandée (`/app/visits/168`).
- **Observé** : la fiche affiche uniquement le bien, le créneau, le type et un lien `Voir le bien`. Aucun bouton `Confirmer`, `Annuler`, `Replanifier`, ni `Marquer effectuée`.
- **Attendu QA** : le propriétaire doit pouvoir confirmer une demande, marquer une visite passée comme effectuée et déclencher les notifications/rappels.
- **Impact** : TC-OWN-21 impossible.

### P0-3 · Création de bail expose des champs ID bruts

- **Reproduction** : `/app/leases/new`.
- **Observé** : le formulaire demande `Bien (ID)`, `Bailleur (ID)`, `Locataire (ID)` sous forme de spinbuttons numériques.
- **Attendu QA** : sélecteur de bien, sélecteur de locataire avec recherche Customer, dates, durée, loyer, échéance, caution et garants.
- **Impact** : un propriétaire ne peut pas créer un bail sans connaître les IDs internes. TC-OWN-23 est non utilisable en conditions réelles.

### P0-4 · Page Avis owner incorrecte

- **Reproduction** : `/app/profile/reviews`.
- **Observé** : la page liste des séjours/baux avec CTA `Laisser un avis`, comme un parcours locataire/client.
- **Attendu QA** : côté propriétaire, l'écran doit permettre de consulter les avis reçus sur ses biens et de `Répondre` / `Signaler`.
- **Impact** : TC-OWN-14 partiel et TC-OWN final "Avis — répondre / signaler" impossibles.

## P1 — Fonctionnel Dégradé

### P1-1 · Sidebar owner incomplète : Maintenance absent

- **Reproduction** : login owner → sidebar `/app`.
- **Observé** : la sidebar contient Tableau de bord, Mes biens, Mes favoris, Recherches sauvegardées, Réservations, Baux, Finances, Messagerie, Documents, Statistiques, Exports, Clients, États des lieux, Visites, Calendrier.
- **Manquant QA** : `Maintenance` dans la sidebar, alors que `/app/maintenance` fonctionne par URL directe.
- **Impact** : TC-OWN-01 Q2 non conforme ; le module maintenance est caché.

### P1-2 · Dashboard owner incomplet

- **Reproduction** : `/app/overview/owner`.
- **Observé** : widgets présents : biens, baux actifs, cashflow du mois, impayés, taux d'occupation, réservations en attente, courbe cashflow/occupation.
- **Manquant QA** : détail par type, vendus/archivés, prochains payouts, liste des demandes en attente, widget maintenance / devis à approuver, état vide avec CTA.
- **Impact** : TC-OWN-02 partiel.

### P1-3 · Création de bien publie directement au lieu d'un brouillon explicite

- **Reproduction** : `/app/properties/new`.
- **Observé** : le formulaire est accessible et complet sur les champs principaux, mais le CTA principal est `Publier le bien`. Aucun workflow visible "Créer en brouillon / non publié".
- **Attendu QA** : création initiale en statut `Brouillon` / `Non publié`, redirection vers la fiche, référence unique affichée.
- **Impact** : risque de publication prématurée ; TC-OWN-04 Q2/Q4 non alignés.

### P1-4 · Fiche bien sans onglets métier attendus

- **Reproduction** : `/app/properties/83`.
- **Observé** : formulaire d'édition unique avec infos générales, prix, localisation, caractéristiques, description, équipements, photos.
- **Manquant QA** : onglets dédiés Adresse/Localisation, Médias, Historique de prix, Lots/Sous-biens, Titre foncier/Légal, statistiques vues/favoris.
- **Impact** : TC-OWN-05 à TC-OWN-14 très partiels.

### P1-5 · Photos du bien en erreur réseau

- **Reproduction** : `/app/properties/83`.
- **Observé** : alerte visible : `Impossible de charger les photos. Vérifiez que le serveur est accessible.`
- **Impact** : la gestion média est affichée, mais l'état existant ne charge pas. TC-OWN-06 est dégradé.

### P1-6 · Liste Mes biens sans tri visible

- **Reproduction** : `/app/properties`.
- **Observé** : filtres statut/type/contrat + recherche sont présents. Les colonnes `BIEN`, `CONTRAT`, `PRIX`, `STATUT`, `VISIBILITÉ`, `ACTIONS` ne sont pas des boutons de tri.
- **Attendu QA** : tri par date, prix, vues.
- **Impact** : TC-OWN-03 Q3 non conforme.

### P1-7 · Liste Baux sans filtres visibles

- **Reproduction** : `/app/leases`.
- **Observé** : liste de baux + CTA `Nouveau bail`, mais pas de filtres par statut ni par bien.
- **Attendu QA** : filtre par statut et par bien.
- **Impact** : TC-OWN-22 Q2 non conforme.

### P1-8 · Bail brouillon sans action Activer

- **Reproduction** : `/app/leases/379`.
- **Observé** : statut `Brouillon`, actions `Ajouter un document`, `Générer l'échéancier`, `Enregistrer un paiement`.
- **Attendu QA** : action `Activer`, puis génération automatique de l'échéancier et notification locataire.
- **Impact** : TC-OWN-24 non conforme ; le vocabulaire d'action ne correspond pas au workflow.

### P1-9 · Révision annuelle / caution non visibles sur bail actif

- **Reproduction** : `/app/leases/374`.
- **Observé** : actions visibles : générer échéancier, enregistrer paiement, renouveler, résilier. Pas de `Réviser le loyer`, pas d'onglet/section `Caution`.
- **Impact** : TC-OWN-29 et TC-OWN-30 non vérifiables dans l'UI actuelle.

### P1-10 · Maintenance accessible mais pas reliée à la navigation owner

- **Reproduction** : URL directe `/app/maintenance`, puis `/app/maintenance/48`.
- **Observé** : liste et détail fonctionnent, avec statut/priorité et section devis. Le module n'est pas dans la sidebar owner.
- **Impact** : fonctionnalité cachée ; les owners ne peuvent pas la découvrir depuis le shell.

## P2 — UX / i18n / Données

### P2-1 · Dates en anglais sur plusieurs pages métier

- Observé sur réservations, visites, baux, paiements, maintenance, états des lieux : `10 Jun 2026`, `29 May 2026`, `2 Mar 2026`.
- Attendu : format FR (`10 juin 2026`) ou format numérique cohérent.

### P2-2 · Montants au format US dans plusieurs modules

- Observé : `121,000,000 F CFA`, `500,000 F CFA`, `2,204,812 F CFA`.
- Attendu : format FR/SN cohérent (`121 000 000 F CFA` ou `121 000 000 F CFA`).

### P2-3 · Labels anglais dans la messagerie

- **Reproduction** : `/app/messages`.
- **Observé** : bouton `New group`, empty state `Select a conversation to view messages.`
- **Impact** : i18n incohérente dans une UI FR.

### P2-4 · Priorités maintenance mélangées FR/EN

- **Reproduction** : `/app/maintenance`.
- **Observé** : filtres en FR (`Faible`, `Normale`, `Élevée`, `Urgente`) mais cartes avec valeurs `Low`, `High`, `Normal`.

### P2-5 · Détail maintenance expose des IDs internes

- **Reproduction** : `/app/maintenance/48`.
- **Observé** : `BIEN #98`, `ASSIGNÉ À Utilisateur #65`.
- **Amélioration** : afficher le titre du bien et le nom du prestataire/agent, avec liens.

### P2-6 · Calendrier trop dense en vue mois

- **Reproduction** : `/app/calendar`.
- **Observé** : chaque jour contient de nombreuses lignes `Réservation ...`, plus des compteurs `+ N autres`. La page fonctionne, mais la lisibilité est faible pour un portefeuille de 76 biens.
- **Amélioration** : regrouper par type/couleur, limiter à 2 événements visibles, proposer une liste latérale du jour sélectionné.

### P2-7 · Calendrier sans légende couleur explicite

- **Reproduction** : `/app/calendar`.
- **Observé** : toggles `Réservations` et `Visites` présents, mais pas de légende claire des couleurs par réservation/visite/bail.
- **Attendu QA** : différencier réservation, visite et location active.

### P2-8 · Documents vides malgré portefeuille actif

- **Reproduction** : `/app/documents`.
- **Observé** : `0 document(s)` pour un owner avec 76 biens et 24 baux actifs.
- **Impact** : peut être normal si la seed n'a aucun document, mais l'état vide devrait proposer des exemples de catégories pertinentes (titre foncier, bail, quittance, devis).

### P2-9 · Titres de page génériques

- **Observé** : `/app/payments`, `/app/maintenance/48`, `/app/profile/reviews` gardent le title navigateur `Tableau de bord — Takussan`.
- **Attendu** : title spécifique (`Finances`, `Maintenance`, `Avis`).

## P3 — Améliorations

### P3-1 · Aligner le compte exemple QA

- Le document QA cite `proprietaire1@example.com / password`, mais la seed locale fournit `owner1@dakarimmo.sn / password`.
- Amélioration : ajouter un compte alias ou mettre à jour la QA.

### P3-2 · Ajouter un raccourci direct vers `/app/overview/owner`

- Après login, l'URL est `/app` et non `/app/overview/owner`. Le dashboard `/app` est role-aware et affiche bien des métriques owner, mais le scénario QA cible explicitement `/app/overview/owner`.
- Amélioration : soit rediriger owner vers `/app/overview/owner`, soit documenter que `/app` est l'entrée canonique.

### P3-3 · Ajouter un filtre "archivés" dans Mes biens

- La liste affiche les statuts visibles, mais aucun contrôle `Inclure les archivés`.
- Couvre TC-OWN-09 Q4.

### P3-4 · Améliorer les CTA de création

- `/app/properties/new` utilise `Publier le bien`.
- Proposition : actions séparées `Enregistrer en brouillon` et `Soumettre à publication`.

### P3-5 · Améliorer les listes owner pour gros portefeuilles

- Les pages `Mes biens`, `Calendrier`, `Paiements` et `États des lieux` chargent beaucoup d'éléments.
- Amélioration : densité tableau optionnelle, filtres sauvegardés, recherche par référence, export contextualisé.

## Couverture réalisée

- Login owner : `owner1@dakarimmo.sn / password`.
- Routes testées au navigateur : `/app`, `/app/overview/owner`, `/app/properties`, `/app/properties/83`, `/app/properties/new`, `/app/bookings`, `/app/bookings/387`, `/app/calendar`, `/app/visits`, `/app/visits/168`, `/app/leases`, `/app/leases/new`, `/app/leases/379`, `/app/leases/374`, `/app/payments`, `/app/maintenance`, `/app/maintenance/48`, `/app/inventories`, `/app/messages`, `/app/documents`, `/app/profile/reviews`.
- Console navigateur : pas d'erreurs/warnings visibles sur la dernière page testée.
- Réseau vérifié ponctuellement : les requêtes récentes de documents/avis répondaient 200 avec usage de `fields[...]` et `include` sur certaines routes.


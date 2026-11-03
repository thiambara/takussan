---
id: TCK-215
title: "Super-admin — Templates de notification (email / SMS / push)"
status: done
phase: P1
family: applicatif
estimate: M
wave: 23
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-145]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#12-appnotification-
    - docs/models-spec.md#30-setting
tags: [back, front, super_admin, notifications, p1]
---

## Contexte

`features.md` §2.9 P1 prévoit la "Configuration email (templates, expéditeur)". Aujourd'hui les templates email sont en dur (Blade Mail) et un super-admin ne peut ni en éditer le contenu ni régler l'expéditeur sans déployer. Avec l'arrivée des canaux SMS et push (§2.3), le besoin s'élargit aux trois canaux.

## Objectif utilisateur

Un super-admin ouvre `/super-admin/templates`, sélectionne un événement (ex. `booking_confirmed`) et un canal (email / SMS / push), édite le template multilingue (FR / EN / WO), prévisualise le rendu avec données factices et active / désactive l'envoi par canal.

## Contrat de données

Endpoints à exposer :

- `GET /api/admin/notification-templates` — liste des événements `notification_event` × `channel`
- `GET /api/admin/notification-templates/{event}/{channel}` — détail (subject + body multilingue)
- `PATCH /api/admin/notification-templates/{event}/{channel}` — éditer (subject, body par langue, is_active)
- `POST /api/admin/notification-templates/{event}/{channel}/preview` — body `{ locale, sample_data?: object }` → renvoie le rendu HTML/text

Le store utilise une table dédiée `notification_templates` (event, channel, locale, subject, body, is_active) ou `Setting` avec convention de clé. Décision finale lors de l'implémentation, mais le **payload** API est figé.

## Direction UX / Artistique

Liste des événements à gauche (groupés par domaine : Réservation, Bail, Paiement, Maintenance, Compte). Détail à droite avec onglets canal (Email / SMS / Push) et tabs langue (FR / EN / WO). Éditeur riche pour email (HTML), zone de texte courte pour SMS (compteur de caractères + segments), texte court pour push. Bouton "Prévisualiser" en haut, ouvre une modale avec le rendu et un sélecteur de jeu de données factice.

## Contraintes strictes (métier)

- Endpoints super-admin-only.
- **Whitelist** des événements éditables — la liste est gérée côté backend (constante). Aucun template système (auth, reset password, etc. — sécurité critique) ne doit être exposé sauf décision explicite.
- Le moteur de templating supporte des **placeholders** définis par événement (`{{ booking.code }}`, `{{ user.first_name }}`) — la validation refuse un placeholder inconnu pour cet événement (422).
- Le SMS impose une limite de 160 caractères par segment ; le compteur côté UI affiche le nombre de segments. Limite stricte côté serveur (validation 422 au-delà de 6 segments).
- Activity log sur chaque édition — diff conservé.
- Les langues FR sont obligatoires ; EN / WO fallback vers FR.

## Delta à produire

- [ ] Migration : table `notification_templates` (`event`, `channel`, `locale`, `subject`, `body`, `is_active`, `updated_by`)
- [ ] Constante `App\Domain\Notifications\EditableNotificationEvents`
- [ ] Service `App\Services\Admin\NotificationTemplateService` (lecture, mutation, render avec placeholders, validation)
- [ ] Controller `Admin\NotificationTemplateController`
- [ ] Routes `routes/api/admin.php`
- [ ] Adaptation des senders existants (`app/Notifications/*`) pour résoudre dynamiquement le template (avec fallback hardcoded si aucun template DB actif)
- [ ] Activity log `super_admin_notification_template_updated`
- [ ] Frontend page `/super-admin/templates`
- [ ] Composants : `NotificationEventList`, `TemplateEditor` (HTML pour email, textarea pour SMS / push), `TemplatePreviewDialog`
- [ ] Tests backend : whitelist, placeholder inconnu refusé, SMS > 6 segments refusé, render preview correct
- [ ] Tests UI : sélection événement, édition multilingue, prévisualisation

## Critères d'acceptation

- [ ] Éditer le template `booking_confirmed/email/fr` change l'email envoyé sans redéploiement
- [ ] Un placeholder inconnu (`{{ unknown }}`) déclenche un 422 explicite
- [ ] Un SMS > 6 segments (× 160 chars) est refusé
- [ ] Un agency_admin reçoit 403 sur tous les endpoints
- [ ] La prévisualisation rend le template avec un jeu de données factice cohérent
- [ ] Désactiver `is_active` fait fallback sur le template hardcoded (pas d'envoi vide)

## Hors périmètre

- Templates système d'authentification (sécurité — restent hardcoded)
- Personnalisation des templates par agence — non couvert (un seul jeu plateforme)
- A/B testing de templates — out of scope
- Import / export de packs de templates — out of scope

## Notes d'implémentation

- Stockage retenu : table dédiée `notification_templates` par `event/channel/locale`.
- Whitelist initiale : `booking_confirmed`, `payment_received`, `maintenance_created`; les templates auth/reset restent hors scope.
- `NewBookingNotification` résout maintenant `booking_confirmed/email` dynamiquement et retombe sur le contenu hardcodé si aucun template actif n'existe.

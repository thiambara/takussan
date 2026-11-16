# ADR-0114 — Un signalement de conversation est une ligne lue par la plateforme, et élargir un fil direct ouvre un groupe neuf

- **Statut** : Accepté le 2026-11-15 — décision du porteur « implémente tout », modalités à revoir
- **Date** : 2026-11-15
- **Tickets** : TCK-2859 (API), TCK-2860 (écrans)
- **S'appuie sur** : [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (accès aux fils de contexte), [ADR-0047](0047-niveaux-d-operateur-plateforme.md) (routes de console sans geste : `super_admin`), la règle de joignabilité de `MessagingReach` (TCK-565), la règle « une directe ne se quitte pas » (TCK-861)

## Contexte

Les maquettes de la messagerie (`app-messagerie`, menu d'un fil) portent trois gestes que l'API ne sert pas : « Marquer comme non lue », « Ajouter un participant » et « Signaler la conversation ». La fiche TCK-2632 les avait rangés en « donnée », sans ticket de suite.

Mesuré le 2026-11-15 (`routes/api/conversations.php`, worktree `feat/audit-manques-2026-11-15`) :

- `PUT conversations/{c}/read`, `mute`, `archive`, `unarchive` existent ; **aucun « non lu »**. Est non lu, pour un lecteur, tout message d'un autre, hors avis système et hors message supprimé, postérieur à son `last_read_at` (`ConversationController::index`, `$nonLus`).
- **Aucun signalement de conversation.** Le seul signalement du dépôt porte sur les avis (`ReviewReportService`, ADR-0043 § 6), rangé dans le `metadata` de l'avis.
- `POST conversations/{c}/participants` exige un **administrateur actif d'un groupe** (`ConversationPolicy::addParticipant`) : un fil `direct` n'a pas d'administrateur, l'ajout y rend 403, et le sélecteur `GET conversations/{c}/contacts` aussi.
- Un fil direct ne se quitte pas (TCK-861) et ne se recrée pas : la directe entre deux personnes est unique par contexte (`DirectConversationService::firstOrCreate`).

Deux de ces gestes changent la nature des données : un signalement est un objet neuf, avec ses lecteurs ; ajouter une personne à un échange privé lui en ouvrirait l'historique.

## Décision

### 1. « Non lu » est un état du lecteur, porté par son `last_read_at`

`PUT /api/conversations/{c}/unread` place le `last_read_at` du participant **une seconde avant** le dernier message qui compte comme non lu (même prédicat que la liste : d'un autre, hors système, non supprimé). Le fil compte alors au moins un non-lu, et `meta.counts.unread` le compte.

- **Idempotent** : la valeur dépend du dernier message, jamais de l'heure de l'appel ; un `last_read_at` déjà antérieur n'est pas avancé.
- **Sans message d'un autre**, il n'y a rien à remettre en non lu : 200, rien ne change.
- **Garde** : celle de la lecture (`ConversationAccess::allows`).
- **Conséquence assumée** : l'accusé de lecture de l'auteur (`read_by_recipient` et `read_count`, TCK-2858, lus sur le `last_read_at` des autres) repasse à « non lu » pour ce message. Le geste dit « je ne l'ai pas traité », et l'accusé le reflète. Une colonne propre (`marked_unread_at`) séparerait les deux ; elle est écartée tant que personne ne le demande.

### 2. Un signalement est une ligne, lue par la plateforme, qui ne gèle rien

Table `conversation_reports` : `conversation_id`, `reporter_id`, `reason` (code), `comment` (texte libre, ≤ 500, facultatif), horodatages.

- **Qui signale** : un participant actif du fil (`ConversationAccess::allows` **et** une participation sans `left_at` ; la dérogation générale du super-admin ne vaut pas ici : il ne participe pas).
- **Motifs codés** : `spam`, `harassment`, `fraud`, `inappropriate`, `other`. Le front porte les libellés.
- **Un seul signalement par auteur et par fil** : index unique `(conversation_id, reporter_id)` ; le second rend **409 `conversation.already_reported`**. L'écriture se fait par `insertOrIgnore` (une violation d'unicité abandonnerait la transaction PostgreSQL).
- **Qui lit** : le **super-admin seul**, par `GET /api/admin/conversation-reports` (route de la console sans geste déclaré, donc réservée au `super_admin`, ADR-0047). La liste rend le signalement, l'auteur et l'identifiant du fil, **jamais le contenu des messages**. L'administrateur de l'agence du fil n'en lit rien dans ce premier usage : à rouvrir si le porteur le décide.
- **Ce qu'il gèle** : rien. Le fil reste ouvert, aucun participant n'est prévenu, aucune notification ne part. Le traitement (écran de console, décisions) est hors périmètre.

### 3. Ajouter quelqu'un à un fil direct crée un groupe neuf, sans l'historique

`POST /api/conversations/{c}/participants` sur un fil `direct` :

- crée un **groupe** dont l'appelant est l'administrateur et dont les membres sont l'autre partie de la directe et les personnes ajoutées ;
- le groupe reprend le **bien** (`property_id`) et le **bail** (`lease_id`) de la directe, et son sujet est le `subject` envoyé, sinon celui de la directe, sinon les noms des membres ;
- **aucun message** n'y est copié : l'historique d'un échange à deux reste à ces deux-là ;
- la **directe reste** inchangée (messages et participants) ;
- **réponse** : 201 avec le nouveau fil (`ConversationResource`), et non la forme `{conversation_id, added_user_ids}` de l'ajout à un groupe.

Garde : une nouvelle capacité `ConversationPolicy::addToDirect` — un fil `direct`, et l'appelant **peut y écrire** (`ConversationAccess::allowsWriting`) : qui lit sans écrire n'ouvre pas de groupe à partir du fil. Le sélecteur `GET conversations/{c}/contacts` s'ouvre sous la même capacité, pour qu'il liste ce que l'ajout accepte.

Règles de l'ajout, les mêmes que pour un groupe : la personne ajoutée est **joignable** par l'appelant pour ce fil (`MessagingReach::outOfReach`, donc jamais un client d'une autre agence) ; si la directe porte un bail, elle **lit ce bail** (`guardLeaseReaders`, TCK-2191) ; le groupe compte 20 membres au plus ; sans personne de neuf (l'autre partie, soi-même), aucun groupe à deux n'est créé. Un refus rend 422, sans fil créé.

## Conséquences

- **Ce que ça coûte** : une table, un modèle, une route de console. Une forme de réponse qui dépend du type du fil, que TCK-2860 doit lire.
- **Ce que ça interdit** : qu'un ajout à une directe fasse lire l'échange passé à un tiers ; qu'un signalement masque ou gèle un fil sans décision humaine.
- **Ce que ça rend possible** : une file de traitement des signalements (console) sans changer le modèle ; le partage des signalements avec l'agence par une seule règle de lecture.
- **Ce que ça ne règle pas** : la notification de la plateforme à un signalement neuf, et la sanction ; un double envoi de l’ajout à une directe crée deux groupes (aucun verrou de la paire, à la différence de la directe).

## Options écartées

- **Changer le type de la directe en groupe** : l'historique privé devenait lisible par la personne ajoutée, et la directe unique de la paire disparaissait (le prochain « Nouvelle conversation » en recréait une).
- **Ranger les signalements dans le `metadata` du fil**, comme les avis : un fil n'est lu par la plateforme que par exception ; une ligne se liste, se pagine et s'indexe sans lire les fils.
- **Remettre `last_read_at` à nul** pour « non lu » : tout l'historique redevenait non lu, et le compte de la pastille explosait.

## Application

- `PUT /api/conversations/{conversation}/unread` (`ConversationController::markAsUnread`).
- `ConversationReport`, migration `2026_11_15_285900_create_conversation_reports_table`, `POST /api/conversations/{conversation}/reports`, `GET /api/admin/conversation-reports`.
- `ConversationPolicy::addToDirect`, `ConversationParticipantController::store` (branche directe), `GroupConversationService::create`.
- Gardes : `ConversationUnreadTest` (accusé de l'auteur compris), `ConversationReportTest`, `DirectConversationAddParticipantTest`.

# ADR-0128 — Le fil est l'interface des objets : un fil rattaché à son objet, des cartes relues pour chaque lecteur, un seul chemin d'écriture

- **Statut** : Accepté le 2026-11-17 (décisions du porteur : architecture A, salles du bail et de la réservation, apartés d'équipe — « je valide toutes tes recommandations »)
- **Date** : 2026-11-17
- **Tickets** : à écrire par lot, d'après le [plan « Le Fil »](../plans/2026-11-17-le-fil.md)
- **Va avec** : [ADR-0129](0129-le-socle-temps-reel-signale-et-l-api-sert.md) (le socle temps réel)
- **S'appuie sur** : [ADR-0068](0068-le-fil-d-un-prospect-suit-le-contact-principal-du-bien.md) (le fil d'un prospect suit le contact principal), [ADR-0101](0101-le-fil-commercial-vit-dans-la-fiche-client.md) (le dossier commercial est la fiche client), [ADR-0114](0114-signaler-une-conversation-et-elargir-un-fil-direct.md) (élargir une directe ouvre un groupe neuf), [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (accès aux fils de contexte)

## Contexte

Relevé sur `dev` (`54adc70f5`) le 2026-11-17 :

- **Un seul objet parle dans un fil : l'intervention.** `SyncMaintenanceConversation` crée et
  synchronise le fil d'une demande, et `SystemMessageFactory::maintenance()` y écrit un avis à chaque
  étape. Les autres événements de `SystemMessageFactory` ne portent que sur le fil lui-même
  (participant ajouté ou retiré, rôle, renommage).
- **Le bail, la réservation, la visite, le paiement et l'état des lieux n'ont pas de fil à eux.**
  `ConversationType` a des cas `lease` et `booking`, mais aucune colonne ne relie un fil à une
  réservation. Un fil se rattache par trois clés étrangères facultatives (`property_id`, `lease_id`,
  `maintenance_request_id`) : chaque nouvel objet demanderait une migration de plus.
- **On ne peut rien faire depuis un fil.** La colonne de contexte (`ConversationThreadContext`)
  montre le bien, la fiche client, le bail ou l'intervention, mais tout geste se fait sur la page de
  l'objet.
- **Le cache de la liste est commun à tous les lecteurs.** `MessageObserver` écrit
  `conversations.last_message_preview`, servi tel quel par `ConversationResource` à chaque
  participant. Un aperçu qui porterait un montant le montrerait au locataire.
- **Le texte d'un avis système est écrit en français par l'API** (`SystemMessageFactory::humanise`),
  contre le principe n° 5 de `CLAUDE.md`.
- Le locataire d'un bail est une **fiche client** (`leases.tenant_id` → `customers`), qui n'a pas
  toujours de compte (`customers.user_id` peut être nul).

Le porteur veut faire de la messagerie la fonction centrale de coordination : chaque objet a son
fil, l'objet y parle, et on agit sur lui sans quitter la conversation.

## Décision

**Un fil peut être rattaché à un objet. Un objet peut être posé dans un fil en carte, ou y parler en
événement. Le message ne garde qu'une référence et un code, et son contenu est relu à l'affichage,
pour chaque lecteur, par la politique de l'objet. Un geste fait depuis une carte passe par la route
de l'objet, jamais par une route de la messagerie.**

### 1. Le fil est rattaché à son objet par un lien générique

- `conversations` gagne `subject_type` et `subject_id`, nuls par défaut, avec un index.
- Les types admis sont tenus par un **registre fermé** en code (`SujetsDuFil`) : type → modèle →
  droit de lecture. Un type absent du registre est refusé, et aucun nom venu d'une requête n'est
  résolu hors de ce registre.
- Les trois clés existantes restent : elles disent **le contexte** du fil (son bien, son bail). Le
  sujet dit **à quel objet le fil appartient**. Les fils d'intervention reçoivent leur sujet par
  reprise ; `maintenance_request_id` n'est pas retiré par cet ADR.
- Il n'y a pas de clé étrangère sur un lien générique : la suppression d'un objet ferme son fil par
  un observateur (statut `closed`), et un test le garde pour chaque type du registre.

### 2. Les salles : un fil par bail et par réservation, synchronisé comme celui d'une intervention

- **Un bail** a une salle (`type = lease`, sujet = le bail), dont les membres sont le compte du
  locataire (s'il en a un), le bailleur désigné (`landlord_id`) et l'agent attribué (`agent_id`).
- **Une réservation** a une salle (`type = booking`, sujet = la réservation), dont les membres sont
  le candidat et l'agent qui la suit.
- Une salle est **unique par sujet** (index unique partiel sur `subject_type`, `subject_id` pour
  ces types) et se crée par `insertOrIgnore` (une violation d'unicité abandonnerait la transaction
  PostgreSQL).
- Les membres sont **synchronisés** à chaque changement des parties, sur le patron de
  `SyncMaintenanceConversation`. L'accès est jugé comme pour un fil d'intervention :
  `ConversationAccess` gagne une branche par sujet, *participation active **et** lecture de
  l'objet*. Un bail fini garde la lecture et perd l'écriture (règle de TCK-2374).
- Une salle ne remplace pas la fiche client comme dossier commercial (ADR-0101) : c'est le canal de
  coordination entre les parties.

### 3. Un message de type carte ou événement garde une référence, jamais une copie

- `MessageType` gagne deux cas :
  - **`card`** : un participant pose un objet dans le fil (« partager ce bien », « proposer ce
    créneau ») ;
  - **`event`** : la plateforme écrit qu'un objet a changé (échéance, paiement reçu, devis soumis,
    état des lieux à signer). `system` reste pour les événements du fil lui-même.
- Le `metadata` d'une carte ou d'un événement est **fermé** :
  `{objet: {type, id}, code, donnees}`. `type` est un type du registre, `code` un code d'événement
  connu, et `donnees` ne porte **que** ce que tout participant peut lire. Un montant, un coût, un
  téléphone ou une adresse n'y sont jamais.
- **Le contenu est relu à l'affichage** : la ressource du message résout l'objet par le registre,
  applique sa politique (`view`) pour **le lecteur**, et rend la projection de l'objet que ce
  lecteur lit déjà ailleurs, avec ses `abilities`. Un lecteur qui ne lit pas l'objet reçoit
  `{indisponible: true}`, sans autre champ.
- **La colonne `content` d'une carte ou d'un événement est un code neutre**, et l'aperçu de la liste
  (`last_message_preview`) aussi. Le front en compose le libellé (principe n° 5). Le cache commun
  de la liste ne peut donc rien porter qui dépende du lecteur.

### 4. Un seul chemin d'écriture

- Un geste offert par une carte (approuver un devis, confirmer un créneau, payer, signer) appelle
  **la route existante de l'objet**, avec sa politique, sa validation et sa machine d'état.
- La messagerie n'expose **aucune** route « agir sur une carte ». Une carte n'a pas de pouvoir
  propre : elle affiche les `abilities` que l'objet accorde au lecteur.
- Le geste fait, l'objet émet son événement dans le fil (§ 3), et le socle temps réel (ADR-0129)
  rafraîchit la carte chez les autres lecteurs.

### 5. Un événement ne compte comme non lu que pour qui doit agir

- Un événement porte `geste_pour` : la liste des comptes dont l'objet attend un geste, calculée à
  l'émission (le donneur d'ordre pour un devis soumis, le locataire pour un loyer dû).
- Le compte des non-lus (`ConversationController::index`, `$nonLus`) compte un message `event`
  seulement si le lecteur figure dans `geste_pour`. Tout autre événement s'affiche replié et ne
  compte jamais. La règle actuelle (message d'un autre, hors avis système, hors message supprimé)
  ne change pas pour les autres types.

### 6. Les apartés d'équipe : un message que seul le personnel du fil lit

- `messages` gagne `visibilite` : `tous` (défaut) ou `equipe`.
- Un message `equipe` n'est lu, écrit, compté, notifié et retrouvé par la recherche **que** par les
  participants qui sont personnel actif de l'agence du fil (l'agence de son sujet, sinon de son bien
  ou de son bail). Pour tout autre lecteur, il n'existe pas : ni dans la liste des messages, ni dans
  les non-lus, ni dans les accusés de lecture, ni dans l'index de recherche (filtre Meilisearch
  sur la visibilité), ni dans les notifications, ni sur le pont WhatsApp ou SMS, ni dans le
  copilote.
- **Un aparté ne met jamais à jour l'aperçu commun de la liste** (`last_message_*`).
- Le filtre vit **dans** `ConversationAccess` (requête des messages), pas dans chaque contrôleur.
  Un test par chemin de lecture, vérifié par ablation, garde la non-fuite.
- Les **@mentions** sont des identifiants de compte dans le `metadata` du message. Une mention ne
  notifie que si la personne mentionnée lit ce message.

### 7. La boîte de pilotage se dérive, elle ne se stocke pas

- « À vous de répondre », « En attente de l'autre » et « Engagements en retard » sont **calculés**
  à la lecture, à partir du dernier message compté et des engagements. Il n'y a aucune colonne
  d'état.
- Deux colonnes seulement :
  - `conversation_participants.rappel_le` : « Rappelez-le-moi », un état propre au lecteur ;
  - `conversations.attribue_a` : la personne de l'agence qui suit le fil.
- **L'attribution vaut pour les salles et les groupes, pas pour le fil d'un prospect.** Ce
  dernier suit le contact principal du bien (ADR-0068) : pour le confier à quelqu'un d'autre, on
  change le contact principal.

## Conséquences

- **Ce que ça coûte** :
  - deux colonnes sur `conversations`, une sur `messages`, une sur `conversation_participants`, et
    deux cas de `MessageType` ;
  - un registre, une projection par lecteur pour chaque type d'objet, et une branche d'accès par
    sujet ;
  - la relecture d'une carte coûte une requête par objet : la ressource charge les objets d'une
    page de messages en lot, par type.
- **Ce que ça interdit** :
  - qu'un message porte une donnée qui dépend du lecteur ;
  - qu'un geste contourne la machine d'état d'un objet ;
  - qu'un aparté atteigne un client par un chemin oublié.
- **Ce que ça rend possible** :
  - tout nouvel objet entre dans le fil par une ligne de registre et une projection ;
  - le copilote et le pont WhatsApp lisent les mêmes cartes, avec les mêmes droits ;
  - les engagements (un ADR à leur lot) se rattachent à n'importe quel sujet du registre.
- **Ce que ça ne règle pas** :
  - un locataire sans compte n'est pas membre de sa salle (pont WhatsApp et SMS, lot 5, son propre
    ADR) ;
  - `SystemMessageFactory::humanise` écrit encore du français pour les avis existants : les
    nouveaux événements naissent en codes, les anciens se convertissent au lot 1.

## Options écartées

- **(B) Une clé étrangère par objet** (`booking_id`, `visit_id`…) et des avis système enrichis :
  moins cher au départ, mais une migration par objet. Et un avis qui recopie l'état de l'objet
  finit par porter un montant que le locataire lira.
- **(C) Une chronologie calculée à la lecture**, qui fusionne messages et journaux d'activité sans
  rien écrire : aucune duplication, mais les non-lus, la pagination par curseur et les
  notifications deviennent un calcul sur plusieurs tables à chaque ouverture.
- **Une route « agir sur une carte »** dans la messagerie : elle dupliquerait les gardes de chaque
  objet, et l'asymétrie entre deux chemins est la signature d'un oubli (`CLAUDE.md`, § 1.8 de
  `features.md`).
- **La conversation comme dossier commercial** : déjà écartée par ADR-0101 (option C).

## Application

- Registre `App\Services\Messaging\SujetsDuFil`, projections par type, branches de
  `ConversationAccess`, `MessageType::Card` et `MessageType::Event`, colonne `messages.visibilite`.
- Gardes :
  - un test d'architecture : tout `metadata` de carte ou d'événement respecte la forme fermée, et
    `donnees` ne contient aucune clé interdite (montant, coût, téléphone, adresse) ;
  - un test par type du registre : un non-lecteur reçoit `indisponible` ;
  - une matrice de non-fuite des apartés, un test par chemin de lecture, vérifiée par ablation.

# ADR-0129 — Le socle temps réel signale, l'API sert : Reverb sur le VPS, des signaux sans donnée, des canaux par objet tenus par un registre

- **Statut** : Accepté le 2026-11-17 (décisions du porteur : Reverb hébergé sur le VPS (1a), le signal seul (2a) ; « poser des bases solides qui facilitent la réutilisabilité »)
- **Date** : 2026-11-17
- **Tickets** : lot 0 du [plan « Le Fil »](../plans/2026-11-17-le-fil.md)
- **Va avec** : [ADR-0128](0128-le-fil-est-l-interface-des-objets.md) (le fil est l'interface des objets)
- **S'appuie sur** : [ADR-0028](0028-auto-hebergement-conteneurise-sur-le-vps.md) (la pile Compose sous Dokploy), [ADR-0078](0078-une-connexion-de-file-pour-les-jobs-longs.md) (files et workers)

## Contexte

Relevé sur `dev` (`54adc70f5`) le 2026-11-17 :

- **Le front relit l'API à intervalle fixe.**
  - Le fil ouvert est relu toutes les 3 s (`lib/queries/conversations.ts`).
  - La liste et le compteur des non-lus le sont toutes les 10 s (`conversations-list.ts`).
  - Un fil dont le dernier message n'est pas lu est relu toutes les 15 s (TCK-2858).
- **Une diffusion existe à moitié, et ne mène nulle part.**
  - `config/broadcasting.php` décrit une connexion `reverb`, mais `BROADCAST_CONNECTION=log` en
    développement, et le défaut est `null`.
  - Aucun serveur WebSocket ne tourne, et `laravel/reverb` n'est pas installé.
  - `routes/channels.php` déclare un seul canal, `App.Models.User.{id}`.
  - `NewNotification` est diffusé par `NotificationService`, dans le vide.
  - `NewMessage` n'est déclenché par personne, et il embarque le message entier
    (`broadcastWith` → `message`).
- **Les routes d'autorisation des canaux sont celles du groupe `web`** (`withRouting(channels:)`,
  `bootstrap/app.php`) : `/broadcasting/auth`, hors du préfixe `api/*`. Or Laravel n'expose en CORS
  que `api/*`. Un appel du navigateur y finirait en `net::ERR_FAILED`, le piège du préfixe que
  `CLAUDE.md` décrit déjà.
- **Le navigateur tient déjà le jeton Sanctum** (`AuthContext`, `token`) pour ses appels directs à
  l'API. Il le tient aussi pendant une impersonation, où c'est le jeton de la cible.
- **La file est en base, avec un seul worker par file** (ADR-0078). Un signal mis en file attend
  le prochain tour de ce worker, derrière les jobs qui le précèdent.

Le porteur veut un temps réel qui serve la messagerie, mais d'abord un **socle réutilisable** :
le compteur des notifications, les files des interventions au bureau, le paiement confirmé à
l'écran, la signature sur place d'un état des lieux, les tableaux de bord.

## Décision

**Le temps réel ne transporte que des signaux : « tel objet a changé ». Le front relit alors
l'objet par l'API, qui applique ses règles d'accès propres à chaque lecteur. Les canaux sont ceux
des objets d'un registre fermé, autorisés par la politique de chaque objet. Reverb tourne sur le
VPS, et le front retombe sur la relecture périodique quand il est absent.**

### 1. Un signal ne porte aucune donnée

- Un événement diffusé a **une seule forme** :
  `{sujet: "<type>:<id>", quoi: "<code>", curseur: "<horodatage ou version>"}`.
  - `quoi` est un code connu (`message.cree`, `carte.modifiee`, `participants.modifies`…) ;
  - `curseur` permet au front d'ignorer un signal plus ancien que ce qu'il a déjà lu.
- Aucun contenu, montant, nom ou aperçu.
- **Pourquoi c'est la règle centrale** : le protocole de Pusher, que parle Reverb, ne permet pas
  au serveur de désabonner quelqu'un. Un participant qui perd ses droits garde son abonnement
  jusqu'à sa déconnexion (changement de contact principal, ADR-0068 ; bail fini ; retrait d'un
  groupe). Avec des signaux sans donnée, il n'apprend au pire que « le fil 123 a changé ». Sa
  relecture, elle, est refusée par l'API.

### 2. Les canaux sont ceux des objets d'un registre fermé

- Deux familles de canaux privés :
  - `sujet.{type}.{id}` : un objet (fil, intervention, bail, paiement, état des lieux…) ;
  - `utilisateur.{id}` : ce qui ne regarde qu'une personne (sa boîte, ses compteurs, ses
    notifications).
- Le **registre** `CanauxTempsReel` associe chaque `type` à un modèle et à son droit de lecture
  (`view` de la politique ; `ConversationAccess::allows` pour un fil). C'est le même principe que le
  registre des sujets du fil (ADR-0128) : tout nom venu du client est cherché dans ce registre
  avant toute résolution, jamais appelé directement.
- **Rendre un objet « en direct » = une ligne de registre**, et des appels à l'émetteur.
- Les canaux de **présence** (`presence-sujet.{type}.{id}`) servent la présence et l'indicateur
  « en train d'écrire ». Ce dernier passe par des messages éphémères entre navigateurs
  (*whispers*) : le serveur ne les stocke ni ne les journalise.
- `App.Models.User.{id}` est remplacé par `utilisateur.{id}`, et `NewMessage` est supprimé.

### 3. Un seul émetteur, après le COMMIT, sans jamais faire échouer la requête

- Tout signal part par `TempsReel::signaler($modele, 'quoi')`, ou par le trait `EmetDesSignaux`
  d'un modèle. Aucun autre code ne diffuse.
- **L'émission attend le COMMIT** (`afterCommit`) : un signal ne précède jamais la donnée qu'il
  annonce, et une transaction annulée n'en émet aucun.
- **Elle est synchrone, vers le Reverb local de la pile, avec un délai court (1 s).** Elle ne passe
  pas par la file, contrairement à ce qui avait été évoqué le 2026-11-17 : la file en base, servie
  par un worker unique, ajouterait des secondes d'attente derrière les autres jobs (ADR-0078).
- Un échec d'émission est **avalé**, journalisé et compté. Il ne fait jamais échouer la requête :
  la relecture de sécurité du front (§ 4) rattrape un signal perdu.
- Les signaux d'une même requête sur un même sujet sont **dédoublonnés** : un envoi par sujet et
  par code.

### 4. Un seul client côté front, avec un mode dégradé automatique

- Un `TempsReelProvider` dans la coque de `/app` ouvre **une** connexion (Laravel Echo, client
  Pusher, vers Reverb).
- L'autorisation des canaux passe par **`POST /api/broadcasting/auth`**, sous `auth:sanctum` et la
  résolution du profil actif, avec le jeton de `AuthContext`. Les routes de diffusion quittent le
  groupe `web` pour le préfixe `api` (piège du préfixe). Pendant une impersonation, c'est le jeton
  de la cible : on écoute ce qu'elle lit.
- Deux hooks seulement, que tout écran réutilise :
  - `useSignal(sujet, rappel)`, la primitive ;
  - `useSujetEnDirect(sujet, clésDeRequêtes)`, qui invalide les requêtes React Query nommées à
    chaque signal.
- **Mode dégradé** : la relecture périodique actuelle reste le filet.
  - Connexion tenue : une relecture de sécurité toutes les 60 s.
  - Connexion perdue : les intervalles d'aujourd'hui (3 s, 10 s), jusqu'au retour.
  - À la reconnexion : une relecture immédiate de tous les sujets ouverts.
- Sans Reverb (`NEXT_PUBLIC_TEMPS_REEL` absent), le front se comporte exactement comme aujourd'hui.

### 5. L'infrastructure : un service de plus dans la pile, Redis pour plusieurs instances

- **Développement** : un service `reverb` dans `docker-compose.yml`, lancé par `./dev.sh` et sondé
  par `./dev.sh doctor`.
- **Préproduction et production** : un service `temps-reel` dans `deploy/takussan/compose.api.yml`,
  sur l'image de l'API (`php artisan reverb:start`), publié par Traefik sur un sous-domaine en
  `wss`. Le nom exact s'écrit dans `docs/infra/hebergement.md` au lot 0, et sa pose dans Dokploy
  fait l'objet d'un fichier sous `docs/deploiement/actions/` (ADR-0127).
- **Plusieurs instances** : la diffusion entre instances passe par le Redis déjà présent dans la
  pile (`REVERB_SCALING_ENABLED`). Une seule instance suffit au départ.
- **Clés** : `REVERB_APP_ID`, `REVERB_APP_KEY`, `REVERB_APP_SECRET`, `REVERB_HOST`, `REVERB_PORT`,
  `REVERB_SCHEME` côté API, `NEXT_PUBLIC_TEMPS_REEL_*` côté front. Elles entrent dans
  `.env.example` et `.env.docker`, gardées par `check-env-parity`.
- **Tests** : `BROADCAST_CONNECTION=null` reste la valeur de la suite. Les tests affirment les
  signaux par un faux émetteur, jamais par un serveur réel.

## Conséquences

- **Ce que ça coûte** :
  - un processus de longue durée de plus à exploiter, avec ses connexions ouvertes, sa mémoire et
    son sous-domaine TLS ;
  - une dépendance PHP (`laravel/reverb`) et deux côté front (`laravel-echo`, `pusher-js`) ;
  - une relecture par l'API à chaque signal : c'est plus de requêtes qu'un événement qui porterait
    la donnée, mais moins que la relecture toutes les 3 s.
- **Ce que ça interdit** :
  - un événement qui porte une donnée ;
  - un canal hors registre ;
  - une diffusion hors de l'émetteur ;
  - un écran qui dépend du temps réel pour être juste. Il n'en dépend que pour être **rapide** :
    le mode dégradé garde la justesse.
- **Ce que ça rend possible** :
  - tout écran passe en direct par un hook et une ligne de registre ;
  - la présence et l'indicateur « en train d'écrire » ;
  - la carte mise à jour chez tous les lecteurs après un geste (ADR-0128 § 4) ;
  - le paiement confirmé à l'écran, la signature attendue sur le téléphone de l'agent.
- **Ce que ça ne règle pas** :
  - les notifications push hors application, exclues par le porteur ;
  - un abonné qui perd ses droits reste abonné jusqu'à sa déconnexion. C'est accepté, puisqu'il ne
    reçoit que des signaux.

## Options écartées

- **Un service hébergé** (Pusher, Ably) : rien à exploiter, mais payant au volume, et les signaux
  sortent de notre infrastructure. Écarté par le porteur (1b).
- **La donnée dans l'événement**, pour un affichage instantané : il faudrait rejuger les droits de
  chaque lecteur dans chaque événement, et un abonné qui a perdu ses droits continuerait de lire.
  Écarté par le porteur (2b).
- **L'émission par la file** : plus robuste en apparence, mais les signaux attendraient derrière les
  jobs du worker unique. Le filet de relecture couvre déjà un signal perdu.
- **Le SSE (Server-Sent Events) servi par l'API** : pas de canaux de présence ni de messages entre
  navigateurs, et une connexion longue par onglet sur les workers FrankenPHP qui servent les
  requêtes.
- **Garder la relecture périodique seule** : pas de présence, et une charge qui croît avec le
  nombre d'onglets ouverts plutôt qu'avec le nombre de changements.

## Application

- API :
  - `App\Support\TempsReel\TempsReel` (l'émetteur), le trait `EmetDesSignaux`, le registre
    `CanauxTempsReel` et l'événement unique `SignalTempsReel` ;
  - `routes/channels.php` réécrit sur le registre ;
  - `Broadcast::routes` sous le préfixe `api`.
- Front : `TempsReelProvider`, `useSignal` et `useSujetEnDirect` sous `src/lib/temps-reel/`.
- Gardes :
  - un test d'architecture : toute classe qui implémente `ShouldBroadcast` ou `ShouldBroadcastNow`
    est `SignalTempsReel`, et son `broadcastWith` n'a que les trois clés ;
  - un test par type du registre : un non-lecteur reçoit 403 à l'autorisation de son canal, vérifié
    par ablation ;
  - côté front, des tests des hooks avec un faux Echo : signal reçu, mode dégradé, reconnexion.

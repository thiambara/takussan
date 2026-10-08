# ADR-0034 — L'agenda sort de la plateforme par un lien secret, en lecture seule, propre à une agence

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Tickets** : [TCK-591](../backlog/tickets/TCK-591-crm-agenda-agent-et-passation.md)

## Contexte

L'agent vit dans l'agenda de son téléphone (Google Agenda, Apple Calendrier), pas dans la console.
`GET /api/calendar` (`CalendarController`) ne sert que la console : aucun export iCalendar n'existe
(`grep -rn "text/calendar" takussan-api` → vide, relevé le 2026-10-07).

Un abonnement d'agenda est une URL qu'une application **tierce** interroge seule, à son rythme, sans
navigateur ni cookie : elle ne peut porter ni l'en-tête `Authorization`, ni le cookie httpOnly
d'ADR-0010. Le secret est donc **dans l'URL**, et cette URL vit ensuite hors de notre contrôle :
dans les réglages d'un téléphone, chez Google, dans une capture d'écran. C'est une **nouvelle
méthode d'authentification** — d'où cet ADR, que le ticket exige avant le code.

Mesuré le 2026-10-07 :

- Les jetons Sanctum sont acceptés par `auth:sanctum` sur **toutes** les routes, et **aucune** ne
  vérifie une capacité de jeton : `grep -rn "tokenCan\|ability:" app routes bootstrap` → vide.
  Un jeton Sanctum « à portée restreinte » ne serait restreint par rien.
- Le périmètre de lecture d'un agent dépend de l'agence de son **profil actif** (ADR-0004) ; une
  requête d'abonnement n'a pas de profil actif — elle n'a que l'URL.
- Le retrait d'un agent (`AgencyController::removeAgent`) supprime ses profils, mais ne touche à
  aucun jeton.

## Décision

**Un agenda sort par un lien secret propre à un couple (utilisateur, agence), haché en base,
révocable, qui n'ouvre qu'une seule réponse : le flux `.ics` de « Mes rendez-vous » dans cette
agence.**

1. **Stockage** — table `calendar_feeds` : `user_id`, `agency_id` (nullable : un prestataire n'a pas
   d'agence de personnel), `token_hash` (SHA-256 hexadécimal, unique), `revoked_at`,
   `last_accessed_at`, horodatages. Le jeton en clair (40 caractères aléatoires, `Str::random`) n'est
   rendu **qu'une fois**, à la création ; il n'est jamais relu ni journalisé.
2. **Un lien actif par couple** — `POST /api/me/calendar-feed` crée le lien, ou le **fait tourner** :
   le précédent est révoqué dans la même transaction. `DELETE /api/me/calendar-feed` révoque sans
   remplacer. L'agence est celle où l'appelant est personnel (prédicat de TCK-587) ; un prestataire
   reçoit un lien sans agence.
3. **Lecture** — `GET /api/calendar-feed/{token}.ics`, hors `auth:sanctum`, limité en débit
   (limiteur nommé `calendar-feed`, 30 requêtes par minute et par IP). Le jeton est haché puis
   cherché ; un lien inconnu, révoqué, ou dont le titulaire **n'est plus personnel** de l'agence du
   lien rend **404** — jamais 401/403, qui confirmeraient qu'un lien a existé. `last_accessed_at` est
   posé à chaque lecture réussie.
4. **Contenu** — exactement les événements que `GET /api/calendar?mine=1` rendrait à ce titulaire dans
   cette agence, pour une fenêtre fixe de **30 jours en arrière à 180 jours en avant** (sous la borne
   de 186 jours du calendrier). Chaque `VEVENT` porte un `UID` stable (`<type>-<id>@takussan`), le
   type, l'horaire, le titre du bien et un lien vers la console. **Aucune donnée personnelle de
   tiers** : ni nom, ni téléphone, ni e-mail de visiteur, de locataire, de client ou de prestataire.
   Le titre d'une tâche (écrit par l'agent lui-même) est rendu ; sa description ne l'est pas.
5. **Durée de vie** — sans expiration calendaire : un abonnement qui expire en silence est un agenda
   qui se vide sans qu'on sache pourquoi. Le lien meurt par révocation, par rotation, ou par **le
   retrait de l'agent** : `AgencyMemberRemovalService` révoque les liens du membre dans l'agence, et
   la lecture vérifie de toute façon le statut de personnel à chaque appel (une suspension éteint
   donc aussi le flux, sans écriture).

## Options écartées

- **Jeton Sanctum à portée restreinte** (`createToken('calendar', ['calendar:read'])`). Écarté : la
  portée n'est vérifiée nulle part (relevé ci-dessus). Un lien d'agenda divulgué deviendrait un jeton
  d'API **complet** — lecture et écriture de tout ce que l'agent peut faire. Il faudrait en outre
  lire le jeton depuis l'URL, ce que Sanctum ne fait pas, et il apparaîtrait dans la liste des
  sessions de l'utilisateur.
- **URL signée Laravel** (`URL::signedRoute`). Écarté : une signature ne se révoque pas sans
  changer `APP_KEY` pour tout le monde, et elle ne porte aucun `last_accessed_at`.
- **Jeton en clair en base**. Écarté : une fuite de la base livrerait tous les agendas ; le hachage
  ne coûte rien puisque le jeton n'a jamais à être relu.

## Conséquences

- Qui détient l'URL lit l'agenda de l'agent sans autre preuve : c'est le prix de tout abonnement
  d'agenda, et c'est pourquoi le contenu exclut les tiers et pourquoi la révocation est à un geste,
  à côté du lien.
- Un agent membre de deux agences a deux liens, un par agence : un flux n'agrège jamais deux
  agences, comme la console.
- Le flux n'est pas temps réel : les applications d'agenda l'interrogent toutes les quelques heures.
  L'écran le dit.

## Application

- `App\Models\CalendarFeed`, `App\Services\Calendar\CalendarFeedService` (création, rotation,
  révocation, résolution), `App\Services\Calendar\CalendarEventCollector` (partagé avec
  `CalendarController`), `App\Services\Calendar\IcsCalendarRenderer`,
  `App\Http\Controllers\Api\CalendarFeedController`.
- `tests/Feature/Calendar/CalendarFeedTest.php` : VCALENDAR valide, aucun nom ni téléphone de
  visiteur, 404 après révocation et après retrait, jeton jamais stocké en clair (AC10 de TCK-591).

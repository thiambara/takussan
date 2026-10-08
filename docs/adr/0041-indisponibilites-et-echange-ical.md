# ADR-0041 — Une indisponibilité est une plage semi-ouverte du bien ; l'échange avec les calendriers externes passe par iCal, en jeton haché à l'export et derrière une garde SSRF à l'import

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tickets** : [TCK-596](../backlog/tickets/TCK-596-cycle-locatif-conge-annulation-signature-edl.md) (O12)
- **Précise** : [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (qui modifie
  un bien), [ADR-0032](0032-l-api-n-ecrit-plus-de-prose.md) (notifications par code).

## Contexte

Mesuré sur `dev` (acf58a66) et sur la branche de TCK-596 après son §3A :

- Aucune trace d'iCal dans l'API ni le front (`grep -rni "VCALENDAR|text/calendar|\.ics"` → 0), et
  aucune dépendance qui en lise ou en écrive (`composer.json`). `PropertyStatus::Unavailable` ferme le
  bien **entier** ; rien ne bloque une plage.
- Un hôte qui publie le même logement sur une autre plateforme n'a aucun moyen d'empêcher la double
  réservation : il ne peut ni importer les dates prises ailleurs, ni exporter celles de Takussan.
- `end_date` d'une réservation est le jour de **départ** (`BookingQuote` : nuits = `start → end`) ; le
  §3A de TCK-596 a posé l'intervalle semi-ouvert `[début, fin)` pour les réservations. Une
  indisponibilité doit se comparer à elles sans conversion.
- Importer une URL fournie par un utilisateur, c'est faire émettre au serveur une requête vers une
  adresse qu'il choisit : sans garde, `http://169.254.169.254/` (métadonnées du VPS) ou
  `http://127.0.0.1:6379/` deviennent lisibles ou atteignables.
- TCK-591 (non fusionné à cette date) écrit un rendu iCalendar maison pour l'abonnement à l'agenda
  (ADR-0034, sur sa branche) : la même forme d'export existe déjà dans le dépôt, sans bibliothèque.

## Décision

**Une indisponibilité est une plage `[starts_on, ends_on)` d'un bien, manuelle ou importée ; elle
bloque une réservation exactement comme une réservation confirmée ; et Takussan échange avec les
calendriers externes en iCal (RFC 5545, `VEVENT` journée entière), par un flux d'export à jeton
aléatoire stocké haché, et par un import horaire qui passe par une garde SSRF.**

1. **Modèle.** `property_unavailabilities` : bien, `starts_on`, `ends_on` (exclusif, le lendemain de la
   dernière nuit bloquée), motif, `source = manual | ical`, flux d'origine, `external_uid`, auteur,
   réservation en conflit. `property_calendar_feeds` : bien, URL **chiffrée** (cast `encrypted` : elle
   porte souvent un secret de la plateforme tierce), libellé, dernier état de synchronisation, compte
   d'échecs consécutifs. `PropertyAvailabilityService` juge les deux sources en semi-ouvert.
2. **Format et bibliothèque.** iCal RFC 5545, `VEVENT` journée entière (`DTSTART;VALUE=DATE`,
   `DTEND;VALUE=DATE` **exclusif**). Écriture et lecture **maison**, sans dépendance : l'export ne
   produit qu'une forme, et la lecture n'a besoin que du dépliage des lignes (§3.1), de `UID`,
   `DTSTART`, `DTEND` et `STATUS`. Une bibliothèque complète (sabre/vobject) apporterait un analyseur
   général pour un sous-ensemble de quatre propriétés. Une date-heure importée est ramenée au jour,
   et une fin à une heure non nulle couvre ce jour-là (une nuit commencée est prise).
3. **Jeton d'export.** Aléatoire, 256 bits (`random_bytes(32)`, 64 caractères hexadécimaux), stocké
   **haché** (SHA-256) dans `properties.ical_export_token_hash`, jamais en clair : l'URL n'est rendue
   qu'une fois, à la régénération. Régénérer tue l'ancien. L'empreinte trouvée est recomparée par
   `hash_equals`. Une URL signée versionnée est écartée : elle dépend d'`APP_KEY`, dont la rotation
   tuerait tous les flux à la fois, et elle ne se révoque pas bien par bien.
4. **Contenu de l'export.** Les réservations **confirmées** (« Réservé ») et les blocages **manuels**
   (« Indisponible ») — **jamais** les dates importées, pour qu'un aller-retour entre deux plateformes
   ne revienne pas en écho ; **aucune donnée personnelle** (ni nom, ni téléphone, ni référence de
   réservation). Route publique `GET /ical/{token}.ics`, `text/calendar; charset=utf-8`, sans session,
   limiteur `ical-export`.
5. **Import.** Toutes les heures (`SyncPropertyCalendarFeedsJob`, `withoutOverlapping`), plus un
   « synchroniser maintenant » limité à un appel par minute et par flux. Un événement disparu de la
   source est **supprimé** : la source fait foi pour ses propres événements. Un événement
   `STATUS:CANCELLED` est traité comme disparu. Au troisième échec consécutif, le bailleur est prévenu
   (une fois, pas à chaque heure).
   **La première synchronisation n'a pas lieu dans la requête de création** (VERIF-596 m3) :
   `POST properties/{p}/calendar-feeds` rend 201 avec le flux en `pending`, et
   `SyncPropertyCalendarFeedJob` va le chercher en file. Un appel sortant de 10 s au plus ne tient
   plus un worker HTTP à chaque création. La création est bornée à **10 par heure et par
   utilisateur**, quel que soit le bien (limiteur `calendar-feed-create`, VERIF-596 m4) : chacune
   déclenche une résolution DNS et un appel sortant.
6. **Conflits.** Un événement importé qui chevauche une réservation confirmée est **enregistré**,
   marqué en conflit (`conflict_booking_id`), et le bailleur et l'agent du bien sont prévenus. Un
   import **n'annule jamais** une réservation : seul un humain tranche entre deux plateformes.
   Un blocage **manuel** sur une réservation confirmée est refusé (422) : l'hôte, lui, sait.
7. **Garde SSRF** (`App\Support\Http\SafeOutboundUrl`). HTTPS seulement, port 443 ; l'hôte est
   résolu, et **toutes** ses adresses doivent être publiques : refus des plages privées, de bouclage,
   lien-local (dont `169.254.169.254`), réservées, CGNAT `100.64.0.0/10`, et de leurs équivalents IPv6
   (ULA, lien-local, adresses IPv4 mappées, préfixes NAT64 `64:ff9b::/96` qui transportent une IPv4).
   Depuis VERIF-596 m3, deux plages que PHP juge globales sont refusées aussi : **`::/8` en entier**
   (réservé ; il porte les IPv4 mappées, traduites `::ffff:0:a.b.c.d` — `::ffff:0:7f00:1` passait — et
   compatibles) et **`fec0::/10`** (site-local déprécié ; avec le lien-local, `fe80::/9`).
   La résolution DNS de l'enregistrement reste dans la requête, bornée par le résolveur du système
   et non par l'application : c'est elle qui rend le refus immédiat (422), et l'appel sortant, lui,
   est parti en file. La connexion est **épinglée** sur l'adresse vérifiée
   (`CURLOPT_RESOLVE`) : une seconde résolution ne peut pas rebondir vers une adresse interne. Pas de
   redirection suivie (une redirection est un échec), délai de 10 s, réponse plafonnée à 1 Mo
   (en-tête et corps). Une URL refusée l'est **avant** toute requête sortante, et dès l'enregistrement
   du flux.
8. **Autorisation.** Qui peut modifier le bien (`PropertyPolicy::update`, territoire de 587, lu et non
   modifié) gère ses indisponibilités, ses flux et son jeton. Une indisponibilité `ical` ne se
   supprime pas à la main : elle reviendrait à la synchronisation suivante.

## Conséquences

- Une réservation est refusée sur une nuit bloquée, à la demande comme à la confirmation, sous le
  même verrou de la ligne du bien que les réservations (§3A).
- L'URL d'un flux importé ne ressort jamais de l'API : la console n'en montre que l'hôte. Une URL
  saisie fausse se remplace, elle ne se corrige pas.
- Le lecteur maison ne comprend pas `RRULE` : un événement récurrent est lu comme sa première
  occurrence. Les plateformes visées (Airbnb, Booking.com, Google Agenda en journée entière)
  exportent des événements simples ; une récurrence lue à tort reste visible dans la vue de l'hôte.
- Deux rendus iCal coexistent tant que TCK-591 et TCK-596 ne sont pas fusionnés ensemble (l'agenda
  de 591, l'export de bien ici). La convergence — un seul écrivain partagé — est une suite.
- Une synchronisation horaire laisse une fenêtre d'une heure à une double réservation venue d'une
  autre plateforme ; « synchroniser maintenant » la réduit à la demande. Le conflit est signalé,
  jamais résolu en silence.

## Application

- `app/Models/PropertyUnavailability.php`, `app/Models/PropertyCalendarFeed.php`, migrations du
  2026-10-08 ; `app/Services/Booking/PropertyAvailabilityService.php`.
- `app/Support/Ical/IcalWriter.php`, `app/Support/Ical/IcalReader.php`,
  `app/Support/Http/SafeOutboundUrl.php`, `app/Services/Booking/PropertyCalendarSyncService.php`,
  `app/Jobs/SyncPropertyCalendarFeedsJob.php` (`routes/console.php`),
  `app/Jobs/SyncPropertyCalendarFeedJob.php` (première synchronisation, VERIF-596 m3).
- Contrôleurs `PropertyUnavailabilityController`, `PropertyCalendarFeedController`,
  `PropertyIcalTokenController`, `Public\PublicPropertyAvailabilityController`,
  `Public\IcalExportController`.
- Tests : `PropertyUnavailabilityTest`, `BookingAvailabilityTest`, `IcalExportTest`,
  `SyncPropertyCalendarFeedsTest` (dont les refus SSRF avec `Http::assertNothingSent`).

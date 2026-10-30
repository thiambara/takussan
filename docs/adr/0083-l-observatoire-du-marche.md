# ADR-0083 — L'observatoire du marché ne lit que les instantanés anonymes, et une annonce n'a disparu que de passages qui ont lu toute la liste

- **Statut** : Accepté
- **Date** : 2026-10-30
- **Tickets** : [TCK-2393](../backlog/tickets/TCK-2393-radar-annonceurs-et-observatoire.md)
- **Dépend de** : [ADR-0077](0077-le-radar.md) (le Radar), [TCK-2392](../backlog/tickets/TCK-2392-radar-collecte-automatique.md) (la collecte automatique, ADR-0080)

## Contexte

Mesuré le 2026-10-30 sur `feat/radar-collecte-automatique` `c3c3d638b` :

- **La collecte écrit des instantanés datés** (`radar_listing_snapshots`, TCK-2392) : prix, contrat, type,
  surface, chambres, quartier du référentiel, ville, empreinte du titre, et la plage de présence
  (`first_seen_at`, `last_seen_at`). Aucun numéro, aucun nom, aucun texte.
- **La purge (TCK-2391) ne supprime aucune annonce** : elle vide son texte brut, son adresse, ses photos et
  son extraction, et la passe à `purged`. Elle supprime ou vide l'annonceur (numéro, nom, nature). Depuis
  TCK-2392 (ADR-0080 §4), elle **supprime aussi les instantanés** de l'annonce, quelle qu'en soit la raison.
- **Un passage de collecte peut s'arrêter avant la fin de la liste** (`max_pages`, page refusée, erreur) :
  `radar_crawl_runs.reached_end` dit s'il a lu la dernière page.
- **Les alertes de la console** naissent d'une activité journalisée dont l'événement est déclaré alertable
  (`AlertableEvents`), livrée par les règles que le super-admin configure.

## Décision

**L'observatoire du marché se calcule à la lecture, sur les seuls instantanés et les colonnes anonymes de
l'annonce. Une annonce n'est « disparue » que lorsque deux passages terminés de son site d'affilée, qui ont lu
toute la liste, ne l'ont pas revue.**

1. **Aucune table d'agrégats.** Prix au m², temps de mise sur le marché et écart d'offre se calculent à la
   requête (`RadarObservatory`), depuis `radar_listing_snapshots`, les colonnes anonymes de `radar_listings`
   (site, doublon, rattachement au catalogue, disparition) et le catalogue public. **Ils se calculent sur les
   données conservées** : une purge retire ses lignes, et la période couverte est bornée par la rétention
   (90 jours pour une annonce jamais publiée). Un historique au-delà passera par des compteurs anonymes
   agrégés (TCK-2434). Un test refuse toute requête de l'observatoire qui nommerait `raw_text`, `extracted`,
   `source_url`, `phone`, `display_name` ou `similarity_text`.
2. **L'état courant d'une annonce est son dernier instantané.** Un doublon (`duplicate_of_listing_id`) ne
   compte pas : la même maison vue sur trois sites est une annonce.
3. **La disparition se constate, elle ne se déduit pas d'une absence.** `radar:observe-sources` marque
   disparue (`radar_listings.source_gone_at`, `source_gone_run_id`) une annonce de son site lorsque
   `radar.observe.confirm_runs` (2 par défaut) passages `finished` dont `reached_end` est vrai ont commencé
   après sa dernière présence. **Un seul ne suffit pas** : une liste triée par date glisse pendant qu'on la
   lit — une annonce retirée ou remontée en page 1 fait passer la première de la page 2 dans une page déjà
   lue —, et le passage atteint la fin sans l'avoir vue (relevé par la vérification adverse, reproduit sur
   le vrai passage de collecte). Une présence remet le compte à zéro : seuls comptent les passages
   postérieurs à la dernière. Un passage incomplet ne compte pas. Une annonce revue plus tard redevient
   présente. **Une annonce que la collecte ne suit plus n'est pas jugée et n'alerte pas** : purgée,
   `do_not_contact`, ou d'un annonceur qui a dit STOP (TCK-2392, `RadarCrawler::silenced()`) — ne plus la
   voir ne dit rien d'elle, même doublure d'un bien publié. La purge supprime en plus ses instantanés.
4. **L'alerte passe par le journal, un journal de plateforme.** Une disparition rattachée à un bien
   (directement, ou par l'annonce dont elle est le doublon) écrit `radar_source_listing_gone`, événement
   alertable : les règles d'alerte existantes la livrent, rien de neuf n'envoie quoi que ce soit. **Son sujet
   est l'annonce collectée, le bien est dans `properties.property_id`** : avec le bien pour sujet,
   `AuditAgencyResolver` donnait à la ligne l'agence du bien, et l'agence d'un bien du catalogue dont une
   annonce collectée n'est que le doublon lisait dans son journal que la plateforme surveille ses annonces
   ailleurs. C'est la forme de `radar_advertiser_revoked` (sujet Radar, biens en propriétés).
5. **Le classement des annonceurs n'est pas anonyme**, et ne prétend pas l'être : c'est l'outil commercial
   du démarchage, qui lit les annonces vivantes. La nature reste dans le Radar (ADR-0077 § 7) ; le
   vocabulaire est « intermédiaire probable », jamais celui du courtier (ADR-0030).

## Conséquences

- **Pas de recalcul à maintenir**, pas de table qui diverge des instantanés ; le prix est une requête de
  plus, bornée par les filtres (`since`, contrat, type, site).
- **Le temps de mise sur le marché est censuré à gauche** : une annonce déjà en ligne avant le premier
  passage semble plus récente qu'elle ne l'est. La médiane se lit avec son compte.
- **La part d'intermédiaires ne se mesure que sur les annonceurs encore porteurs d'annonces** : la purge
  remet la nature à `unknown`. Figer des compteurs anonymes par nature est la suite TCK-2431.
- **Le marché ne remonte pas au-delà de la rétention** : une annonce jamais publiée quitte les agrégats à sa
  purge (90 jours, ou aussitôt pour un STOP). Les séries longues sont la suite TCK-2434.
- **Une disparition se constate un passage complet plus tard** qu'avec un seul : au rythme par défaut
  (6 h), une demi-journée. `radar.observe.confirm_runs` à 1 rend l'ancien comportement.
- **Une annonce saisie à la main n'a aucun instantané** : elle n'entre ni dans les agrégats ni dans la
  détection de disparition, et le classement lit son extraction tant qu'elle n'est pas purgée.

## Application

- `App\Services\Radar\Observatory\RadarObservatory`, `RadarSourceWatch`, `RadarAdvertiserRanking` ;
  commande `radar:observe-sources` inscrite au planificateur (`routes/console.php`).
- `tests/Feature/Radar/Observatory/` : purge qui retire ses lignes et requêtes sans colonne personnelle (AC1),
  alerte (AC2), passage incomplet (AC3), réapparition (AC4).

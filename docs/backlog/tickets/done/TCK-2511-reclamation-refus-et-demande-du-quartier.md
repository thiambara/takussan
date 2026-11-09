---
id: TCK-2511
title: Réclamation Radar : refuser depuis le lien (« Ce n'est pas moi », « Ne plus me contacter ») et chiffre de demande du quartier
status: done
phase: P1
family: back
estimate: M
wave: 85
created: 2026-11-08
updated: 2026-11-09
depends_on: []
blocks: [TCK-2512]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models:
    - "docs/models-spec.md#108-radaradvertiser-"
tags: [back, radar, consentement, audit-ux]
---

## Objectif utilisateur

L'annonceur contacté peut dire non sans effort depuis le lien du message, et, s'il hésite, apprend ce que la publication lui rapporte : combien de personnes cherchent dans son quartier.

## Contrat de données

1. **`POST /api/radar/claims/{token}/decline`** — public, sans code, sous son propre compteur par IP (même famille que `radar_claim_show`). Corps : `reason` ∈ `not_me`, `stop_contact`. Effet : **exactement celui d'un STOP** — le chemin existant de `RadarConsentWorkflow` (accord retiré, annonces non publiées purgées, `phone` effacé, `phone_hmac` conservé pour ne plus contacter ce numéro) ; le motif est journalisé pour le super-admin. Rend `200 { data: { status: 'declined' } }`. Un jeton déjà mort (expiré, STOP, révoqué) rend la même réponse que les autres routes pour un lien mort — aucune information de plus.
2. **`GET /api/radar/claims/{token}`** ajoute `demand` : `{ quarter, searches_30d }` — le nombre de recherches des 30 derniers jours dont le lieu est le quartier des annonces du lien, lu dans le journal des recherches (`SearchQueryStat`, ADR-0088) ; **`null` sous le seuil** `radar.claim.demand_min_searches` (config, défaut 50) ou quand les annonces n'ont pas de quartier commun.

## Direction UX / Artistique

Sans objet (back). Maquette servie : `/fr/playground/maquettes?p=revendication&a=a` (écrans « Vos annonces », « Ce n'est pas moi »).

## Contraintes strictes (métier)

- Le refus n'exige aucune connaissance que le lien ne donne pas : pas de code SMS, pas de compte.
- Un refus sur un lien **sous mandat** ou dont des annonces sont déjà publiées suit la règle du STOP existante (biens publiés retirés de la surface publique) — aucune règle neuve.
- Le chiffre est un compte de recherches, jamais de visiteurs, et il n'existe pas sous le seuil : pas de « 3 recherches » qui desservirait la promesse.
- Aucune donnée d'un tiers dans `demand` (ni requêtes, ni personnes).

## Delta à produire

- [x] Route `radar.claims.decline` + FormRequest + limiteur.
- [x] Branchement sur le chemin du STOP de `RadarConsentWorkflow` (aucune seconde implémentation du retrait).
- [x] `demand` dans la réponse de `show`, seuil en config (`radar.claim.demand_min_searches`) avec sa clé dans `.env.example` si elle est surchargeable.
- [x] Tests.

## Critères d'acceptation

- [x] AC1 — Après `decline`, le numéro n'est plus contactable par le Radar (même vérification que pour un STOP par message), et une nouvelle annonce de ce numéro n'ouvre pas de prise de contact.
- [x] AC2 — Après `decline`, `GET …/{token}` répond comme pour un lien mort.
- [x] AC3 — Avec 49 recherches sur le quartier et un seuil à 50, `demand` est `null` ; avec 50, il vaut 50.
- [x] AC4 — `decline` n'appelle aucun envoi de SMS (vérifié par le faux pilote SMS).

## Hors périmètre

- La page de réclamation (TCK-2512).
- Un tableau de bord des refus pour le super-admin.

## Notes d'implémentation

**Relevé avant de coder (2026-11-09, arbre `feat/audit-ux-vague-1`)**

- **Le « chemin du STOP » n'est pas une méthode de `RadarConsentWorkflow` qu'on puisse appeler d'un lien.**
  `recordOutcome(…, Stop, …, User $by)` exige un opérateur qui TIENT l'annonceur (`AdvertiserClaim::assertHeld`) et un
  message envoyé sans issue finale : un refus anonyme ne passe aucune de ces deux portes. Le corps commun du retrait est
  `AdvertiserRevocation::apply()` (`do_not_contact_at`, empreinte `phone_hmac`, annonces ouvertes → `do_not_contact`,
  accords retirés, biens publiés hors du public, `PurgeRadarAdvertiser` après le commit), et il a **déjà trois entrées** :
  le STOP de l'opérateur (`RadarConsentWorkflow::stop()`), la révocation (`AdvertiserRevocation::revoke()`) et le STOP reçu
  par WhatsApp (`RadarWhatsappInbox::stop()`, TCK-2395 — issue `stop` sans auteur sur le dernier message). Le refus par le
  lien en est une **quatrième entrée**, calquée sur le STOP reçu (même ordre de verrous annonces → annonceur → message,
  même reprise si une annonce rejoint l'annonceur pendant la lecture) : aucune seconde implémentation du retrait.
- « `phone` effacé » : ce n'est pas `apply()` qui l'efface, c'est la purge mise en file (`PurgeRadarAdvertiser` →
  `RadarPurger`), et **seulement quand il ne reste à l'annonceur aucune annonce publiée** (`RadarStopPurgeTest`, cas de
  la révocation). Le refus suit la même règle — c'est l'effet du STOP, pas une règle neuve.
- Le seuil `radar.claim.link_ttl_days` n'est pas lu de l'environnement : `demand_min_searches` ne l'est pas non plus
  (aucune clé dans `.env.example` / `.env.docker`).
- Le lieu d'une recherche, dans `search_query_stats.criteria`, est le critère libre `location` (le nom du quartier tel que
  le panneau ou la barre l'envoient). Il se rapproche d'un quartier par `CleDeQuartier`, comme `QuartierDuFiltre::idsDuReferentiel()`
  (noms, anciens noms, quartiers fusionnés dans la cible).

**Ce qui a été fait, et pourquoi (non évident seulement)**

- `App\Services\Radar\ClaimDecline` : quatrième entrée de `AdvertiserRevocation::apply()`, calquée sur
  `RadarWhatsappInbox::stop()`. Le dernier message envoyé (bout de chaîne, tout canal) prend l'issue `stop` sans auteur ;
  le motif part au journal `radar_claim_declined` (`reason`, `advertiser_id`, `outreach_id`, `listing_ids`…), jamais un
  numéro. Deux refus concurrents : le second relit `ClaimLinks::revoked()` sous le verrou de l'annonceur et rend 410
  `radar.claim.revoked`, comme un lien mort.
- **Le refus n'est PAS sous `RadarClaims::ensureAvailable()`** (503 quand la connexion par téléphone est éteinte ou
  l'aperçu des codes actif) : le droit d'opposition ne se ferme pas avec une porte de la publication. Gardé par
  `test_le_refus_reste_ouvert_quand_la_page_est_fermee` (ablation : rouge si on l'y remet).
- Limiteur : `throttle:10,1,radar_claim_decline` (show : 30, confirm : 10).
- `App\Services\Radar\ClaimDemand` : les annonces lues sont toutes celles que la page montre (`listings`, `publishing`,
  `awaiting_review`) ; quartier commun = un seul `neighborhood_id` rattaché, aucune annonce sans quartier, suivi par
  `canonique()` (un quartier refusé → `null`). Fenêtre : aujourd'hui compris, `day >= now() - 29 j` (celle de
  `SearchJournal::popular()`). Somme de `searches_count` des lignes dont `criteria->>'location'` a la clé
  `CleDeQuartier` d'un nom du quartier (nom, anciens noms, quartiers fusionnés en lui). **`normalized_query` n'est pas
  lu** : une recherche tapée « villa almadies » sans filtre `location` ne compte pas. Seuil `radar.claim.demand_min_searches`
  (config, défaut 50, non lu de l'environnement comme `link_ttl_days` — aucune clé `.env`).
- ⚠ ADR-0088 §4 dit que la demande « ne sort que vers » le Radar, les variantes et la console, et qu'une recherche ne se
  montre qu'à cinq réseaux distincts. `demand` sort un **agrégat par quartier** (aucune recherche, aucune saisie) vers le
  porteur d'un lien signé : ce n'est pas une recherche montrée, mais l'ADR ne nomme pas cette sortie. À trancher par la
  session (amendement d'ADR-0088 ou phrase dans `features.md` § 2.12).

**Contrat pour le front (TCK-2512)**

```
POST /api/radar/claims/{token}/decline        corps : { "reason": "not_me" | "stop_contact" }
  200 { "data": { "status": "declined" } }
  422 validation (reason absent ou inconnu)     — { message, errors: { reason: [...] } }
  404 { code: "radar.claim.invalid" }           — jeton illisible / signature fausse
  410 { code: "radar.claim.expired" }           — lien expiré
  410 { code: "radar.claim.revoked" }           — déjà refusé, STOP, révoqué, numéro purgé (y compris un second refus)
  409 { code: "radar.advertiser.busy" }         — rare : annonces en mouvement trois fois de suite, réessayer
  429                                           — limiteur radar_claim_decline (10/min/IP)
  ⚠ pas de 503 : le refus reste ouvert quand GET rend 503 radar.claim.unavailable.
  Après un 200, GET …/{token} rend 410 radar.claim.revoked : la page affiche l'écran « lien mort »/« c'est noté ».

GET /api/radar/claims/{token}   → data.demand : null | { "quarter": "Almadies", "searches_30d": 57 }
  quarter = nom canonique du quartier (le même que data.listings[].neighborhood) ; searches_30d = entier ≥ seuil.
  null : sous le seuil, annonces de quartiers différents, ou une annonce sans quartier. Ne rien afficher si null.
```

- [x] Delta specs fait par la session (2026-11-09) : `docs/features.md` § 2.12 (règles « Refuser par le lien » et « La page dit la demande de son quartier ») et § 2.4 (la sortie de l'agrégat, ADR-0088 §4 amendé).

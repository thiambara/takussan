---
id: TCK-2391
title: "Radar : la révocation retire du public sur-le-champ, et la purge efface les annonces jamais publiées en gardant l'empreinte des refus"
status: todo
phase: P1
family: back
estimate: M
wave: 80
created: 2026-10-26
updated: 2026-10-29
depends_on: [TCK-2389]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
    - "docs/features.md#210-pages-légales-publiques"
  models: []
tags: [api, radar, donnees-personnelles, purge, adr-0077]
---

## Objectif utilisateur

Un annonceur qui retire son accord voit ses annonces disparaître aussitôt et n'est plus jamais
contacté ; les données des annonceurs qui n'ont jamais rien accepté ne traînent pas.

## Contexte

[ADR-0077](../../adr/0077-le-radar.md) §8 et §9 ; durées annoncées par les ajouts de `privacy.ts`
posés par TCK-2389. Loi n° 2008-12 : la durée annoncée doit être tenue par le code.

## Contrat de données

- `POST /api/admin/radar/advertisers/{advertiser}/revoke` — motif ; aussi déclenché par un
  résultat `stop` enregistré après publication (TCK-2388).
- Commande planifiée `radar:purge`, inscrite au suivi des tâches planifiées.

## Contraintes strictes (métier)

- **Révocation** : toutes les preuves de l'annonceur passent `revoked_at`, ses biens publiés par
  le Radar **quittent la surface publique et l'index de recherche dans la même requête**, il passe
  `do_not_contact` avec l'empreinte HMAC de son numéro. Son compte reste.
- **Purge** d'une annonce **jamais publiée**, à 90 jours de la saisie ou dès un STOP : texte brut,
  captures, champs extraits, téléphone et nom effacés ; restent l'étape, le site d'origine, les
  dates et des compteurs. Un annonceur sans annonce restante perd son numéro en clair, son nom et
  ses notes ; **l'empreinte d'un refus est conservée**.
- **Les preuves d'accord ne sont pas purgées** tant qu'un bien qu'elles justifient existe ; après
  le retrait du dernier, elles le sont à la durée annoncée par `privacy.ts`.
- La purge est idempotente et journalise ses comptes.
- **Notes de la revue finale de TCK-2386** : « champs extraits » comprend `extracted.phones`, les
  numéros écartés (si TCK-2387 les conserve) et **chaque passage cité** (`evidence`), qui recopie
  la source. Une annonce purgée garde son empreinte de contenu : la recoller rend la fiche
  `purged` (voulu, à dire dans l'écran). Une relance par recollage (`requeued`, TCK-2386) **ne
  repousse pas** `purge_at` : la date court depuis la première saisie.
- **Ce que TCK-2387 ajoute à la purge** (relecture, 2026-10-28) :
  - `extracted.phones_dropped` : les numéros que le modèle a rendus sans que la source les porte,
    **conservés en clair** pour la fiche (décision 7a, option a) — un numéro halluciné peut être
    celui d'un inconnu ;
  - les `ai_suggestions` d'usage `radar.extraction` dont le sujet est l'annonce : `input_snapshot`
    (anonymisé à l'écriture, mais le titre et la description libres peuvent garder un nom), et
    `title` / `description` de `proposal`, `final_value` et `correction_diff`, qui peuvent recopier
    un numéro ou un nom. Effacer ces champs, ou la ligne entière : à trancher ici, contre le taux
    d'acceptation que le socle IA en calcule ;
  - une annonce passée `do_not_contact` **après** sa lecture — STOP tardif par
    `PUT …/advertiser` (TCK-2387), ou par TCK-2388 — garde `extracted` (numéros compris) et
    `raw_text` : le geste ne réécrit pas la fiche. « Dès un STOP » (ADR-0077 §9) doit la couvrir,
    contrairement au STOP vu par le job, qui ne garde pas la lecture ;
  - `source_photo_hashes` et `matches` ne portent aucune donnée personnelle et peuvent rester.

**Héritées de TCK-2388** (démarchage et preuve d'accord) — ce que la purge efface en plus :

- `radar_outreaches.salutation`, `summary` et `message` d'un annonceur jamais publié : le nom
  affiché et le résumé de l'annonce y sont recopiés.
- Pour les réponses **non confirmées** (`radar_consents` sans `confirmed_at`) : les captures (médias
  de la collection `radar_consent_captures`, disque privé), `transcript` et `ai_verdict` (numéro et
  nom lus par le modèle).
- Les `ai_suggestions` d'usage `radar.message_accord` et `radar.verification_accord` dont le sujet
  s'efface.
- **Jamais** une réponse confirmée tant qu'un bien qu'elle justifie existe (ADR-0077 §3).
- Le STOP de TCK-2388 ne purge rien : « dès un STOP » reste à ce ticket. La partie « ne plus
  contacter » de la révocation peut réemployer le STOP de `RadarConsentWorkflow` (aujourd'hui une
  méthode privée, appelée par `recordOutcome` sous les verrous annonces → annonceur, avec reprise
  bornée si une annonce rejoint l'annonceur pendant la lecture).

## Delta à produire

- [ ] `App\Services\Radar\AdvertiserRevocation`.
- [ ] Commande `radar:purge` (`App\Console\Commands\RadarPurge`), planifiée chaque jour.
- [ ] Contrôleur ou action `revoke` · FormRequest `RevokeRadarAdvertiserRequest`
      (`platform.radar.publish`).
- [ ] Tests : `AdvertiserRevocationTest` (biens retirés du public et de l'index ; compte conservé ;
      empreinte enregistrée), `RadarPurgeTest` (89 jours ⇒ intact, 91 ⇒ purgé ; STOP ⇒ purgé tout
      de suite ; preuve conservée tant que le bien existe ; empreinte de refus conservée ; une
      nouvelle saisie du même numéro est marquée `do_not_contact`).
- [ ] Héritées de TCK-2389 : la purge efface aussi la réserve de photos d'une annonce jamais
      publiée (collection `radar_photos`, colonne `photo_preparation`) ; ce ticket **rend vraies**
      les promesses que TCK-2389 a écrites dans les textes juridiques (décision 2a du porteur,
      2026-10-29) : biens retirés « sans délai » après un STOP (`terms.ts` 6.3) et durées de
      conservation (`privacy.ts` § 6), puis retire leur ligne de « Avant la mise en production »
      du `README` de `content/legal`.
- [ ] Spécifications : lever les réserves « **à venir** (TCK-2391) » de `models-spec.md` §105
      (`input_snapshot`), §108 (`phone`, description) et §109 (`raw_text`, `phones_dropped`,
      `stage = purged`), posées par la passe 017 de `/sync-specs` (MF1).

## Critères d'acceptation

- [ ] AC1 — Après révocation, les biens de l'annonceur ne sont plus servis par les routes publiques
      ni par la recherche.
- [ ] AC2 — Une annonce jamais publiée saisie il y a 91 jours n'a plus ni texte, ni capture, ni
      téléphone ; celle de 89 jours est intacte.
- [ ] AC3 — Après purge d'un annonceur qui a dit STOP, une nouvelle annonce de son numéro est
      marquée `do_not_contact` à la saisie.
- [ ] AC4 — Une preuve qui justifie un bien encore publié survit à la purge.

## Hors périmètre

- La suppression du compte (voie existante de `features.md` § 2.1).

## Notes d'implémentation

_(à remplir par implementing-specs)_

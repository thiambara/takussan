---
id: TCK-2391
title: "Radar : la révocation retire du public sur-le-champ, et la purge efface les annonces jamais publiées en gardant l'empreinte des refus"
status: todo
phase: P1
family: back
estimate: M
wave: 80
created: 2026-10-26
updated: 2026-10-26
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

## Delta à produire

- [ ] `App\Services\Radar\AdvertiserRevocation`.
- [ ] Commande `radar:purge` (`App\Console\Commands\RadarPurge`), planifiée chaque jour.
- [ ] Contrôleur ou action `revoke` · FormRequest `RevokeRadarAdvertiserRequest`
      (`platform.radar.publish`).
- [ ] Tests : `AdvertiserRevocationTest` (biens retirés du public et de l'index ; compte conservé ;
      empreinte enregistrée), `RadarPurgeTest` (89 jours ⇒ intact, 91 ⇒ purgé ; STOP ⇒ purgé tout
      de suite ; preuve conservée tant que le bien existe ; empreinte de refus conservée ; une
      nouvelle saisie du même numéro est marquée `do_not_contact`).

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

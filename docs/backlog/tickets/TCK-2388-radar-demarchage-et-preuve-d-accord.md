---
id: TCK-2388
title: "Radar : fiche annonceur, message d'accord à clauses fixes ouvert dans WhatsApp, et preuve d'accord vérifiée par l'IA puis confirmée"
status: doing
phase: P1
family: full
estimate: L
wave: 80
created: 2026-10-26
updated: 2026-10-28
depends_on: [TCK-2386]
blocks: [TCK-2389, TCK-2390, TCK-2395]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, ia, whatsapp, consentement, adr-0077]
---

## Objectif utilisateur

Un opérateur contacte un annonceur en un clic pour toutes ses annonces à la fois, puis enregistre
sa réponse « OUI » comme une preuve d'accord vérifiée, qui ouvre la publication.

## Contexte

Lot 1 du [plan](../../plans/2026-10-26-radar-et-socle-ia.md) (écran 4 « Fiche annonceur » et
« Le message d'accord — clauses fixes (v1) »), [ADR-0077](../../adr/0077-le-radar.md) §2 à §5,
§11. Canal du lot 1 : WhatsApp **manuel** (`wa.me`), depuis un téléphone dédié au Radar.

## Contrat de données

- Tables `radar_outreaches`, `radar_outreach_listing`, `radar_consents` (plan, § « Les données »).
- Routes sous `/api/admin/radar` :
  - `GET advertisers` · `GET advertisers/{advertiser}` (ses annonces, messages, accords) ;
  - `POST advertisers/{advertiser}/claim` · `DELETE …/claim` — prise en charge de 10 minutes ;
  - `POST advertisers/{advertiser}/outreaches` — `{listing_ids[]}` → le message préparé (texte
    exact, version des clauses, lien `wa.me`) ;
  - `POST outreaches/{outreach}/sent` — l'opérateur confirme l'envoi ;
  - `POST outreaches/{outreach}/reply` — captures (multipart) → verdict IA ;
  - `POST outreaches/{outreach}/outcome` — confirmation humaine : `consented` · `refused` ·
    `stop` · `question` · `no_answer` (les trois derniers sans capture).
- Usages IA : `radar.message_accord` (rôle `redaction` : salutation et résumé seulement) et
  `radar.verification_accord` (rôle `raisonnement` + `vision` : transcription, numéro ou nom
  concordant, clauses retrouvées, classement, confiance).

## Direction UX / Artistique

La fiche annonceur est le poste de travail du démarchage : qui il est (nature présumée et indices),
ce qu'il a publié, ce qu'on lui a dit et quand, ce qu'il a répondu. Préparer un message, c'est
cocher des annonces et relire un texte dont les clauses sont visiblement figées et la partie
personnalisée visiblement éditable. Le verdict de la vérification se lit d'un coup d'œil (accord,
refus, STOP, question, ambigu) avec ce qui le justifie, et l'opérateur le confirme ou le corrige.
Les relances dues remontent d'elles-mêmes.

## Contraintes strictes (métier)

- **Les clauses sont un texte versionné du dépôt, jamais généré** :
  `resources/radar/clauses/accord.v1.<locale>.md`. L'IA ne produit que `{salutation}` et
  `{resume}`. Le texte enregistré dans `radar_outreaches` est **exactement** celui du lien `wa.me`.
- **Un message couvre une liste d'annonces** de l'annonceur, toutes `reviewed`.
- **On ne prépare aucun message pour un annonceur `do_not_contact`** (422), ni pour une annonce
  déjà couverte par un accord valide.
- **Un accord n'est valide qu'une fois confirmé par un humain** (`radar_consents.confirmed_by_id`
  et `confirmed_at`) ; le verdict IA seul ne vaut rien.
- **Un verdict IA dont le numéro ne concorde pas ou dont les clauses ne sont pas retrouvées** ne
  peut être confirmé en `consented` qu'avec un motif écrit, journalisé.
- **STOP** passe l'annonceur en `do_not_contact` (date) et enregistre l'empreinte HMAC de son numéro
  (`App\Support\PhoneFingerprint`) : définitif. ⚠ TCK-2386 a livré l'empreinte sous
  `App\Support\RadarPhone::hmac()` (et la lecture des refus sous
  `RadarAdvertiserDirectory::refusedAmong()`) : les réutiliser, pas en écrire une seconde.
  **Ordre des verrous** (revue finale de TCK-2386) : le job d'extraction verrouille l'annonce,
  puis l'annonceur ; le gestionnaire de STOP qui touche les deux prend le même ordre, sous peine
  d'interblocage.
- **Captures** : mêmes règles que TCK-2386, empreinte SHA-256 conservée dans `radar_consents`.
- **Prise en charge** : 10 minutes, renouvelable, un seul opérateur par annonceur (modèle
  d'ADR-0043) ; une écriture sans la prise en charge rend 409.
- Le numéro WhatsApp des notifications n'est jamais utilisé : le lien `wa.me` ne porte que le
  numéro de l'annonceur.
- **Ce que TCK-2387 laisse à ce ticket** (revue finale, 2026-10-28) :
  - la nature présumée **corrigée** à la relecture (`PATCH … {advertiser_nature}`) vit dans
    `radar_listings.extracted.advertiser_nature` et **n'est pas recopiée** dans
    `radar_advertisers.nature` : la fiche annonceur doit la lire depuis ses annonces relues, ou ce
    ticket décide de la propager (et de ce qui l'emporte entre deux annonces qui divergent) ;
  - `PUT …/listings/{listing}/advertiser` (TCK-2387) rattache déjà un annonceur depuis un numéro
    connu de l'annonce, sous le même ordre de verrous, et rend `do_not_contact` si ce numéro a dit
    STOP : le gestionnaire de STOP de ce ticket s'y aligne.
- Droits : `platform.radar.operate`.

## Delta à produire

- [ ] Migrations `create_radar_outreaches_table`, `create_radar_outreach_listing_table`,
      `create_radar_consents_table`, `add_claim_columns_to_radar_advertisers_table` · modèles
      `RadarOutreach`, `RadarConsent` · enums `RadarOutreachOutcome`, `RadarConsentProof`.
- [ ] Clauses `resources/radar/clauses/accord.v1.fr.md` (texte du plan) et `accord.v1.en.md`.
- [ ] `App\Services\Radar\ConsentMessageComposer` (clauses + parties générées, lien `wa.me`).
- [ ] Agents `App\Ai\Agents\RadarConsentMessage`, `App\Ai\Agents\RadarConsentVerification` et
      leurs usages ; prompts `v1` ; premiers jeux d'évaluation anonymisés (captures d'accord, de
      refus, de STOP, ambiguës).
- [ ] `App\Services\Radar\AdvertiserClaim` (prise en charge).
- [ ] Contrôleurs `RadarAdvertiserController`, `RadarOutreachController` · FormRequests associées.
- [ ] Front : fiche annonceur, préparation du message, dépôt de la réponse, verdict, file « à
      relancer ».
- [ ] Sections `docs/models-spec.md` des nouveaux modèles.
- [ ] Tests : `ConsentMessageComposerTest` (**clauses mot pour mot**, salutation seule générée),
      `RadarOutreachTest` (annonceur `do_not_contact` refusé, annonces non relues refusées),
      `RadarConsentTest` (verdict IA non confirmé ≠ accord ; confirmation contre un verdict
      discordant exige un motif ; STOP ⇒ `do_not_contact` + empreinte), `AdvertiserClaimTest`.

## Critères d'acceptation

- [ ] AC1 — Le texte enregistré et le paramètre `text` du lien `wa.me` sont identiques, et
      contiennent les clauses de `accord.v1.fr.md` mot pour mot, même si le faux modèle renvoie
      une « clause » de sa propre invention.
- [ ] AC2 — Un seul accord confirmé couvre toutes les annonces listées par le message.
- [ ] AC3 — Une réponse classée « accord » par l'IA n'ouvre aucune publication tant qu'un humain
      ne l'a pas confirmée.
- [ ] AC4 — STOP : l'annonceur passe `do_not_contact`, l'empreinte de son numéro est enregistrée,
      et préparer un nouveau message rend 422.
- [ ] AC5 — Un second opérateur qui écrit sur un annonceur pris en charge reçoit 409.
- [ ] AC6 — `ai:eval radar.verification_accord` passe sur le jeu livré.

## Hors périmètre

- La publication (TCK-2389) et la réclamation (TCK-2390).
- Le canal automatisé par l'API Cloud (TCK-2395).

## Notes d'implémentation

_(à remplir par implementing-specs)_

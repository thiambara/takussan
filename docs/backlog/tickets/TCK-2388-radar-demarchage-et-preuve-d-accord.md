---
id: TCK-2388
title: "Radar : fiche annonceur, message d'accord à clauses fixes ouvert dans WhatsApp, et preuve d'accord vérifiée par l'IA puis confirmée"
status: done
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
  models:
    - "docs/models-spec.md#108-radaradvertiser-"
    - "docs/models-spec.md#110-radaroutreach-"
    - "docs/models-spec.md#111-radarconsent-"
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

- [x] Migrations `create_radar_outreaches_table`, `create_radar_outreach_listing_table`,
      `create_radar_consents_table`, `add_claim_columns_to_radar_advertisers_table` · modèles
      `RadarOutreach`, `RadarConsent` · enums `RadarOutreachOutcome`, `RadarConsentProof`.
- [x] Clauses `resources/radar/clauses/accord.v1.fr.md` (texte du plan) et `accord.v1.en.md`.
- [x] `App\Services\Radar\ConsentMessageComposer` (clauses + parties générées, lien `wa.me`).
- [x] Agents `App\Ai\Agents\RadarConsentMessage`, `App\Ai\Agents\RadarConsentVerification` et
      leurs usages ; prompts `v1` ; premiers jeux d'évaluation anonymisés (captures d'accord, de
      refus, de STOP, ambiguës) — 16 captures synthétiques pour `radar.verification_accord` (décision 6) ;
      aucun jeu pour `radar.message_accord`, que l'opérateur relit avant chaque envoi.
- [x] `App\Services\Radar\AdvertiserClaim` (prise en charge).
- [x] Contrôleurs `RadarAdvertiserController`, `RadarOutreachController` · FormRequests associées.
- [x] Front : fiche annonceur, préparation du message, dépôt de la réponse, verdict, file « à
      relancer ».
- [x] Sections `docs/models-spec.md` des nouveaux modèles.
- [x] Tests : `ConsentMessageComposerTest` (**clauses mot pour mot**, salutation seule générée),
      `RadarOutreachTest` (annonceur `do_not_contact` refusé, annonces non relues refusées),
      `RadarConsentTest` (verdict IA non confirmé ≠ accord ; confirmation contre un verdict
      discordant exige un motif ; STOP ⇒ `do_not_contact` + empreinte), `AdvertiserClaimTest`.

## Critères d'acceptation

- [x] AC1 — Le texte enregistré et le paramètre `text` du lien `wa.me` sont identiques, et
      contiennent les clauses de `accord.v1.fr.md` mot pour mot, même si le faux modèle renvoie
      une « clause » de sa propre invention.
- [x] AC2 — Un seul accord confirmé couvre toutes les annonces listées par le message.
- [x] AC3 — Une réponse classée « accord » par l'IA n'ouvre aucune publication tant qu'un humain
      ne l'a pas confirmée.
- [x] AC4 — STOP : l'annonceur passe `do_not_contact`, l'empreinte de son numéro est enregistrée,
      et préparer un nouveau message rend 422.
- [x] AC5 — Un second opérateur qui écrit sur un annonceur pris en charge reçoit 409.
- [x] AC6 — `ai:eval radar.verification_accord` passe sur le jeu livré. *Partiel (décision 6) : vérifié sur
      faux modèle ; la référence réelle part avec le passage payant de TCK-2403 (son AC3).*

## Hors périmètre

- La publication (TCK-2389) et la réclamation (TCK-2390).
- Le canal automatisé par l'API Cloud (TCK-2395).

## Notes d'implémentation

**Plan** : [`docs/plans/2026-10-28-radar-tck-2388.md`](../../plans/2026-10-28-radar-tck-2388.md) — neuf tâches, chacune
relue (conformité + qualité), puis une revue de branche entière et sa re-revue, et une vérification au navigateur.

**Décisions du porteur (2026-10-28)** — détail au plan, § « Décisions du porteur » :

1. Les clauses `accord.v1` n'ont pas de ligne de réclamation ; TCK-2390 l'ajoute en `accord.v2`. Chaque message garde
   sa version (`radar_outreaches.clauses_version`).
2. Les liens du message se construisent depuis la configuration (`app.frontend_url`).
3. Une nature d'annonceur corrigée à la relecture devient `radar_advertisers.nature` (la dernière relecture humaine
   l'emporte).
4. Relances après 3 jours, deux au plus, puis « sans réponse » proposé (`config/radar.php` → `follow_ups`).
5. Langue du message : `fr` ou `en`, `fr` par défaut.
6. Jeu d'évaluation `radar.verification_accord` synthétique ; sa référence se fixe avec le passage payant de
   TCK-2403 (amendé : delta, AC3, notation de `number_matches`).

**Décisions prises pendant l'implémentation** :

- Un premier message est refusé sur une annonce dont la chaîne est ouverte (`radar.outreach.listing_pending`) : avant
  une issue, seule une relance réécrit.
- La prise en charge est stricte : toute écriture sur l'annonceur sans la tenir rend 409 (`claim_required`,
  `claimed_by_other`) — les six routes d'écriture, AC5.
- Ordre des verrous : annonces (id croissant) → annonceur → message → réponse, partout. Le STOP relit les annonces
  de l'annonceur sous son verrou et reprend la transaction (trois fois, puis 409 `radar.advertiser.busy`) si une
  annonce l'a rejoint pendant la lecture.
- « J'ai envoyé » refuse un message dont une annonce est passée à un autre annonceur (409 `listing_foreign`), dont
  une annonce a changé d'étape (`stage_conflict`), ou une relance dont la cible a reçu une issue
  (`follow_up_invalid`). Une seule règle, `RadarOutreachWorkflow::sendBlock()`, sert aussi la fiche : un tel
  brouillon n'offre plus de lien `wa.me` et dit pourquoi (`send_blocked`).
- Un brouillon de relance non envoyé ne ferme pas la chaîne : seule une relance **envoyée** remplace un message
  (`RadarFollowUps`). Piège payé : dans un `whereDoesntHave` sur une auto-relation, Laravel aliase la table de la
  sous-requête, et la colonne qualifiée `radar_outreaches.sent_at` y désigne la ligne d'origine.
- La transcription s'affiche depuis la colonne `radar_consents.transcript` ; sa copie dans `ai_verdict` n'est pas lue
  par le front.
- `onboarding/super-admin` devient une frontière de dictionnaire : `superAdmin` (que chaque libellé du Radar
  alourdit) n'est plus servi aux six autres assistants de l'onboarding (42,9 % → 21,2 % du dictionnaire).
- **Identité non vérifiée (décision du porteur, 2026-10-28, revue finale I3)** : quand le numéro de la capture est
  illisible et que le nom affiché ne confirme pas l'annonceur, le verdict porte la discordance
  `identity_unverified`, et confirmer un accord exige un motif écrit, comme pour un numéro discordant. Le jeu
  d'évaluation y gagne un 16ᵉ cas.

**Limites acceptées** :

- La vérification sans verrou de « préparer » peut payer un appel au modèle pour rien quand une écriture concurrente
  change l'état entre la lecture et le verrou ; la transaction refuse ensuite proprement.
- Une issue non finale (question) décide la suggestion IA pour de bon, même si une réponse déposée plus tard change
  l'issue ; l'ordre « issue / réponse » se juge à la seconde.
- Le plancher de 5 s par maillon de repli fois quatre maillons et plus dépasse le budget de temps d'un appel
  (imposé par le plan).
- Les clauses `accord.v1` disent « ces annonces » même pour une seule : à reprendre en `accord.v2` (TCK-2390), avec
  la relecture de l'avocat.
- Une retouche reste acceptée après un STOP ; « J'ai envoyé » la refuse ensuite.
- Un opérateur qui ne tient pas la prise et envoie un STOP pendant une course reçoit `busy` après les trois reprises
  plutôt que `claimed_by_other` ; rien n'est écrit.
- **Coût de nuit (décision du porteur, 2026-10-28)** : le passage nocturne `ai:eval --all` (ADR-0076 §8) joue les
  16 cas de vision de `radar.verification_accord` sur tout environnement doté d'une clé et d'un planificateur, sans
  référence à comparer tant que TCK-2403 n'est pas fait. Gardé, comme pour `radar.extraction` : ces appels ne
  comptent pas au budget du jour.

**Tests** (ciblés en local, suites entières par la CI de la PR) :

- AC1 : `ConsentMessageComposerTest::test_ac1_*` (×2, fr et en), `RadarOutreachTest::test_ac1_*`.
- AC2 : `RadarOutreachTest::test_ac2_*`, `RadarConsentTest::test_ac2_*`.
- AC3 : `RadarConsentTest::test_ac3_*`. AC4 : `RadarConsentTest::test_ac4_*`.
- AC5 : `AdvertiserClaimTest::test_ac5_*` (×2, une ligne par route d'écriture).
- AC6 : `RadarConsentVerificationEvalSetTest::test_ac6_*` sur faux modèle ; la référence réelle part avec TCK-2403
  (son AC3).
- Front : `annonceur/__tests__/*` (fiche, prise, aperçu, réponse, verdict, dialogue d'issue, files), la pastille de
  `RadarConsole`, `codes-radar` (chaque code `radar.*` de l'API a son libellé ; aucun motif `ai.*` ne parle
  d'extraction).
- Chaque correctif de revue porte un test vérifié par ablation (le correctif retiré, le test rougit) ; le détail est
  dans les rapports de tâche.

**Vérification au navigateur** (2026-10-28, local, usages IA coupés par la console pour ne rien payer) : fiche,
prise en charge, préparation sans IA, retouche, lien `wa.me`, « J'ai envoyé », issue « question », verdict
discordant, motif exigé puis accord confirmé (deux annonces couvertes par un accord), files « à contacter » et « à
relancer », pastille de la console, STOP en deux temps. Trois défauts relevés et corrigés (5d567772d).

---
id: TCK-2391
title: "Radar : la révocation retire du public sur-le-champ, et la purge efface les annonces jamais publiées en gardant l'empreinte des refus"
status: review
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

- [x] `App\Services\Radar\AdvertiserRevocation`.
- [x] Commande `radar:purge` (`App\Console\Commands\RadarPurge`), planifiée chaque jour.
- [x] Contrôleur ou action `revoke` · FormRequest `RevokeRadarAdvertiserRequest`
      (`platform.radar.publish`).
- [x] Tests : `AdvertiserRevocationTest` (biens retirés du public et de l'index ; compte conservé ;
      empreinte enregistrée), `RadarPurgeTest` (89 jours ⇒ intact, 91 ⇒ purgé ; STOP ⇒ purgé tout
      de suite ; preuve conservée tant que le bien existe ; empreinte de refus conservée ; une
      nouvelle saisie du même numéro est marquée `do_not_contact`).
- [x] Héritées de TCK-2389 : la purge efface aussi la réserve de photos d'une annonce jamais
      publiée (collection `radar_photos`, colonne `photo_preparation`) ; ce ticket **rend vraies**
      les promesses que TCK-2389 a écrites dans les textes juridiques (décision 2a du porteur,
      2026-10-29) : biens retirés « sans délai » après un STOP (`terms.ts` 6.3) et durées de
      conservation (`privacy.ts` § 6), puis retire leur ligne de « Avant la mise en production »
      du `README` de `content/legal`. ⚠ Le § 6 dit que la preuve de l'accord est conservée « tant que
      les annonces concernées sont en ligne, puis 3 ans » : la règle de purge doit suivre CE texte (un
      bien retiré du public mais non supprimé fait courir les 3 ans), ou le texte change, avec l'avocat.
      ⚠ La réserve peut laisser des **fichiers sans ligne `media`** : un échec du commit, ou un
      worker coupé (`$timeout`) entre l'écriture du fichier et le commit, dans
      `PrepareRadarListingPhotos` ou le dépôt manuel. Une purge qui part des lignes `media` ne les
      verrait jamais : balayer le préfixe de stockage des médias de l'annonce, pas ses seules lignes.
      ⚠ La publication (`RadarPublisher`) copie aussi la réserve dans les médias des biens à
      l'intérieur de sa transaction : une transaction défaite, ou une requête coupée par
      `max_execution_time`, laisse des fichiers sous le préfixe des **biens** jamais créés, que le
      balayage de la réserve ne voit pas.
- [x] Héritée de la revue finale de TCK-2389 : **retirer un compte créé par le Radar, c'est le
      supprimer (suppression douce), pas le bloquer.** Un compte du Radar bloqué reste le candidat que
      `PhoneLoginService` ouvre par code (amendement d'ADR-0033 §3) : le titulaire du numéro reçoit
      403 `account_blocked` à chaque essai et ne peut plus s'inscrire par téléphone, pour toujours.
      La révocation (et le runbook du support) le dit, et le geste de suppression du compte
      (`features.md` § 2.1) est celui à employer.
- [ ] Spécifications (PR de spec de la session déléguante, texte dans le rapport) : lever les réserves « **à venir** (TCK-2391) » de `models-spec.md` §105
      (`input_snapshot`), §108 (`phone`, description) et §109 (`raw_text`, `phones_dropped`,
      `stage = purged`), posées par la passe 017 de `/sync-specs` (MF1).

## Critères d'acceptation

- [x] AC1 — Après révocation, les biens de l'annonceur ne sont plus servis par les routes publiques
      ni par la recherche.
- [x] AC2 — Une annonce jamais publiée saisie il y a 91 jours n'a plus ni texte, ni capture, ni
      téléphone ; celle de 89 jours est intacte.
- [x] AC3 — Après purge d'un annonceur qui a dit STOP, une nouvelle annonce de son numéro est
      marquée `do_not_contact` à la saisie.
- [x] AC4 — Une preuve qui justifie un bien encore publié survit à la purge.

## Hors périmètre

- La suppression du compte (voie existante de `features.md` § 2.1).

## Notes d'implémentation

**Re-mesure : ce que le ticket supposait et que le code dément.**

- **Il n'y a pas de préfixe de stockage par annonce à balayer.** `DefaultPathGenerator` range un média sous `{id du média}/` ; un fichier
  orphelin (commit défait, worker coupé) vit sous un identifiant que la séquence a brûlé. Le balayage de `radar:purge`
  (`RadarOrphanFiles`) parcourt donc les dossiers numériques de premier niveau du disque **privé** sans ligne `media`, plus vieux d'1 h
  (une transaction vit 60-85 s). Changer le générateur aurait cassé les chemins des médias existants. Les copies de la publication sous
  les biens (disque public, des milliers de dossiers légitimes) ne sont **pas** balayées : TCK-2406.
- **L'annonceur n'a pas de colonne « notes »** : « ses notes » = `nature` et `nature_signals`, remis à `unknown` et `[]`.
- **Un STOP après publication ne retirait aucun bien** : `RadarConsentWorkflow::stop()` fermait les annonces et révoquait les accords, rien de plus.
  Il appelle désormais `AdvertiserRevocation::apply()`, le corps commun avec le geste de l'opérateur, sous ses propres verrous
  (annonces → annonceur → biens). Les quatre épreuves de `RadarConsentTest` qui lisaient l'annonce après un STOP la trouvaient `do_not_contact` :
  la purge part maintenant en file (`Bus::fake([PurgeRadarAdvertiser::class])` dans leur `setUp`), `RadarStopPurgeTest` éprouve la chaîne entière.

**Décisions (porteur ou défaut conventionnel).**

- **`ai_suggestions` du sujet purgé : les champs s'effacent, la ligne reste** (`proposal` → `[]`, `input_snapshot`, `final_value`,
  `correction_diff` → null). `acceptanceRates()` ne lit que `usage_key`, `decision` et `decided_at` ; `EvalCaseExporter` filtre déjà
  `whereNotNull('input_snapshot')`. Supprimer la ligne aurait bougé le taux d'acceptation rétroactivement.
- **Durée de la preuve : le texte de `privacy.ts` § 6 est suivi à la lettre** — tant qu'une annonce qu'elle couvre attend sa publication
  (`consented`) ou est publiée sur un bien **public** (`Property::public()`), puis `radar.consent_retention_years` (3) ans. Le retrait n'a
  pas de date en base : `radar_consents.offline_since`, posée par `radar:purge` à la première observation « plus rien en ligne »
  (`coalesce(revoked_at, maintenant)` : le jour de la révocation s'il y en a une), remise à null si un bien revient en ligne. Précision d'un jour.
  `purged_at` : la preuve est effacée (transcription, verdict, captures) ; la ligne reste avec les empreintes des captures, le statut et les dates.
  Le message qu'elle prouvait (salutation, résumé, texte) part au même passage, pas avant : c'est lui qu'elle prouve.
- **La matière collectée d'une annonce publiée n'est pas purgée** (ADR-0077 §9 : « jamais publiée »), révocation comprise : texte brut, captures,
  `extracted` et numéro en clair de l'annonceur restent tant qu'il lui reste une annonce. TCK-2406 attend le porteur.
- **Une annonce `consented` jamais publiée est purgée à 90 jours comme les autres** : le texte légal ne distingue pas.
- **La révocation ne demande pas la prise en charge** de l'annonceur (un retrait n'attend pas qu'un autre opérateur libère la sienne) et est
  idempotente : rejouée, elle garde la première date et ne retire que ce qui serait encore public. Un bien déjà sorti du public n'est pas touché ;
  un bien vendu ou loué ne ferme que sa vitrine (visibilité privée), son statut dit déjà quelque chose de vrai.
- **Retrait d'un bien = `PropertyPublication::archivedAttributes()`**, la voie de l'archivage en lot ; l'observateur de Scout le sort de l'index à la
  sauvegarde et `reindexer()` le redit après le commit.
- **Compte créé par le Radar** : la révocation ne le supprime pas (« le compte reste », hors périmètre) et la réponse porte `account_user_id`. **Runbook
  du support : le retirer = le SUPPRIMER (suppression douce, `features.md` § 2.1), jamais le bloquer** — un compte du Radar bloqué reste le candidat que
  `PhoneLoginService` ouvre par code ; son titulaire reçoit 403 `account_blocked` à chaque essai et ne peut plus s'inscrire par téléphone, pour toujours.
- **« Dès un STOP » : un job après le commit** (`PurgeRadarAdvertiser`), `radar:purge` en filet. Une annonce qui arrive APRÈS le STOP sur ce numéro naît
  `do_not_contact` (saisie, extraction) et n'est purgée qu'au passage quotidien suivant : au plus un jour de texte brut pour un numéro qui a refusé.
- **Un annonceur sans annonce restante** perd numéro, nom et indices ; sa ligne s'en va s'il n'a ni refus, ni message, ni accord, ni compte lié (sans
  elle, son empreinte ne survit pas : le texte légal ne promet l'empreinte qu'à celui qui a dit STOP). Sinon il garde sa ligne, empreinte comprise, et
  `RadarAdvertiserDirectory::findOrCreate()` lui rend son numéro s'il revient SANS refus (la publication et le lien `wa.me` partent de `phone`).
- **Les gardes sous verrou de `RadarPurger`** (annonce encore due, annonceur encore sans annonce) sont des gardes de course : un test ne les atteint pas
  sans concurrence. Le premier filtre des candidats les double, et c'est lui que les épreuves ablatées voient.
- **Journal** : `radar_purged` (comptes seulement, jamais un numéro ni un texte), écrit quand quelque chose a été effacé ; `radar_advertiser_revoked`
  (motif de l'opérateur, qu'il lui appartient de garder sans numéro). Ni l'un ni l'autre ne figure dans une famille de rétention de
  `audit:prune-activity-log` : douze mois par défaut.
- **Pour TCK-2390** : le lien de réclamation doit refuser un annonceur dont `do_not_contact_at` est non nul ; les accords révoqués portent `revoked_at`.
- `README` de `content/legal` : la ligne 6 de « Avant la mise en production » est retirée, les suivantes ne sont pas renumérotées (TCK-2390 retire la 7e :
  pas de conflit de lignes).

**Corrections de la vérification adverse (2026-10-29).**

- **Les trois ans partent du DERNIER retrait.** `offline_since` prenait `coalesce(revoked_at, maintenant)` : une preuve révoquée à T0, republiée par l'hôte puis
  retirée à T0 + 2,5 ans s'effaçait 200 jours après le dernier retrait. Il prend la date de l'observation (un jour de précision) et se remet à null
  quand un bien revient ; `revoked_at` ne dit que le premier retrait. Limite : une remise en ligne qui ne dure pas jusqu'au passage quotidien suivant
  n'est pas vue, et la date du retrait précédent reste.
- **« Dès un STOP » vaut aussi pour ce qui arrive après.** Une annonce saisie en texte sur un numéro qui a refusé, un STOP trouvé par l'extraction
  (sous verrou, ou avant l'appel) et un numéro rattaché à la main lancent `PurgeRadarAdvertiser` après commit : plus un jour de texte brut. La saisie par URL
  ou par captures n'a pas de numéro à la saisie ; elle passe par l'extraction.
- **Le balayage date un dossier vide par le dossier lui-même** (jamais balayé s'il a moins d'1 h ; sur un seau objet, un dossier vide n'existe pas).
- **Course purge d'annonceur / rattachement : réelle, corrigée.** `findOrCreate()` rend le numéro, puis le job (ou `setAdvertiser`) prend le verrou de
  l'annonceur ; une purge entre les deux ne voit pas encore l'annonce, efface le numéro et valide. Reproduite par un crochet `updated` qui lance la purge
  à cet instant (un test dans `ExtractRadarListingTest`, un dans `RadarListingAdvertiserTest`) ; corrigée par `RadarAdvertiserDirectory::restorePhone()`
  rappelé sous verrou. Un annonceur dont la ligne a été supprimée entre-temps (ni refus, ni message, ni accord) est simplement non rattaché : l'opérateur
  le pose à la main.
- **L'empreinte des refus dépend de `app.key`** (`config/radar.php`) : le numéro en clair étant purgé, une rotation d'`APP_KEY` perd sans retour l'empreinte de tous
  les refus déjà purgés, et le Radar pourrait recontacter ces numéros. À poser avant la production : une clé dédiée (`radar.phone_hmac_key`), jamais tournée à la légère.
- **Copie nocturne du seau privé** : les fichiers purgés survivent dans `vps-sauvegardes` (jamais `sync`). Hors du diff : TCK-2407.

- **Une réponse purgée pendant la vérification n'est plus réécrite (I-4).** `VerifyRadarConsentReply` lit les captures, appelle le modèle (plusieurs secondes),
  puis écrit : un STOP posé pendant l'appel faisait revenir transcription, verdict et suggestion sur une réponse déjà purgée, que la purge quotidienne
  ne revoyait jamais (`purged_at` posé). Deux gardes : le `settle()` du job relit la réponse sous verrou et n'écrit rien si `purged_at` est posé (il journalise
  `radar.verification.abandoned_purged`, identifiant seulement) ; la purge sort une réponse `pending` vers `failed` avec le motif `radar.verification.purged`
  (`done` dirait qu'un verdict existe, `pending` que le job doit revenir ; une réponse déjà `done` ou `failed` garde son statut). Le motif a son libellé dans
  le front (`codes-radar.ts`, trois langues). La ligne `ai_calls` de l'appel ne garde pas la sortie du modèle (jetons, issue, motif, rattachement à la réponse :
  aucun numéro ni nom) et la passerelle ne met pas en cache un usage `personnelle` avec pièces jointes : rien à purger de ce côté.

**Décisions du porteur (2026-10-29).** Les quatre recommandations de l'implémentation sont retenues, ainsi que les choix techniques ci-dessus.

1. `ai_suggestions` du sujet purgé : les champs s'effacent, la ligne reste.
2. Durée de la preuve : règle de `privacy.ts` § 6 avec `radar_consents.offline_since` et `purged_at`, durée en configuration à 3 ans (`radar.consent_retention_years`).
3. Matière collectée des annonces publiées : la lettre d'ADR-0077 § 9 (« jamais publiée »). TCK-2406 porte l'éventuelle purge de cette matière 3 ans après le retrait.
4. Orphelins : balayage des répertoires numériques du disque privé sans ligne `media` et de plus d'1 h ; l'écart des copies publiques est noté dans TCK-2406.

**Reste avant `done`** : la PR de spec (`models-spec.md` §105, §108, §109, §111 ; `features.md` § 2.12), faite par la session déléguante à partir du rapport.

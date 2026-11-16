---
id: TCK-537
title: "La politique de confidentialité promet quatre choses que le code ne fait pas encore (preuve du consentement, effacement des profils, purges, auteur des avis)"
status: todo
phase: P1
family: bug
estimate: L
wave: 66
created: 2026-09-17
updated: 2026-11-16
depends_on: [TCK-531]
blocks: []
spec_refs:
  features:
    - docs/features.md#210-pages-légales-publiques
    - docs/features.md#21-authentification--comptes
    - docs/features.md#26-audit--traçabilité
    - docs/features.md#111-avis--réputation
  models:
    - docs/models-spec.md#1-user
tags: [back, front, légal, données-personnelles, conformité]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé, et le ticket a grossi.** `depends_on: [TCK-531]` est levé (TCK-531 `done`).

- Fermé entre-temps : purge du journal par famille (TCK-2342, déjà coché) ; quatre des cinq écarts
  hors politique — EXIF (TCK-2355, `jpegoptim` dans le `Dockerfile`), jetons Sanctum bornés à 30 j
  (TCK-589), code de téléphone envoyé (TCK-589, voix TCK-2940), adresses divergentes (TCK-590) ;
  `ipapi.co` réduit (TCK-1225). Depuis TCK-633 lot C, `users.terms_accepted_at`/`terms_version`
  existent (publication, connexion par téléphone, réclamation radar) — une date écrasée, sans
  document ni IP : ce n'est pas la preuve demandée.
- Toujours vrai : preuve du consentement (inscription, assistant hôte, réservation, offre) ;
  `endProfiles` soft-delete les profils sans effacer leurs colonnes chiffrées ; aucune purge KYC
  + 5 ans ni des demandes de contact à 3 ans ; auteur des avis (nom complet + avatar).
- Ajouté (renvoyé par des tickets clos) : trois engagements de texte absents de `privacy.ts` —
  les jobs échoués (TCK-803), l'export des notes/critères de la fiche client (TCK-956), la dictée
  vocale du navigateur (TCK-2903).
- Reste à faire : table de preuve du consentement + case de `RegisterRequest` ; effacement des
  colonnes de profil ; deux purges planifiées ; les trois mentions de texte ; aligner `VERSION_DOCUMENTS`.
- **Décisions attendues du porteur** : auteur d'un avis — (a) prénom + initiale (recommandé) /
  (b) statu quo, nom complet + photo ? `ipapi.co` à l'accueil — (a) au premier geste seulement /
  (b) garder la lecture au premier affichage, déclarée ? Quelle version fait foi —
  `VERSION_DOCUMENTS` (`editeur.ts`) ou `PublishReadiness::TERMS_VERSION` (même date aujourd'hui) ?

## Décisions du porteur (2026-11-16)

1. **Une personne montrée publiquement est nommée par son prénom et l'initiale de son nom**
   (« Awa N. »). Ce que le ticket relève : l'auteur d'un avis. Les fiches d'agent et d'agence sont
   des fiches professionnelles (TCK-2576) et gardent leur nom.
2. **`ipapi.co` n'est appelé qu'au premier geste du visiteur** (appui, clic ou touche), jamais au
   simple chargement d'une page ; la politique le dit.
3. **La version des documents juridiques a une seule source : `VERSION_DOCUMENTS`**
   (`takussan-web/src/content/legal/editeur.ts`). `PublishReadiness::TERMS_VERSION` en est le reflet
   côté API, tenu égal par `scripts/check-terms-version.mjs` (Repo CI) — jamais une recopie silencieuse.
   Répond à la question de la contrainte 3.

## Objectif utilisateur

Que ce que la politique de confidentialité et les CGU affirment soit vrai. Un texte juridique qui
promet un effacement ou une purge que le code n'exécute pas engage l'éditeur devant la CDP (loi
n° 2008-12) et devant l'utilisateur.

## Contrat de données

Relevé le 2026-09-17 en rédigeant les textes de TCK-531 (`takussan-web/src/content/legal/`). La
règle de rédaction retenue : **le texte énonce l'engagement que la loi impose, et l'écart est
tracé ici** — plutôt que d'écrire une politique qui décrirait un défaut comme une règle.

| Engagement écrit | Où | Ce que fait le code (2026-09-17) |
|---|---|---|
| **Preuve du consentement** conservée « le temps du consentement, puis 5 ans » | `privacy.ts` §6 | `cgu_accepted` (assistant hôte) et `terms_accepted` (offre) sont **validés puis jetés** ; `RegisterRequest` ne porte **aucune** case CGU alors que le front en affiche une obligatoire (`app/Http/Requests/Auth/RegisterRequest.php`). *Depuis TCK-633 lot C (2261d4f45) : `users.terms_accepted_at` + `terms_version` posés à la publication, à la connexion par téléphone et à la réclamation radar — une date unique écrasée, sans document ni IP ; l'inscription par e-mail, l'assistant hôte, la réservation et l'offre n'écrivent toujours rien (relevé 2026-11-16).* *Tenu le 2026-11-16 : `consent_proofs` (AC1).* |
| À la suppression, « les données d'identification du compte **et des profils** sont effacées ou anonymisées » | `privacy.ts` §6, `terms.ts` §17.1 | `AccountDeletionService` anonymise `users` et les médias du compte, **pas** les profils : RIB, `tax_id`, type et numéro de pièce, revenu, employeur de `OwnerProfile` restent en base. *Au 2026-11-16 : `endProfiles` (TCK-1061) renomme les pièces et soft-delete les profils ; leurs colonnes chiffrées (`rib`, `tax_id`, `id_document_*`, `monthly_income`) restent.* *Tenu le 2026-11-16 (AC2).* |
| Journal d'activité : **12 mois** ; journaux de sécurité et de preuve : **5 ans** ; journaux des pièces comptables : **10 ans** (durées par famille, décision du porteur du 2026-10-25 sur P19.04) | `privacy.ts` §6 | **tenu** par TCK-2342 : `audit:prune-activity-log`, par famille de `log_name`, planifiée chaque jour. Relevé du 2026-09-17 : `activitylog:clean` n'était pas planifiée, rien n'était jamais purgé |
| Pièces KYC : la relation **+ 5 ans** ; demandes de contact anonymes : **3 ans** | `privacy.ts` §6 | aucune purge (point de départ déjà décidé par TCK-1061 : le `deleted_at` du profil). *Tenu le 2026-11-16 : `kyc:prune-ended-pieces`, `crm:prune-contact-leads` (AC3).* |
| Notifications in-app lues : **6 mois** après leur lecture (ajout du 2026-10-18, décision du porteur sur P19.06) | `privacy.ts` §6 | **tenu** par TCK-918 : `notifications:prune-read`, planifiée chaque jour |
| Avis publics : le texte dit (vrai) « prénom, nom et photo » | `privacy.ts` §4.1 | `ReviewResource` expose le nom complet et l'avatar. **Recommandation** : prénom + initiale, par minimisation (loi 2008-12, principe de proportionnalité) — puis corriger le texte. *Tenu le 2026-11-16 (décision 1) : « Prénom N. » sur les routes `public.*`, photo gardée, § 4.1 aligné.* |
| *(ajouté le 2026-11-16, renvoyé par TCK-803)* La conservation des **jobs échoués** | `privacy.ts` | absente du texte |
| *(ajouté le 2026-11-16, renvoyé par TCK-956)* Les notes et critères de la **fiche client** dans l'export | `privacy.ts` | absente du texte (conseil juridique demandé) |
| *(ajouté le 2026-11-16, renvoyé par TCK-2903)* La **dictée vocale** du navigateur | `privacy.ts` | absente du texte |

Écarts **hors** politique, relevés au passage, à trancher :

- ~~Les métadonnées EXIF~~ — fermé par TCK-2355 (`Dockerfile:55-60`, `jpegoptim`). Constat d'origine : les métadonnées EXIF (dont la position GPS des photos) : `config/media-library.php` prévoit
  `jpegoptim --strip-all`, mais le `Dockerfile` n'installe pas `jpegoptim`. Une photo de bien
  prise au téléphone peut publier la position du domicile de l'hôte.
- ~~Jetons Sanctum sans expiration~~ — fermé par TCK-589 : 30 jours (`config/sanctum.php:53-56`). Constat d'origine : jetons Sanctum **sans expiration** (`config/sanctum.php`), alors que le cookie qui les porte vit
  7 jours : un jeton fuité reste valide indéfiniment.
- `ipapi.co` reçoit l'IP de tout visiteur au premier affichage, **avant** tout geste de sa part
  (`UserLocationProvider.tsx`). Déclaré dans la politique ; à confirmer comme choix produit.
  *Au 2026-11-16 : TCK-1225 — au premier lecteur seulement ; l'accueil (`HomepageDiscovery.tsx`)
  le lit encore sans geste — décision produit.* *Tenu le 2026-11-16 (décision 2) : au premier geste
  seulement, § 2.2 et § 4.3 le disent.*
- ~~Adresses divergentes~~ — fermé : TCK-590, `support@takussan.app` disparu de `web/src`. Constat d'origine : adresses divergentes : `support@takussan.app` dans `HostIndividualWizard.tsx`, « Takussan.sn »
  dans le message pré-rempli de `PublicPropertyController::contact` ; les textes citent
  `contact@`, `privacy@`, `legal@takussan.com`.
- ~~Le code de vérification du téléphone~~ — fermé par TCK-589 (envoi SMS) ; TCK-2940 (voix). Constat d'origine : le code de vérification du téléphone n'est **envoyé par aucun canal** (pilote `log-stub`,
  `PhoneVerificationService`).

## Contraintes strictes (métier)

1. Un paiement, une facture, un reversement ou une pièce comptable se conserve **10 ans** (Acte
   uniforme OHADA relatif au droit comptable) : l'effacement des profils ne touche pas ces lignes,
   il les détache de l'identité.
2. La suppression reste bloquée tant qu'un bail est actif (comportement actuel, stipulé à
   l'article 17.1 des CGU).
3. La preuve du consentement porte **la version du texte acceptée** (`VERSION_DOCUMENTS` de
   `editeur.ts`, ou un identifiant qui en dérive), l'horodatage, et le document concerné.
   *Relevé 2026-11-16 : coexiste désormais avec `PublishReadiness::TERMS_VERSION = '2026-11-13'`
   (même date que `VERSION_DOCUMENTS.date`) — dire laquelle fait foi.*
4. Corriger le code, pas le texte — sauf décision écrite du porteur qui en change l'engagement.
5. **La purge du journal d'activité garde chaque famille de journaux sa durée** (décision du
   porteur du 2026-10-25, P19.04, qui remplace l'exemption de `PersonalDataAccess` et `Privacy`
   seuls posée le 2026-10-06 par TCK-601) :
   - **12 mois** par défaut, et pour tout journal qu'aucune liste ne nomme ;
   - **5 ans** pour `PersonalDataAccess`, `Privacy`, `Security`, `UserSupport`, `KYC`,
     `KycDossier`, `Account`, `Membership`, `AgencyRole`, `Integration` et `export` : ils prouvent
     qui a consulté une donnée personnelle, comment une demande de droits a été traitée, et les
     gestes de sécurité, de support, d'identité, de compte et de rôle ;
   - **10 ans** pour les pièces comptables (`LeasePayment`, `BookingPayment`, `Invoice`, `Payout`,
     `PlatformPayout`, `CommissionEntry`, `Billing`), la durée de la contrainte 1.

   Une purge à 365 jours qui les effacerait détruirait la preuve que TCK-601 crée.

## Delta à produire

- [x] Modèle et migration de preuve de consentement (utilisateur ou contact anonyme, document,
      version, horodatage, IP) ; écriture à l'inscription, à l'assistant hôte, à la demande de
      réservation et à l'offre. `RegisterRequest` exige la case.
- [x] `AccountDeletionService` : anonymiser les champs identifiants de chaque profil du compte.
- [x] Purge du journal d'activité par famille (contrainte 5) : `audit:prune-activity-log`,
      planifiée chaque jour, `docs/models-spec.md` § 13 mis à jour — fait par TCK-2342 (2026-10-25).
- [x] Purges KYC (+5 ans après la fin de la relation) et demandes de contact anonymes (3 ans) ;
      `docs/models-spec.md` mis à jour.
- [x] Décision produit sur l'auteur d'un avis public ; texte aligné.
- [x] Ticket à part, ou décision écrite de ne pas le traiter, pour ~~chacun des cinq écarts hors
      politique~~ `ipapi.co` seul — les quatre autres sont fermés (TCK-2355, TCK-589, TCK-590).
      Décision 2 du 2026-11-16, tenue dans ce ticket.
- [x] Les trois mentions renvoyées à ce ticket (jobs échoués, export de la fiche client, dictée
      vocale) écrites dans `privacy.ts`, `VERSION_DOCUMENTS` avancée.

## Critères d'acceptation

- [x] AC1 — Une inscription sans la case CGU est refusée (422) ; une inscription acceptée crée une
      preuve portant la version en vigueur. Ablation : retirer l'écriture → rouge.
- [x] AC2 — Après suppression effective d'un compte propriétaire, aucune colonne identifiante de
      son `OwnerProfile` ne porte sa valeur d'origine ; ses paiements existent toujours.
- [x] AC3 — `php artisan schedule:list` montre la purge du journal d'activité et les deux purges
      ajoutées ; un test prouve chacune par ablation.
- [x] AC3b — Une ligne de chacun des onze journaux de preuve datée de 400 jours survit à la purge
      planifiée, quand une ligne `default` de 12 mois et un jour disparaît ; à 5 ans et un jour, elle
      disparaît. Une ligne de chacun des sept journaux de pièces comptables survit à 5 ans et un jour,
      et disparaît à 10 ans et un jour. Ablation : retirer un nom d'une liste → son cas rougit. Tenu
      par `tests/Feature/Console/PruneActivityLogCommandTest.php` (TCK-2342).
- [x] AC4 — Chaque ligne du tableau « Contrat de données » est vraie, ou le texte juridique a été
      changé sur décision écrite du porteur, avec `VERSION_DOCUMENTS` avancée.

## Hors périmètre

- La déclaration à la CDP et la relecture par un avocat : gestes du porteur (README de
  `takussan-web/src/content/legal/`).

## Notes d'implémentation

- **2026-10-25 — la purge du journal d'activité est faite** (TCK-2342, P19.04) :
  `audit:prune-activity-log`, par famille de `log_name` (12 mois, 5 ans, 10 ans, contrainte 5), par
  lots, idempotente, planifiée chaque jour à 04:10 (Dakar) ; `privacy.ts` § 6 donne les trois
  durées. Le ticket reste `todo` pour ses autres parties : preuve du consentement, effacement des
  profils, purges KYC et demandes de contact anonymes, auteur des avis, écarts hors politique.
  `activitylog:clean` du paquet reste enregistré, non planifié ; lancé à la main sans `--days`, il
  purge à 3653 jours (`config/activitylog.php`), la plus longue des trois durées.

## Livré (2026-11-16)

Première partie (bb998f64a) : texte, noms, ipapi, version. Seconde partie : AC1 à AC4, ci-dessous.

- **Auteur d'un avis** : `App\Support\NomPublic::abrege()` (prénom + initiale ; sans prénom,
  l'initiale ; sans nom, le `username` réduit de même, partie avant `@` comprise). `ReviewResource`
  l'emploie sur toute route `public.*` quel que soit le lecteur ; ailleurs, le nom entier reste à
  l'auteur et à qui répond ou modère. La photo reste (la décision ne la vise pas), et le § 4.1 le dit.
  Preuve : `tests/Feature/Public/NomDeLAuteurDAvisTest.php` (corps entier des trois réponses publiques
  sans « Ndiouckmbaye »), `tests/Unit/Support/NomPublicTest.php`. Ablations : nom entier rétabli → 4
  rouges ; clause `public.*` retirée → 1 rouge.
- **ipapi.co** : `UserLocationProvider` écoute `GESTES` (`pointerdown`, `touchstart`, `keydown`) dès
  son montage ; un lecteur ne lit que le cache de 24 h, le réseau attend le geste. Sans cache ni geste,
  `loading` retombe sans ville et ne remonte jamais (l'assistant hôte ne repasse pas en squelette) ;
  geste déjà fait (clic qui mène à l'écran), `loading` attend la réponse. Coût accepté : arrivé par un
  chargement direct sans cache ni geste, l'assistant hôte ne préremplit plus ville ni devise. Preuve :
  `UserLocationProvider.test.tsx` ; ablations (geste réputé fait → 5 rouges ; `loading` inconditionnel
  → 1 rouge).
- **Version** : `VERSION_DOCUMENTS` et `TERMS_VERSION` avancés au 16 novembre 2026. Une acceptation
  déjà datée ne se redemande pas (`PhoneLoginService::termsRequired`, « quelle que soit sa version ») ;
  seule une page de réclamation radar ouverte avant l'avance renvoie l'ancienne version et reçoit
  `radar.claim.terms_outdated`.
- **Textes** (`privacy.ts`, fr et en) : § 2.2 localisation au premier geste et dictée vocale (son
  envoyé par le navigateur à son éditeur, jamais à nous) ; § 4.1 prénom et initiale ; § 4.3 ipapi ;
  § 6 tâches en échec 30 jours (`queue:prune-failed --hours=720`) ; § 9 l'archive ne contient pas les
  notes ni les critères de la fiche client, communiqués sur demande (droit d'accès de la loi 2008-12).
  Preuve : `textes.test.ts`, bloc TCK-537.
- **AC1 — preuve du consentement** : table `consent_proofs` (migration `2026_11_16_100100`, ajout seul :
  document, version, contexte, IP, `accepted_at`), écrite par `App\Services\Privacy\ConsentLedger` à
  l'inscription (conditions + politique, dans la transaction du compte), à l'assistant hôte, à l'offre
  d'achat, et à la première acceptation datée par `PublishReadiness::recordTerms` (publication,
  connexion par téléphone, réclamation radar — contexte passé par l'appelant) — conditions seules, ce
  que ces cases disent.
  `RegisterRequest` exige `terms_accepted` ; le front l'envoie (`VoieEmail`). La version écrite est
  `TERMS_VERSION`, reflet gardé de `VERSION_DOCUMENTS`. Le séjour et la candidature n'ont pas de case :
  rien n'est écrit, rien n'est présumé. Aucun des gestes visés ne recueille de case sans compte : pas de
  colonne « contact anonyme ». Preuve : `tests/Feature/Privacy/ConsentProofTest.php`, plus une assertion
  dans `PhoneLoginRadarTermsTest` et `RadarClaimTest` ; ablations
  (écriture retirée → 1 rouge ; règle retirée → 1 rouge).
- **AC2 — effacement des profils** : `AccountDeletionService::IDENTIFYING_PROFILE_COLUMNS` (RIB, NINEA,
  pièce, revenu, employeur, carte pro, police d'assurance, certifications, notes, `metadata`) mis à nul
  dans `endProfiles`, profils déjà terminés compris, par requête de masse (aucun événement, rien de
  recopié au journal). Les moyens de versement du compte perdent aussi IBAN, titulaire et relevé
  (`erasePayoutMethods`), forme masquée gardée. Preuve : `tests/Feature/Privacy/ProfileErasureOnDeletionTest.php`
  (lecture brute, journal sans trace, reversement intact) ; ablations (profils → rouge ; moyens → rouge).
- **AC3 — purges** : `kyc:prune-ended-pieces` (pièces de VÉRIFICATION des profils terminés depuis 5 ans
  — CNI, passeport, RIB, NINEA, photo, assurance —, `forceDelete` avec fichiers ; le mandat de gestion et
  les documents `other`, dont la carte pro d'agent, restent ; dossier KYC d'une agence supprimée depuis
  5 ans, sans copie au journal), `crm:prune-contact-leads` (dernier
  échange = la plus récente de `created_at`, `updated_at`, `handled_at`, `first_responded_at`, plus de
  3 ans), et `account:prune-consent-proofs` (5 ans après l'effacement du compte). `schedule:list` :
  `10 4 * * * audit:prune-activity-log` · `15 4 * * * kyc:prune-ended-pieces` ·
  `20 4 * * * crm:prune-contact-leads` · `25 4 * * * account:prune-consent-proofs`. Preuve :
  `tests/Feature/Console/PrivacyRetentionPurgesTest.php` (bornes à un jour près) ; ablations (borne KYC
  retirée → rouge ; dernier échange réduit au dépôt → rouge).
- **AC4** : § 6 de la politique précise la fin de la relation KYC, le dernier échange d'une demande et le
  contenu de la preuve du consentement ; le ⚠ du docblock de `privacy.ts` et la ligne 5 du README sont
  levés. Toutes les lignes du tableau « Contrat de données » sont vraies.

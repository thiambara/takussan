---
id: TCK-2394
title: "Radar lot 4 : relance d'activation des comptes créés pour un annonceur, et publication sous mandat Takussan"
status: done
phase: P2
family: full
estimate: M
wave: 80
created: 2026-10-26
updated: 2026-10-30
depends_on: [TCK-2389, TCK-2390]
blocks: [TCK-2421, TCK-2422]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, activation, mandat, adr-0077, adr-0079]
---

## Objectif utilisateur

Un annonceur publié pour lui est incité à activer son compte par ce que son annonce lui rapporte
déjà ; et l'annonceur d'accord mais sans envie de compte peut confier la diffusion à Takussan.

## Contexte

Lot 4 du [plan](../../plans/2026-10-26-radar-et-socle-ia.md#les-lots) ; le mandat est le repli de
l'option c arbitrée le 2026-10-26. **Le mandat demande son propre ADR** : Takussan y devient
diffuseur pour le compte d'un tiers, ce qui touche les conditions d'utilisation (article 1,
« intermédiaire technique ») et la présentation publique.

### Re-mesuré sur le terrain (2026-10-30, `feat/radar-revocation-purge` = `dev` + TCK-2391)

- **Une vue de bien n'a pas de série datée.** `properties.views_count` est un compteur cumulé,
  incrémenté par le seul `PropertyViewCounter` (TCK-598) ; aucune table ne date une vue. Les
  demandes, elles, sont datées : `property_contact_leads` (canaux `form`, `whatsapp`, `call`,
  `created_at`) et `property_visits` (`created_at`).
- **Le compte à activer se lit déjà** : `RadarClaims::state()` rend `activation` pour le compte que
  le Radar a créé et que personne n'a encore vérifié (ni supprimé, ni bloqué, ni doublé par un
  compte vérifié) ; le lien d'activation est le lien de réclamation (`ClaimLinks`, `publie.v2`).
- **Les crédits offerts à l'activation** sont `credits.welcome_amount` (`BoostSettings`), accordés
  à la vérification du numéro par `WelcomeCreditService::onPhoneVerified()`, une fois par numéro
  et par espace (`credit_welcome_grants`).
- **Le « mandat » n'est défini nulle part** : ni ADR-0077 ni les CGU. L'article 1 des CGU dit
  « *sauf mention expresse contraire*, nous ne sommes ni […] mandataire immobilier des biens
  présentés ». Le message d'accord `accord.v2` autorise déjà la publication sur takussan.com
  (clause 1), atteste le droit de diffuser (clause 2) et le contact direct (clause 4) ; seule la
  clause 3 (le compte) manque à qui refuse un compte.
- **La révocation et la purge suivent `radar_listings.property_id`** (`AdvertiserRevocation`,
  `RadarPurger`) : elles couvrent un bien publié sous mandat sans changement.

## Contrat de données

- `GET /api/admin/radar/advertisers/{advertiser}/activation-reminder?locale=fr|en` —
  `platform.radar.operate`. Rend l'état (`none` : rien à relancer ; `activation`), les chiffres de
  la période, ce qui bloque, et — sans blocage — le texte fixe `activation.v1` et son lien `wa.me`.
- `POST /api/admin/radar/advertisers/{advertiser}/activation-reminder/sent` — même capacité,
  prise en charge exigée ; rejuge tout sous verrou, pose la ligne de base et journalise.
- `POST /api/admin/radar/advertisers/{advertiser}/publish-mandate` — `platform.radar.publish`,
  prise en charge exigée, `idempotent`. L'aperçu de publication porte un bloc `mandate`.
- `radar_advertisers` reçoit `activation_reminded_at`, `activation_reminder_count`,
  `activation_baseline` (jsonb, vues par bien au dernier envoi), `mandate_at`, `mandate_by_id`.
- Drapeau `radar_mandate` (catalogue `Flag`, serveur seul, éteint tant qu'aucune ligne ne
  l'allume) et réglage plateforme `radar.mandate_agency_id` (0 : aucun espace).

## Delta à produire

- [x] **Relance d'activation** (message `wa.me` préparé ; l'envoi automatique est TCK-2395) :
      vues, demandes de contact, demandes de visite, crédits offerts à l'activation.
  - [x] chiffres d'une **période** : depuis la dernière relance envoyée, sinon depuis la mise en
        ligne ; vues = `views_count` moins la ligne de base posée au dernier envoi (un bien du
        Radar naît à 0) ; demandes = lignes datées de la période ; crédits = montant de bienvenue
        s'il n'a encore été accordé ni à ce numéro ni à cet espace ;
  - [x] une relance ne part qu'une fois la période longue de `radar.activation.min_interval_days`
        (7) jours : chaque relance couvre au moins une semaine ;
  - [x] gardes : STOP / `do_not_contact`, accord révoqué ou numéro purgé (`ClaimLinks::revoked`),
        compte activé ou indisponible (`RadarClaims::state()`), connexion par téléphone éteinte,
        aperçu des codes actif, aucun bien en ligne ; l'envoi passe au journal ;
  - [x] texte fixe versionné `resources/radar/messages/activation.v1.{fr,en}.md`, jamais généré ;
  - [x] panneau « Relance d'activation » sur la fiche annonceur.
- [x] **ADR-0079 du mandat** (Proposé), puis sa mise en œuvre derrière le drapeau :
  - [x] publication sous mandat dans l'espace désigné, sans compte créé, numéro de l'annonceur en
        contact, mêmes gardes que « publier pour lui » (accord relu sous verrou, étape, photos,
        champs, plafond, quota de l'espace, STOP, prise en charge) ;
  - [x] refusée pour un annonceur déjà rattaché à un compte ; « publier pour lui » refusé pour un
        annonceur sous mandat ;
  - [x] second message `mandat.v1` (en ligne, STOP), sans lien d'activation ;
  - [x] bouton « Publier sous mandat » sur l'écran de publication, seulement drapeau allumé ;
  - [x] réglage `radar.mandate_agency_id` dans la console des paramètres.

## Critères d'acceptation

- [x] AC1 — La relance d'un annonceur cite ses chiffres réels de la période (au moins une semaine) :
      vues depuis la ligne de base, demandes de contact et de visite datées de la période, crédits
      de bienvenue encore à accorder — et rien d'autre que ces chiffres.
- [x] AC1b — Aucune relance (ni texte, ni lien `wa.me`, ni envoi enregistré) pour un annonceur
      STOP, révoqué, purgé, déjà activé, dont le compte est indisponible, sans bien en ligne, ou
      dont la période n'a pas encore une semaine ; l'envoi rejuge ces gardes sous verrou et
      journalise les chiffres cités.
- [x] AC2 — Aucune publication sous mandat avant l'acceptation de son ADR : drapeau
      `radar_mandate` éteint par défaut, et tant qu'il l'est, `publish-mandate` refuse sans rien
      écrire et l'aperçu ne propose rien.
- [x] AC2b — Drapeau allumé, la publication sous mandat ne crée aucun compte, publie dans
      l'espace désigné avec le numéro de l'annonceur en contact, et garde toutes les gardes de
      « publier pour lui » ; la révocation retire ces biens du public.

## Hors périmètre

- L'envoi automatique (TCK-2395).
- La reprise des biens sous mandat par l'annonceur qui ouvre ensuite un compte (TCK-2421).
- L'article des CGU et la mention publique du mandat, à poser avec l'acceptation d'ADR-0079
  (TCK-2422).

## Notes d'implémentation

- **Aucun modèle neuf** : l'état de la relance (`activation_*`) et du mandat (`mandate_*`) vit sur
  `radar_advertisers`. Une table de relances aurait exigé une entrée de `docs/models-spec.md`, que ce
  lot ne touche pas (texte proposé au porteur dans le rapport de nuit).
- **La ligne de base des vues est posée À L'ENVOI**, jamais à la lecture : un aperçu relu ne
  déplace pas la période. Un compteur repassé sous sa ligne de base rend 0, jamais un négatif.
- **Le journal garde les chiffres cités, pas le texte** : le texte porte le lien d'activation, dont
  la signature dépend de l'instant ; les chiffres, la langue, la version et le rang suffisent à le
  recomposer.
- **`relance` sous mandat** : `radar.activation.under_mandate` ne joue que pour un annonceur sous
  mandat ET rattaché depuis à un compte (la reprise, TCK-2421) ; sans compte, l'état est `none`.
- **Front** : le panneau de relance lit l'aperçu à chaque ouverture de la fiche et ne rend rien
  pour `none` ; sur « Publier pour lui », un blocage du compte laisse cocher si le mandat est
  ouvert (c'est le cas où il sert), et le mandat a sa propre clé d'idempotence.
- **Le quota de l'espace des mandats** s'applique comme à tout espace : il porte tous les biens
  sous mandat, son plan doit le permettre (prérequis du porteur).
- **Pas de contrôle au navigateur** cette nuit (machine à `load average` 45-106) : les écrans sont
  éprouvés par Vitest seulement.

### Décisions prises en autonomie, à revoir

| Décision | Retenu | Écarté | Pourquoi |
|---|---|---|---|
| Vues de la période | ligne de base `activation_baseline` posée à chaque envoi | table de vues datées | changer le chemin chaud de `PropertyViewCounter` pour un panneau de console |
| Période minimale | `radar.activation.min_interval_days` = 7, 0 permis | intervalle en dur | la semaine du plan, réglable sans code |
| Où vit l'état | colonnes sur `radar_advertisers` | modèle `RadarActivationReminder` | un modèle neuf casse `check-models-spec` sans toucher `models-spec.md` |
| Capacité de la relance | `platform.radar.operate` (support compris), prise exigée à l'envoi | `platform.radar.publish` | relancer est du démarchage (ADR-0077 §11) |
| Ce que le mandat est | l'accord `accord.v2` (clauses 1, 2, 4) exercé dans un espace Takussan | un accord neuf `accord.v3` | le moins restrictif ; ADR-0079 le pose, l'avocat le relit |
| Interrupteurs du mandat | drapeau `radar_mandate` (console) + réglage `radar.mandate_agency_id` | variables d'environnement | réversible sans déploiement ni parité `.env` |
| Garde du compte sous mandat | ni numéro inscrit ni connexion par téléphone exigés | les exiger comme « pour lui » | aucun compte n'est créé ni promis |
| Compte rattaché | `account_exists` refuse le mandat ; `under_mandate` refuse « pour lui » | mêler les deux états | ADR-0079 § 4 ; la reprise est TCK-2421 |
| Mention publique et CGU | reportées à TCK-2422 | les poser ici | règle du README juridique : un texte public attend l'acceptation de l'ADR |

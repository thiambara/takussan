---
id: TCK-611
title: "Une annonce réécrite, ou rendue publique après un passage en privé, repasse par la file de modération de son agence (suite de TCK-597, verif-597 passes 2 et 3 — décision du porteur)"
status: done
phase: P2
family: back
estimate: S
wave: 76
created: 2026-10-08
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#3-property
tags: [back, moderation, annonce, adr-0043, decision-porteur]
---

# TCK-611 — Une annonce réécrite repasse par la file

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai, bloqué sur la décision du porteur.** Le code n'a pas bougé sur ce point
(`git log --grep=TCK-611` : rien ; aucun `PropertyRewriteModerationTest`) et ADR-0043 §5 n'est pas
amendé (les amendements du 2026-10-23 et du 2026-11-15 portent sur les avis).

- Chemin 1 : `archived` n'efface pas l'approbation (`PropertyObserver.php:37-41`) ; `carriesStandingApproval` (`:228-238`) ne lit que `approved_at` / `rejected_at`.
- Chemin 2 : le `PATCH` ne détourne que le passage **à** `public` (`PropertyController.php:315-319`) ; `wasAlreadyOnline` (`:221-225`) ignore toujours `visibility`.
- Fermé entre-temps, en appui : la notification des admins actifs au passage en `pending_review` existe (TCK-782, `af8c9cbdf`).

Reste à faire : la décision ; ADR-0043 §5 amendé (si a/b) ; `PropertyObserver` (prédicat de réécriture,
`wasAlreadyOnline` avec `visibility`) ; `PropertyRewriteModerationTest` (AC1-AC5) et ablations.

**Décision attendue du porteur** : (1) qu'est-ce qu'une réécriture qui annule l'approbation — (a) tout
champ affiché, (b) seule une réécriture hors ligne, (c) rien ? (2) « déjà en ligne » exige-t-il
`visibility = public` — oui / non ?

## Objectif utilisateur

Une agence qui a choisi de valider les annonces de son équipe (`moderation_required`) ne voit jamais
en ligne un texte, un prix ou des photos qu'elle n'a pas validés.

## Contexte

[ADR-0043 §5](../../../adr/0043-avis-cible-eligibilite-moderation-et-verrou-plateforme.md) ne modère que
l'**activation** : un bien qui porte une approbation debout, ou qui était **déjà en ligne**, change
librement de contenu. verif-597 a mesuré deux conséquences, conformes à l'ADR et renvoyées à une
décision humaine (`FILE-D-ATTENTE.md`, points hors périmètre ; TCK-597, « Hors périmètre ») :

**Re-mesure sur `839be671` (2026-10-08)** — `PropertyObserver` (`app/Observers/PropertyObserver.php`) :

1. **Une approbation survit à une réécriture** (verif-597 passe 2). Bien approuvé, archivé,
   entièrement réécrit (`title`, `description`, `price`), republié : `status=available`,
   `approved_at` posé, en ligne **sans** file. `carriesStandingApproval` (`:228-238`) ne regarde que
   `approved_at` / `rejected_at`, jamais ce qui a changé depuis.
2. **Un bien en ligne avant la modération, passé en privé, réécrit, repassé public** (verif-597
   passe 3). `wasAlreadyOnline` (`:221-225`) = statut affichable **et** `published_at` : un
   `PUT /properties/{id}` qui rend le bien privé garde `published_at`, donc le retour en public n'est
   pas une activation (`status=available approved_at=null liste=OUI`). Passé par `archived`, le même
   bien irait en file : les deux chemins se contredisent. (Depuis TCK-1431, P147.02, archiver écrit
   `published_at = null` — `app/Services/Property/PropertyPublication.php:38-46` — d'où la file
   au retour d'`archived` et pas au retour de `private`.)

**Re-mesuré le 2026-11-16 sur `9112194ec` : inchangé.**

## Décision du porteur

**Tranchée le 2026-11-16** — écrite dans [ADR-0043, amendement du 2026-11-16](../../../adr/0043-avis-cible-eligibilite-moderation-et-verrou-plateforme.md) :

1. **(a)** : toute réécriture d'un **champ affiché** publiquement annule l'approbation, et renvoie
   le bien en file s'il est en ligne. Liste des champs (ce que `PropertyResource` sert sur la fiche) :
   `title`, `description`, `price`, `currency`, `type`, `contract_type`, `rent_period`, `title_type`,
   `condition`, `area`, `bedrooms`, `bathrooms`, `furnished`, `floor_number`, `total_floors`,
   `year_built`, `parking_spaces`, `available_from`, `check_in_from`, `check_out_before`,
   `virtual_tour_url`, `deposit_months`, `advance_months`, `agency_fee_months`, `monthly_charges` ;
   l'adresse ; les photos (ajout, suppression) ; les équipements. Le modérateur de l'agence et le
   super-admin n'y sont pas soumis.
2. **Oui** : « déjà en ligne » exige `visibility = public` ; un bien privé qui redevient public
   repasse par la file.

La notification des admins au passage en `pending_review` existe déjà (TCK-782).

### Options soumises

1. **Qu'est-ce qu'une réécriture qui annule l'approbation ?** Options :
   - **(a)** toute modification d'un champ **affiché au public** (titre, description, prix, photos,
     adresse affichée) d'un bien d'une agence `moderation_required`, faite par qui n'a pas le droit
     de modérer, efface l'approbation et renvoie le bien en file s'il est en ligne ;
   - **(b)** seule une réécriture faite **hors ligne** (archivé, privé, brouillon) l'efface — le bien
     en ligne garde sa liberté, la remise en ligne repasse par la file ;
   - **(c)** rien ne change (ADR-0043 tel quel), et ce ticket se ferme sans code.

   *Recommandation de la session : (a)*, avec la liste des champs écrite dans l'ADR : c'est ce
   qu'une agence `moderation_required` croit avoir acheté. Un admin d'agence (qui modère) n'est pas
   renvoyé en file par sa propre réécriture.
2. **« Déjà en ligne » exige-t-il d'être public ?** Recommandation : oui — statut affichable, ET
   `visibility = public`, ET `published_at`. Le chemin « privé puis public » devient une activation,
   comme le chemin « archivé puis disponible ».

## Contraintes strictes (métier)

1. ADR-0043 §5 est amendé avant le code, avec la liste des champs (si (a) ou (b)).
2. Le verrou plateforme (ADR-0043) n'est pas touché ; l'approbation d'agence seule change.
3. Un bien renvoyé en file sort du catalogue public et de l'index dans la même sauvegarde
   (`pending_review` non indexé), et la page publique en cache est invalidée
   (`RevalidatePublicPropertyPage`, ADR-0052).
4. Un bien d'une agence sans modération n'est jamais concerné.

## Delta à produire

- [x] ADR-0043 §5 amendé.
- [x] `PropertyObserver` : `wasAlreadyOnline` (décision 2) ; détection de la réécriture et effacement
      de l'approbation (décision 1).
- [x] Notification au modérateur de l'agence : réutiliser le code de mise en file existant — la
      notification des admins actifs au passage en `pending_review` existe (TCK-782, `af8c9cbdf`) et
      part d'elle-même si le bien entre en `pending_review`.
- [x] Tests : `PropertyRewriteModerationTest`.

## Critères d'acceptation

- [x] **AC1 (rouge sur `839be671` si (a) ou (b)).** Rejeu de verif-597 passe 2 : bien approuvé,
      archivé, réécrit, republié → `pending_review`, absent de `/api/public/properties`.
- [x] **AC2 (rouge sur `839be671`).** Rejeu de verif-597 passe 3 : bien publié avant l'activation de
      la modération, passé en privé, réécrit, repassé public → `pending_review`.
- [x] **AC3.** Le même parcours dans une agence sans modération : en ligne, aucune file.
- [x] **AC4.** La réécriture d'un admin d'agence de son propre bien (décision 1) : approbation gardée.
- [x] **AC5.** Un changement d'un champ non affiché (notes internes, collaborateurs) ne renvoie pas
      en file.
- [x] Ablations consignées : prédicat de réécriture retiré → AC1 rouge ; `visibility` retirée de
      `wasAlreadyOnline` → AC2 rouge.

## Hors périmètre

- La modération par la plateforme et son verrou (TCK-597).
- La 2FA des modérateurs (TCK-609).
- La détection de doublons (ADR-0054).

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- Un seul point de règle, `App\Services\Property\PropertyRewriteModeration` (liste
  `DISPLAYED_COLUMNS`, prédicat, effet) : appelé par `PropertyObserver::updating` pour les colonnes,
  et après coup par `PropertyController::update` (adresse réellement changée),
  `PropertyMediaController::store`/`destroy` (photos) et `PropertyTagController::sync`/`destroy`
  (équipements). Les chemins hors colonnes passent par `$property->update()` : notification
  TCK-782, boosts, cache de fiche et index suivent seuls.
- Prédicat : agence `moderation_required`, utilisateur authentifié, ni super-admin ni
  `PropertyModerationPolicy::moderatesAt` ; une valeur renvoyée identique n'est pas une réécriture
  (`isDirty`). Sans utilisateur (job, console), rien. L'exemption du modérateur ne vaut que pour la
  réécriture : l'activation reste sans exemption par rôle.
- Dans une même sauvegarde, l'approbation effacée par la réécriture ne compte plus comme
  approbation debout (`PUT {title, status: available}` sur un bien approuvé archivé → file).
- `wasAlreadyOnline` exige `visibility = public` à l'origine (décision 2).
- Non couverts, écrits dans l'ADR : documents publics, médias `videos`/`plans` ; le
  réordonnancement des photos n'est pas une réécriture.
- Preuves (`tests/Feature/Api/PropertyRewriteModerationTest.php`, 15 tests) : AC1
  `test_ac1_*` (×2) — ablation du prédicat → 4 rouges ; AC2 `test_ac2_*` +
  `test_private_then_public_*` — ablation de `visibility` → 2 rouges ; AC3 — ablation du test
  `moderation_required` → rouge ; AC4 — ablation de l'exemption du modérateur → rouge ; AC5
  `test_ac5_*` (métadonnées, collaborateur) ; ablation de `! $rewritten` → rouge du cas « même
  sauvegarde » ; AC5 rougit si `metadata` entre dans la liste (l'acteur est bien vu). Chaque point
  d'appel hors colonnes (adresse, photo ajoutée/supprimée, équipements synchronisés/retirés) a son
  test et son ablation rouge ; un `PATCH` de statut seul n'est pas une réécriture. Restaurations
  par `cp`, md5 vérifié.

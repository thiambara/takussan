---
id: TCK-611
title: "Une annonce réécrite, ou rendue publique après un passage en privé, repasse par la file de modération de son agence (suite de TCK-597, verif-597 passes 2 et 3 — décision du porteur)"
status: todo
phase: P2
family: back
estimate: S
wave: 74
created: 2026-10-08
updated: 2026-10-08
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

## Objectif utilisateur

Une agence qui a choisi de valider les annonces de son équipe (`moderation_required`) ne voit jamais
en ligne un texte, un prix ou des photos qu'elle n'a pas validés.

## Contexte

[ADR-0043 §5](../../adr/0043-avis-cible-eligibilite-moderation-et-verrou-plateforme.md) ne modère que
l'**activation** : un bien qui porte une approbation debout, ou qui était **déjà en ligne**, change
librement de contenu. verif-597 a mesuré deux conséquences, conformes à l'ADR et renvoyées à une
décision humaine (`FILE-D-ATTENTE.md`, points hors périmètre ; TCK-597, « Hors périmètre ») :

**Re-mesure sur `839be671` (2026-10-08)** — `PropertyObserver` (`app/Observers/PropertyObserver.php`) :

1. **Une approbation survit à une réécriture** (verif-597 passe 2). Bien approuvé, archivé,
   entièrement réécrit (`title`, `description`, `price`), republié : `status=available`,
   `approved_at` posé, en ligne **sans** file. `carriesStandingApproval` (`:152-160`) ne regarde que
   `approved_at` / `rejected_at`, jamais ce qui a changé depuis.
2. **Un bien en ligne avant la modération, passé en privé, réécrit, repassé public** (verif-597
   passe 3). `wasAlreadyOnline` (`:146-150`) = statut affichable **et** `published_at` : un
   `PUT /properties/{id}` qui rend le bien privé garde `published_at`, donc le retour en public n'est
   pas une activation (`status=available approved_at=null liste=OUI`). Passé par `archived`, le même
   bien irait en file : les deux chemins se contredisent.

## Décision du porteur

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

- [ ] ADR-0043 §5 amendé.
- [ ] `PropertyObserver` : `wasAlreadyOnline` (décision 2) ; détection de la réécriture et effacement
      de l'approbation (décision 1).
- [ ] Notification au modérateur de l'agence : réutiliser le code de mise en file existant.
- [ ] Tests : `PropertyRewriteModerationTest`.

## Critères d'acceptation

- [ ] **AC1 (rouge sur `839be671` si (a) ou (b)).** Rejeu de verif-597 passe 2 : bien approuvé,
      archivé, réécrit, republié → `pending_review`, absent de `/api/public/properties`.
- [ ] **AC2 (rouge sur `839be671`).** Rejeu de verif-597 passe 3 : bien publié avant l'activation de
      la modération, passé en privé, réécrit, repassé public → `pending_review`.
- [ ] **AC3.** Le même parcours dans une agence sans modération : en ligne, aucune file.
- [ ] **AC4.** La réécriture d'un admin d'agence de son propre bien (décision 1) : approbation gardée.
- [ ] **AC5.** Un changement d'un champ non affiché (notes internes, collaborateurs) ne renvoie pas
      en file.
- [ ] Ablations consignées : prédicat de réécriture retiré → AC1 rouge ; `visibility` retirée de
      `wasAlreadyOnline` → AC2 rouge.

## Hors périmètre

- La modération par la plateforme et son verrou (TCK-597).
- La 2FA des modérateurs (TCK-609).
- La détection de doublons (ADR-0054).

## Notes d'implémentation

_(à remplir par implementing-specs)_

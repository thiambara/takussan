---
id: TCK-2812
title: "« Tout télécharger » du coffre au-delà du seuil synchrone : l'archive se bâtit sur la file media et se remet par un lien signé"
status: todo
phase: P2
family: full
estimate: M
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2770, TCK-2811]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#27-médias--fichiers"
  models:
    - "docs/models-spec.md#22-document-"
tags: [back, front, documents, archive, file-media, suite-de-tck-2770, audit-ux, app]
---

## Objectif utilisateur

Le bailleur dont le dossier « Relevés et attestations » compte plus de quarante documents les récupère quand même
en un seul geste. Il n'a pas à les télécharger un par un.

## Contrat de données

**Origine.** Écart ouvert de TCK-2770 (notes, « ⚠ Écart ouvert : pas de voie asynchrone ») : le porteur ouvre le
ticket de suite.

**Constat, relu dans l'arbre de TCK-2770 le 2026-11-14 (non commité à cette date).**

- L'archive (`ArchiveDuCoffre`) se bâtit pendant la requête, bornée à 40 entrées et 100 Mo de pièces. Au-delà,
  422 `document.archive_too_large`, et le front dit de télécharger les documents un par un.
- Seuil mesuré par TCK-2770 sous `dompdf`, 8 cœurs, contre `max_execution_time = 60` : 40 quittances en 12,8 à
  13,6 s, 39 relevés en 13,0 à 14,4 s (charges 4 à 7). Commande de mesure dans ses notes.
- Sous `cloudflare`, onze rendus d'affilée dépassent la limite de débit du pilote (TCK-2811).
- Modèle existant de la voie asynchrone : `ExportActivityLogJob` (export du journal d'audit, lien signé).

## Direction UX / Artistique

Au-delà du seuil, « Tout télécharger » ne dit plus « trop gros ». Il dit que l'archive se prépare, et la remet quand
elle est prête, sans que la personne ait à rester sur la page. Une archive qui échoue le dit, avec de quoi
recommencer.

## Contraintes strictes (métier)

- **Le travail ne juge rien de neuf** : il prend les entrées du dossier par `DocumentVault::for()` pour l'appelant,
  comme l'archive synchrone. Le jugement se fait au moment de la construction, pas au moment de la demande : une
  entrée devenue illisible entre-temps n'y entre pas.
- **Le lien est signé, à durée courte, et ne s'ouvre qu'à son demandeur** (authentifié, le même compte). Il ne porte
  ni identifiant de document ni chemin. Le fichier vit sur le disque des médias privés (R2 en production,
  ADR-0029), jamais en `getPath()` local, et il est purgé à l'expiration du lien.
- **Sous impersonation, refusé** (403 `impersonation.read_only`), comme l'archive synchrone (ADR-0055 §3).
- **File `media`** (consommée par `worker-media`, `scripts/check-queues.mjs` garde la règle). Une limite de débit du
  pilote PDF (TCK-2811) se traite par un nouvel essai différé dans le travail, pas par un échec de l'archive.
- Une demande identique en cours n'en lance pas une seconde.
- Les mêmes règles d'exclusion que TCK-2770 : interne (TCK-2759), règle d'auteur, profil bloqué en lecture seule.

## Delta à produire

- [ ] ADR (ou amendement de celle de TCK-2770 si elle en a une) : seuil synchrone/asynchrone, durée du lien, purge.
- [ ] Endpoint de demande d'archive asynchrone pour un dossier du coffre ; 202 avec l'état de la préparation.
- [ ] Job `BatirLArchiveDuCoffreJob` sur la file `media`, qui réutilise `ArchiveDuCoffre` pour écrire le `.zip`.
- [ ] Notification à l'appelant quand l'archive est prête, et en cas d'échec. Sa cible ouvre le coffre
  (`/app/documents`) : un genre ajouté à `NotificationTarget::PATHS` et classé dans `AgenceDeLaCible::HORS_AGENCE`
  (`AgenceDeLaCibleTest` l'exige).
- [ ] Route signée de téléchargement, réservée au demandeur ; purge planifiée des archives expirées.
- [ ] Front : « Tout télécharger » au-delà du seuil passe par la préparation, avec son état et son échec.
- [ ] Tests `ArchiveAsynchroneDuCoffreTest` et tests vitest du geste.

## Critères d'acceptation

- [ ] AC1 — Un dossier de 41 quittances : la demande rend 202 (plus 422) ; le travail exécuté, le `.zip` contient
  exactement les 41 entrées que le coffre liste dans ce dossier (noms comparés un à un).
- [ ] AC2 — Le lien ouvert par un autre compte rend 403 ; ouvert après expiration, 403 ou 410 ; aucun des deux ne
  rend d'octet de l'archive.
- [ ] AC3 — Une pièce interne ajoutée au dossier APRÈS la demande et AVANT l'exécution n'est pas dans l'archive ; une
  pièce rendue illisible à l'appelant entre la demande et l'exécution n'y est pas non plus.
- [ ] AC4 — Sous impersonation, la demande rend 403 `impersonation.read_only` et aucun travail n'est mis en file.
- [ ] AC5 — Un double du pilote qui rend la limite de débit au troisième rendu, puis réussit : le travail se
  relance et l'archive finale est complète. Le même double qui échoue toujours : l'archive échoue, l'appelant est
  notifié, aucun fichier partiel ne reste.
- [ ] AC6 — Deux demandes du même dossier par le même compte, la seconde pendant la préparation : un seul travail en
  file.
- [ ] AC7 — Front : au-delà du seuil, le geste annonce la préparation (texte présent vérifié), puis l'archive prête ;
  un échec se dit avec « Réessayer ». En deçà du seuil, le téléchargement direct de TCK-2770 ne change pas.
- [ ] AC8 — Ablation : le jugement fait à la demande au lieu de l'exécution rend AC3 rouge ; la vérification du
  demandeur retirée rend AC2 rouge.

## Hors périmètre

- Changer le seuil synchrone de TCK-2770.
- L'archive de plusieurs dossiers à la fois.

## Notes d'implémentation

_(à remplir par implementing-specs)_

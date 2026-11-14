---
id: TCK-2731
title: "La parité du coffre amorcé et non amorcé se juge sur le coffre entier, et sur les personnes que la contre-vérification a ajoutées"
status: done
phase: P2
family: technique
estimate: S
wave: 88
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2655]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
tags: [technique, documents, coffre, tests, parite, amorce, suivi-lot-1]
---

## Objectif utilisateur

Un changement de l'amorce des capacités (`MembershipCapabilityResolver::primed()`) qui ferait lire à quelqu'un un
document de plus, ou de moins, dans son coffre rougit la suite du dépôt, et pas seulement un test jetable.

## Contexte

Contre-vérification de TCK-2655 (2026-11-11). `tests/Feature/Documents/DocumentVaultPrimedVerdictParityTest.php` compare
des **verdicts** amorcés et non amorcés pour les personnes de son décor. Un test jetable de la contre-vérification (hors
dépôt, non versionné) a comparé **le coffre entier** et **les générés** pour des personnes que le test du dépôt n'a pas,
vert partout (212 assertions, 65 listes de générés non vides), et il **discrimine** : avec
`BailleurDuBien::tientUnProfil` lisant l'amorce `owner` (actifs) au lieu de `owner_any`, il rougit sur « générés du
bailleur bloqué conducteur ». Durée mesurée ≈ 18 s.

Ce ticket verse ces cas au dépôt. Il se suffit à lui-même : le jetable n'existera pas pour qui l'implémente.

## Décision

**Aucune décision du porteur requise** : durcissement d'un test.

## Contrat de données

Aucun changement de code applicatif.

## Contraintes strictes (métier)

- Décor (en plus de celui de `CoffreDeDocuments`, agence A, bailleur, locataire, agent, bien, autre bien, baux) : une
  agence B, et un relevé de bailleur enregistré pour le bailleur du décor (`OwnerStatementSnapshots::record`, un mois).
- Personnes à ajouter, chacune avec ses profils à essayer (`null` = sans profil actif, puis son profil) :
  1. collaborateur `viewer` du bien, agent de A ;
  2. collaborateur `agent` du bien, agent de A ;
  3. collaborateur `agent` du bien, agent de **B** ;
  4. collaborateur `agent` du bien, agent de A **suspendu** (`AgentProfileStatus::Suspended`) ;
  5. collaborateur `manager` du bien **sans profil** ;
  6. compte à profil propriétaire actif dans A et **délégation de rôle expirée** (`ends_at` hier) ;
  7. bailleur **bloqué** de A (`OwnerProfileStatus::Blocked`), **conducteur** d'un état des lieux signé sur le bail du
     décor ;
  8. agent de B, quand un **bail croisé** existe : bien de A (bailleur du décor), bail porté par l'agence B, état des
     lieux signé conduit par le bailleur ;
  9. le locataire du décor, **aussi bailleur dans B** (profil propriétaire dans B, un bien et un bail là-bas) ;
  10. le bailleur, l'agent et l'autre locataire du décor.
- Cibles des générés : les deux biens et les deux baux du décor, le bail croisé, le bien du locataire-bailleur.
- Comparaison, pour chaque couple (personne, profil) :
  - le coffre amorcé (`DocumentVault::for()`) **égal** (`assertSame`) au coffre non amorcé (`build()` appelé
    directement) ;
  - pour chaque cible, les générés amorcés (`generatedFor()`) égaux aux non amorcés (`generatedOf()` sur les baux de la
    cible) ;
  - le coffre construit sous **amorce partielle** (`primed([user], [A])` puis `primed([user], [B])`) égal au non amorcé ;
  - le profil actif est posé dans `request()->attributes['active_profile']` pour chaque appel, et retiré ensuite.
- Le test exige qu'au moins 10 listes de générés soient non vides (un décor qui ne rend rien ne prouve rien).
- Un second test garde l'amorce : remise à `null` après une exception dans le rappel ; un `primed()` imbriqué n'efface pas
  l'amorce externe avant la fin de l'externe ; le coffre appelé sous l'amorce d'autres utilisateurs rend le même coffre.

## Delta à produire

- [x] `DocumentVaultPrimedVerdictParityTest` étendu (ou une classe sœur dans `tests/Feature/Documents/`) avec le décor et
      les deux tests ci-dessus.

## Critères d'acceptation

- [x] AC1 — Le test est vert sur l'arbre courant.
- [x] AC2 — Ablation (une, au premier plan, md5 restauré) : `BailleurDuBien::tientUnProfil` lit l'amorce `owner` au lieu
      de `owner_any` → le test rougit, et le message nomme la personne 7 et sa cible.
- [x] AC3 — Ablation : `primed()` ne remet plus l'amorce à `null` dans son `finally` → le second test rougit.

## Hors périmètre

- La réentrance de `primed()` (un coffre appelé sous une autre amorce rend la main sans amorcer et perd sa constance de
  requêtes, sans changer de verdict) : rien ne l'appelle ainsi aujourd'hui ; les égalités de requêtes de
  `DocumentVaultOwnerTest` / `DocumentVaultTenantTest` le verraient.
- Le coffre du bailleur bloqué (TCK-2729).

## Notes d'implémentation

**Une classe sœur** : `tests/Feature/Documents/DocumentVaultPrimedVaultParityTest.php`, avec le décor de
`CoffreDeDocuments`, plus l'agence B, un relevé de bailleur enregistré (`2025-12`) et les personnes 1 à 10 du ticket,
chacune essayée sans profil actif puis avec son profil. `build()` et `generatedOf()` sont privées et sont appelées par
réflexion. Le compte est relu à chaque appel, et le profil actif est posé dans
`request()->attributes['active_profile']`, puis retiré dans un `finally`.

- Test 1 : coffre amorcé (`for()`) = coffre non amorcé (`build()`) ; coffre sous l'amorce de A seule, puis de B
  seule = coffre non amorcé ; pour les six cibles, `generatedFor()` = `generatedOf()`. Au moins 10 listes de générés
  doivent être non vides.
- Test 2 : le bailleur bloqué conducteur lit bien des générés. Sans ce cas, la parité qui discrimine serait vide.
- Test 3 : amorce remise à `null` après une exception dans le rappel ; un `primed()` imbriqué n'efface pas l'amorce
  externe ; le coffre appelé sous l'amorce d'autres utilisateurs rend le même coffre.

Résultat : 3 tests, 210 assertions, verts en 17,6 s (`load average` 4,5 sur 8 cœurs).

**Ablations du 2026-11-11.** Une à la fois, au premier plan, md5 restauré et vérifié.
- AC2 : `BailleurDuBien::tientUnProfil` lit `owner` au lieu de `owner_any`. Le test 1 rougit avec le message
  « 7. bailleur bloqué conducteur / sans profil actif : générés de « bien » ».
- AC3 : le `finally` de `primed()` ne remet plus l'amorce à `null`. Le test 3 rougit.

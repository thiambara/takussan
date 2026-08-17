---
id: TCK-306
title: "25 contrôleurs redéfinissent l'autorisation que 16 policies portent déjà"
status: review
phase: P2
family: technique
estimate: L
wave: 39
created: 2026-08-16
updated: 2026-08-17
depends_on: [TCK-279, TCK-297]
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#packages-transversaux
tags: [back, securite, autorisation, policy, convention, refactor, dette]
---

## Objectif utilisateur

Qu'une règle d'autorisation existe en un seul exemplaire — pour qu'on puisse la corriger une fois
au lieu de la corriger dans 25 contrôleurs, ou de croire l'avoir corrigée partout.

## Contrat de données

Aucun modèle nouveau. Mesuré le 2026-08-16, dans `takussan-api/app/` :

- **16** policies sous `app/Policies/`.
- **25** contrôleurs définissent leur propre `authorizeAccess()` ou `authorizeManage()`.
- **88** appels à ces helpers, avec une logique copiée-collée entre contrôleurs.

> Chiffres re-mesurés le 2026-08-16. L'ardoise D-32 annonçait **38 contrôleurs et 124 appels** au
> 2026-08-12 — **surestimé d'un tiers**. La dette est réelle, son ampleur ne l'était pas.

`takussan-api/CLAUDE.md` tranche déjà pour le code neuf : la policy fait foi.

## Contraintes strictes (métier)

- **C'est le lot où une erreur ouvre une porte.** Une règle d'autorisation déplacée de travers ne
  produit pas un test rouge mais un accès accordé. Chaque helper migré doit être couvert par un test
  d'autorisation **avant** d'être déplacé — pas après.
- **L'agence est la frontière d'isolation** (principe n°2) : une capacité se juge pour un couple
  *(utilisateur, agence)*, et le profil actif se lit via `request()->activeProfile()`. Un helper de
  contrôleur qui capturait implicitement l'agence courante doit la rendre explicite en migrant.
- **Dépend de TCK-297.** Tant que `BasePolicy` résout des capacités inexistantes, migrer des règles
  vers les policies déplace du code fonctionnel vers une chaîne qui refuse tout le monde sauf le
  super-admin.
- **Dépend de TCK-279.** Les rôles personnalisés par agence redéplacent la résolution des
  capacités ; converger avant réécrirait du code que TCK-279 va bouger.
- La duplication d'autorisation PHP↔TS est déjà gardée (D-23) : vérifier que la garde reste verte,
  et qu'elle ne devient pas verte parce qu'elle ne voit plus rien.

## Delta à produire

- [ ] Inventorier les 25 contrôleurs et les 88 appels, et rattacher chacun à la policy qui devrait
      porter la règle
- [ ] Pour chaque règle, écrire le test d'autorisation qui la couvre **avant** de la déplacer
- [ ] Migrer contrôleur par contrôleur, tests verts à chaque étape
- [ ] Créer les policies manquantes pour les modèles qui n'en ont pas et en ont besoin
- [ ] Garde CI : la définition d'un `authorizeAccess()`/`authorizeManage()` dans un contrôleur fait
      échouer le build
- [ ] Prouver la garde **par mutation**

## Critères d'acceptation

- [ ] AC1 — plus aucun contrôleur ne définit `authorizeAccess()` ni `authorizeManage()`
- [ ] AC2 — chaque règle migrée est couverte par un test qui **échouerait** si la règle disparaissait
      — vérifié par ablation, pas par lecture
- [ ] AC3 — aucun test d'autorisation n'a été assoupli ni supprimé pendant la migration
- [ ] AC4 — la garde de duplication PHP↔TS (D-23) reste verte et couvre toujours le même périmètre
- [ ] AC5 — réintroduire un helper d'autorisation dans un contrôleur fait échouer la CI

## Hors périmètre

- Les capacités inexistantes résolues par `BasePolicy` — TCK-297, dont ce ticket dépend.
- Les rôles personnalisés par agence — TCK-279, dont ce ticket dépend.

## Notes d'implémentation

**Inventaire réel, mesuré le 2026-08-17** : **25 contrôleurs**, **88 appels** — les deux chiffres du
ticket, à l'unité. **17** policies existantes (le ticket en annonçait 16).

Mais le compte de 88 cherchait **deux noms**. En cherchant une **forme**, la garde a trouvé
**19 helpers d'autorisation de plus, sous 19 noms différents**, dans **15 autres contrôleurs** —
`authorizeAdmin`, `authorizeAgency`, `authorizeBookingManage`, `authorizeLeaseAccess`,
`authorizeReceipt`, `authorizeAttach`, `authorizeWrite`… *Un inventaire qui cherche des noms mesure
les noms qu'il connaît.* Ils sont **hors périmètre** (le « Delta à produire » nomme 25 contrôleurs)
et inscrits dans `EXEMPTIONS_JUSTIFIEES` avec leur motif : la garde bloque tout helper **nouveau**,
et la liste dit exactement ce qui reste. **Un ticket de suite est à ouvrir.**

Neuf helpers voisins des 88 ont en revanche été migrés, parce qu'ils étaient appelés par les mêmes
méthodes : `authorizeUpload`, `authorizeView`, `authorizePropertyAccess`, `authorizeAccessProperty`,
`authorizeAgentOrOwner`, `authorizeProvider`, `authorizeManageLease`, `authorizeTaskable`,
`ensureCanActOn` + `checkDocumentableAccess`. **93 appels remplacés, 45 définitions supprimées.**

### Douze policies créées, deux étendues

Nouvelles : `BookingPolicy`, `BookingPaymentPolicy`, `CustomerPolicy`, `DocumentPolicy`,
`GuarantorPolicy`, `InventoryPolicy`, `InvoicePolicy`, `LeasePaymentPolicy`,
`MaintenanceRequestPolicy`, `PayoutPolicy`, `PropertyVisitPolicy`, `TaskPolicy`.
Étendues : `PropertyPolicy` (`view`, `viewMedia`), `LeasePolicy` (`view`, `update`).

`Base\Controller` porte désormais `AuthorizesRequests` — il ne l'avait pas, alors que l'autre classe
de base (`App\Http\Controllers\Controller`, presque inutilisée) l'avait : quatre contrôleurs de
comptabilité pouvaient appeler `$this->authorize()`, les 161 autres non.

### ⚠️ Le piège central : deux `authorizeManage()` du même nom, sur le même modèle, DIFFÉRENTS

`DocumentController::authorizeManage()` autorisait le **seul téléverseur**.
`DocumentVersionController::authorizeManage()` déléguait à `ensureCanActOn()`, c'est-à-dire à la
règle de **lecture** — donc aussi l'agence du modèle porteur. Deux contrôleurs, un modèle, deux
réponses à « qui gère ce document », et rien qui les confrontait.

Les mapper tous deux sur `update` aurait rendu **403 là où l'endpoint répondait 200**. Les quatre
appels de `DocumentVersionController` pointent donc sur `view`, et la raison est écrite dans le
fichier — sinon le prochain « corrigera » l'incohérence apparente.

Ce contrôleur portait d'ailleurs le commentaire « Mirrors `DocumentController::authorizeUpload()`
without the abort_unless » sur sept branches polymorphes recopiées. *Un commentaire qui annonce une
duplication ne la corrige pas : il la documente, et il vieillit avec elle.*

### Deux abilities existantes ÉLARGIES, et il faut le dire

`PropertyPolicy::view()` et `LeasePolicy::view()/update()` n'étaient pas surchargées : elles
retombaient sur le défaut de `BasePolicy` (capacité `null` → **super-admin seul**) pendant que
dix contrôleurs laissaient passer propriétaire, agence et locataire. **Aucune n'avait d'appelant**
(mesuré : 0 `can('view', $property)`), donc ce refus n'a jamais été observé — c'était une porte
murée, pas une porte fermée. Les remplir n'ouvre rien que les contrôleurs n'ouvraient déjà.

Conséquence directe : `BasePolicyCapabilityTest::test_an_ability_without_capability_denies_a_non_super_admin`
prenait `LeasePolicy` pour sujet et **mesurait ce trou** sans le savoir. Il a été reporté sur une
sous-classe anonyme de `BasePolicy` — le générateur plutôt qu'un de ses clients — et complété d'un
test réciproque qui échouerait si `LeasePolicy::view()` redevenait refusante.

### Un test d'ablation ailleurs a fait exactement ce pour quoi il avait été écrit

`MediaAttachSuperAdminBypassTest` exerçait la branche « cible **sans** policy » de
`MediaController::authorizeAttach` en visant `Inventory`. Écrire `InventoryPolicy` a fait passer ce
modèle par la Gate : les deux tests d'ablation seraient restés **verts sans rien prouver**. Sa
troisième méthode — une sonde de pertinence — l'a dit en rouge, en nommant le modèle et la commande
pour lui trouver un remplaçant. Cible déplacée sur `KycDossier`, dérivée comme le test l'indique.
*Une sonde de pertinence est ce qui distingue un test qui garde d'un test qui occupe la case
« couvert ».*

### Ordre des travaux

Les policies et leurs tests unitaires (16 tests, 100 assertions, **6 ablations rouges**) précèdent
le recâblage des 93 appels — l'étape où une clause perdue devient un accès. Une assertion ne peut
pas s'écrire avant son sujet ; ce qu'elle garde, c'est l'étape risquée.

### AC4 — la garde de duplication PHP↔TS (D-23)

`scripts/check-pro-routes.mjs` : **7/7 routes**, même périmètre qu'avant (ce ticket ne touche pas
`takussan-web/src`). Elle imprime son propre inventaire, donc le vert **montre** ce qu'elle a
confronté au lieu de le laisser déduire — et elle écrit elle-même qu'elle ne lit aucun contrôleur
Laravel.

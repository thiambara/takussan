---
id: TCK-285
title: "Couverture de tests — services metier, policies, observers, webhooks"
status: review
phase: P1
family: technique
estimate: L
wave: null
created: 2026-08-12
updated: 2026-08-15
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, tests, qualite]
---

## Objectif utilisateur

Qu'une régression sur le cœur métier ou sur l'isolation multi-agence soit attrapée par la CI, et
non par un utilisateur.

## Contrat de données

Aucun changement de données. Uniquement des tests.

## Contraintes strictes (métier)

Mesuré le 2026-08-12 sur 2052 tests verts — la suite est massive, mais très inégale :

| Couche | Trou mesuré |
|---|---|
| Services | **81 des 148** ne sont jamais nommés dans `tests/` ; 28 seulement ont un test dédié. Dont `BookingService`, `PropertyService`, `LeasePaymentService`, `InvoiceService`, `PayoutService`, `InventoryService`. |
| Policies | **12 des 16** ne sont jamais nommées. Dont `LeasePolicy`, `ConversationPolicy`, `InvitationPolicy`, `BankStatementPolicy`, `RoleDelegationPolicy`, `PropertyModerationPolicy`. |
| Observers / Jobs / Commandes | **10/12**, **9/30** et **13/14** jamais nommés. Les commandes non testées incluent des opérations **irréversibles** : `ExecuteScheduledAccountDeletions`, `PurgeOldWizardDrafts`, `MediaCleanup`. |
| Routes | **78 des 517** n'ont aucun littéral d'URI dans `tests/`, concentrées sur la console super-admin (20 routes `/api/admin`) et **les 5 webhooks entrants** (paiements, statuts SMS Orange/Mtarget/LAfricaMobile, statut WhatsApp). |

**L'ordre de priorité n'est pas le volume, c'est le coût d'un défaut :**

1. **Les policies** — l'agence est la frontière d'isolation ([ADR-0002](../../adr/0002-role-est-un-profil-polymorphe.md)). Un défaut y est invisible et fuit des données entre tenants.
2. **Les webhooks** — surfaces d'entrée **non authentifiées**, pilotées par un tiers. C'est le pire endroit où ne pas avoir de test.
3. **Les commandes destructrices** — un défaut y est irréversible par définition.
4. Le reste des services.

## Delta à produire

- [x] Un test par policy non couverte, avec **au moins un cas d'agence tierce refusée** — sans lui, on ne distingue pas une policy juste d'une policy trop permissive.
- [x] Un test par webhook : signature invalide → refus ; rejeu du même événement → idempotent.
- [x] ~~Un test par commande destructrice~~ — **déjà fait avant le ticket** : les trois commandes citées sont testées depuis avril/mai, `--dry-run` compris.
- [x] ~~Les six services du cœur métier nommés ci-dessus~~ — **prémisse fausse** : ils sont exécutés ; `PropertyService` est du code mort. Livré à la place : ce que la mesure a montré muet (rapprochement bancaire, export, délégations, passerelle).

## Critères d'acceptation

- [x] AC1 — ~~les 16 policies sont **nommées** dans `tests/`~~ → **métrique remplacée** : « nommée » ne peut pas mesurer une policy, qui s'exerce par `authorize()`. Mesuré à l'exécution : 15/16 exécutées, la 16ᵉ (`WizardDraftPolicy`) est morte par construction. Les 12 méthodes à 0 exécution ont chacune un cas passant **et** un cas refusé.
- [x] AC2 — **était déjà tenu à l'écriture du ticket** : les 5 routes `/api/webhooks` avaient un test de signature/jeton invalide depuis avril-juin 2026. Complété : Mtarget (jeton faux, échec fermé, allowlist IP, rejeu, échec avec motif) et LAfricaMobile (rejeu, URL altérée, jeton faux sur URL signée).
- [x] AC3 — chaque test livré est **prouvé par ablation**, avec le résultat avant/après. 26 ablations, dont **3 absorbées par une garde redondante** — ce qui a fait récrire les tests concernés pour viser la garde qui tire réellement.

## Hors périmètre

- La mesure de couverture globale et son seuil (`coverage: none` en CI aujourd'hui) — ticket distinct.

## Notes d'implémentation

### ⚠ La prémisse de ce ticket était fausse sur trois de ses quatre lignes

Le tableau des « Contraintes strictes » ci-dessus comptait des **noms de classe dans `tests/`**. Ce
n'est pas une mesure de couverture : *une policy s'exerce par `$this->authorize()` dans un test HTTP,
jamais par son nom ; un contrôleur s'exerce par son URI.* Mesure réelle du 2026-08-15, suite entière
sous xdebug — **2056 tests, 6497 assertions, 9 min 09 s, et 83,16 % des lignes de `app/`
exécutées** :

| Ligne du ticket | Ce qui a été mesuré |
|---|---|
| « 81 des 148 services jamais testés » | La couche services est à **~83 % de lignes**. Et `PropertyService`, cité comme cœur métier, est du **code mort** — zéro appelant dans `app/`. |
| « 12 des 16 policies jamais nommées » | **15 des 16 sont exécutées.** Seule `WizardDraftPolicy` est à 0 — parce que `WizardDraftController` ne l'appelle jamais. Ce qui manquait, ce sont les **chemins de refus**. |
| « les 5 webhooks entrants sans test » | **Les 5 ont un test HTTP**, depuis le 2026-04-26 et le 2026-06-17 — donc **avant** l'audit qui les déclarait absents. **AC2 était déjà tenu à l'écriture du ticket.** |
| « 78 routes sur 517 sans test » | **~20 routes applicatives**, pas 78 (36 brutes dont 15 de framework et ≥1 faux négatif). Chiffre = plafond, pas compte. |
| « commandes irréversibles non testées » | Les **trois** citées sont testées, depuis avril et mai. `account:execute-deletions` est à **100 % de ses lignes**. |

L'erreur allait **dans les deux sens** — des tests existants comptés absents, des chemins jamais
exécutés comptés couverts. Ardoise D-26 à D-29 corrigées en conséquence.

### Ce qui manquait réellement, et qui est livré

Classé par **coût d'un défaut**, pas par pourcentage. 96 tests ajoutés sur 12 fichiers.

**Argent** — le pipeline de rapprochement bancaire était intégralement neutralisé par un
`Queue::fake()` : 155 lignes (`ParseBankStatementJob::handle` 0/52, `MatchBankStatementJob::handle`
0/18, `ReconciliationMatcher` 0/85) qui tournent en production à chaque dépôt de relevé. Déroulé
pour de vrai dans un fichier **séparé** — retirer le `Queue::fake()` de `BankReconciliationTest`
aurait cassé ses 8 cas, les jobs créant des lignes en plus de celles des factories. S'y ajoutent
`ReconciliationManager::unmatch` (0/26), `PaymentSearchService` (0/62) et
`PaymentGatewayService::verify` (0/14).

**Autorisation** — `BankReconciliationTest` ne contenait aucun `assertForbidden` : la garde
inter-agence de `ReconciliationManager` n'était jamais atteinte. `ExportDataService::scopeToActor`
(14/31) est le point de fuite inter-tenant le plus large : ses branches propriétaire, locataire et
« aucun profil » étaient muettes. Et 12 méthodes de policy — toutes des chemins de refus — n'étaient
jamais exécutées.

**Privilèges** — `ProcessRoleDelegationsJob`, qui accorde et retire des droits **toutes les 5
minutes**, était à 0 %.

### Trois décisions non évidentes

**1. La probe des délégations est `hasActiveAgencyDelegation()`, pas `canActAt()`.** Le plan
initial disait d'asserter sur `canActAt`. C'est faux : `MembershipCapabilityResolver` **ne consulte
à aucun moment** la table `role_delegations` — il n'agrège que les profils polymorphes. Un test sur
`canActAt` aurait été vert avant comme après le job, et n'aurait rien gardé. Les trois policies de
profil et les trois services d'invitation qui lisent réellement la délégation passent tous par
`hasActiveAgencyDelegation()`.

**2. Certaines gardes sont redondantes, et l'ablation seule le révèle.** Trois fois, une ablation
d'apparence décisive n'a rien fait rougir, parce qu'une seconde garde absorbait la panne :
`BankStatementPolicy::viewAny` porte deux contrôles de portée indépendants ; la garde inter-agence
de `ReconciliationManager` backstoppe `BankStatementLinePolicy::match` (mais **pas** `unmatch` ni
`ignore`, qui n'ont que la policy) ; et `RoleDelegation::readyToActivate()` backstoppe la garde
d'état de `RoleDelegationService::activate()`. Les tests concernés ont été **récrits pour viser la
garde qui tire réellement** — sinon ils auraient documenté une protection sans jamais l'éprouver.

**3. Trois défauts trouvés en écrivant les tests ne sont PAS corrigés ici.** Aucun n'est une
correction de test : chacun change le comportement en production et demande une décision. Ils sont
inscrits à l'ardoise, et leurs tests sont **suspendus par une sonde qui interroge la cause** — pas
le symptôme — donc ils se rallument seuls le jour du correctif et en deviennent la garde. Les
écrire à l'endroit du comportement mesuré aurait figé le défaut en contrat ; les laisser rouges
aurait cassé la CI.

- **[D-50] 🔴 Le webhook de paiement accepte le secret de n'importe quelle agence.** Mesuré : un
  webhook signé par l'agence B fait passer à `paid` un paiement de l'agence A (HTTP 200), tandis
  que le secret légitime de A est rejeté (HTTP 401). Comportement **inversé dans les deux sens**.
  Correctif = décision d'architecture (le contrat de `PaymentDriverContract`), pas une ligne.
- **[D-51] La branche `invoices` de la passerelle est morte par schéma** : pas de colonne
  `transaction_id`, et `initiate` lit `amount` là où une facture porte `total_amount` (422 mesuré).
- **[D-52] `GET /api/share/{token}/download` rend 404 en toutes circonstances** — le contrôleur lit
  la collection `'files'` quand tout le dépôt écrit `'file'`. C'est la cause exacte du
  `recordDownload` à 0/2 : la ligne est inatteignable, le plafond `max_downloads` n'a jamais été
  franchi.

### Le constat sur les webhooks non signés — ardoise D-49

**Orange SMS et Mtarget SMS ne vérifient aucune signature** : jeton d'URL + allowlist d'IP
seulement, là où les trois autres webhooks exigent une empreinte cryptographique. **Aucune
vérification n'a été ajoutée** — délibérément : si l'opérateur n'en émet pas, on casse la réception
des accusés de livraison, et la question « Orange et Mtarget en proposent-ils une ? » exige de lire
leur documentation d'API. Le docblock d'`OrangeSmsStatusController`, qui annonçait un middleware
`signed` que la route ne porte pas, a été corrigé (schéma D-21). Les 6 clés d'environnement de ces
gardes ne sont déclarées dans **aucun** des 4 fichiers `.env` — à traiter avec TCK-288.

### Hors périmètre, assumé

- **`WizardDraftPolicy`** : morte par construction. Lui écrire un test serait écrire un test qui ne
  garde rien ; la supprimer ou câbler `authorize()` est une décision, pas un test.
- **Supprimer `PropertyService`** (code mort) : suppression de code, hors d'un ticket de tests.
- **Activer la couverture en CI** (`coverage: pcov` + `--min`) : explicitement hors périmètre de ce
  ticket (voir « Hors périmètre » ci-dessus), et le surcoût de pcov n'a pas été mesuré.
- **Les ~20 routes applicatives restantes** sans test : les plus coûteuses sont livrées (KYC,
  téléchargement partagé, `payment-search`, `unmatch`, `verify`) ; le reste est de la console
  super-admin en lecture.

**Trou de mesure connu** : la couverture a été mesurée sur **SQLite `:memory:`**. Un chemin qui
diverge entre les deux moteurs — les agrégations `selectRaw` de `PlatformPayoutService::breakdown`,
par exemple — peut être vert ici et faux sur MySQL 8 en production.

---
id: TCK-443
title: "21 écouteurs sont enregistrés DEUX fois — la découverte automatique et `AppServiceProvider` font le même travail, et l'utilisateur reçoit tout en double"
status: todo
phase: P1
family: bug
estimate: M
wave: 50
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
    - docs/features.md#14-location-longue-durée-baux
    - docs/features.md#29-administration--configuration
tags: [back, events, notifications, bug, garde-ci]
---

## Objectif utilisateur

Un utilisateur qui s'inscrit reçoit **un** courriel, un locataire dont le bail s'active reçoit
**une** liste d'accueil, et une image n'est filigranée qu'une fois.

## Contexte

`Application::configure()` appelle `->withEvents()` **lui-même**
(`vendor/laravel/framework/src/Illuminate/Foundation/Application.php:250`, Laravel 13.25) — et
c'est le seul endroit du framework qui enregistre `AppEventServiceProvider`
(`Configuration/ApplicationBuilder.php:110-116`). Tout `app/Listeners` est donc **déjà**
auto-découvert, alors que `bootstrap/app.php` n'écrit `withEvents()` nulle part.

⚠ **Ne pas conclure de `bootstrap/app.php` que la découverte est éteinte** : c'est la déduction
qui a été faite en ouvrant ce ticket, et elle est fausse. Le fichier de configuration ne dit pas
l'état de l'application — seul le code du framework le dit. *C'est le motif de
[J-04](../../journal-des-corrections.md#j-04), sur un autre objet.*

Chaque `Event::listen(X::class, Listener::class)` d'`AppServiceProvider` en pose donc un
**second**. Les deux inscriptions apparaissent sous des chaînes différentes — `App\Listeners\X`
et `App\Listeners\X@handle` — et `array_unique()` ne dédoublonne qu'à l'intérieur de
`getEvents()` (`EventServiceProvider.php:61`), jamais entre lui et un `Event::listen()` externe.

**Mesuré sur `dev` (2026-08-27) : 21 couples (écouteur, événement) enregistrés deux fois.**
Méthode : appliquer la règle exacte du framework — toute méthode publique
`Str::is('handle*')` ou `__invoke` dont le premier paramètre est typé classe
(`Foundation/Events/DiscoverEvents.php:87-90`) — aux 17 classes de `app/Listeners`, puis
intersecter avec les 23 enregistrements explicites d'`AppServiceProvider`.

| Origine du doublon | Nombre |
|---|---|
| Découverte de `app/Listeners` ∩ `Event::listen()` explicite | **20** |
| `configureEmailVerification()` du framework ∩ `AppServiceProvider:628` | **1** |

Conséquences visibles par des utilisateurs réels : deux courriels de vérification par
inscription, **deux** listes d'onboarding par bail activé (`CreateTenantOnboardingChecklist`),
filigrane appliqué deux fois (`ApplyWatermarkOnConversionListener`), et double notification sur
`NotifyTenantOf{LateFee,DepositRefund,Renewal,RentReview}`, `SendTenantWelcomeNotification`,
`FlipAgencyKindOnUpgradeApproved`, `NotifyDelegation{Activated,Expired,Revoked}`,
`NotifyStatement{Imported,Finalized}`, `RecordScheduledTaskRun`.

**Deux points où la mesure d'ouverture de ce ticket était fausse, et tous deux dans le sens qui
rassure :**

1. **Les enregistrements en tableau `[Classe::class, 'methode']` SONT concernés.** La règle du
   framework est le glob `handle*`, pas `handle` : `handleOrderCreated`, `handleRequested`,
   `handleCancelled`, `handleConfirmed` sont découverts comme les autres. Cela ajoute **six**
   doublons qu'on croyait hors sujet — `LemonSqueezyEventListener` (×3, `app/Listeners/Payments/`)
   et `NotifyOnEarlyTermination` (×3, `app/Listeners/Lease/`).
2. **`SendEmailVerificationNotification` est bien un doublon, mais pas pour la raison qu'on
   croyait.** Il vit dans `Illuminate\Auth\Listeners\`, hors de `app/Listeners` : la découverte
   ne le voit pas. C'est `configureEmailVerification()`
   (`EventServiceProvider.php:223-228`, appelé en `booted()`) qui le ré-enregistre dès que
   `$this->listen[Registered::class]` est absent — ce qui est le cas.

*Deux mécanismes différents produisent ici le même symptôme. Une correction qui n'en traite qu'un
laisse le second, et le vert obtenu ne prouvera rien.*

### Les trois traitements de paiement sont-ils idempotents ? **Oui — mesuré, et c'est ce qui fixe la gravité**

`LemonSqueezyEventListener::handle{OrderCreated,OrderRefunded,SubscriptionCreated}` sont des
traitements de webhook de **paiement** exécutés deux fois par événement reçu. La question n'est
pas rhétorique : elle sépare « deux notifications partent » de « une commande est créditée deux
fois ». Réponse par lecture des trois méthodes et de ce qu'elles appellent :

Les trois délèguent à `PaymentGatewayService::handleWebhookEvent()`
(`LemonSqueezyEventListener.php:19-31`), dont **le seul chemin d'écriture** est
`applyEventToMatchingPayment()` (`PaymentGatewayService.php:206`) — le reste ne construit qu'une
`Request` et un `PaymentEvent` en mémoire. Et ce chemin est gardé :

```php
// PaymentGatewayService.php:214-224 — dans DB::transaction()
foreach ($candidates as $payment) {
    if ($this->isAlreadyProcessed($payment, $event)) { continue; }   // ← la garde
    $this->applyStatusToPayment(...);
    $this->markAsProcessed($payment, $event);
}
```

`isAlreadyProcessed()` (l. 400-414) relit le journal `metadata.gateway_events` et compare le
triplet *(provider, transaction_id, type)* que `markAsProcessed()` (l. 416-429) y a écrit. La
garde court **avant** toute écriture.

**Le second passage est donc un no-op**, et il l'est pour une raison qu'il faut nommer :
`LemonSqueezyEventListener` n'implémente pas `ShouldQueue`. Les deux inscriptions sont donc
invoquées **séquentiellement dans la même dépêche** — le premier passage a commité sa marque
avant que le second ne lise. Aucune commande n'est créditée deux fois, aucun remboursement n'est
rejoué, aucun abonnement n'est dupliqué.

⚠ **Conséquence directe pour le correctif : ce chemin ne lève pas.** Le second passage sort par
`continue`, pas par une exception — il n'y a ni contrainte d'unicité ni index derrière cette
garde (`grep gateway_events database/migrations/` → aucun résultat). Le piège PostgreSQL n°1 du
`CLAUDE.md` — *une erreur abandonne la transaction entière, et le message accuse ensuite la
première requête innocente venue* — **ne se déclenche pas ici**. Il n'y a donc pas de défaut
fantôme à chercher ailleurs à cause de ce doublon.

⚠ **La limite de cette garde, à ne pas franchir en corrigeant** : elle est applicative, dans une
colonne `jsonb`, **sans verrou de ligne et sans contrainte d'unicité**. Elle protège du rejeu
**séquentiel** — exactement notre cas — et non du rejeu **concurrent**. Rendre
`LemonSqueezyEventListener` `ShouldQueue` transformerait le doublon en deux jobs concurrents, et
le lire-modifier-écrire sur le journal JSON deviendrait une course.

**Ce ticket reste donc P1 et non P0.** La gravité vient des doublons réellement visibles — deux
courriels de vérification, deux listes d'onboarding, un filigrane appliqué deux fois — pas du
chemin de paiement, qui absorbe son doublon. *Un ticket qui crie plus fort que sa mesure vaut
aussi peu qu'un ticket qui la minimise.*

### L'histoire du comptage : 7 → 12/13 → 15 → 21

Quatre mesures successives, **toutes fausses dans le même sens**, chacune corrigée par la
suivante : 7 (implémenteur), 12/13 (vérificateur), 15 (session), **21** (ce ticket, dont 20 par
la découverte de `app/Listeners`).

Ce n'est pas une anecdote, c'est la justification du **delta**. Un compte sous-estimé quatre fois
de suite par des lecteurs attentifs n'appelle pas une cinquième lecture attentive : il appelle une
**garde** qui le recompte à chaque exécution. *Le lecteur de ce ticket doit re-mesurer 21, pas le
recopier* — et l'AC1 le lui demande sur l'application réellement bootée, la mesure ci-dessus
étant statique.

Les deux causes récurrentes de sous-estimation, à ne pas refaire : compter par **événement** au
lieu de compter par identité *(écouteur, méthode, événement)*, et croire que la forme tableau
échappe à la découverte.

**Ce qu'il ne faut PAS faire : couper la découverte.** `DispatchAlerts@handle` ← `Activity` est
le seul écouteur de `app/Listeners` qui n'a **aucun** enregistrement explicite : il ne vit que par
la découverte. `withEvents(discover: false)` le tuerait en silence.

## Contrat de données

Aucun endpoint, aucune migration, aucun modèle. Le delta est un retrait d'enregistrements dans
`app/Providers/AppServiceProvider.php` plus une garde.

## Contraintes strictes (métier)

- **Aucun écouteur ne doit perdre son unique enregistrement.** Le retrait ne vaut que pour les
  couples où la découverte fait déjà le travail — c'est-à-dire classe sous `app/Listeners`,
  méthode `handle*`/`__invoke`, premier paramètre typé de l'événement visé, classe instanciable.
- Les trois enregistrements qui ne sont **pas** des doublons restent. Les deux
  `SocialiteWasCalled` (`AppServiceProvider:551-552`) sont exclus pour **deux** raisons
  indépendantes, re-vérifiées : ce sont des classes **différentes**
  (`SocialiteProviders\Apple\AppleExtendSocialite` et `SocialiteProviders\Facebook\FacebookExtendSocialite`)
  — donc une vraie pluralité, contrairement à `NotifyOnEarlyTermination` — **et** elles vivent
  hors de `app/Listeners`, donc hors de la découverte. Reste le cas `Registered`, dont le doublon
  se corrige côté framework et non par symétrie avec les autres.
- **Ne pas rendre `LemonSqueezyEventListener` `ShouldQueue`** en passant : c'est son caractère
  synchrone qui rend sa garde d'idempotence suffisante (cf. Contexte).
- Deux écouteurs **différents** sur un même événement ne sont pas un doublon :
  `SendTenantWelcomeNotification` et `CreateTenantOnboardingChecklist` écoutent tous deux
  `LeaseActivated` légitimement. La garde doit compter par identité *(écouteur, méthode,
  événement)*, jamais par événement.

## Delta à produire

- [ ] Retirer d'`AppServiceProvider` les 20 `listen()` que la découverte double, formes tableau
      comprises
- [ ] Trancher le cas `Registered` → `SendEmailVerificationNotification` : retirer la ligne 628
      (le framework l'enregistre déjà) **ou** documenter pourquoi elle reste
- [ ] Test/garde : `EventListenerDuplicationTest` — monte l'application, lit
      `Event::getRawListeners()`, normalise `/@(handle\w*|__invoke)$/`, compte par identité
      *(écouteur, méthode, événement)* et **échoue** s'il reste un couple à plus d'un
- [ ] Vérifier par ablation que la garde rougit : remettre **un** `Event::listen()` retiré

## Critères d'acceptation

- [ ] AC1 — la garde compte **0** couple *(écouteur, méthode, événement)* enregistré plus d'une
      fois, sur l'application réellement bootée
- [ ] AC2 — la garde ROUGIT si l'on réintroduit un seul des `listen()` retirés ; vérifié par
      ablation, et le rouge nomme le couple fautif
- [ ] AC3 — un test d'inscription n'envoie qu'**un** courriel de vérification, et un test
      d'activation de bail ne crée qu'**une** liste d'onboarding — chacun échouant avant le
      correctif
- [ ] AC4 — `DispatchAlerts` reste enregistré (preuve que la découverte n'a pas été coupée)
- [ ] AC5 — la garde compte deux écouteurs distincts sur `LeaseActivated` comme **normaux**
- [ ] AC6 — le chemin de paiement est non régressé : un `order_created` reçu **une** fois produit
      exactement une entrée `metadata.gateway_events`, et le retrait des doublons ne change ni ce
      compte ni le statut du paiement
- [ ] AC7 — le compte de l'AC1 est pris sur l'application **bootée**, et non recopié depuis ce
      ticket ; s'il diffère de 21, c'est le compte mesuré qui fait foi et le ticket est corrigé

## Hors périmètre

- Remplacer la découverte automatique par des enregistrements explicites partout (ce serait la
  décision inverse, et elle demande un ADR).
- Les gestionnaires `SocialiteWasCalled`, qui ne sont pas des doublons.
- Durcir l'idempotence des paiements au niveau de la base (contrainte d'unicité ou verrou de
  ligne plutôt qu'un journal `jsonb` relu). La garde actuelle **suffit** au cas de ce ticket, qui
  est séquentiel ; la renforcer relève d'un ticket propre, à ouvrir si un jour un écouteur de
  paiement passe en file.

## Notes d'implémentation

_(à remplir par implementing-specs)_

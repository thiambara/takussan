---
id: TCK-490
title: "Un second chemin d'écriture d'adresse survit sans aucun appelant, et c'est celui dont TCK-464 a corrigé le défaut"
status: done
phase: P2
family: technique
estimate: S
wave: 55
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-464]
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#4-address
tags: [front, properties, dette, nettoyage]
---

## Objectif utilisateur

Aucun — c'est une dette. Le bénéficiaire est le prochain écran qui aura besoin d'écrire une adresse
de bien : il doit trouver **un** chemin, celui qui marche.

## Contrat de données

**TCK-464 a fait passer l'adresse dans le corps du bien, imbriquée.** `toCreatePayload` et
`toUpdatePayload` (`payload.ts`) composent un bloc `address`, que `PropertyController::store()` crée
dans la même transaction et que `update()` crée ou met à jour (`PropertyController.php:82-83`,
`136-145`). L'écriture différée par `PUT /api/properties/{id}/address` n'a plus de raison d'être
côté front.

**Ce qui reste, mesuré le 2026-08-30 :**

- `src/app/actions/dashboard-properties.ts:220` — `setPropertyAddressAction` : **zéro appelant**
  dans tout `src/`, tests compris. Avant TCK-464, `PropertyForm` l'appelait (l. 208 de la version
  d'alors).
- `src/lib/queries/properties-server.ts:379` — `setPropertyAddress`, appelée par la seule action
  ci-dessus.
- `takussan-api/routes/api/properties.php:48-49` — la route `PUT|DELETE .../address` et son
  contrôleur, couverts par `tests/Feature/Api/PropertyAddressTest.php`.

**Le front et le back ne se décident pas ensemble.** Côté front, la fonction est morte : elle part.
Côté back, la route est un endpoint public de l'API, testé, et rien ne prouve qu'aucun autre client
ne l'appelle — **la supprimer serait déduire l'usage de l'absence d'appel dans CE dépôt**, ce que ce
projet a déjà payé (`docs/journal-des-corrections.md#j-04`). Elle reste.

**Pourquoi ce n'est pas cosmétique.** C'est ce chemin-là qui portait le défaut central de TCK-464 :
l'adresse envoyée à plat puis rattrapée par un `PUT` sous une condition qui ne testait pas la ville
— une création qui ne renseignait que la ville n'écrivait aucune adresse. Une fonction qui survit
sans appelant est une invitation à rebrancher exactement ça. *Un répertoire mort n'est pas inerte :
il absorbe les corrections* ([J-08](../../journal-des-corrections.md#j-08)).

## Contraintes strictes (métier)

1. **Aucun changement de comportement.** Ce ticket ne touche à aucun chemin exécuté : la preuve
   attendue est que la suite front reste verte sans qu'aucun test n'ait été modifié pour l'occasion.
2. **La route API n'est pas supprimée**, ni son contrôleur, ni `PropertyAddressTest`. Ce qui part
   est le code front sans appelant.
3. **Si une fonction retirée laisse un import ou une re-export orphelin** (`lib/queries/properties.ts`
   ré-exporte `setPropertyAddress`), il part avec elle — un point d'entrée qui ne mène nulle part
   est le même problème d'un cran plus loin.

## Delta à produire

**Frontend — intentionnel**

- [x] Retirer `setPropertyAddressAction` et la fonction de requête qu'elle est seule à appeler,
      ainsi que toute ré-exportation devenue orpheline
- [x] Vérifier, avant de retirer, que le compte d'appelants est bien zéro **sur tout `src/`, tests
      compris** — et le consigner dans les notes d'implémentation

**Backend**

- [x] Rien. La route, le contrôleur et son test restent en place.

## Critères d'acceptation

- [x] **AC1** — `setPropertyAddressAction` n'existe plus, et aucune référence à son nom ne subsiste
      dans `takussan-web/src/`.
- [x] **AC2** — La création et l'édition d'un bien continuent d'écrire l'adresse ; les tests qui le
      vérifient (TCK-464, AC1) passent **sans avoir été modifiés**.
- [x] **AC3** — `PUT /api/properties/{id}/address` répond toujours, et `PropertyAddressTest` est
      vert.
- [x] **AC4** — `npm run lint`, `npx tsc --noEmit`, `npm run test` verts.

## Hors périmètre

- La suppression de la route API ou de son contrôleur — voir le raisonnement ci-dessus.
- Toute autre fonction morte du dépôt : ce ticket ne fait pas l'inventaire général, il ferme celle
  que TCK-464 vient de laisser derrière lui.
- `DELETE /api/properties/{id}/address`, qui n'a jamais eu d'appelant front et n'est pas une
  conséquence de TCK-464.

## Notes d'implémentation

Compte d'appelants avant suppression, sur tout `src/`, tests compris : **zéro**
(`grep -rn "setPropertyAddress" src/` → 5 occurrences, toutes internes aux trois fichiers retirés).

**`PropertyAddressPayload` part avec la fonction** : elle n'était le type d'argument que de
`setPropertyAddress`, et sa ré-exportation par `lib/queries/properties.ts` en faisait un second
point d'entrée orphelin (contrainte 3).

La route API, son contrôleur et `PropertyAddressTest` sont intacts — aucun fichier de
`takussan-api/` n'a été touché par ce ticket.

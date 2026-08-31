---
id: TCK-495
title: "Le courtier est un profil commutable sans aucune surface — lui en donner une, ou le retirer"
status: blocked
phase: P2
family: applicatif
estimate: M
wave: 56
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-494]
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#36-brokerprofile-
    - docs/models-spec.md#38-brokeragencycollaboration-
tags: [back, front, broker, profils, decision-produit]
---

> **`status: blocked` — et c'est le sens du ticket.** Il porte une décision produit, pas un delta
> déjà tranché : *le courtier fait-il partie de Takussan aujourd'hui ?* Les deux issues sont
> légitimes et le delta n'est pas le même. Le ticket se débloque quand la réponse est donnée.

## Objectif utilisateur

Un rôle qu'on peut choisir mène quelque part. Aujourd'hui, un compte qui obtiendrait un profil de
courtier pourrait le sélectionner dans le sélecteur d'espaces et se retrouverait devant un produit
qui ne le connaît pas.

## Contrat de données

**Ce qui existe**, et c'est réel : `BrokerProfile`, `BrokerAgencyCollaboration`, leurs migrations et
leurs factories ; l'alias `broker` dans `ActiveProfileResolver::TYPE_MAP`, donc dans le sélecteur de
profil et dans `GET /api/me/profiles` ; `broker` émis par `profileTypes()`, donc dans `roles` ;
`BrokerProfile` lu par `PropertyResource` ; la spec, qui le décrit
(`features.md#22-rôles--permissions`, `models-spec.md#36-brokerprofile-`) et qui cite explicitement
« un courtier indépendant collaborant avec C et D » comme cas d'usage du multi-profil.

**Ce qui n'existe pas**, mesuré le 2026-08-30 :

```
php artisan route:list --json | (uri | action | name contenant "broker")   →  0
find takussan-web/src/app -ipath '*broker*'                                →  0
grep 'broker' takussan-web/src/types/user.ts                               →  0
```

Zéro route API, zéro page, absent de l'union `UserRole` côté front, aucun assistant d'onboarding,
aucun chemin — invitation comprise — qui crée un `BrokerProfile`.

**La conséquence si un compte en obtenait un** : `isAgent()`, `isOwner()`, `isAdmin()`,
`isServiceProvider()` rendraient tous `false`, et le menu serait vide. C'est le défaut de
[TCK-492](TCK-492-customer-et-tenant-jamais-emis-dans-roles.md), en pire : là, au moins, le compte
n'a pas choisi son espace.

## Contraintes strictes (métier)

1. **Les deux issues sont recevables, la situation actuelle ne l'est pas.** Un rôle sélectionnable
   qui ne mène nulle part est plus coûteux que pas de rôle du tout.
2. **Si le courtier reste** : il lui faut une porte (par quel chemin obtient-on le profil ?), un
   menu qui le reconnaît, et des capacités déclarées dans `MembershipCapabilityResolver`. Un profil
   sans capacité déclarée **refuse tout en silence** — c'est la panne la plus discrète de cette
   couche (`takussan-api/CLAUDE.md`, § Autorisation).
3. **Si le courtier part** : il sort de `TYPE_MAP` — donc du sélecteur — et de `profileTypes()`. Les
   modèles et leurs migrations ne se suppriment pas dans le même geste : une migration de
   suppression est irréversible en pratique, et la spec le décrit encore.
4. **Dans les deux cas, la spec suit.** `features.md` et `models-spec.md` décrivent le courtier au
   présent ; si le produit tranche autrement, c'est une PR de spec, jamais une divergence de plus
   (`/sync-specs`).
5. **Aucune décision par défaut.** Ne pas trancher « en attendant » en retirant l'alias : ce serait
   décider le retrait sans l'avoir décidé.

## Delta à produire

**À la décision — issue A : le courtier reste**

- [ ] Un chemin qui crée un `BrokerProfile` (invitation, ou déclaration en libre-service)
- [ ] Les capacités du courtier déclarées dans `MembershipCapabilityResolver`, chacune avec son test
- [ ] Un menu qui le reconnaît, et les écrans que ses capacités ouvrent
- [ ] `broker` ajouté à l'union `UserRole` et aux prédicats (recoupe TCK-494)

**À la décision — issue B : le courtier sort**

- [ ] `broker` retiré de `ActiveProfileResolver::TYPE_MAP` et de `profileTypes()`
- [ ] Les gardes de parité suivent d'elles-mêmes (TCK-329, TCK-494) — vérifier qu'elles rougissent
      avant, et verdissent après
- [ ] `features.md` et `models-spec.md` mis à jour par une PR de spec dédiée
- [ ] `BrokerProfile` et `BrokerAgencyCollaboration` marqués comme non exposés, sans suppression de
      schéma

## Critères d'acceptation

- [ ] **AC1** — La décision est écrite quelque part de durable : un ADR si elle est structurelle,
      sinon le corps de ce ticket. *Une décision qui ne vit que dans une conversation est une
      décision perdue.*
- [ ] **AC2** — À l'issue du ticket, il n'existe plus de profil sélectionnable dans le sélecteur qui
      ne mène à aucun écran. Vérifié en parcourant `TYPE_MAP` et en confrontant chaque alias à une
      route front.
- [ ] **AC3** — Aucune divergence résiduelle entre le code et les deux specs sur le courtier :
      `/sync-specs` ne signale rien.
- [ ] **AC4** — Suites back et front vertes ; les gardes de parité passent.

## Hors périmètre

- La suppression des tables `broker_profiles` et `broker_agency_collaborations` : irréversible en
  pratique, et hors de portée d'un ticket d'arbitrage.
- La parité `UserRole` ↔ `profileTypes()` en elle-même → TCK-494, dont ce ticket dépend pour que
  l'écart soit visible avant d'être arbitré.
- Le sort des autres profils sans porte en libre-service (agent, prestataire) — ardoise D-60, autre
  question : eux ont des écrans, il leur manque une entrée.

## Notes d'implémentation

_(à remplir par implementing-specs)_

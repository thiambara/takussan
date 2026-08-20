---
id: TCK-317
title: "Les rôles système dérivent par date de création d'agence — une capacité ajoutée à l'enum n'atteint jamais les agences existantes"
status: done
phase: P2
family: back
estimate: M
wave: 39
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: []
spec_refs:
  features: []
  models:
    - docs/models-spec.md
tags: [api, autorisation, dette, tck-279]
---

## Objectif utilisateur

Que deux agences dont le rôle porte le même nom — « Administrateur », `is_system=true` —
accordent les mêmes droits, quelle que soit la date à laquelle elles ont été créées.

## Le défaut

TCK-279 a transformé une table de vérité **définie en code** en **lignes persistées** :
`SystemRoleCapabilities` n'est plus lue à chaque autorisation, elle est SEEDÉE une fois
par agence dans `agency_role_capabilities`, et c'est le pivot que
`MembershipCapabilityResolver` interroge ensuite.

Le seed n'est jamais rejoué. `AgencySystemRoleSeeder::systemRoleFor()` rend le rôle
existant et sort :

```php
$role = AgencyRole::query()->where(...)->where('is_system', true)->first();
if ($role !== null) {
    return $role;          // ← ses capacités ne sont jamais réconciliées
}
```

Conséquence : **le jour où un 45ᵉ cas est ajouté à `Capability`**, le rôle système
`agency_admin` le reçoit dans toute agence créée APRÈS, et ne le reçoit dans aucune
agence créée AVANT. Rien ne le signale — ni garde, ni test, ni log.

C'est le pendant exact du travers que `SystemRoleCapabilities` corrigeait
(« si les deux divergeaient, une agence créée avant TCK-279 et une agence créée après
n'auraient pas les mêmes droits par défaut — et rien ne le dirait »). La source unique
a bien été établie **en code** ; la divergence s'est déplacée d'un cran, **dans les
données**.

## La mesure

Sonde exécutée le 2026-08-16 sur `dev` (retirée après coup, elle n'est pas commitée) :
retirer une ligne de capacité d'un rôle système, puis rejouer
`AgencySystemRoleSeeder::seed($agency)` — ce qui simule « la capacité a été ajoutée à
l'enum après la création de cette agence » :

```
avant = 42 lignes
après suppression + reseed = 41
`invoices.send` récupérée ? false
```

Le re-seed est un no-op sur une agence existante. Confirmé aussi par lecture : seule la
migration de backfill 120300 réconcilie (`ensureCapabilities` fait un `array_diff`), et
elle ne tourne qu'une fois.

## Delta à produire

La décision n'est pas tranchée — c'est l'objet du ticket, pas un détail
d'implémentation. Trois options, à arbitrer avant d'écrire :

- [x] **A — réconcilier au déploiement.** Une commande idempotente
      (`membership:reconcile-system-roles`) qui, pour chaque agence, ajoute au rôle
      système les capacités du catalogue qui lui manquent. Ne retire rien : un rôle
      système qu'on a délibérément amputé n'existe pas aujourd'hui, mais le supposer
      serait un choix non écrit. À brancher dans la chaîne de déploiement.
- [x] **B — réconcilier à la lecture.** `AgencyRoleCapabilityCache` complète un rôle
      `is_system` avec le catalogue au moment de la résolution. Supprime la divergence
      par construction, mais rend le pivot non autoritatif pour les rôles système —
      et l'UI afficherait alors des capacités absentes de la base.
- [x] **C — ne pas matérialiser les rôles système.** `is_system` ne porte pas de lignes
      de pivot du tout ; le résolveur lit `SystemRoleCapabilities` pour eux et le pivot
      pour les rôles personnalisés. Le plus propre conceptuellement, le plus coûteux à
      reprendre (le clonage lit les lignes du rôle source).
- [x] Quelle que soit l'option : une **garde** qui casse si un rôle système d'une agence
      quelconque diverge du catalogue. C'est la partie qui ne se négocie pas — sans
      elle, la prochaine divergence sera silencieuse elle aussi.
- [x] Écrire la décision en **ADR** (`docs/adr/`) : matérialiser ou non un catalogue
      code-defined est structurel, et c'est la deuxième fois que la question se pose.

## Critères d'acceptation

- [x] AC1 — Après ajout d'un cas à `Capability`, une agence créée AVANT et une agence
      créée APRÈS accordent les mêmes droits via leur rôle système du même type.
- [x] AC2 — Un test le prouve en ajoutant réellement une capacité (fixture d'enum ou
      double), pas en supposant le mécanisme.
- [x] AC3 — Une garde signale toute divergence entre un rôle `is_system` et le
      catalogue, et elle est rejouée en CI.
- [x] AC4 — Les rôles PERSONNALISÉS ne sont jamais touchés : s'écarter du catalogue est
      exactement leur raison d'être.

## Hors périmètre

- Les capacités réservées à la plateforme (`Capability::platformReserved()`) — traitées,
  gardées à l'écriture et testées.
- La réconciliation des rôles personnalisés — cf. AC4, ce serait un défaut.

## Notes d'implémentation

⑴ **Le défaut est latent aujourd'hui** : l'enum n'a pas bougé depuis TCK-278, donc
aucune agence ne diverge encore. Il se déclenchera au premier ajout de capacité — c'est
-à-dire au moment où l'on pensera le moins à cette mécanique.

⑵ Trouvé en revoyant la PR #176, en même temps que l'escalade de privilège corrigée par
`Capability::platformReserved()`. Les deux naissent du même geste — matérialiser en base
un catalogue défini en code — et c'est ce que l'ADR demandé ci-dessus doit nommer.

## Résultat — mesuré le 2026-08-16

**Option A retenue**, B et C écartées avec leur motif : [ADR-0014](../../adr/0014-catalogue-code-defini-materialise-et-reconcilie.md).
En deux mots — B rendrait le pivot non autoritatif (la base dirait une chose, le résolveur une
autre, l'UI une troisième) ; C est conceptuellement la plus propre mais demande de faire converger
**quatre** chemins de lecture, dont deux qui lisent le pivot en direct (`AgencyRoleResource`,
`AgencyRole::capabilityEnums()`), c'est-à-dire un refactor de la surface d'autorisation.

Livré :

- `AgencySystemRoleSeeder::reconcile()` et `diff()` — additifs, jamais destructifs, jamais sur un
  rôle personnalisé ;
- `systemRoleFor()` réconcilie au lieu de sortir : toute agence touchée par le trafic se répare ;
- `membership:reconcile-system-roles` (`--dry-run`, `--agency=`) pour balayer le reste ;
- branchée dans `scripts/deploy.sh`, **non fatale** — un rôle en retard accorde MOINS de droits que
  prévu, c'est la direction sûre, et elle ne doit pas faire échouer un déploiement sain ;
- **la garde** `SystemRoleDriftTest::test_guard_no_seeded_system_role_diverges_from_the_catalogue`,
  qui refuse l'écart **dans les deux sens** et est rejouée par la CI.

**AC2** — la preuve n'utilise ni double d'enum ni fixture : elle RETIRE une ligne du pivot, ce qui
produit rigoureusement le même état de base qu'une capacité ajoutée au catalogue après coup.

**Ablation** — sans la réconciliation dans `systemRoleFor()`, 1 des 5 tests rougit. 5/5 avec.

Un excédent (capacité hors catalogue sur un rôle système) est **signalé, jamais supprimé** : rien ne
peut en produire aujourd'hui, et effacer une donnée qu'on n'a pas su expliquer coûterait plus cher
que de la voir en rouge.

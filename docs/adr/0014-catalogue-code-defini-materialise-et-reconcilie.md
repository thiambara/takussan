# ADR-0014 — Un catalogue défini en code, matérialisé en base, se réconcilie ; il ne se lit pas à deux endroits

- **Statut** : Accepté
- **Date** : 2026-08-16
- **Ticket** : TCK-317

## Contexte

TCK-278 a défini le catalogue des capacités **en code** : l'enum `Capability`, et une table de
vérité par type de profil. TCK-279 a transformé cette table de vérité en **lignes persistées** —
`agency_role_capabilities`, seedées une fois par agence par `AgencySystemRoleSeeder`. C'est le
pivot que `MembershipCapabilityResolver` interroge désormais.

Le seed n'était jamais rejoué. `systemRoleFor()` rendait un rôle existant sans regarder ses
capacités :

```php
$role = AgencyRole::query()->where(...)->where('is_system', true)->first();
if ($role !== null) {
    return $role;          // ← ses capacités ne sont jamais réconciliées
}
```

**Conséquence mesurée le 2026-08-16** — retirer une ligne de capacité d'un rôle système puis
rejouer `seed()` :

```
avant                        42 lignes
après suppression + reseed   41
`invoices.send` récupérée ?  false
```

Autrement dit : le jour où un cas est ajouté à `Capability`, les agences créées **avant** ne le
reçoivent jamais, celles créées **après** oui, et rien ne le signale — ni garde, ni test, ni log.
Deux agences dont le rôle porte le même nom, `is_system=true`, n'accordent pas les mêmes droits,
et la seule variable est leur date de création.

C'est le pendant exact du travers que `SystemRoleCapabilities` existait pour fermer. Son propre
docblock l'écrit : *« si les deux divergeaient, une agence créée avant TCK-279 et une agence créée
après n'auraient pas les mêmes droits par défaut — et rien ne le dirait. »* La source unique avait
bien été établie **en code** ; la divergence s'était déplacée d'un cran, **dans les données**.

## Décision

**Le pivot reste la SEULE autorité à l'exécution. La cohérence avec le catalogue est tenue par une
réconciliation additive et par une garde, jamais par une seconde lecture.**

Trois choses en découlent :

1. **`AgencySystemRoleSeeder::systemRoleFor()` réconcilie** au lieu de sortir. Toute agence touchée
   par le trafic normal se répare d'elle-même.
2. **`membership:reconcile-system-roles`** balaie les agences que le trafic ne touche pas. Idempotente,
   additive, `--dry-run` disponible. À lancer après tout déploiement qui ajoute un cas à `Capability`.
3. **Une garde dans la suite** refuse toute divergence entre un rôle `is_system` et le catalogue,
   **dans les deux sens**. C'est la partie non négociable : sans elle, la prochaine divergence
   serait silencieuse comme celle-ci.

La réconciliation est **purement additive**. Rien aujourd'hui ne retire légitimement une capacité à
un rôle système : la seule écriture qui le pourrait, `AgencyRoleService::replaceCapabilities()`,
n'est atteignable que par l'API, où `AgencyRolePolicy` refuse tout rôle `is_system`. Supprimer un
excédent reviendrait à traiter un cas qui n'existe pas, au risque d'effacer une donnée qu'on n'a pas
su expliquer. La garde, elle, **signale** l'excédent — on le verra rouge plutôt que disparu.

**Les rôles personnalisés ne sont jamais touchés.** S'écarter du catalogue est exactement leur
raison d'être.

## Les deux options écartées, et pourquoi

**B — réconcilier à la lecture** (le cache complète un rôle `is_system` depuis le catalogue).
Supprime la divergence par construction, et c'est son seul mérite. Elle rend le pivot **non
autoritatif** pour les rôles système : la base dirait une chose, le résolveur une autre, et l'UI —
qui lit le pivot via `AgencyRoleResource` — afficherait une matrice en désaccord avec les droits
réellement appliqués. C'est précisément la classe de défaut que ce dépôt paie en boucle : deux
sources qui se contredisent, dont une seule fait autorité, sans que rien ne dise laquelle.

**C — ne pas matérialiser les rôles système du tout** (le résolveur lit `SystemRoleCapabilities`
pour eux, le pivot pour les rôles personnalisés). Conceptuellement la plus propre : la dérive
devient impossible plutôt que corrigée. Écartée sur son coût **et** sur son risque : quatre chemins
lisent aujourd'hui les capacités d'un rôle — le résolveur et `HasAgencyRole` via
`AgencyRoleCapabilityCache`, mais `AgencyRoleResource` et le clonage
(`AgencyRole::capabilityEnums()`) **directement par la relation pivot**. Les faire tous converger
est un refactor de la surface d'autorisation, c'est-à-dire l'endroit où une erreur ne se voit pas.
Ce n'est pas un refus définitif : si le pivot devait un jour cesser de porter les rôles système, cet
ADR serait à réviser, pas à contourner.

## Conséquences

**Ce que ça coûte.** Une requête de plus par appel à `systemRoleFor()` sur un rôle existant (un
`pluck` sur le pivot). Ce chemin n'est emprunté qu'à la création d'un profil sans `agency_role_id`
explicite, pas sur le chemin d'autorisation — `MembershipCapabilityResolver` passe par le cache et
n'est pas touché.

**Ce que ça n'élimine pas.** Entre l'ajout d'un cas à l'enum et le passage de la commande, une
agence non touchée par le trafic reste en retard. La fenêtre est bornée par le déploiement, et la
garde la rend visible — mais elle existe. C'est le prix assumé de ne pas prendre l'option C.

**Ce que ça interdit.** Ajouter un cas à `Capability` sans lancer la commande au déploiement. La
garde le rattrape en CI, pas en production.

## Application

- `takussan-api/app/Services/Membership/AgencySystemRoleSeeder.php` — `reconcile()` et `diff()`
- `takussan-api/app/Console/Commands/MembershipReconcileSystemRoles.php`
- `takussan-api/tests/Feature/Agency/SystemRoleDriftTest.php` — dont
  `test_guard_no_seeded_system_role_diverges_from_the_catalogue`, la garde, rejouée par la CI
  puisqu'elle vit dans la suite

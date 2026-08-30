---
id: TCK-476
title: "La carte d'impact ne connaît pas les fichiers de langue, et retombe sur la suite entière"
status: review
phase: P2
family: technique
estimate: S
wave: 52
created: 2026-08-29
updated: 2026-08-30
depends_on: []
blocks: []
spec_refs: {}
tags: [outillage, tests, dette]
---

## Objectif utilisateur

Aucun, directement. C'est la boucle de retour quotidienne : `php bin/impacted-tests.php --run` doit
ne lancer que les tests que le diff touche, sinon plus personne ne l'emploie.

## Le défaut

Mesuré pendant le lot des vagues 50-51 : un diff qui ne touche qu'un fichier de langue —
`takussan-api/lang/en/invitations.php` — fait résoudre la carte d'impact à **la suite ENTIÈRE**.
Le fichier est inconnu de `tests/impact-map.json`, et l'inconnu est traité comme « tout ».

Ce repli est **le bon défaut** : face à un fichier qu'elle ne sait pas situer, une carte d'impact
doit sur-sélectionner, jamais sous-sélectionner. Le problème n'est pas le repli, c'est sa
**fréquence** : les fichiers de `lang/` changent souvent, et à chaque fois l'outil du quotidien
coûte 470 à 610 secondes au lieu de quelques dizaines.

⚠ **Un outil qui retombe souvent sur son pire cas cesse d'être employé** — et c'est alors la boucle
de retour qui disparaît, pas seulement sa vitesse.

## Contrat de données

Aucun.

## Delta à produire

- [ ] Faire connaître `lang/**` à la carte, ou lui donner une règle explicite pour cette famille.
- [ ] ⚠ **Sans casser le repli** : un fichier vraiment inconnu doit continuer de rendre la suite
      entière.

## Critères d'acceptation

- [x] **AC1** — un diff limité à un fichier de `lang/` résout un ensemble **strictement plus
      petit** que la suite entière, et le compte est écrit.
- [x] **AC2** — l'ensemble résolu **contient** les tests qui asserten sur ces clés. Le vérifier par
      ablation : casser une clé et constater que l'ensemble résolu la rougit. *Une carte d'impact
      qui va plus vite en oubliant un test est pire que celle qui lance tout.*
- [x] **AC3** — un fichier hors de toute règle connue rend **toujours** la suite entière. Le
      vérifier avec un chemin inventé.
- [x] **AC4** — le relevé qui motive le ticket est reproduit dans le ticket, avec sa commande.

## Hors périmètre

- La régénération de la carte, qui a son propre chemin.

## Notes d'implémentation

Relevé pendant le lot des vagues 50-51, en essayant d'employer la boucle du quotidien sur un diff
qui touchait des dictionnaires.

---

## Relevé de livraison — 2026-08-30

### Comment le diff a été isolé (l'arbre était sale)

Sept autres agents éditaient l'arbre pendant ce ticket : `php bin/impacted-tests.php` aurait mesuré
**leur** travail, pas un diff de `lang/`. Le relevé est donc pris par une **sonde** qui court-circuite
la couche git et passe la liste de chemins EN ARGUMENT, en instanciant la vraie `ImpactMap` (celle du
dépôt, commit `f167e640`) et le vrai `ImpactSelector` :

```php
$map = ImpactMap::fromJson(file_get_contents('tests/impact-map.json'));
$sel = new ImpactSelector($map, (new TranslationUsage($api))->consumersOf(...));
$s   = $sel->select(['takussan-api/lang/en/invitations.php'], fn ($p) => '', []);
```

La couche git n'apporte rien d'autre que cette liste (`git status --porcelain` ∪
`git diff --name-only <base>...HEAD`) : la décision mesurée est exactement celle de la commande.
Vérifié en marge : la réparation de péremption n'ajoute rien ici —
`git diff --name-only --diff-filter=ACMR f167e640..HEAD -- takussan-api/tests` ne rend que
`tests/impact-map.json`, qui n'est pas une classe de test.

### AC4 — le relevé qui motive le ticket, reproduit

Référence de « suite entière » : `find tests -name '*Test.php' | wc -l` → **404**.

| | avant | après |
|---|---|---|
| `takussan-api/lang/en/invitations.php` | `SUITE ENTIÈRE — chemin non reconnu, sécurité par défaut` → **404 classes** | **sélection partielle — 18 classes** |

Le motif d'avant est celui qu'annonçait le ticket, et il est reproduit mot pour mot par la sonde.

### AC1 — strictement plus petit, sur les quinze dictionnaires applicatifs

Aucun n'escalade plus, tous restent sous 404 :

| domaine | classes | | domaine | classes | | domaine | classes |
|---|---|---|---|---|---|---|---|
| `onboarding` | 2 | | `role_delegations` | 4 | | `owners` | 4 |
| `super_admins` | 4 | | `agency_upgrade` | 5 | | `reconciliation` | 5 |
| `account` | 6 | | `service_providers` | 17 | | `invitations` | **18** |
| `agencies` | 27 | | `notifications` | 55 | | `messages` | 58 |
| `team` | 188 | | `messaging` | 198 | | `properties` | 228 |

`properties` et `messaging` sélectionnent beaucoup — ce sont des domaines cités par des fichiers de
`app/` très couverts. C'est le bon sens de l'erreur : **strictement** plus petit, et jamais moins que
ce qu'il faut.

### AC2 — l'ablation, et son groupe témoin

L'ablation ne peut pas porter sur le TEXTE d'un message : **aucun test du dépôt n'assert sur ces
chaînes** (`grep -rlniE "This invitation|invitation is already pending" tests/` → rien). C'est un
constat de la mesure, pas de la règle. L'ablation porte donc sur le TYPE des valeurs : chaque feuille
du dictionnaire remplacée par `['CASSE-TCK-476']`, ce qui fait exploser tout
`abort(4xx, __('invitations.…'))` en `TypeError`.

```
md5 avant   a5543fa2d987f3a8ddd5cb66730ae3ed
md5 cassé   4ed1ade78060a7d5e5d08034a1540630     ← la casse est PROUVÉE avant de lire le résultat
md5 restauré a5543fa2d987f3a8ddd5cb66730ae3ed    ← restauration par `cp`, jamais par `git checkout`
```

- **L'ensemble résolu ROUGIT** : `php artisan test <les 18 classes>` → **4 failed, 166 passed**,
  46,58 s. La première rupture est `InvitationAcceptTest::test_revoked_token_returns_410` sur
  `HttpException::__construct(): Argument #2 ($message) must be of type string, array given`.
- **Le groupe témoin reste VERT** : les **9** classes de test qui mentionnent « invitation » et que
  la règle NE sélectionne PAS (`TeamManagementTest`, `InvitationPolicyTest`, `AgencyOnboardingTest`,
  `AccountDeletionStepUpTest`…) → **80 passed**, 0 échec. Aucune n'a été oubliée par la sélection.

⚠ **Ce que cette épreuve ne prouve pas** : la population témoin est celle des tests qui *nomment*
l'invitation (26 fichiers, dont 18 sélectionnés). Un test qui traduirait une clé du domaine sans
jamais écrire le mot resterait hors de portée de ce contrôle — seule la suite entière trancherait, et
elle n'est pas le rituel d'un agent délégué.

Le locale des tests vient de `.env` (`APP_LOCALE=en` en local, `fr` en CI via `.env.example`) : c'est
bien `lang/en/invitations.php` qui est chargé ici, c'est-à-dire le fichier même du ticket.

### AC3 — le repli n'est pas remplacé, il est borné

```
takussan-api/chemin/completement/invente.php
  → SUITE ENTIÈRE — chemin non reconnu, sécurité par défaut
takussan-api/lang/en.json
  → SUITE ENTIÈRE — fichier de langue de forme inattendue
takussan-api/lang/en/vendor/foo/bar.php
  → SUITE ENTIÈRE — fichier de langue de forme inattendue
takussan-api/lang/fr/validation.php
  → SUITE ENTIÈRE — dictionnaire lu par le framework
```

### Ce que la mesure a corrigé en chemin

1. **Le balayeur se prenait lui-même pour un consommateur.** Première exécution :
   `lang/en/invitations.php` → *« consommateur de invitations dans le harnais :
   tests/Support/TranslationUsage.php »*, parce que le docblock de ce fichier cite une clé en
   exemple. Les commentaires sont désormais retirés (`token_get_all`) avant toute recherche ; le cas
   est figé par `TranslationUsageTest::test_a_key_named_in_a_comment_is_not_a_consumption`.
2. **Le premier ordre seul aurait oublié un Mailable.** Les cinq fichiers de `app/` qui écrivent
   `'invitations.…'` ne contiennent PAS `app/Mail/InvitationMailable.php` — c'est
   `resources/views/emails/invitation.blade.php` qui porte les clés, et le Mailable qui la rend. D'où
   le second ordre vue → renderer. Sans lui, les tests couvrant ce Mailable sortaient de la
   sélection : exactement le défaut que l'AC2 existe pour interdire.
3. **`validation.php` ne pouvait pas suivre la règle du domaine.** Il porte le message de chaque 422
   du dépôt et n'est cité que par 13 fichiers de `app/`. Il rejoint `auth`, `pagination` et
   `passwords` dans `GLOBAL_TRANSLATION_DOMAINS`, confrontée à la documentation par
   `scripts/check-impact-triggers.mjs` comme les trois autres constantes.

### Coût

Le balayage de `app/`, `tests/` et `resources/views/` coûte **0,9 s**, et il est **paresseux** : un
diff sans fichier de `lang/` ne le paie pas.

### Périmètre touché

`takussan-api/tests/Support/TranslationUsage.php` (neuf) ·
`takussan-api/tests/Support/ImpactSelector.php` · `takussan-api/bin/impacted-tests.php` ·
`takussan-api/tests/Unit/Testing/TranslationUsageTest.php` (neuf) ·
`takussan-api/tests/Unit/Testing/ImpactSelectorTest.php` · `scripts/check-impact-triggers.mjs` ·
`takussan-api/CLAUDE.md`.

**`tests/impact-map.json` n'est PAS touchée** : la règle se passe de la carte pour l'arête
`lang/` → consommateurs, et la lit ensuite telle quelle. Aucune régénération, donc aucun risque de
carte dérivée d'un sous-ensemble.

### Gardes

```
node scripts/check-impact-triggers.mjs --report   ✓ les quatre constantes et la documentation disent la même chose
node scripts/check-impact-map.mjs --report        ✓ 396 classes · 823 fichiers couverts sur 945 scannés
./vendor/bin/pint --test <les 5 fichiers PHP>     ✓ passed
php artisan test tests/Unit/Testing/{ImpactSelectorTest,TranslationUsageTest,ImpactMapTest}.php
                                                  ✓ 53 passed
```

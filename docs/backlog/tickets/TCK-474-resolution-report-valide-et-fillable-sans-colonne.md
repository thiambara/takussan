---
id: TCK-474
title: "`resolution_report` est validé et `$fillable`, mais aucune migration ne crée la colonne"
status: review
phase: P1
family: technique
estimate: S
wave: 52
created: 2026-08-29
updated: 2026-08-30
depends_on: []
blocks: []
spec_refs:
  models:
    - docs/models-spec.md
tags: [api, maintenance, migration, dette]
---

## Objectif utilisateur

Un gestionnaire qui clôt une demande de maintenance en joignant son rapport d'intervention doit
obtenir une réponse, pas une erreur serveur.

## Le défaut

`resolution_report` traverse toute la chaîne applicative — il est **validé** par la requête et
présent dans `$fillable` du modèle — mais **aucune migration ne crée la colonne**. Un `PATCH` qui
le porte rend donc un **500** :

```
SQLSTATE[42703]  column "resolution_report" of relation "…" does not exist
```

⚠ **Ce n'est pas un 422.** Le champ est accepté par la validation, puis explose à l'écriture : le
client reçoit une erreur serveur là où toute autre clé inconnue serait refusée proprement. C'est la
pire des deux réponses possibles.

⚠⚠ **Sur PostgreSQL, l'échec ne s'arrête pas là.** Une erreur SQL **abandonne la transaction
entière** (`SQLSTATE[25P02]`) : dans un contrôleur qui ferait plusieurs écritures, tout ce qui suit
échoue en accusant une requête innocente. Cf. le piège n°1 du bloc « Migrations » de `CLAUDE.md`.

## Ce qu'il faut trancher avant de coder

**La colonne doit-elle exister ?** Les deux issues sont légitimes et le ticket ne préjuge pas :

- **oui** → migration, `down()` juste, et le champ devient réel ;
- **non** → le retirer de la validation ET de `$fillable`, et écrire pourquoi il y était.

*Ajouter la colonne parce que le code la mentionne, c'est laisser le code décider du schéma.*

## Contrat de données

À décider par ce ticket. Si la colonne est créée : nommer son type, sa nullabilité et son `down()`.

## Delta à produire

- [x] Trancher, et écrire la décision → **RETRAIT du champ**, pas de migration.
- [x] Pas de migration : la décision est le retrait. Le champ est `prohibited` dans
      `UpdateMaintenanceRequestRequest::rules()` et absent de `MaintenanceRequest::$fillable`.

## Critères d'acceptation

- [x] **AC1** — un test Feature envoie `resolution_report` sur le `PATCH` et obtient une réponse
      **déterministe** : 2xx avec la valeur persistée, ou 422 nommant le champ. **Jamais 500.**
- [x] **AC2** — si la colonne est créée, un test assert la valeur **en base**, pas seulement dans
      la réponse. *Un test qui relit le payload qu'il vient d'envoyer ne prouve pas l'écriture.*
- [x] **AC3** — ablation : retirer la migration (ou remettre le champ dans `$fillable` selon la
      branche retenue) fait rougir AC1.
- [x] **AC4** — le relevé est pris à la **source**, pas au code : `information_schema.columns`
      confirme l'état de la colonne avant et après.

## Hors périmètre

- Les autres champs de la demande de maintenance.

## Notes d'implémentation

Relevé pendant le lot des vagues 50-51, sur un chemin qu'aucun ticket du lot ne visait.

---

## Décision (2026-08-30) — le champ est RETIRÉ, la colonne n'est pas créée

**Modèle et route réellement concernés** (le ticket ne les nommait pas) :
`App\Models\MaintenanceRequest`, `PATCH /api/maintenance-requests/{maintenanceRequest}` →
`MaintenanceRequestController::update()`, validé par
`App\Http\Requests\Api\UpdateMaintenanceRequestRequest`.

**Le 500 a été reproduit AVANT toute correction**, sur la route réelle :

```
PDOException: SQLSTATE[42703]: Undefined column: 7 ERROR:  column "resolution_report"
of relation "maintenance_requests" does not exist
LINE 1: ...aintenance_requests" set "resolution_notes" = $1, "resolutio...
```

### Ce qui a tranché — quatre mesures, pas une intention

1. **`docs/models-spec.md` ne déclare que `resolution_notes`** (`text`, nullable). Le champ
   `resolution_report` n'y figure nulle part : la source de vérité data ne le connaît pas.
2. **`MaintenanceRequestResource` n'expose que `resolution_notes`.** Même en créant la colonne,
   l'AC1 « 2xx avec la valeur persistée » aurait exigé d'ouvrir aussi le contrat de sortie —
   c'est-à-dire d'inventer une fonctionnalité que personne n'a demandée.
3. **Le front ne l'envoie jamais.** `grep -rn "resolution_report" takussan-web/src/` → 0.
   `resolution_notes` y vit à 12 endroits (`types/maintenance.ts`, `MaintenanceCompleteForm`,
   `MaintenanceDetail`, `lib/queries`, `lib/schemas`, les trois catalogues i18n).
4. **L'origine est une passe de scaffolding, pas une décision.** `git log -S` remonte à
   `74c507bb` (*« feat: add … maintenance resolution fields »*), qui ajoute le champ à `$fillable`
   et à la validation **sans migration** — et qui, dans le **même commit**, crée
   `docs/backend-gap-report.md` où le champ est listé comme un **manque P1 non implémenté** :
   *« pas de champ structuré `resolution_report` ou collection media dédiée pour le rapport »*.
   Le commit documentait donc son propre trou en le laissant ouvert.

**Motif de la décision, en une phrase :** créer la colonne aurait été laisser un commit de
scaffolding décider du schéma, sur un champ dont `docs/backend-gap-report.md` (ligne 319) décrit
encore la forme comme non tranchée — texte libre ? structure ? collection média ? Le rapport
d'intervention est déjà porté par `resolution_notes` (`text`) et la collection média
`completion_photos`. Le besoin d'un rapport **structuré** reste un vrai manque produit ; il se
tranchera dans un ticket qui décide sa forme, pas dans une correction de 500.

### La forme retenue, et pourquoi ce n'est pas un simple retrait de règle

Le champ n'est pas seulement retiré : il est **`prohibited`**.

Un retrait pur des règles aurait rendu **200 en avalant la valeur en silence** — pour le
gestionnaire qui joint son rapport, c'est aussi trompeur que le 500, et l'AC1 le refuse au même
titre. `prohibited` rend un **422 qui NOMME le champ**. Même geste que `RenewLeaseRequest`, seul
précédent du dépôt pour « refuser fort plutôt qu'ignorer ».

⚠ `prohibited` laisse passer une valeur **vide** (`null`, `""`) : envoyer « rien » n'est pas
demander une écriture, et un corps généré côté client qui porte la clé à `null` n'a pas à être
refusé.

### Relevé `information_schema` — pris à la source, avant et après

```bash
docker compose exec -T postgres psql -U takussan -d takussan -c \
  "SELECT column_name, data_type, is_nullable FROM information_schema.columns \
   WHERE table_name='maintenance_requests' AND column_name LIKE 'resolution%';"
```

| | AVANT (2026-08-30) | APRÈS (2026-08-30) |
|---|---|---|
| `resolution_notes` | `text`, nullable | `text`, nullable |
| `resolution_report` | **absent** | **absent — inchangé, c'est la décision** |

Le schéma ne bouge pas : **aucune migration n'est produite par ce ticket.** Le relevé est aussi
épinglé en test (`test_information_schema_confirms_the_column_state`), pour qu'une réapparition de
la colonne soit un choix explicite et non un effet de bord.

### Ablation (AC3) — et ce qu'elle a appris

Les deux moitiés du correctif ont été ablatées **séparément**, modification prouvée par `md5`
avant chaque lecture de résultat, restauration par `cp` depuis le scratchpad prouvée par `md5`.

| Ablation | md5 avant → après | Résultat |
|---|---|---|
| **A** — règle rendue à `['sometimes','nullable','string']` | `e3a0dcfa…` → `1b05ce26…` | **2 rouges** (AC1) ✅ |
| **B** — `resolution_report` rendu à `$fillable` | `c4512697…` → `c04ad891…` | **5 verts** ❌ |
| **C** — les deux (= état d'origine) | — | **2 rouges, 500 `42703`** ✅ |

⚠ **L'ablation B est restée verte, et c'est un résultat, pas un raté.** `prohibited` court-circuite
avant `fill()` : le retrait de `$fillable` n'est **pas observable par la route**. Les deux moitiés
ne se gardent donc pas l'une l'autre — et sans témoin propre, tout autre chemin d'écriture en masse
(service, factory, FormRequest futur) aurait ressuscité le 500 sans qu'un test ne bouge.

D'où `test_the_model_refuses_to_mass_assign_the_ghost_field`, qui s'éprouve au niveau du **modèle**,
seule couche où `$fillable` s'observe. Ablation B rejouée avec ce test présent : **1 rouge** ✅.

### Fichiers touchés

- `takussan-api/app/Models/MaintenanceRequest.php` — `resolution_report` retiré de `$fillable`,
  docblock qui dit pourquoi il ne doit pas y revenir sans migration.
- `takussan-api/app/Http/Requests/Api/UpdateMaintenanceRequestRequest.php` — règle passée à
  `['prohibited']`, docblock portant la décision.
- `takussan-api/tests/Feature/Api/MaintenanceResolutionReportTest.php` — **neuf**, 5 tests.
- `takussan-api/tests/Feature/Api/MaintenancePrincipalFieldsTest.php` — docblock de TCK-445 mis à
  jour : il annonçait le défaut comme ouvert.

Aucune migration, aucune factory : le schéma est inchangé.

### Vérification

```
php artisan test tests/Feature/Api/MaintenanceResolutionReportTest.php \
  tests/Feature/Api/MaintenancePrincipalFieldsTest.php \
  tests/Feature/Api/Maintenance{Assignment,Completion,History,Report,Request,Status}Test.php
→ Tests: 45 passed (98 assertions)
./vendor/bin/pint <les 4 fichiers> → passed
```

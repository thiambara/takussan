---
id: TCK-378
title: "`forbidden()` — trois pages que TCK-167 n'a pas pu voir, et le cliquet qui manquait pour qu'il le voie"
status: done
phase: P1
family: bug
estimate: S
wave: 48
created: 2026-08-26
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#16-crm--relation-client
tags: [front, dashboard, rbac, nextjs, bug, garde-ci]
---

## Objectif utilisateur

Un utilisateur qui atteint une page `/app/*` réservée à un autre rôle retombe sur son tableau de
bord — il ne reçoit pas un écran d'erreur générique qui lui laisse croire à une panne.

## Contexte

**Ce ticket ne rejoue pas TCK-167 : il corrige la raison pour laquelle TCK-167 est `done` alors
que le défaut est de retour.**

TCK-167 (wave 19, `done` le 2026-05-05) a retiré `forbidden()` de six pages, créé
`assertCanReachAgentArea` dans `src/lib/auth/guards.ts`, et posé en AC3 que
`experimental.authInterrupts` **ne serait pas** activé. Les trois points tiennent encore :
`next.config.ts` ne porte pas le drapeau, et le helper existe.

Ce qui n'a pas tenu, c'est que rien ne rejoue l'AC. Le quatrième point du delta de TCK-167 — un
test e2e parcourant les six routes — n'a jamais été fait ; ses propres notes d'implémentation le
disent : *« E2e test non ajouté : pas de setup Playwright dans le repo. »* Trois pages écrites
**après** ont donc réintroduit l'appel, chacune de bonne foi :

| Page | Ticket d'origine | Appel |
|---|---|---|
| `src/app/(dashboard)/app/customers/new/page.tsx` | TCK-042 | l. 24 |
| `src/app/(dashboard)/app/crm/pipeline/page.tsx` | TCK-083 | l. 20 |
| `src/app/(dashboard)/app/leases/onboarding-pending/page.tsx` | TCK-266 | l. 34 |

Mesure du 2026-08-26, à la source plutôt qu'au raisonnement —
`node_modules/next/dist/client/components/forbidden.js` :

```js
function forbidden() {
    if (!process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS) {
        throw new Error('`forbidden()` is experimental and only allowed to be enabled when
                         `experimental.authInterrupts` is enabled.')   // __NEXT_ERROR_CODE: E488
    }
```

et `node_modules/next/dist/build/define-env.js:169` :
`'process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS': !!config.experimental.authInterrupts`.

Le drapeau étant absent, l'appel lève `E488`. La frontière `(dashboard)/error.tsx` l'attrape et
affiche son message **générique** — délibérément générique, son propre docblock explique
pourquoi. L'utilisateur non autorisé reçoit donc « une erreur est survenue » et un bouton
« réessayer » qui relèvera la même erreur.

Le docblock de `leases/onboarding-pending/page.tsx` affirme quant à lui : *« Les autres tombent
en 403 via `forbidden()` »*. C'est faux, et c'est le genre de faux qui coûte : le prochain
lecteur croira la garde bonne.

*Un `done` mesuré une fois redevient faux sans que personne le voie — sauf si une garde le
remesure.* C'est la même leçon que TCK-372 a tirée de TCK-244.

## Contrat de données

Aucune donnée nouvelle, aucun endpoint. Les trois pages lisent déjà l'utilisateur courant via
`getMeAction()`.

## Direction UX / Artistique

Un refus n'est pas une panne, et les deux ne doivent pas se ressembler. La destination du refus
est le tableau de bord de l'utilisateur — un écran qui marche — et non un écran d'erreur.

## Contraintes strictes (métier)

- **`experimental.authInterrupts` reste désactivé.** C'est l'AC3 de TCK-167, reconduite : le
  correctif passe par la redirection, pas par l'activation d'un drapeau expérimental.
- Le refus reste **côté serveur**, avant tout rendu : aucun flash de contenu privé.
- `assertCanReachAgentArea` couvre le trio agent/bailleur/admin. `crm/pipeline` et
  `customers/new` portent exactement cette condition ; `leases/onboarding-pending` porte
  agent/admin **sans** bailleur — ne pas l'élargir en la factorisant, la table de vérité du menu
  et celle de l'API font foi.
- La garde à écrire doit être **prouvée capable d'échouer**, pas seulement de passer.

## Delta à produire

- [x] Remplacer les trois `forbidden()` par la redirection serveur, en réutilisant
      `src/lib/auth/guards.ts` — et en y ajoutant la garde agent/admin dont
      `leases/onboarding-pending` a besoin plutôt qu'en élargissant l'existante
- [x] Corriger le docblock de `leases/onboarding-pending/page.tsx`, qui décrit un 403 qui
      n'arrive pas
- [x] Garde `scripts/check-auth-interrupts.mjs` : refuse tout import ou appel de `forbidden()` /
      `unauthorized()` sous `takussan-web/src` **tant que** `experimental.authInterrupts` est
      absent de `next.config.ts` — et refuse l'inverse aussi (le drapeau activé sans fichier
      `forbidden.tsx` de frontière). En-tête portant le motif, la mesure du 2026-08-26 et le
      renvoi à TCK-167
- [x] Branchement de la garde dans `.github/workflows/repo-ci.yml`
- [x] Tests : les trois pages, en rôle non autorisé, redirigent

## Critères d'acceptation

- [x] AC1 — `grep -rn "forbidden()" takussan-web/src` ne renvoie plus aucun appel (le mot peut
      subsister dans un commentaire ou dans la garde elle-même)
- [x] AC2 — un `customer` authentifié atteignant `/app/customers/new`, `/app/crm/pipeline` et
      `/app/leases/onboarding-pending` est redirigé vers `/app` ; aucun des trois ne rend la
      frontière d'erreur du tableau de bord
- [x] AC3 — un `agent` continue d'accéder aux trois pages ; un `owner` accède aux deux premières
      et **pas** à la troisième, comme aujourd'hui
- [x] AC4 — `next.config.ts` n'introduit pas `experimental.authInterrupts`
- [x] AC5 — `node scripts/check-auth-interrupts.mjs` sort en 0 sur le dépôt propre et **sort en
      échec** quand on réintroduit volontairement `forbidden()` dans une page (vérification par
      ablation)
- [x] AC6 — la garde est rejouée par `repo-ci.yml`
- [ ] AC7 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent
      *Non cochée : `npm run lint` (0 erreur, 36 avertissements préexistants), `npx tsc --noEmit`
      (exit 0), `npx vitest run 'src/app/(dashboard)' src/lib/auth` (20 fichiers, 120/120),
      `php artisan test tests/Feature/Tenant/TenantOnboardingChecklistTest.php` (20 tests,
      46 assertions) et `./vendor/bin/pint --test` (dépôt entier) sont exécutés et verts sur
      l'arbre fusionné le 2026-08-27. `npm run test` et `php artisan test` **en entier** n'ont pas
      tourné : ils appartiennent à la session déléguante (CLAUDE.md, « qui lance quoi »).*

## Hors périmètre

- Introduire un écran 403 dédié : la décision de TCK-167 était la redirection, elle n'est pas
  rouverte ici.
- Le harnais e2e que TCK-167 n'a pas pu poser : la garde statique le remplace pour **cette**
  propriété, elle ne le remplace pas en général.
- Les autres gardes d'accès de `/app`.

## Notes d'implémentation

**Ce que la re-mesure a confirmé, et le seul point qui différait.** Les trois pages portaient bien
l'appel, `next.config.ts` ne porte pas le drapeau, et `assertCanReachAgentArea` existe. Le mécanisme
a été vérifié **par exécution** du module installé, et pas seulement par lecture :

```
$ node -e "const {forbidden}=require('next/dist/client/components/forbidden'); …"
  sans le drapeau : E488  « `forbidden()` is experimental… »
  avec le drapeau : E1019, digest NEXT_HTTP_ERROR_FALLBACK;403
```

Seul écart : `leases/onboarding-pending` appelle `forbidden()` **l. 31**, pas 34 — l'import est
l. 9. Rien d'autre du ticket n'a bougé.

**Deux gardes, pas une élargie.** `assertCanReachAgencyStaffArea` (agent/admin, bailleur exclu) a
été ajoutée à côté de `assertCanReachAgentArea` (agent/owner/admin), conformément à la contrainte.
Le docblock de chacune dit *pourquoi* le périmètre est ce qu'il est, faute de quoi la prochaine
factorisation les réunira.

**La garde a été mise à l'épreuve dans les deux sens, et c'est ce qui l'a faite.**

- 17 mutations *du dépôt* (réintroduction canonique, alias, import multiligne, `import * as`,
  crochets, `import()` dynamique, réexport par un module tiers, référence sans appel, espace avant
  la parenthèse, drapeau activé, 22ᵉ refus artisanal, entrée périmée, répertoire exclu…) : toutes
  attrapées. Deux formes légitimes (mot en commentaire, mot en chaîne) restent vertes.
- 21 mutations *de la garde elle-même* : toutes attrapées. **Trois trous réels ont été trouvés là,
  pas ailleurs**, et corrigés :
  1. `constats.length > 0` ne distinguait pas quel détecteur avait parlé — l'épreuve « alias »
     restait verte alors que la détection de l'appel aliasé était morte, masquée par celle de
     l'import. Les épreuves comparent désormais l'ensemble des **genres**.
  2. Vider `SENTINELLES` rendait la garde muette sans la rendre rouge (un filtre sur liste vide
     est vide). D'où `PLANCHERS`.
  3. Un `if (false)` sur une condition de verdict passait inaperçu. Les quatre décisions sont
     devenues des **fonctions pures** jouées sur des entrées synthétiques à chaque invocation.
- Le test rejoue les trois pages **par exécution**, sept rôles chacune. Vérifié par ablation : en
  restaurant `forbidden()`, 4 à 5 cas rougissent par page. La première version du cas « jamais
  E488 » était **toothless** — le mock de `next/navigation` ne fournissait pas `forbidden`, donc
  l'ancienne page mourait sur « forbidden is not a function » et le critère restait vert. Le mock
  lève maintenant l'erreur réelle, et l'assertion porte sur le `digest`.

**Le cliquet D est un inventaire nommé, pas un nombre** : 21 écrans de `(dashboard)` refusent sur
le rôle sans passer par `guards.ts` (24 avant ce ticket). Un de plus est rouge ; une entrée devenue
fausse est rouge aussi, avec « retirez la ligne ». `PLAFOND_MESURE` redit le compte à part, pour
qu'on ne puisse pas remonter le plafond en une ligne discrète.

**Limites écrites en tête du script** : un nom calculé (`nav['for'+'bidden']()`) échappe ; un champ
d'API qui s'appellerait `forbidden` produirait un faux positif ; et aucun script ne se prémunit de
l'amputation de son propre appel de verdict.

### Revue adverse et correctif final (2026-08-27)

**Verdict : ACCEPTÉ SOUS RÉSERVE.** Le constat du ticket est reproduit par exécution, le
remplacement refuse vraiment (serveur, avant tout rendu, cible atteignable, pas de boucle, pas de
frontière d'erreur) et **les 7 AC ont été vérifiés par exécution**, y compris l'ablation qui
restaure `forbidden()` (garde exit 1 **et** 4 tests rouges). La réserve portait entièrement sur la
GARDE, plus faible que le rapport ne l'affirmait : **7 mutations échappées sur 12**, dont trois qui
éteignent un contrôle entier en silence. Toutes sont fermées.

| Défaut mesuré par la revue | Ce qui a été fait |
|---|---|
| `drapeauActif()` — le contrôle qui rejoue AC4 — n'était traversé par **aucune** épreuve. `authInterrupts` → `authInterruptsZZZ` dans sa regex : garde **exit 0 silencieux**, drapeau réellement actif compris. `next.config.ts` → `next.config.mjs` : exit 0 aussi. | La fonction devient **pure** (prend sa source en argument), la lecture disque est isolée et échoue bruyamment si le fichier manque. 9 `EPREUVES_CONFIG` + un aller-retour sur la config réelle. Les deux mutations sortent maintenant en **1**. |
| Le périmètre n'était gardé que par 4 sentinelles, toutes dans deux répertoires : exclure `components` faisait passer le parcours de **1110 à 517 fichiers** (53 % du dépôt) — exit 0, et un `forbidden()` réellement ajouté dans `PipelineKanban.tsx` passait. | Le périmètre est **recoupé par `git ls-files`** — une énumération qui n'emprunte aucun code du script — plus deux planchers dont un dérivé. Les deux exclusions sortent en **1**, en nommant les 593 et 32 fichiers absents. |
| `analysees === tous.length` ne fermait la forme `if (…) continue;` qu'**au-dessus** du compteur : la même exemption placée une ligne plus bas sortait en 0. | Le compteur devient un ENSEMBLE et son marquage est la **dernière** instruction du corps de boucle. Mutation → exit 1. |
| Le cliquet D ne comptait un écran que s'il **importait** `@/lib/roles` : un 22ᵉ écran refusant par `user.roles.includes('agency_admin')` en ligne existait **déjà** dans le dépôt (`settings/agency/upgrade/page.tsx:34-38`) et lui était invisible ; un fichier important `guards.ts` était blanchi en entier. | Renversement : ce n'est plus l'import qui compte, c'est la **décision écrite dans le fichier**. Les prédicats sont **lus** dans `src/lib/roles.ts` sous plancher, pas recopiés. Inventaire porté de 21 à **22**, le 22ᵉ nommé avec son motif. Contrôle négatif : un écran qui délègue tout reste vert — aucun faux positif. |
| `customers/page.tsx:81` — le merge de TCK-379 avait **réintroduit** un commentaire affirmant « la page cible garde son `forbidden()` » à propos de `/app/crm/pipeline`, dont ce ticket a précisément retiré l'appel. *Le lot recréait, deux commits plus tard, le docblock menteur qui lui sert de motif d'ouverture.* | Ligne corrigée. ⚠ Aucune garde de ce dépôt ne peut attraper cette forme : les commentaires sont neutralisés à dessein (AC1 les autorise). |

### Un écart d'isolation trouvé ici, et tranché du côté de l'API

Le docblock d'`assertCanReachAgencyStaffArea` affirmait que « la table de vérité du menu **et celle
de l'API** » tiennent le bailleur à l'écart. **Mesuré par exécution** (test PHPUnit sur PostgreSQL) :
un `User` porteur d'un `OwnerProfile` sur l'agence obtenait **200** sur
`GET /api/agencies/{agency}/tenant-onboarding-pending` et **une ligne** de la file interne. La
moitié « menu » était vraie, la moitié « API » fausse — *dans le fichier même qui porte le
correctif, et c'est la classe de défaut que ce ticket existe pour supprimer.*

**L'API a été resserrée plutôt que le docblock affaibli**, parce que trois écrits concordants
disaient déjà « personnel d'agence » et que c'est le code qui divergeait : `docs/features.md:150`
(onboarding résident = locataire + agent, jamais bailleur), `routes/api/agencies.php:74-76`
(TCK-266) et TCK-266 lui-même. `TenantOnboardingPendingController::index` perd `isOwnerAt()` : la
table est désormais **exactement** celle du front des deux côtés. Mesuré rouge avant (200 ≠ 403),
vert après (4/4, puis 20/20 sur le fichier).

⚠ **Un test existant était faux et le dit maintenant** : il construisait son « membre » par
`User::factory()->create(['agency_id' => …])`, ce que le pont de compatibilité TCK-142 traduit en
**`OwnerProfile`** — le test vert éprouvait donc un bailleur sous le nom de « member », et c'est
lui qui tenait l'écart en place. Converti en `->withAgentProfile($agency)`.

### Reste ouvert

- Les 22 écrans de `REFUS_ARTISANAL` ne sont pas convertis aux gardes partagées — hors périmètre
  explicite de ce ticket (« il ne les convertit pas, il en interdit le suivant »). Le 22ᵉ,
  découvert ici, est nommé dans l'inventaire.
- L'**amputation** du flot principal de la garde (retirer une ligne `echecs.push(…)`) reste hors
  de portée par construction, et c'est écrit dans le § LES LIMITES : *aucun script ne se prémunit
  de sa propre amputation.* C'est la revue qui garde ça.
- Un répertoire exclu dont les fichiers ne sont pas suivis par git échappe au recoupement,
  délibérément : l'inverse ferait rougir la garde sur tout arbre en cours d'édition, donc la ferait
  désarmer.

# TCK-2479 — La bande « À traiter » et le groupe « Démarrer » : plan d'implémentation

> **Pour les agents :** sous-compétence requise — `superpowers:subagent-driven-development` (recommandé)
> ou `superpowers:executing-plans`, tâche par tâche. Les étapes se cochent (`- [ ]`).
>
> ⚠ **Ne démarre qu'une fois TCK-2478 mergé sur `dev`** (règle 2 du backlog : `depends_on: [TCK-2478]`).
> Branche à tirer de `dev` à jour : `feat/a-traiter-et-demarrer-tck-2479`.
>
> ⚠ **Les arbitrages ci-dessous sont des RECOMMANDATIONS du planificateur**, à valider par la session
> avant l'exécution. Un arbitrage refusé change la tâche qu'il cite, et elle seule.

**But :** ce qui attend une réponse (messages, visites, demandes, files de modération) se lit d'un coup
d'œil dans une bande de pastilles au-dessus du menu, chaque pastille ouvrant sa page déjà filtrée, sans
qu'aucune entrée du menu ne bouge ; et un espace neuf (admin d'agence, hôte, bailleur) voit un groupe
« Démarrer » de trois étapes au plus, chacune un lien, qui disparaît étape par étape.

**Architecture :** la priorité des pastilles et le mode de « Démarrer » deviennent deux champs de la
disposition du persona (`priorites`, `demarrer`), que `composerMenu` rend avec le menu. Les pastilles
se dérivent par une fonction pure (`pastillesATraiter`) des entrées du menu RENDUES (donc des seuls
compteurs déjà sondés, `countersToPoll`) ; la page filtrée de chaque compteur est un champ du catalogue
(`hrefATraiter`), et une garde vérifie que la page LIT chacun de ses paramètres. « Démarrer » lit un
endpoint neuf, `GET /api/me/espace/demarrage`, jugé sur le profil actif, qui compose la mise en service
d'agence existante (`AgencySetupStatus`, TCK-589) sans en réécrire aucune règle.

**Pile :** Laravel 13 / PHP 8.4 (API) ; Next.js 16, React 19, TypeScript 5, vitest 4 + Testing Library,
next-intl, TanStack Query, lucide-react (front).

**Références :** [ADR-0089](../adr/0089-le-menu-de-app-se-derive-du-profil-actif.md) §1 et §5 ·
[TCK-2479](../backlog/tickets/doing/TCK-2479-bande-a-traiter-et-demarrer.md) ·
plan précédent : [TCK-2478](2026-11-05-tck-2478-dispositions-par-persona.md) ·
[ADR-0064](../adr/0064-l-administration-d-agence-vit-dans-app.md) §3 (la carte « Mise en service »).

## Contraintes globales

- **Aucune entrée du menu ne change de place selon un compteur** (ADR-0089 §5). La bande est HORS du
  `<nav>` ; l'ordre des entrées ne lit jamais un compteur.
- **Aucun compteur neuf, aucune requête de compteur neuve.** La bande lit le MÊME objet `counters`
  qu'`AppSidebar` calcule déjà, mêmes clés de cache, même cadence ; un compteur n'est sondé que si son
  entrée est rendue et non cadenassée (`countersToPoll`, TCK-377).
- **0 vaut « rien à traiter »** : ni bande pendant le chargement, ni pastille pour un compteur en
  erreur — et jamais de nœud vide dans le DOM.
- Bande : `<section aria-label="À traiter">` (rôle `region`) ; chaque pastille a un nom accessible
  complet qui CONTIENT son texte visible (WCAG 2.5.3) ; la couleur primaire reste à l'action principale.
- Quatre pastilles au plus, puis « +N » (bouton de divulgation).
- « Démarrer » : jamais dans un espace suspendu ; son masquage n'est PAS persistant avant TCK-2480
  (`demarrer_masque`) — écrit dans les notes du ticket.
- Chaque clé i18n neuve en `fr`, `en`, `wo` (le `wo` porte le français tel quel, wolof en pause).
  Aucun texte en dur (pas même `+`).
- `md:` n'est pas le bureau dans `/app` (TCK-505). Pas de `useMemo`/`useCallback` neuf (React
  Compiler). Aucune dépendance neuve. Aucune Radix.
- Tests : les fichiers touchés, jamais une suite entière (cf. `brief-commun.md`). Ablations dans UN
  script écrit avec Write, lancé par `bash fichier.sh`, puis `git diff` vide de toute mutation.
- Commits en français, préfixés, citant `TCK-2479`, terminés par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Relevés (mesurés le 2026-11-05 sur `feat/menu-par-persona-tck-2478`, 0a43db392)

> Re-mesurer avant d'implémenter : le code a pu bouger. Un écart se corrige au plus juste et s'écrit.

### R1 — Les compteurs et ce que leur page lit

| Compteur (`NavCounterKey`) | Requête du compteur | Page | Ce que la page lit dans l'URL | Décision |
|---|---|---|---|---|
| `unreadMessages` | `useNonLusTotal` → `meta.unread_total` (`src/components/chat-widget/useUnreadCount.ts:29-43`) — hors fils en sourdine | `/app/messages` | `?conversation=`, `?property=` seulement (`src/components/messages/MessagesPage.tsx:75-81`). L'API n'a **aucun filtre « non lus »** : `ConversationController::index` ne lit que `archived` (`takussan-api/app/Http/Controllers/Api/ConversationController.php:30`) | **pas de `hrefATraiter`** : la pastille mène à la liste entière (non-lus en gras et badgés, `ConversationList.tsx:139-236`). Écart écrit (A4). |
| `pendingVisits` | `filter[status]=scheduled`, `meta.total`, **sans borne de date** (`src/lib/queries/visits.ts:74-92`) | `/app/visits` | **`?tab=`** déjà lu, borné, défaut `requested` (`src/components/visits/VisitsList.tsx:22,40-43`, TCK-1736) ; l'onglet « Demandées » = `status=scheduled` **et** `scheduled_at_min=maintenant` (`VisitsList.tsx:72-79`) | `hrefATraiter: '/app/visits?tab=requested'`. Écart : une visite `scheduled` passée compte dans la pastille mais se range sous « Passées » (aucune tâche planifiée ne la clôt — `routes/console.php:95` n'envoie que des rappels). Écrit, ticket de suite proposé. |
| `unhandledLeads` | `filter[handled]=0`, `meta.total` (`src/lib/queries/contact-leads.ts:103-121`) | `/app/leads` | **rien** : le filtre est un `useState('todo')` (`src/components/leads/ContactLeadsInbox.tsx:67`) ; seul `?lead=` est lu (`:74`). Le défaut `todo` = `handled=0` = le compteur, au point près. | La page **apprend `?filtre=todo\|handled\|all`** (patron `useVueDansLUrl`, TCK-1732) ; `hrefATraiter: '/app/leads?filtre=todo'` (A5). |
| `reviewModeration` | `GET /api/reviews?per_page=1` → `meta.pending_count` (`src/components/layout/AppSidebar.tsx:386-392`) ; côté API `ReviewModerationScope::pendingCount` : `pending` seul pour l'agence, `pending`+`reported` pour le super-admin, avis modérables seuls (`takussan-api/app/Services/Review/ReviewModerationScope.php:170-178`) | `/app/agency/moderation` | **`filter[moderation_status]`** déjà lu (`src/components/admin/ModerationWorkspace.tsx:52,81`, TCK-376), défaut `''` = tous ; éprouvé par `ModerationWorkspace.test.tsx:306` | `hrefATraiter: '/app/agency/moderation?filter[moderation_status]=pending'`. Écarts : la liste montre aussi les avis SUR l'agence (tranchés par la plateforme, non comptés) ; pour le super-admin, les avis `reported` comptés n'y sont pas (filtre `flagged`). Écrits. |
| `propertyModeration` | `propertyModerationCountQueryOptions` → `meta.total` (`src/lib/queries/agency-queues.ts:151-161`) | `/app/agency/moderation/properties` | `filter[search]` seulement (`PropertyModerationWorkspace.tsx:23`) — mais la page **EST** la file : l'API ne rend que `pending_review` (`takussan-api/app/Http/Controllers/Api/Admin/PropertyModerationController.php:39-41`) | **pas de `hrefATraiter`** : la page entière est « ce qui attend ». |

**Relevé annexe — une clé i18n manquante, bogue existant.** `SidebarItem` nomme le badge par
`t(\`counters.${cle}\`)` (`AppSidebar.tsx:137-138`) ; `nav.sidebar.counters` ne porte que
`unreadMessages` et `pendingVisits` dans les trois fichiers : le badge des demandes (`unhandledLeads`)
a un nom accessible manquant depuis TCK-590. La tâche 4 ajoute la clé.

**Relevé annexe — l'erreur ne remet pas à zéro.** `AppSidebar.tsx:398-407` affirme « une requête en
échec rend `data === undefined` : le compteur vaut 0 ». C'est vrai d'un PREMIER échec seulement : sur
une relecture en échec, react-query GARDE le dernier `data` (`isError: true`). `useUnreadCount` ne lit
pas `isError` non plus (`useUnreadCount.ts:33-42`). Sans correction, l'AC3 serait faux après une
relecture ratée (A7).

### R2 — « Démarrer » : un endpoint existant ?

- **Oui pour l'agence, non pour le bailleur.** `GET /api/agencies/{agency}/setup-status`
  (`takussan-api/routes/api/agencies.php:69`, `AgencySetupStatusController.php:24-30`) rend sept étapes
  lues sur l'état réel (`app/Services/Agency/AgencySetupStatus.php:41-49`), dont les trois du ticket :
  `first_published_property`, `kyc_verified`, `first_member`. Il est autorisé par
  `AgencyPolicy::configure` (`app/Policies/AgencyPolicy.php:67-75`) : **un bailleur reçoit 403**, et
  l'endpoint désigne une agence (le front doit connaître son id). La carte qui le lit
  (`src/components/dashboard/admin/MiseEnService.tsx:31-54`) retire `first_member` d'une agence
  `individual` (TCK-777).
- **Le bailleur** : aucun endpoint d'état. Ses deux faits se lisent sur l'existant : ses biens =
  `Property` par `(user_id, agency_id)` (`app/Http/Controllers/Api/Me/OwnerProfileController.php:152-159`) ;
  ses pièces = `OwnerProfile.metadata.kyc.submitted_at` (`:104-138`, « aucune file ne lit ce dossier »,
  TCK-685). Son écran KYC est l'assistant `/onboarding/owner?owner={id}` (`src/app/onboarding/owner/page.tsx`,
  reprise par `profilAReprendre`, `src/lib/onboarding-reprise.ts`).
- **Décision (A1)** : le contrat PRESCRIPTIF du ticket — `GET /api/me/espace/demarrage`,
  `EspaceDemarrageController`, `EspaceDemarrageTest` —, dont le service COMPOSE `AgencySetupStatus` et
  `AgencyPolicy::configure` au lieu de les recopier.

### R3 — Le profil actif côté front

- `useAuth().activeProfileId` porte le composite `owner:3` (`src/context/AuthContext.tsx:42,116`) :
  c'est de lui que « Démarrer » tire l'id du profil bailleur pour son lien KYC (aucune prop neuve).
- `useSwitchActiveProfile` oublie tout le cache de l'espace au changement de profil
  (`src/hooks/useProfiles.ts:100-104`, `oublierLeCacheDEspace`) : la clé `['me','espace','demarrage']`
  n'a pas besoin de porter le profil.

---

## Arbitrages (validés par la session le 2026-11-05, par délégation du porteur)

1. **Source de « Démarrer » : l'endpoint neuf du ticket**, pas l'existant. `setup-status` refuse le
   bailleur (403), désigne une agence et parle un autre vocabulaire (sept étapes). Le service neuf
   compose `AgencySetupStatus::for()` (trois de ses sept étapes) et `$user->can('configure', $agence)` :
   aucune règle n'est réécrite, et un admin dont le rôle retire `agency.update` n'a pas plus d'étapes
   que de carte.
2. **L'hôte** (agence `individual`) : `premier_bien`, `kyc`, **pas** `equipe` — la règle de la carte
   (TCK-777), portée côté serveur. Lu sous ses DEUX profils (admin ou bailleur actif), comme
   `resoudrePersona` le fusionne.
3. **Le bailleur** : `premier_bien` = un bien à lui dans son agence, **hors brouillon** ; `kyc` = pièces
   ENVOYÉES (`submitted_at`) — il n'existe aucune vérification. Lien KYC : `/onboarding/owner?owner={id}`.
   ⚠ À mesurer au navigateur (tâche 6) : l'assistant sur un profil DÉJÀ actif. S'il échoue (refus de
   `complete`, boucle), retirer `kyc` du bailleur côté API (une ligne) et l'écrire — ne pas livrer un
   lien cassé.
4. **Messages : la liste entière.** Ajouter `?non_lus=1` coûterait un filtre API, un état de liste et
   un compte divergent (la pastille exclut les fils en sourdine, le filtre les inclurait). Écart écrit ;
   ticket de suite proposé.
5. **Demandes : la page apprend `?filtre=`** plutôt que lier la vue par défaut : trois lignes, le patron
   `useVueDansLUrl` déjà suivi par les visites, et la garde a alors un paramètre à éprouver.
6. **`priorites` est une liste blanche ET un ordre.** Un compteur absent de la liste garde son badge
   dans le menu, mais n'est pas « à traiter » pour ce persona. Table :

   | Persona | `priorites` | Pourquoi (une ligne) |
   |---|---|---|
   | `client` | `unreadMessages` | ses visites et réservations attendent l'agence, pas lui : seuls les messages attendent SA réponse |
   | `locataire` | `unreadMessages` | le ticket ; son bail et ses interventions se suivent par messages, aucun compteur ne porte ce qu'il doit faire |
   | `bailleur` | `unreadMessages`, `unhandledLeads`, `pendingVisits` | il traite avec son agence par messages ; les demandes et visites de ses biens passent le plus souvent par elle |
   | `agent` | `unhandledLeads`, `pendingVisits`, `unreadMessages` | le ticket : demandes d'abord — un prospect non rappelé se perd en heures, une visite non confirmée en un jour |
   | `admin-agence` | `unhandledLeads`, `pendingVisits`, `unreadMessages`, `propertyModeration`, `reviewModeration` | le flux commercial d'abord, comme l'agent ; puis les files internes : un bien en attente bloque la publication d'un agent, un avis attend sans coût immédiat |
   | `hote` | `unreadMessages`, `unhandledLeads`, `pendingVisits` | seul, il répond lui-même à ses voyageurs : la conversation en cours avant le prospect |
   | `prestataire` | `unreadMessages` | AC6 : ses interventions n'ont pas de compteur ; la messagerie est son seul « à traiter » |
   | `plateforme` | `propertyModeration`, `reviewModeration`, `unhandledLeads`, `pendingVisits`, `unreadMessages` | la plateforme modère ; le reste est le travail des agences |

7. **Un compteur en erreur vaut 0, dans la bande ET dans le badge du menu** : un seul objet `counters`,
   `isError → 0`. Et `useUnreadCount` rend 0 sur `isError` — ce qui touche aussi la pastille du widget
   flottant (`CorpsDuWidget.tsx:71`) : elle disparaît après une relecture ratée jusqu'à la suivante
   (30 s), au lieu d'afficher un compte qu'on ne sait plus vrai. Cohérent avec « 0 pendant le
   chargement » du même hook.
8. **Placement.** La bande : hors du `<nav>`, entre l'action principale et le menu (ticket). « Démarrer » :
   **premier bloc DANS le `<nav>`**, avant le premier groupe — il défile avec le menu (au pied, il
   mangeait la hauteur du tiroir : avec la carte « Passer en agence » de l'hôte, ~340 px fixes) et reste
   visible à l'arrivée d'un espace neuf. Comme la bande, il décale le menu une fois, à sa première
   lecture ; il ne réordonne rien.
9. **AC5 « disparaît étape par étape »** : une étape faite SORT du groupe (elle n'est pas barrée comme
   dans la carte du tableau de bord) ; la progression « 1 sur 3 » dit qu'il y en avait.
10. **Masquage** : `useState` local, par instance de la barre (barre fixe et tiroir sont deux
    montages) ; revient au rechargement. TCK-2480 l'enregistrera (`demarrer_masque`).
11. **Relecture de « Démarrer »** : pas de sondage. Le hook relit à chaque navigation si sa lecture a
    plus de 30 s (`refetchQueries({ stale: true })`) : une étape faite sur sa page disparaît au retour.
12. **« +N »** est un bouton de divulgation (`aria-expanded`) qui montre les pastilles restantes sur
    place — pas un lien (il n'a pas de destination unique).
13. **Recouvrement assumé** : l'admin voit « Démarrer » (trois étapes) au menu ET la carte « Mise en
    service » (sept) sur `/app/overview/agency`. Les deux lisent l'état réel ; aucune ne se contredit.

---

## AC → preuve

| AC | Tâche | Test | Ablation |
|---|---|---|---|
| AC1 — deux pastilles dans l'ordre de l'agent ; à zéro, ni bande ni nœud | 3, 4 | `a-traiter.test.ts` (ordre) ; `AppSidebar.test.tsx` « TCK-2479 — AC1 » (monté) | T3-1 (ordre du menu au lieu des priorités) ; T4-3 (bande rendue vide) |
| AC2 — même jeu d'`href` avec ou sans compteurs | 4 | `AppSidebar.test.tsx` « AC2 », huit personas | T4-1 (tri des entrées par charge) |
| AC3 — compteur en échec : pas de pastille | 4 | `AppSidebar.test.tsx` « AC3 » ; `useUnreadCount.test.tsx` | T4-2 (`isError` ignoré) |
| AC4 — pastille → page filtrée qui affiche ce qui attend | 2 | `a-traiter-lu-par-sa-page.test.ts` (garde) ; `ContactLeadsInbox.test.tsx` (`?filtre=`) ; `VisitsList.url.tck-1736.test.tsx` et `ModerationWorkspace.test.tsx` (existants) | T2-1 (`?statut=` ignoré) ; T2-2 (la boîte ignore `?filtre=`) |
| AC5 — « Démarrer » étape par étape, puis en entier | 1, 5 | `EspaceDemarrageTest.php` ; `demarrer.test.ts` ; `DemarrerDeLEspace.test.tsx` | T1-1..4 ; T5-1, T5-2 |
| AC6 — prestataire : une pastille au plus | 3, 4 | `a-traiter.test.ts` ; `AppSidebar.test.tsx` « AC6 » | T4-4 (priorités du prestataire élargies) |

## Carte des fichiers

| Fichier | Rôle | Tâche |
|---|---|---|
| Créer `takussan-api/app/Services/Onboarding/DemarrageDeLEspace.php` | les étapes du profil actif | 1 |
| Créer `takussan-api/app/Http/Controllers/Api/Me/EspaceDemarrageController.php` | `GET /api/me/espace/demarrage` | 1 |
| Modifier `takussan-api/routes/api/me.php` | la route | 1 |
| Créer `takussan-api/tests/Feature/Api/Me/EspaceDemarrageTest.php` | | 1 |
| Créer `takussan-web/src/components/visits/onglet-des-visites.ts` | lecteur pur de `?tab=` | 2 |
| Modifier `takussan-web/src/components/visits/VisitsList.tsx` | l'appelle | 2 |
| Créer `takussan-web/src/components/leads/filtre-des-demandes.ts` | lecteur pur de `?filtre=` | 2 |
| Modifier `takussan-web/src/components/leads/ContactLeadsInbox.tsx` | le filtre dans l'URL | 2 |
| Créer `takussan-web/src/components/admin/statut-de-la-file.ts` | lecteur pur de `filter[moderation_status]` | 2 |
| Modifier `takussan-web/src/components/admin/ModerationWorkspace.tsx` | l'appelle | 2 |
| Modifier `takussan-web/src/lib/navigation/catalogue.ts` | `hrefATraiter` | 2 |
| Créer `takussan-web/src/lib/navigation/__tests__/a-traiter-lu-par-sa-page.test.ts` | la garde | 2 |
| Créer `takussan-web/src/lib/navigation/demarrer.ts` | `ModeDemarrer`, `etapesARendre` | 3 |
| Créer `takussan-web/src/lib/navigation/a-traiter.ts` | `pastillesATraiter` | 3 |
| Modifier `takussan-web/src/lib/navigation/dispositions.ts` | `priorites`, `demarrer` | 3 |
| Modifier `takussan-web/src/lib/navigation/composer-menu.ts` | `MenuCompose.priorites/demarrer`, `EntreeComposee.hrefATraiter` | 3 |
| Créer `takussan-web/src/components/layout/styles-de-la-barre.ts` | `FOCUS_RING`, `STYLE_TITRE` partagés | 4 |
| Créer `takussan-web/src/components/layout/BandeATraiter.tsx` | la bande | 4 |
| Modifier `takussan-web/src/components/layout/AppSidebar.tsx` | compteurs `isError`, bande, « Démarrer » | 4, 5 |
| Modifier `takussan-web/src/components/chat-widget/useUnreadCount.ts` | `isError → 0` | 4 |
| Créer `takussan-web/src/lib/queries/demarrage-espace.ts` | `useDemarrageDeLEspace` | 5 |
| Créer `takussan-web/src/components/layout/DemarrerDeLEspace.tsx` | le groupe | 5 |
| Modifier `takussan-web/src/messages/{fr,en,wo}.json` | libellés | 4, 5 |

**Ordre :** la tâche 1 (API) est indépendante — un agent à part peut la mener pendant les tâches 2 à 5,
qui sont SÉQUENTIELLES (mêmes fichiers : catalogue, composer-menu, `AppSidebar.tsx`, `messages/*.json`).
Le front ne dépend de l'API que par le contrat, moqué dans ses tests.

---

### Tâche 1 (API) : `GET /api/me/espace/demarrage`

**Fichiers :** voir la carte. Lire d'abord `takussan-api/CLAUDE.md` (« Réponse JSON », « Autorisation »,
« Profil actif », « Tests »).

**Interfaces :**
- Produit : `GET /api/me/espace/demarrage` (auth sanctum, nom `me.espace.demarrage`) →
  `200 { "data": { "etapes": [ { "code": "premier_bien"|"kyc"|"equipe", "faite": bool } ] } }`, toujours
  200, `etapes: []` pour tout profil sans étape. L'ordre est celui du groupe : `premier_bien`, `kyc`,
  `equipe`.

- [ ] **Étape 1 : écrire le test qui échoue** — `tests/Feature/Api/Me/EspaceDemarrageTest.php` :

```php
<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2479 (ADR-0089 §5) — `GET /api/me/espace/demarrage` : les étapes du groupe « Démarrer » du
 * menu de `/app`, jugées sur le PROFIL ACTIF.
 *
 * Agence neuve, agence en service, hôte, bailleur ; et tout profil sans étape (agent, compte sans
 * profil, admin dont le rôle retire `agency.update`) → 200 et `etapes: []` : le groupe ne s'affiche
 * pas, ce n'est pas une erreur.
 *
 * Rouge avant TCK-2479 : la route n'existait pas (404).
 */
class EspaceDemarrageTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const URL = '/api/me/espace/demarrage';

    private const CODES_D_AGENCE = ['premier_bien', 'kyc', 'equipe'];

    public function test_une_agence_neuve_rend_ses_trois_etapes_a_faire(): void
    {
        [, $entete] = $this->adminDUneAgence();

        $this->apiGet(self::URL, $entete)->assertOk()->assertExactJson(['data' => ['etapes' => [
            ['code' => 'premier_bien', 'faite' => false],
            ['code' => 'kyc', 'faite' => false],
            ['code' => 'equipe', 'faite' => false],
        ]]]);
    }

    /** @return array<string, array{0: string}> */
    public static function codesDAgence(): array
    {
        return array_combine(self::CODES_D_AGENCE, array_map(fn (string $c) => [$c], self::CODES_D_AGENCE));
    }

    /** Chaque fait de la mise en service (TCK-589) fait passer SON étape, et elle seule. */
    #[DataProvider('codesDAgence')]
    public function test_chaque_fait_de_l_agence_fait_passer_sa_seule_etape(string $code): void
    {
        [$agence, $entete] = $this->adminDUneAgence();
        $this->poser($code, $agence);

        $this->assertSame(
            array_map(fn (string $c) => ['code' => $c, 'faite' => $c === $code], self::CODES_D_AGENCE),
            $this->apiGet(self::URL, $entete)->assertOk()->json('data.etapes'),
        );
    }

    public function test_une_agence_en_service_rend_ses_trois_etapes_faites(): void
    {
        [$agence, $entete] = $this->adminDUneAgence();
        foreach (self::CODES_D_AGENCE as $code) {
            $this->poser($code, $agence);
        }

        $this->apiGet(self::URL, $entete)->assertOk()->assertExactJson(['data' => ['etapes' => [
            ['code' => 'premier_bien', 'faite' => true],
            ['code' => 'kyc', 'faite' => true],
            ['code' => 'equipe', 'faite' => true],
        ]]]);
    }

    /** L'hôte n'a pas d'équipe (TCK-777), et lit les mêmes étapes sous ses DEUX profils. */
    public function test_l_hote_lit_les_etapes_de_son_agence_sans_equipe_sous_ses_deux_profils(): void
    {
        $agence = Agency::factory()->individual()->create();
        $hote = $this->apiActingAsRole('agency_admin', ['agency' => $agence]);
        $this->materializeRoleProfile($hote, 'owner', $agence);
        $attendu = ['data' => ['etapes' => [
            ['code' => 'premier_bien', 'faite' => false],
            ['code' => 'kyc', 'faite' => false],
        ]]];

        $this->apiGet(self::URL, $this->entete('agency_admin', $this->idDuProfil(AgencyAdminProfile::class, $hote)))
            ->assertOk()->assertExactJson($attendu);
        $this->apiGet(self::URL, $this->entete('owner', $this->idDuProfil(OwnerProfile::class, $hote)))
            ->assertOk()->assertExactJson($attendu);
    }

    public function test_le_bailleur_rend_son_premier_bien_et_ses_pieces(): void
    {
        $agence = Agency::factory()->create();
        $bailleur = $this->apiActingAsRole('owner', ['agency' => $agence]);
        $profil = OwnerProfile::query()->where('user_id', $bailleur->id)->firstOrFail();
        $entete = $this->entete('owner', $profil->id);

        $this->apiGet(self::URL, $entete)->assertOk()->assertExactJson(['data' => ['etapes' => [
            ['code' => 'premier_bien', 'faite' => false],
            ['code' => 'kyc', 'faite' => false],
        ]]]);

        Property::factory()->draft()->create(['agency_id' => $agence->id, 'user_id' => $bailleur->id]);
        $this->assertFalse($this->etape($entete, 'premier_bien'), 'un brouillon n’est pas un premier bien');

        Property::factory()->published()->create(['agency_id' => $agence->id, 'user_id' => $bailleur->id]);
        $profil->forceFill(['metadata' => ['kyc' => ['submitted_at' => now()->toIso8601String()]]])->save();

        $this->apiGet(self::URL, $entete)->assertOk()->assertExactJson(['data' => ['etapes' => [
            ['code' => 'premier_bien', 'faite' => true],
            ['code' => 'kyc', 'faite' => true],
        ]]]);
    }

    public function test_le_bien_d_un_autre_ou_d_une_autre_agence_ne_compte_pas(): void
    {
        $agence = Agency::factory()->create();
        $bailleur = $this->apiActingAsRole('owner', ['agency' => $agence]);
        $entete = $this->entete('owner', $this->idDuProfil(OwnerProfile::class, $bailleur));
        Property::factory()->published()->create(['agency_id' => $agence->id]);
        Property::factory()->published()->create(['agency_id' => Agency::factory()->create()->id, 'user_id' => $bailleur->id]);

        $this->assertFalse($this->etape($entete, 'premier_bien'));
    }

    public function test_un_agent_n_a_pas_d_etape(): void
    {
        $agent = $this->apiActingAsRole('agent');

        $this->apiGet(self::URL, $this->entete('agent', $this->idDuProfil(AgentProfile::class, $agent)))
            ->assertOk()->assertExactJson(['data' => ['etapes' => []]]);
    }

    public function test_un_compte_sans_profil_n_a_pas_d_etape(): void
    {
        $this->apiActingAsRole('customer');

        $this->apiGet(self::URL)->assertOk()->assertExactJson(['data' => ['etapes' => []]]);
    }

    /** TCK-2024 — la règle de la carte de mise en service : sans `agency.update`, pas d'étape. */
    public function test_un_admin_dont_le_role_retire_agency_update_n_a_pas_d_etape(): void
    {
        $agence = Agency::factory()->create();
        $admin = $this->adminWithout($agence, Capability::AgencyUpdate);
        $this->actingAs($admin, 'sanctum');

        $this->apiGet(self::URL, $this->entete('agency_admin', $this->idDuProfil(AgencyAdminProfile::class, $admin)))
            ->assertOk()->assertExactJson(['data' => ['etapes' => []]]);
    }

    /** @return array{0: Agency, 1: array<string, string>} */
    private function adminDUneAgence(): array
    {
        $agence = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agence]);

        return [$agence, $this->entete('agency_admin', $this->idDuProfil(AgencyAdminProfile::class, $admin))];
    }

    private function poser(string $code, Agency $agence): void
    {
        match ($code) {
            'premier_bien' => Property::factory()->published()->create(['agency_id' => $agence->id, 'is_test' => false]),
            'kyc' => KycDossier::query()->create([
                'subject_type' => Agency::class,
                'subject_id' => $agence->id,
                'status' => KycDossierStatus::Verified,
                'metadata' => [],
            ]),
            'equipe' => AgentProfile::query()->create([
                'user_id' => User::factory()->create()->id,
                'agency_id' => $agence->id,
                'status' => AgentProfileStatus::Active,
            ]),
        };
    }

    /** @param class-string $classe */
    private function idDuProfil(string $classe, User $user): int
    {
        return (int) $classe::query()->where('user_id', $user->id)->value('id');
    }

    /** @return array<string, string> */
    private function entete(string $alias, int $id): array
    {
        return ['X-Profile-Id' => "{$alias}:{$id}"];
    }

    /** @param array<string, string> $entete */
    private function etape(array $entete, string $code): bool
    {
        return (bool) collect($this->apiGet(self::URL, $entete)->assertOk()->json('data.etapes'))
            ->firstWhere('code', $code)['faite'];
    }
}
```

> Si `adminWithout` (`tests/Concerns/CreatesAgencyMembers.php:50`) crée un admin sans 2FA et qu'un
> middleware 2FA répond 403 avant le contrôleur, poser la 2FA sur ce compte (`forceFill`, comme
> `AgencySetupStatusTest:126`) — le test porte sur `agency.update`, pas sur la 2FA. L'écrire.

- [ ] **Étape 2 : lancer, constater l'échec**

Run (dans `takussan-api/`) : `php artisan test tests/Feature/Api/Me/EspaceDemarrageTest.php`
Attendu : FAIL, 404 sur chaque appel.

- [ ] **Étape 3 : le service** — `app/Services/Onboarding/DemarrageDeLEspace.php` :

```php
<?php

namespace App\Services\Onboarding;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\PropertyStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Agency\AgencySetupStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-2479 (ADR-0089 §5) — les étapes du groupe « Démarrer » du menu de `/app`, pour le PROFIL ACTIF.
 *
 * Trois codes, que le front libelle et relie (`takussan-web/src/lib/navigation/demarrer.ts`) :
 * `premier_bien`, `kyc`, `equipe`. Aucune règle n'est réécrite ici :
 *
 *  - L'espace d'une AGENCE — le profil d'admin, ou le profil bailleur de l'hôte (agence `individual`
 *    dont le compte est aussi l'admin, TCK-497) — reprend trois des sept étapes de la mise en service
 *    ({@see AgencySetupStatus}, TCK-589) sous la même autorisation que sa carte
 *    (`AgencyPolicy::configure`, TCK-2024) : un admin à qui son rôle retire `agency.update` n'a pas
 *    plus d'étapes que de carte. Une agence `individual` n'a pas d'équipe : `equipe` n'y paraît pas
 *    (TCK-777, la règle de `MiseEnService.tsx`).
 *  - Le BAILLEUR : un bien à lui dans son agence, hors brouillon (la forme de
 *    `OwnerProfileController::properties`), et ses pièces ENVOYÉES — `metadata.kyc.submitted_at` :
 *    aucune file ne les vérifie (TCK-685).
 *  - Tout autre profil, ou aucun : `[]`. Le groupe ne s'affiche pas ; ce n'est pas une erreur.
 *
 * C'est de l'AFFICHAGE : chaque écran que vise une étape rejuge (cf. `MeCapabilityController`).
 */
class DemarrageDeLEspace
{
    /** Le code du menu → l'étape de mise en service qu'il reprend. L'ordre est celui du groupe. */
    private const ETAPES_D_AGENCE = [
        'premier_bien' => 'first_published_property',
        'kyc' => 'kyc_verified',
        'equipe' => 'first_member',
    ];

    public function __construct(private readonly AgencySetupStatus $miseEnService) {}

    /**
     * @return list<array{code: string, faite: bool}>
     */
    public function pour(User $user, ?Model $profilActif): array
    {
        if ($profilActif instanceof AgencyAdminProfile || $this->estLeBailleurDeLHote($profilActif)) {
            $agence = $profilActif->agency;

            return $agence !== null && $user->can('configure', $agence) ? $this->etapesDeLAgence($agence) : [];
        }

        if ($profilActif instanceof OwnerProfile) {
            return $this->etapesDuBailleur($profilActif);
        }

        return [];
    }

    /**
     * Le profil bailleur d'une agence `individual` dont le compte est aussi l'admin : une seule
     * personne, un seul espace (`resoudrePersona` côté front en fait le persona `hote`).
     */
    private function estLeBailleurDeLHote(?Model $profil): bool
    {
        return $profil instanceof OwnerProfile
            && $profil->agency?->kind === AgencyKind::Individual
            && $profil->user?->isAgencyAdminAt((int) $profil->agency_id) === true;
    }

    /**
     * @return list<array{code: string, faite: bool}>
     */
    private function etapesDeLAgence(Agency $agence): array
    {
        $faites = array_column($this->miseEnService->for($agence)['steps'], 'done', 'key');

        $etapes = [];
        foreach (self::ETAPES_D_AGENCE as $code => $cle) {
            if ($code === 'equipe' && $agence->kind === AgencyKind::Individual) {
                continue;
            }
            $etapes[] = ['code' => $code, 'faite' => (bool) $faites[$cle]];
        }

        return $etapes;
    }

    /**
     * @return list<array{code: string, faite: bool}>
     */
    private function etapesDuBailleur(OwnerProfile $profil): array
    {
        $premierBien = $profil->user_id !== null && Property::query()
            ->where('user_id', $profil->user_id)
            ->when($profil->agency_id !== null, fn (Builder $q) => $q->where('agency_id', $profil->agency_id))
            ->where('status', '!=', PropertyStatus::Draft->value)
            ->exists();

        return [
            ['code' => 'premier_bien', 'faite' => $premierBien],
            ['code' => 'kyc', 'faite' => filled(data_get($profil->metadata, 'kyc.submitted_at'))],
        ];
    }
}
```

- [ ] **Étape 4 : le contrôleur** — `app/Http/Controllers/Api/Me/EspaceDemarrageController.php` :

```php
<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Services\Onboarding\DemarrageDeLEspace;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2479 (ADR-0089 §5) — `GET /api/me/espace/demarrage` → `{ data: { etapes: [{ code, faite }] } }` :
 * les étapes du groupe « Démarrer » du menu, jugées sur le profil actif (`ResolveActiveProfile`).
 *
 * Toujours 200 : un profil sans étape rend `etapes: []`, et le menu n'affiche rien.
 *
 * Distinct de `GET /api/agencies/{agency}/setup-status` (la carte du tableau de bord d'agence : sept
 * étapes, une agence désignée, 403 hors admin) : celui-ci suit l'espace du compte et sert aussi le
 * bailleur. Les deux lisent le même état ({@see DemarrageDeLEspace}).
 */
class EspaceDemarrageController extends Controller
{
    public function __invoke(Request $request, DemarrageDeLEspace $demarrage): JsonResponse
    {
        return $this->json(['data' => [
            'etapes' => $demarrage->pour($request->user(), $request->activeProfile()),
        ]]);
    }
}
```

- [ ] **Étape 5 : la route** — dans `routes/api/me.php`, ajouter l'import
  `use App\Http\Controllers\Api\Me\EspaceDemarrageController;` (ordre alphabétique des `use`), et sous
  la route `capabilities` :

```php
    // TCK-2479 (ADR-0089 §5) — les étapes du groupe « Démarrer » du menu, jugées sur le profil actif.
    Route::get('espace/demarrage', EspaceDemarrageController::class)->name('me.espace.demarrage');
```

- [ ] **Étape 6 : lancer, constater le vert** — commande de l'étape 2 : PASS. Puis
  `php artisan test tests/Feature/Agency/AgencySetupStatusTest.php` (inchangé : PASS) et
  `php artisan route:list --name=me.espace` (une ligne).

- [ ] **Étape 7 : ablations** (un script, cf. contraintes) — chacune doit rougir le test nommé :
  1. `'kyc' => 'first_member'` dans `ETAPES_D_AGENCE` → `test_chaque_fait_de_l_agence_fait_passer_sa_seule_etape` (kyc, equipe).
  2. Retirer le `continue` des agences `individual` → `test_l_hote_lit_…`.
  3. Retirer `->where('status', '!=', …Draft…)` → `test_le_bailleur_rend_…` (« un brouillon… »).
  4. Remplacer `$user->can('configure', $agence)` par `true` → `test_un_admin_dont_le_role_retire_…`.
  5. Retirer `|| $this->estLeBailleurDeLHote(...)` → `test_l_hote_lit_…` (le profil bailleur rendrait les étapes du bailleur).
  Puis `git diff` : seules les modifications de la tâche.

- [ ] **Étape 8 : style et gardes** — `./vendor/bin/pint app/Services/Onboarding/DemarrageDeLEspace.php app/Http/Controllers/Api/Me/EspaceDemarrageController.php routes/api/me.php tests/Feature/Api/Me/EspaceDemarrageTest.php` ;
  depuis la racine : `node scripts/check-controller-authorization.mjs` et `node scripts/check-test-base-classes.mjs`.

- [ ] **Étape 9 : commit** — `feat(api): les étapes de mise en service de l'espace actif, pour « Démarrer » (TCK-2479)`.

---

### Tâche 2 : chaque compteur a sa page filtrée, et la garde qui le vérifie (AC4)

**Fichiers :** `onglet-des-visites.ts`, `VisitsList.tsx`, `filtre-des-demandes.ts`,
`ContactLeadsInbox.tsx`, `statut-de-la-file.ts`, `ModerationWorkspace.tsx`, `catalogue.ts` ;
tests : `a-traiter-lu-par-sa-page.test.ts` (neuf), `ContactLeadsInbox.test.tsx` (complété).

**Interfaces :**
- Produit : `Destination.hrefATraiter?: string` ;
  `ongletDesVisites(params: Pick<URLSearchParams, 'get' | 'toString'>, personnel: boolean): OngletDesVisites` ;
  `filtreDesDemandes(params: Pick<URLSearchParams, 'get' | 'toString'>): FiltreDesDemandes` ;
  `statutDeLaFile(lire: (cle: string) => string): ModerationStatus | ''` ; `P_STATUT`.

- [ ] **Étape 1 : écrire la garde qui échoue** — `src/lib/navigation/__tests__/a-traiter-lu-par-sa-page.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { statutDeLaFile } from '@/components/admin/statut-de-la-file';
import { filtreDesDemandes } from '@/components/leads/filtre-des-demandes';
import { ongletDesVisites } from '@/components/visits/onglet-des-visites';
import { CATALOGUE } from '../catalogue';

type Lecture = Pick<URLSearchParams, 'get' | 'toString'>;

/**
 * TCK-2479 (ADR-0089 §1, AC4) — « chaque `hrefATraiter` vise un paramètre que sa page lit ».
 *
 * Chaque page à filtre expose le LECTEUR pur qu'elle appelle elle-même pour tirer sa vue de l'URL. La
 * garde l'appelle sur la requête de `hrefATraiter` à travers un espion et exige (1) que CHAQUE
 * paramètre de la requête ait été lu, (2) que la vue rendue soit celle de ce qui attend.
 *
 * ⚠ (1) n'est pas redondant avec (2) : la vue « ce qui attend » est souvent la vue PAR DÉFAUT
 * (`?tab=requested`, `?filtre=todo`), qu'un paramètre IGNORÉ rend aussi. Sans l'espion, un
 * `hrefATraiter` vers `?statut=requested` resterait vert.
 */
const LECTEURS: Readonly<Record<string, { readonly lire: (p: Lecture) => string; readonly vue: string }>> = {
  '/app/visits': { lire: (p) => ongletDesVisites(p, true), vue: 'requested' },
  '/app/leads': { lire: (p) => filtreDesDemandes(p), vue: 'todo' },
  '/app/agency/moderation': { lire: (p) => statutDeLaFile((cle) => p.get(cle) ?? ''), vue: 'pending' },
};

/** Les pages comptées SANS filtre, et pourquoi — chaque écart est écrit dans TCK-2479. */
const SANS_FILTRE: Readonly<Record<string, string>> = {
  '/app/messages': 'aucun filtre « non lus » côté API : ConversationController::index ne lit que `archived`',
  '/app/agency/moderation/properties': 'la page EST la file : PropertyModerationController::index ne rend que `pending_review`',
};

function espion(requete: URLSearchParams) {
  const lus = new Set<string>();
  const lecture: Lecture = {
    get: (cle: string) => {
      lus.add(cle);
      return requete.get(cle);
    },
    toString: () => requete.toString(),
  };
  return { lecture, lus };
}

const COMPTEES = CATALOGUE.filter((d) => d.compteur !== undefined);
const FILTREES = COMPTEES.filter((d) => d.hrefATraiter !== undefined);

describe('TCK-2479 — chaque pastille mène à une page qui lit son filtre (AC4)', () => {
  it.each(COMPTEES.map((d) => [d.id, d] as const))('%s : un filtre lu, OU une absence justifiée', (_id, d) => {
    const filtre = d.hrefATraiter !== undefined;
    const justifiee = d.href in SANS_FILTRE;
    expect(filtre || justifiee, `${d.href} : ni hrefATraiter ni SANS_FILTRE`).toBe(true);
    expect(filtre && justifiee, `${d.href} : à la fois filtrée et justifiée sans filtre`).toBe(false);
  });

  it.each(FILTREES.map((d) => [d.hrefATraiter!, d] as const))('%s', (hrefATraiter, d) => {
    const url = new URL(hrefATraiter, 'https://takussan.test');
    expect(url.pathname, 'le filtre reste sur la page de sa destination').toBe(d.href);
    const lecteur = LECTEURS[d.href];
    expect(lecteur, `${d.href} : aucun lecteur déclaré dans LECTEURS`).toBeDefined();
    const cles = [...url.searchParams.keys()];
    expect(cles.length, 'un hrefATraiter porte au moins un paramètre').toBeGreaterThan(0);

    const { lecture, lus } = espion(url.searchParams);
    expect(lecteur!.lire(lecture)).toBe(lecteur!.vue);
    expect(cles.filter((c) => !lus.has(c)), 'paramètres que la page ne lit pas').toEqual([]);
  });

  it('aucun lecteur orphelin', () => {
    const visees = new Set(FILTREES.map((d) => d.href));
    expect(Object.keys(LECTEURS).filter((h) => !visees.has(h))).toEqual([]);
  });
});
```

Et compléter `src/components/leads/__tests__/ContactLeadsInbox.test.tsx` — le mock de
`next/navigation` (l. 47-49) devient :

```ts
const remplacer = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(etat.recherche),
  useRouter: () => ({ replace: remplacer }),
}));
```

puis, dans le `describe`, deux cas (le rendu suit celui des cas voisins du fichier) :

```ts
  it('TCK-2479 — `?filtre=handled` ouvre « Traitées », et c’est la liste lue', () => {
    etat.recherche = 'filtre=handled';
    render(withIntl(<ContactLeadsInbox />));

    expect(screen.getByRole('tab', { name: /Traitées/ })).toHaveAttribute('aria-selected', 'true');
    expect(etat.filtres.at(-1)).toBe('handled');
  });

  it('TCK-2479 — sans paramètre « À traiter » ; un choix s’écrit dans l’URL, le défaut s’en retire', async () => {
    const user = userEvent.setup();
    render(withIntl(<ContactLeadsInbox />));
    expect(etat.filtres.at(-1)).toBe('todo');

    await user.click(screen.getByRole('tab', { name: /Toutes/ }));
    expect(remplacer).toHaveBeenLastCalledWith('?filtre=all', { scroll: false });
  });
```

- [ ] **Étape 2 : lancer, constater l'échec**

Run (dans `takussan-web/`) :
`npx vitest run src/lib/navigation/__tests__/a-traiter-lu-par-sa-page.test.ts src/components/leads/__tests__/ContactLeadsInbox.test.tsx`
Attendu : FAIL (modules des lecteurs absents ; `?filtre=` ignoré).

- [ ] **Étape 3 : les trois lecteurs**

`src/components/visits/onglet-des-visites.ts` :

```ts
import { valeurBornee } from '@/hooks/useVueDansLUrl';

/** TCK-171, TCK-590 — les onglets de la liste des visites (« Non attribuées » : le personnel seul). */
export const ONGLETS_DES_VISITES = ['unassigned', 'requested', 'confirmed', 'past', 'cancelled'] as const;
export type OngletDesVisites = (typeof ONGLETS_DES_VISITES)[number];

/**
 * TCK-1736 (P168.03) — l'onglet que porte `?tab=`, borné aux onglets ouverts ; « Demandées » sinon.
 *
 * TCK-2479 — sorti de `VisitsList` pour que la garde du menu (`a-traiter-lu-par-sa-page.test.ts`)
 * éprouve CE lecteur-ci, celui que la page appelle : la pastille « À traiter » des visites vise
 * `?tab=requested`.
 */
export function ongletDesVisites(params: Pick<URLSearchParams, 'get' | 'toString'>, personnel: boolean): OngletDesVisites {
  const ouverts = personnel ? ONGLETS_DES_VISITES : ONGLETS_DES_VISITES.filter((k) => k !== 'unassigned');
  return valeurBornee(params, 'tab', ouverts) ?? 'requested';
}
```

`src/components/leads/filtre-des-demandes.ts` :

```ts
import { valeurBornee } from '@/hooks/useVueDansLUrl';
import type { FiltreDesDemandes } from '@/lib/queries/contact-leads';

export const FILTRES_DES_DEMANDES: readonly FiltreDesDemandes[] = ['todo', 'handled', 'all'];

/**
 * TCK-2479 — le filtre de la boîte « Demandes » vit dans `?filtre=` (patron TCK-1732), « À traiter »
 * par défaut. Tenu en `useState`, il ne survivait ni au rechargement ni au lien — et la pastille
 * « À traiter » du menu n'avait aucun paramètre à viser.
 */
export function filtreDesDemandes(params: Pick<URLSearchParams, 'get' | 'toString'>): FiltreDesDemandes {
  return valeurBornee(params, 'filtre', FILTRES_DES_DEMANDES) ?? 'todo';
}
```

`src/components/admin/statut-de-la-file.ts` :

```ts
import type { ModerationStatus } from '@/lib/queries/reviews-moderation';

/** TCK-376 — la clé d'URL porte le NOM DU FILTRE D'API, pas un alias. */
export const P_STATUT = 'filter[moderation_status]';

/**
 * TCK-2479 — le statut de la file de modération des avis, tel que la page le lit (`''` : tous). Sorti
 * de `ModerationWorkspace` pour que la garde du menu éprouve le lecteur que la page appelle.
 */
export function statutDeLaFile(lire: (cle: string) => string): ModerationStatus | '' {
  return lire(P_STATUT) as ModerationStatus | '';
}
```

- [ ] **Étape 4 : les pages les appellent**
  - `VisitsList.tsx` : supprimer `TAB_KEYS` et `TabKey` (l. 22-23), l'import de `valeurBornee` (l. 9),
    et `ongletsOuverts` (l. 41) ; importer
    `import { ongletDesVisites, type OngletDesVisites as TabKey } from './onglet-des-visites';` ;
    l. 42 devient `const tab: TabKey = ongletDesVisites(params, personnel);`.
  - `ContactLeadsInbox.tsx` : supprimer `FILTRES` (l. 48) au profit de `FILTRES_DES_DEMANDES` (dans le
    `.map` des onglets) ; importer `useVueDansLUrl` et `filtreDesDemandes` ; remplacer
    `const [filtre, setFiltre] = useState<FiltreDesDemandes>('todo');` par
    `const { params, remplacer } = useVueDansLUrl();` puis `const filtre = filtreDesDemandes(params);` ;
    `searchParams?.get('lead')` devient `params.get('lead')` (et l'import de `useSearchParams` part s'il
    n'a plus d'appelant) ; le `onValueChange` des onglets devient :

    ```tsx
        onValueChange={(v) => {
          const suivant = (v as FiltreDesDemandes) ?? 'todo';
          remplacer({ filtre: suivant === 'todo' ? null : suivant });
          setPage(1);
        }}
    ```
  - `ModerationWorkspace.tsx` : supprimer `const P_STATUT = …` (l. 52) ; importer
    `{ P_STATUT, statutDeLaFile }` de `./statut-de-la-file` (P_STATUT reste utilisé par l'écriture du
    filtre) ; l. 81 devient `const status = statutDeLaFile(url.lire);`.

- [ ] **Étape 5 : `hrefATraiter` au catalogue** — dans `interface Destination` (`catalogue.ts`), après
  `compteur` :

```ts
  /**
   * TCK-2479 (ADR-0089 §1) — la page de la destination FILTRÉE sur ce qui attend : la cible de la
   * pastille « À traiter » de son compteur. Même chemin que `href` ; chacun de ses paramètres est LU
   * par la page (`a-traiter-lu-par-sa-page.test.ts`). Absente, la pastille mène à `href` — la page est
   * alors déjà la file, ou n'a pas de filtre, et la garde exige qu'elle soit dans `SANS_FILTRE`.
   */
  readonly hrefATraiter?: string;
```

  Puis : `visites` reçoit `hrefATraiter: '/app/visits?tab=requested',` ; `demandes` reçoit
  `hrefATraiter: '/app/leads?filtre=todo',` ; `pageAgence` prend un quatrième paramètre :

```ts
function pageAgence<const I extends string>(id: I, chemin: CheminAdmin, compteur?: NavCounterKey, hrefATraiter?: string) {
  // … corps inchangé, et dans l'objet rendu :
    ...(compteur ? { compteur } : {}),
    ...(hrefATraiter ? { hrefATraiter } : {}),
```

  et `pageAgence('agence-moderation-avis', '/app/agency/moderation', 'reviewModeration', '/app/agency/moderation?filter[moderation_status]=pending'),`.

- [ ] **Étape 6 : lancer, constater le vert** — commande de l'étape 2, plus les tests existants des
  trois pages :
  `npx vitest run src/lib/navigation src/components/leads src/components/visits src/components/admin/__tests__/ModerationWorkspace.test.tsx`.
  Attendu : PASS.

- [ ] **Étape 7 : ablations** — chacune rougit :
  1. `hrefATraiter: '/app/visits?statut=requested'` → la garde (« paramètres que la page ne lit pas : statut »).
  2. Dans `ContactLeadsInbox`, `const filtre: FiltreDesDemandes = 'todo';` → « `?filtre=handled` ouvre « Traitées » ».
  3. Retirer `hrefATraiter` de `demandes` → « un filtre lu, OU une absence justifiée ».
  4. Dans `VisitsList`, `const tab: TabKey = 'requested';` → `VisitsList.url.tck-1736.test.tsx` (« ouvre l'onglet que porte l'URL »).

- [ ] **Étape 8 : `npx tsc --noEmit && npm run lint && npm run check:i18n`**, puis commit —
  `feat(web): chaque compteur du menu vise sa page filtrée, et une garde vérifie que la page lit le filtre (TCK-2479)`.

---

### Tâche 3 : la priorité des pastilles et « Démarrer » dans les dispositions (fonctions pures)

**Fichiers :** créer `src/lib/navigation/demarrer.ts`, `src/lib/navigation/a-traiter.ts` ; modifier
`dispositions.ts`, `composer-menu.ts` ; tests : `a-traiter.test.ts`, `demarrer.test.ts` (neufs),
`composer-menu.test.ts` (deux littéraux `Disposition` reçoivent `priorites: []`).

**Interfaces :**
- Produit :

```ts
// demarrer.ts
export type ModeDemarrer = 'espace' | 'bailleur';
export const CODES_D_ETAPE: readonly ['premier_bien', 'kyc', 'equipe'];
export type CodeDEtape = (typeof CODES_D_ETAPE)[number];
export interface EtapeDeDemarrage { readonly code: string; readonly faite: boolean }
export interface EtapeARendre { readonly code: CodeDEtape; readonly href: string; readonly cle: string }
export function etapesARendre(etapes: readonly EtapeDeDemarrage[], mode: ModeDemarrer, idProfilActif: string | null):
  { readonly restantes: readonly EtapeARendre[]; readonly faites: number; readonly total: number };

// a-traiter.ts
export interface EntreeComptee { readonly href: string; readonly counterKey?: NavCounterKey; readonly hrefATraiter?: string; readonly locked?: boolean }
export interface PastilleATraiter { readonly cle: NavCounterKey; readonly nombre: number; readonly href: string }
export const PASTILLES_VISIBLES = 4;
export function pastillesATraiter(entrees: readonly EntreeComptee[], comptes: Readonly<Partial<Record<NavCounterKey, number>>>, priorites: readonly NavCounterKey[]):
  { readonly visibles: readonly PastilleATraiter[]; readonly autres: readonly PastilleATraiter[] };

// dispositions.ts — Disposition + :
  readonly priorites: readonly NavCounterKey[];
  readonly demarrer?: ModeDemarrer;

// composer-menu.ts — EntreeComposee + `readonly hrefATraiter?: string` ; MenuCompose + :
  readonly priorites: readonly NavCounterKey[];
  readonly demarrer: ModeDemarrer | null;   // null sans « Démarrer » ou dans un espace suspendu
```

- [ ] **Étape 1 : écrire les tests qui échouent**

`src/lib/navigation/__tests__/a-traiter.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { PASTILLES_VISIBLES, pastillesATraiter, type EntreeComptee } from '../a-traiter';
import { DISPOSITIONS } from '../dispositions';
import { PERSONAS } from '../personas';
import type { NavCounterKey } from '../types';

const ENTREES: EntreeComptee[] = [
  { href: '/app/messages', counterKey: 'unreadMessages' },
  { href: '/app/visits', counterKey: 'pendingVisits', hrefATraiter: '/app/visits?tab=requested' },
  { href: '/app/leads', counterKey: 'unhandledLeads', hrefATraiter: '/app/leads?filtre=todo' },
  {
    href: '/app/agency/moderation',
    counterKey: 'reviewModeration',
    hrefATraiter: '/app/agency/moderation?filter[moderation_status]=pending',
  },
  { href: '/app/agency/moderation/properties', counterKey: 'propertyModeration' },
];
const TOUS: Record<NavCounterKey, number> = {
  unreadMessages: 3,
  pendingVisits: 2,
  unhandledLeads: 1,
  reviewModeration: 4,
  propertyModeration: 5,
};

describe('TCK-2479 — pastillesATraiter (ADR-0089 §5)', () => {
  it('AC1 — suit l’ordre des priorités, pas celui du menu, et vise la page filtrée', () => {
    const { visibles } = pastillesATraiter(ENTREES, TOUS, ['unhandledLeads', 'pendingVisits', 'unreadMessages']);
    expect(visibles.map((p) => [p.cle, p.nombre, p.href])).toEqual([
      ['unhandledLeads', 1, '/app/leads?filtre=todo'],
      ['pendingVisits', 2, '/app/visits?tab=requested'],
      ['unreadMessages', 3, '/app/messages'],
    ]);
  });

  it('0, une valeur absente ou négative : pas de pastille', () => {
    const comptes = { unreadMessages: 0, pendingVisits: -1 };
    expect(pastillesATraiter(ENTREES, comptes, ['unreadMessages', 'pendingVisits', 'unhandledLeads']).visibles).toEqual([]);
  });

  it('un compteur hors des priorités du persona ne monte pas dans la bande', () => {
    expect(pastillesATraiter(ENTREES, TOUS, ['unreadMessages']).visibles.map((p) => p.cle)).toEqual(['unreadMessages']);
  });

  it('une entrée absente du menu, ou cadenassée, ne fait pas de pastille (TCK-377 : pas de sondage)', () => {
    const entrees: EntreeComptee[] = [{ href: '/app/leads', counterKey: 'unhandledLeads', locked: true }];
    expect(pastillesATraiter(entrees, TOUS, ['unhandledLeads', 'unreadMessages']).visibles).toEqual([]);
  });

  it(`${PASTILLES_VISIBLES} pastilles au plus ; le reste, dans l’ordre, derrière « +N »`, () => {
    const { visibles, autres } = pastillesATraiter(ENTREES, TOUS, [
      'propertyModeration', 'reviewModeration', 'unhandledLeads', 'pendingVisits', 'unreadMessages',
    ]);
    expect(visibles.map((p) => p.cle)).toEqual(['propertyModeration', 'reviewModeration', 'unhandledLeads', 'pendingVisits']);
    expect(autres.map((p) => p.cle)).toEqual(['unreadMessages']);
  });
});

describe('TCK-2479 — la priorité de chaque persona (arbitrage 6 du plan)', () => {
  it('la table', () => {
    expect(Object.fromEntries(PERSONAS.map((p) => [p, DISPOSITIONS[p].priorites]))).toEqual({
      client: ['unreadMessages'],
      locataire: ['unreadMessages'],
      bailleur: ['unreadMessages', 'unhandledLeads', 'pendingVisits'],
      agent: ['unhandledLeads', 'pendingVisits', 'unreadMessages'],
      'admin-agence': ['unhandledLeads', 'pendingVisits', 'unreadMessages', 'propertyModeration', 'reviewModeration'],
      hote: ['unreadMessages', 'unhandledLeads', 'pendingVisits'],
      prestataire: ['unreadMessages'],
      plateforme: ['propertyModeration', 'reviewModeration', 'unhandledLeads', 'pendingVisits', 'unreadMessages'],
    });
  });

  it.each(PERSONAS)('%s : aucune clé deux fois', (persona) => {
    const priorites = DISPOSITIONS[persona].priorites;
    expect(new Set(priorites).size).toBe(priorites.length);
  });

  it('AC6 — le prestataire ne fait monter que la messagerie, quels que soient les compteurs', () => {
    const { visibles } = pastillesATraiter(ENTREES, TOUS, DISPOSITIONS.prestataire.priorites);
    expect(visibles.map((p) => p.cle)).toEqual(['unreadMessages']);
  });
});
```

`src/lib/navigation/__tests__/demarrer.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { composerMenu } from '../composer-menu';
import { etapesARendre } from '../demarrer';
import { DISPOSITIONS } from '../dispositions';
import { PERSONAS } from '../personas';

const TROIS = [
  { code: 'premier_bien', faite: false },
  { code: 'kyc', faite: false },
  { code: 'equipe', faite: false },
];

describe('TCK-2479 — etapesARendre', () => {
  it('une agence neuve : trois liens, dans l’ordre de l’API', () => {
    expect(etapesARendre(TROIS, 'espace', null)).toEqual({
      restantes: [
        { code: 'premier_bien', href: '/app/properties/new', cle: 'etapes.espace.premier_bien' },
        { code: 'kyc', href: '/app/agency/kyc', cle: 'etapes.espace.kyc' },
        { code: 'equipe', href: '/app/agency/team', cle: 'etapes.espace.equipe' },
      ],
      faites: 0,
      total: 3,
    });
  });

  it('AC5 — une étape faite sort du groupe, et compte dans la progression', () => {
    const { restantes, faites, total } = etapesARendre([{ ...TROIS[0]!, faite: true }, TROIS[1]!, TROIS[2]!], 'espace', null);
    expect(restantes.map((e) => e.code)).toEqual(['kyc', 'equipe']);
    expect([faites, total]).toEqual([1, 3]);
  });

  it('un code inconnu ne fait ni lien ni compte', () => {
    expect(etapesARendre([{ code: 'logo', faite: false }], 'espace', null)).toEqual({ restantes: [], faites: 0, total: 0 });
  });

  it('bailleur : le KYC rouvre SON assistant ; sans profil bailleur actif, l’assistant choisit', () => {
    const kyc = [{ code: 'kyc', faite: false }];
    expect(etapesARendre(kyc, 'bailleur', 'owner:3').restantes[0]).toEqual({
      code: 'kyc',
      href: '/onboarding/owner?owner=3',
      cle: 'etapes.bailleur.kyc',
    });
    expect(etapesARendre(kyc, 'bailleur', null).restantes[0]?.href).toBe('/onboarding/owner');
    expect(etapesARendre(kyc, 'bailleur', 'agency_admin:2').restantes[0]?.href).toBe('/onboarding/owner');
  });
});

describe('TCK-2479 — « Démarrer » dans les dispositions et le menu composé', () => {
  it('admin d’agence et hôte : l’espace ; bailleur : le sien ; personne d’autre', () => {
    expect(Object.fromEntries(PERSONAS.map((p) => [p, DISPOSITIONS[p].demarrer ?? null]))).toEqual({
      client: null, locataire: null, bailleur: 'bailleur', agent: null,
      'admin-agence': 'espace', hote: 'espace', prestataire: null, plateforme: null,
    });
  });

  it('composerMenu le rend, et le retire d’un espace suspendu', () => {
    const ctx = { roles: ['customer', 'agency_admin'] as const, capacites: ['properties.create'], cheminsAdmin: [] };
    expect(composerMenu({ ...ctx, roles: [...ctx.roles] }, 'admin-agence').demarrer).toBe('espace');
    expect(composerMenu({ ...ctx, roles: [...ctx.roles], agenceSuspendue: true }, 'admin-agence').demarrer).toBeNull();
    expect(composerMenu({ ...ctx, roles: [...ctx.roles] }, 'admin-agence').priorites).toBe(DISPOSITIONS['admin-agence'].priorites);
  });
});
```

- [ ] **Étape 2 : lancer, constater l'échec**

Run : `npx vitest run src/lib/navigation/__tests__/a-traiter.test.ts src/lib/navigation/__tests__/demarrer.test.ts`
Attendu : FAIL (modules absents, `priorites` inconnu).

- [ ] **Étape 3 : `demarrer.ts`**

```ts
/**
 * TCK-2479 (ADR-0089 §5) — le groupe « Démarrer » d'un espace neuf : ce que le menu fait des étapes
 * que rend `GET /api/me/espace/demarrage` (`EspaceDemarrageController`).
 *
 * L'API dit QUELLES étapes et si elles sont faites ; le front, OÙ chacune se fait et comment elle se
 * dit (principe 5 du `CLAUDE.md` racine). Un code que ce fichier ne connaît pas n'est ni rendu ni
 * compté : le groupe ne montre jamais un lien sans destination.
 */
export type ModeDemarrer = 'espace' | 'bailleur';

export const CODES_D_ETAPE = ['premier_bien', 'kyc', 'equipe'] as const;
export type CodeDEtape = (typeof CODES_D_ETAPE)[number];

export interface EtapeDeDemarrage {
  readonly code: string;
  readonly faite: boolean;
}

export interface EtapeARendre {
  readonly code: CodeDEtape;
  readonly href: string;
  /** Clé sous `nav.sidebar.demarrer`. */
  readonly cle: string;
}

/** `owner:3` → 3 ; tout autre jeton → `null`. */
function profilBailleur(idProfilActif: string | null): number | null {
  const [type, id] = (idProfilActif ?? '').split(':');
  return type === 'owner' && id !== undefined && /^\d+$/.test(id) ? Number(id) : null;
}

/**
 * L'écran qui fait chaque étape. Le KYC du bailleur est son assistant d'onboarding, repris sur SON
 * profil (`?owner=`, `profilAReprendre`, TCK-589) : sans lui, l'assistant prendrait le premier
 * profil « à compléter », et un profil déjà actif renverrait vers `/app`.
 */
function lienDe(code: CodeDEtape, mode: ModeDemarrer, idProfilActif: string | null): string {
  switch (code) {
    case 'premier_bien':
      return '/app/properties/new';
    case 'equipe':
      return '/app/agency/team';
    case 'kyc': {
      if (mode === 'espace') return '/app/agency/kyc';
      const id = profilBailleur(idProfilActif);
      return id === null ? '/onboarding/owner' : `/onboarding/owner?owner=${id}`;
    }
  }
}

function connue(e: EtapeDeDemarrage): e is EtapeDeDemarrage & { readonly code: CodeDEtape } {
  return (CODES_D_ETAPE as readonly string[]).includes(e.code);
}

/** AC5 — une étape faite SORT du groupe ; la progression dit combien l'étaient. */
export function etapesARendre(
  etapes: readonly EtapeDeDemarrage[],
  mode: ModeDemarrer,
  idProfilActif: string | null,
): { readonly restantes: readonly EtapeARendre[]; readonly faites: number; readonly total: number } {
  const connues = etapes.filter(connue);
  return {
    restantes: connues
      .filter((e) => !e.faite)
      .map((e) => ({ code: e.code, href: lienDe(e.code, mode, idProfilActif), cle: `etapes.${mode}.${e.code}` })),
    faites: connues.filter((e) => e.faite).length,
    total: connues.length,
  };
}
```

- [ ] **Étape 4 : `a-traiter.ts`**

```ts
import type { NavCounterKey } from './types';

/**
 * TCK-2479 (ADR-0089 §5) — la bande « À traiter » au-dessus du menu : une fonction pure des entrées
 * RENDUES, des compteurs et de la priorité du persona.
 *
 * - Elle ne lit que les entrées que la barre rend, non cadenassées : exactement celles dont le
 *   compteur est sondé (`countersToPoll`, TCK-377). Elle ne demande aucun compteur de plus.
 * - `priorites` est une LISTE BLANCHE et un ORDRE : un compteur que le persona ne cite pas garde son
 *   badge dans le menu, mais n'est pas « à traiter » pour lui (les visites d'un client attendent
 *   l'agence, pas lui).
 * - 0 vaut « rien à traiter » : le chargement et l'erreur arrivent ici déjà ramenés à 0.
 * - Elle ne touche pas au menu : aucune entrée ne change de place selon un compteur.
 */
export interface EntreeComptee {
  readonly href: string;
  readonly counterKey?: NavCounterKey;
  readonly hrefATraiter?: string;
  readonly locked?: boolean;
}

export interface PastilleATraiter {
  readonly cle: NavCounterKey;
  readonly nombre: number;
  /** La page filtrée sur ce qui attend (`hrefATraiter`), sinon la page de l'entrée. */
  readonly href: string;
}

/** Quatre pastilles au plus ; le reste derrière « +N ». */
export const PASTILLES_VISIBLES = 4;

export function pastillesATraiter(
  entrees: readonly EntreeComptee[],
  comptes: Readonly<Partial<Record<NavCounterKey, number>>>,
  priorites: readonly NavCounterKey[],
): { readonly visibles: readonly PastilleATraiter[]; readonly autres: readonly PastilleATraiter[] } {
  const pastilles: PastilleATraiter[] = [];
  for (const cle of priorites) {
    const entree = entrees.find((e) => e.counterKey === cle && !e.locked);
    const nombre = comptes[cle] ?? 0;
    if (!entree || !(nombre > 0)) continue;
    pastilles.push({ cle, nombre, href: entree.hrefATraiter ?? entree.href });
  }
  return { visibles: pastilles.slice(0, PASTILLES_VISIBLES), autres: pastilles.slice(PASTILLES_VISIBLES) };
}
```

- [ ] **Étape 5 : `dispositions.ts`**
  - Imports : `import type { ModeDemarrer } from './demarrer';` et `import type { NavCounterKey } from './types';`.
  - `interface Disposition` reçoit :

```ts
  /**
   * TCK-2479 (ADR-0089 §5) — les compteurs qui montent dans la bande « À traiter », DANS CET ORDRE.
   * Liste blanche : un compteur absent garde son badge au menu, mais n'est pas « à traiter » pour ce
   * persona. Obligatoire : un persona sans priorités se décide, il ne s'oublie pas.
   */
  readonly priorites: readonly NavCounterKey[];
  /** TCK-2479 — le groupe « Démarrer » : les étapes d'une agence (`espace`) ou d'un bailleur. */
  readonly demarrer?: ModeDemarrer;
```

  - `ADMIN_AGENCE` devient une BASE sans les deux champs, partagée par l'admin et la plateforme :

```ts
const BASE_ADMIN = {
  action: PUBLIER,
  groupes: [ /* … inchangés … */ ],
  plus: ['maintenance', 'carnet-prestataires', 'etats-des-lieux', 'documents', 'avis'],
  libelles: { 'mes-biens': 'allProperties' },
} as const satisfies Omit<Disposition, 'priorites' | 'demarrer'>;
```

  (si `as const` gêne le typage des groupes, garder `const BASE_ADMIN: Omit<Disposition, 'priorites' | 'demarrer'> = { … }`.)

  - Dans `DISPOSITIONS`, chaque persona reçoit sa ligne `priorites` (table de l'arbitrage 6, mot pour
    mot) ; `bailleur` reçoit `demarrer: 'bailleur'`, `hote` `demarrer: 'espace'` ;
    `'admin-agence': { ...BASE_ADMIN, priorites: [...], demarrer: 'espace' }` ;
    `plateforme: { ...BASE_ADMIN, priorites: [...] }`.

- [ ] **Étape 6 : `composer-menu.ts`**
  - Imports : `import type { ModeDemarrer } from './demarrer';`.
  - `EntreeComposee` reçoit `readonly hrefATraiter?: string;` ; dans `composer`, après `counterKey` :
    `...(d.hrefATraiter ? { hrefATraiter: d.hrefATraiter } : {}),`.
  - `MenuCompose` reçoit :

```ts
  /** TCK-2479 — l'ordre (et la liste blanche) de la bande « À traiter ». */
  readonly priorites: readonly NavCounterKey[];
  /** TCK-2479 — le groupe « Démarrer », `null` sans lui ou dans un espace suspendu (TCK-600). */
  readonly demarrer: ModeDemarrer | null;
```

  - Le `return` devient :

```ts
  return {
    persona,
    action,
    carte,
    groupes: groupes.filter((g) => g.entrees.length > 0),
    priorites: disposition.priorites,
    demarrer: ctx.agenceSuspendue ? null : (disposition.demarrer ?? null),
  };
```

  - `composer-menu.test.ts` l. 55 et 169 : ajouter `priorites: []` aux deux littéraux `Disposition`.

- [ ] **Étape 7 : lancer, constater le vert** — commande de l'étape 2, puis `npx vitest run src/lib/navigation` (tout PASS ; `dispositions-validees.test.ts` inchangé).

- [ ] **Étape 8 : ablations**
  1. Dans `pastillesATraiter`, itérer sur `entrees` au lieu de `priorites` (filtrées par `priorites.includes`) → « AC1 — suit l'ordre des priorités » rougit.
  2. Retirer les deux `slice` (tout dans `visibles`) → « 4 pastilles au plus » rougit.
  3. Retirer `&& !e.locked` → « … ou cadenassée » rougit.
  4. Retirer `.filter((e) => !e.faite)` de `etapesARendre` → « AC5 — une étape faite sort du groupe » rougit.
  5. `demarrer: disposition.demarrer ?? null` (sans l'espace suspendu) → « composerMenu le rend, et le retire… » rougit.

- [ ] **Étape 9 : `npx tsc --noEmit && npm run lint`**, puis commit —
  `feat(web): la priorité des pastilles et « Démarrer » entrent dans les dispositions (TCK-2479)`.

---

### Tâche 4 : la bande « À traiter » dans la barre (AC1, AC2, AC3, AC6)

**Fichiers :**
- Créer : `src/components/layout/styles-de-la-barre.ts`, `src/components/layout/BandeATraiter.tsx`
- Modifier : `src/components/layout/AppSidebar.tsx`, `src/components/chat-widget/useUnreadCount.ts`,
  `src/messages/{fr,en,wo}.json`
- Tests : `src/components/layout/__tests__/BandeATraiter.test.tsx` (neuf),
  `AppSidebar.test.tsx` (complété), `src/components/chat-widget/__tests__/useUnreadCount.test.tsx` (complété)

- [ ] **Étape 1 : les libellés** — sous `nav.sidebar` des trois fichiers (le `wo` = le `fr`) :

| Clé | fr | en |
|---|---|---|
| `counters.unhandledLeads` *(manquante, cf. R1)* | `{count, plural, one {# demande non traitée} other {# demandes non traitées}}` | `{count, plural, one {# unhandled request} other {# unhandled requests}}` |
| `aTraiter.titre` | À traiter | To do |
| `aTraiter.pastilles.unreadMessages` | `{count, plural, one {# message} other {# messages}}` | `{count, plural, one {# message} other {# messages}}` |
| `aTraiter.pastilles.pendingVisits` | `{count, plural, one {# visite} other {# visites}}` | `{count, plural, one {# visit} other {# visits}}` |
| `aTraiter.pastilles.unhandledLeads` | `{count, plural, one {# demande} other {# demandes}}` | `{count, plural, one {# request} other {# requests}}` |
| `aTraiter.pastilles.reviewModeration` | `{count, plural, other {# avis}}` | `{count, plural, one {# review} other {# reviews}}` |
| `aTraiter.pastilles.propertyModeration` | `{count, plural, one {# bien} other {# biens}}` | `{count, plural, one {# listing} other {# listings}}` |
| `aTraiter.noms.unreadMessages` | `{count, plural, one {# message non lu} other {# messages non lus}}` | `{count, plural, one {# message unread} other {# messages unread}}` |
| `aTraiter.noms.pendingVisits` | `{count, plural, one {# visite en attente} other {# visites en attente}}` | `{count, plural, one {# visit pending} other {# visits pending}}` |
| `aTraiter.noms.unhandledLeads` | `{count, plural, one {# demande non traitée} other {# demandes non traitées}}` | `{count, plural, one {# request unhandled} other {# requests unhandled}}` |
| `aTraiter.noms.reviewModeration` | `{count, plural, other {# avis à modérer}}` | `{count, plural, one {# review to moderate} other {# reviews to moderate}}` |
| `aTraiter.noms.propertyModeration` | `{count, plural, one {# bien à valider} other {# biens à valider}}` | `{count, plural, one {# listing to review} other {# listings to review}}` |
| `aTraiter.plusCourt` | `+{count}` | `+{count}` |
| `aTraiter.autres` | `{count, plural, one {+# autre à traiter} other {+# autres à traiter}}` | `{count, plural, other {+# more to do}}` |

> ⚠ Chaque nom (`noms.*`, `autres`) **commence par** le texte visible de sa pastille (WCAG 2.5.3,
> « label in name ») — d'où l'anglais « 3 messages unread » et non « 3 unread messages ». Ne pas
> « corriger » l'ordre des mots.

- [ ] **Étape 2 : écrire les tests qui échouent**

`src/components/layout/__tests__/BandeATraiter.test.tsx` :

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { withIntl } from '@/test/intl';
import type { PastilleATraiter } from '@/lib/navigation/a-traiter';
import { BandeATraiter } from '../BandeATraiter';

const P = (cle: PastilleATraiter['cle'], nombre: number, href: string): PastilleATraiter => ({ cle, nombre, href });

describe('<BandeATraiter> — TCK-2479', () => {
  it('sans pastille : aucun nœud', () => {
    const { container } = render(withIntl(<BandeATraiter visibles={[]} autres={[]} />));
    expect(container).toBeEmptyDOMElement();
  });

  it('une région « À traiter » ; chaque pastille porte un nom complet qui commence par son texte', () => {
    render(withIntl(<BandeATraiter visibles={[P('unreadMessages', 3, '/app/messages'), P('pendingVisits', 2, '/app/visits?tab=requested')]} autres={[]} />));
    const bande = screen.getByRole('region', { name: 'À traiter' });
    const liens = within(bande).getAllByRole('link');
    expect(liens.map((l) => [l.textContent, l.getAttribute('aria-label'), l.getAttribute('href')])).toEqual([
      ['3 messages', '3 messages non lus', '/app/messages'],
      ['2 visites', '2 visites en attente', '/app/visits?tab=requested'],
    ]);
  });

  it('« +N » montre les autres sur place', async () => {
    const user = userEvent.setup();
    render(withIntl(<BandeATraiter visibles={[P('unhandledLeads', 1, '/app/leads?filtre=todo')]} autres={[P('reviewModeration', 2, '/app/agency/moderation'), P('unreadMessages', 5, '/app/messages')]} />));
    const plus = screen.getByRole('button', { name: '+2 autres à traiter' });
    expect(plus).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('link')).toHaveLength(1);

    await user.click(plus);
    expect(plus).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('aria-label'))).toEqual([
      '1 demande non traitée', '2 avis à modérer', '5 messages non lus',
    ]);
  });

  it('un clic referme le tiroir (onNavigate)', async () => {
    const onNavigate = vi.fn();
    render(withIntl(<BandeATraiter visibles={[P('unreadMessages', 1, '/app/messages')]} autres={[]} onNavigate={onNavigate} />));
    await userEvent.setup().click(screen.getByRole('link'));
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('a11y : aucune violation', async () => {
    const { container } = render(withIntl(<BandeATraiter visibles={[P('unreadMessages', 3, '/app/messages')]} autres={[P('pendingVisits', 1, '/app/visits')]} />));
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
```

Dans `AppSidebar.test.tsx` :
  - `type ReponseCompteur = { data?: { meta: { total: number } }; isError?: boolean };`
  - ajouter le mock de « Démarrer » (tâche 5 le monte ; ici il reste muet) :

```ts
const demarrageMock = vi.fn<(options: { enabled: boolean }) => { data?: unknown; isError?: boolean }>(() => ({}));
vi.mock('@/lib/queries/demarrage-espace', () => ({
  useDemarrageDeLEspace: (options: { enabled: boolean }) => demarrageMock(options),
}));
```

    (et `demarrageMock.mockReset(); demarrageMock.mockReturnValue({});` dans le `beforeEach`).
  - un bloc :

```tsx
describe('TCK-2479 — la bande « À traiter » (ADR-0089 §5)', () => {
  const bande = () => screen.queryByRole('region', { name: 'À traiter' });
  const noms = () => within(bande()!).getAllByRole('link').map((l) => l.getAttribute('aria-label'));
  /** Les `href` du MENU, dans l'ordre — la bande est hors du `<nav>`. */
  const menu = (c: HTMLElement) =>
    Array.from(c.querySelectorAll('nav [data-groupe] a, nav [data-groupe] [role="link"]')).map(
      (a) => a.getAttribute('href') ?? a.textContent,
    );
  const chargerLesCompteurs = () => {
    unreadMock.mockReturnValue(3);
    pendingVisitsMock.mockReturnValue({ data: { meta: { total: 2 } } });
    unhandledLeadsMock.mockReturnValue({ data: { meta: { total: 1 } } });
  };

  it('AC1 — agent, 3 messages et 2 visites : deux pastilles, visites d’abord, vers la page filtrée', () => {
    unreadMock.mockReturnValue(3);
    pendingVisitsMock.mockReturnValue({ data: { meta: { total: 2 } } });
    const { container } = renderSidebar('agent', '/app');

    expect(noms()).toEqual(['2 visites en attente', '3 messages non lus']);
    expect(within(bande()!).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/app/visits?tab=requested', '/app/messages']);
    // Entre l'action principale et le menu.
    const action = container.querySelector('[data-slot="action-principale"]')!;
    const nav = container.querySelector('nav')!;
    expect(action.compareDocumentPosition(bande()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bande()!.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nav.contains(bande())).toBe(false);
  });

  it('AC1 — à zéro partout (ou au chargement) : aucune bande, aucun nœud', () => {
    const { container } = renderSidebar('agent', '/app');
    expect(bande()).toBeNull();
    expect(container.querySelector('[data-slot="a-traiter"]')).toBeNull();
  });

  it.each(PERSONAS)('AC2 — %s : le menu garde les mêmes entrées, dans le même ordre, avec ou sans compteurs', (persona) => {
    const { container, unmount } = renderSidebar(persona, '/app');
    const avant = menu(container);
    unmount();
    chargerLesCompteurs();
    const { container: apres } = renderSidebar(persona, '/app');
    expect(menu(apres)).toEqual(avant);
  });

  it('AC3 — un compteur en échec ne rend pas sa pastille (ni son badge) ; les autres restent', () => {
    unreadMock.mockReturnValue(3);
    pendingVisitsMock.mockReturnValue({ data: { meta: { total: 2 } }, isError: true });
    renderSidebar('agent', '/app');
    expect(noms()).toEqual(['3 messages non lus']);
    expect(screen.queryByLabelText('2 demandes de visite en attente')).toBeNull();
  });

  it('AC6 — prestataire : une pastille au plus, la messagerie', () => {
    chargerLesCompteurs();
    renderSidebar('prestataire', '/app');
    expect(within(bande()!).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/app/messages']);
  });

  it('a11y : la barre avec sa bande, sans violation', async () => {
    chargerLesCompteurs();
    const { container } = renderSidebar('admin-agence', '/app');
    expect(bande()).not.toBeNull();
    // Mêmes options qu'au bloc axe existant de ce fichier (l. ~757) : les recopier.
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
```

Dans `src/components/chat-widget/__tests__/useUnreadCount.test.tsx`, le mock rend aussi `isError`
(élargir le type de `useConversationsMock` à `{ data; isLoading: boolean; isError?: boolean }`), et un cas :

```ts
  it('TCK-2479 — une relecture en échec rend 0, même si le cache garde l’ancienne valeur', () => {
    useConversationsMock.mockReturnValue({ data: { data: [], meta: { unread_total: 4 } }, isLoading: false, isError: true });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: ({ children }) => wrap(children) });
    expect(result.current).toBe(0);
  });
```

- [ ] **Étape 3 : lancer, constater l'échec**

Run : `npx vitest run src/components/layout/__tests__/BandeATraiter.test.tsx src/components/layout/__tests__/AppSidebar.test.tsx src/components/chat-widget/__tests__/useUnreadCount.test.tsx`
Attendu : FAIL (composant absent ; aucune bande ; `isError` ignoré).

- [ ] **Étape 4 : `styles-de-la-barre.ts`** — déplacer d'`AppSidebar.tsx` (l. 94-107), docblock compris,
  `FOCUS_RING` et `STYLE_TITRE`, désormais `export const` ; `AppSidebar.tsx` les importe de `./styles-de-la-barre`.

- [ ] **Étape 5 : `BandeATraiter.tsx`**

```tsx
'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { PastilleATraiter } from '@/lib/navigation/a-traiter';
import { cn } from '@/lib/utils';
import { FOCUS_RING } from './styles-de-la-barre';

interface BandeATraiterProps {
  readonly visibles: readonly PastilleATraiter[];
  readonly autres: readonly PastilleATraiter[];
  readonly onNavigate?: () => void;
}

/**
 * Une pastille : calme, lisible, pas une alerte — ni couleur primaire (elle reste à l'action
 * principale), ni rouge. `max-md:` = le tiroir : une cible plus haute au doigt.
 */
const STYLE_PASTILLE =
  'inline-flex items-center rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium tabular-nums text-foreground transition-colors hover:bg-muted max-md:py-1.5';

/**
 * TCK-2479 (ADR-0089 §5) — la bande « À traiter », entre l'action principale et le menu.
 *
 * Elle est HORS du `<nav>` : le menu ne bouge jamais selon un compteur, et la bande n'en est pas une
 * entrée. Sans pastille, elle ne rend RIEN (pas même un conteneur vide). Chaque pastille porte un nom
 * complet qui commence par son texte visible (« 3 messages » → « 3 messages non lus », WCAG 2.5.3).
 * Au-delà de quatre, « +N » est une divulgation sur place, pas un lien.
 */
export function BandeATraiter({ visibles, autres, onNavigate }: BandeATraiterProps) {
  const t = useTranslations('nav.sidebar.aTraiter');
  const idAutres = useId();
  const [ouvert, setOuvert] = useState(false);
  if (visibles.length === 0) return null;

  const pastille = (p: PastilleATraiter) => (
    <li key={p.cle}>
      <Link
        href={p.href}
        onClick={onNavigate}
        aria-label={t(`noms.${p.cle}`, { count: p.nombre })}
        className={cn(STYLE_PASTILLE, FOCUS_RING)}
      >
        {t(`pastilles.${p.cle}`, { count: p.nombre })}
      </Link>
    </li>
  );

  return (
    <section aria-label={t('titre')} data-slot="a-traiter" className="px-3 pb-3">
      <ul className="flex flex-wrap gap-1.5">
        {visibles.map(pastille)}
        {autres.length > 0 ? (
          <li>
            <button
              type="button"
              aria-expanded={ouvert}
              aria-controls={idAutres}
              aria-label={t('autres', { count: autres.length })}
              onClick={() => setOuvert((v) => !v)}
              className={cn(STYLE_PASTILLE, FOCUS_RING, 'text-muted-foreground')}
            >
              {t('plusCourt', { count: autres.length })}
            </button>
          </li>
        ) : null}
      </ul>
      {autres.length > 0 ? (
        <ul id={idAutres} hidden={!ouvert} className="mt-1.5 flex flex-wrap gap-1.5">
          {autres.map(pastille)}
        </ul>
      ) : null}
    </section>
  );
}
```

- [ ] **Étape 6 : `useUnreadCount.ts`** — `const { data, isLoading, isError } = useNonLusTotal(...)` et :

```ts
  // TCK-2479 (ADR-0089 §5) — une relecture en ÉCHEC garde l'ancien `data` dans le cache de
  // react-query : sans `isError`, la pastille affichait un compte qu'on ne sait plus vrai. 0 vaut
  // « rien à traiter », comme pendant le chargement ; la relecture suivante (30 s) le rétablit.
  if (!enabled || isLoading || isError || !user) return 0;
```

- [ ] **Étape 7 : `AppSidebar.tsx`**
  - Imports : `pastillesATraiter` (`@/lib/navigation/a-traiter`), `BandeATraiter` (`./BandeATraiter`).
  - Les deux `useQuery` de modération déstructurent aussi `isError` (`avisEnErreur`, `biensEnErreur`).
  - Le bloc `counters` (l. 398-407) devient :

```ts
  // TCK-2479 (ADR-0089 §5) — 0 pendant le chargement ET sur une erreur, premier échec ou relecture
  // ratée (react-query garde alors l'ancien `data` : ce commentaire disait « `data === undefined` »,
  // vrai du premier échec seulement). Le badge du menu et la bande lisent ce MÊME objet : le menu
  // n'est pas l'endroit où l'on apprend qu'un endpoint est tombé.
  const total = (q: { readonly data?: { readonly meta?: { readonly total?: number } }; readonly isError?: boolean }) =>
    q.isError ? 0 : (q.data?.meta?.total ?? 0);
  const counters: Record<NavCounterKey, number> = {
    unreadMessages,
    pendingVisits: total(pendingVisits),
    unhandledLeads: total(unhandledLeads),
    reviewModeration: avisEnErreur ? 0 : (avisEnAttente?.pending_count ?? 0),
    propertyModeration: biensEnErreur ? 0 : (biensEnAttente ?? 0),
  };
  // TCK-2479 — la bande : les entrées RENDUES (donc sondées), dans l'ordre du persona.
  const bande = pastillesATraiter(entrees, counters, menu.priorites);
```

  - Dans le rendu, entre le bloc de l'action principale et le `<nav>` :

```tsx
      {/* TCK-2479 (ADR-0089 §5) — ce qui attend une réponse, HORS du `<nav>` : le menu ne bouge
          jamais selon un compteur. Rien n'est rendu quand rien n'attend. Le tiroir monte la même
          barre : la bande y est aussi. */}
      <BandeATraiter visibles={bande.visibles} autres={bande.autres} onNavigate={onNavigate} />
```

- [ ] **Étape 8 : lancer, constater le vert** — commande de l'étape 3 : PASS. Puis le périmètre de la
  barre : `npx vitest run src/components/layout src/components/chat-widget src/lib/navigation src/components/dashboard/admin/__tests__/AgencyQueues.source-unique.test.tsx`.

- [ ] **Étape 9 : ablations**
  1. Dans `AppSidebar`, trier les entrées de chaque groupe par compteur décroissant
     (`g.entrees.toSorted((a, b) => (counters[b.counterKey!] ?? 0) - (counters[a.counterKey!] ?? 0))`)
     → « AC2 » rougit (agent : « Visites » remonte dans « Prospection »).
  2. Rendre `total = (q) => q.data?.meta?.total ?? 0` (sans `isError`) → « AC3 » rougit.
  3. Retirer `if (visibles.length === 0) return null;` → « sans pastille : aucun nœud » et
     « AC1 — à zéro partout » rougissent.
  4. Donner au prestataire `priorites: ['unreadMessages', 'pendingVisits', 'unhandledLeads']` → « AC6 »
     (monté et pur) rougit.
  5. Retirer `isError` de `useUnreadCount` → son cas TCK-2479 rougit.

- [ ] **Étape 10 : `npx tsc --noEmit && npm run lint && npm run check:i18n`**, puis commit —
  `feat(web): la bande « À traiter » au-dessus du menu, triée par persona, vers les pages filtrées (TCK-2479)`.

---

### Tâche 5 : le groupe « Démarrer » (AC5)

**Fichiers :**
- Créer : `src/lib/queries/demarrage-espace.ts`, `src/components/layout/DemarrerDeLEspace.tsx`
- Modifier : `src/components/layout/AppSidebar.tsx`, `src/messages/{fr,en,wo}.json`
- Tests : `src/components/layout/__tests__/DemarrerDeLEspace.test.tsx` (neuf), `AppSidebar.test.tsx` (complété)

- [ ] **Étape 1 : les libellés** — sous `nav.sidebar.demarrer` (le `wo` = le `fr`) :

| Clé | fr | en |
|---|---|---|
| `titre` | Démarrer | Get started |
| `progression` | `{faites} sur {total}` | `{faites} of {total}` |
| `masquer` | Masquer « Démarrer » | Hide “Get started” |
| `aFaire` | À faire | To do |
| `etapes.espace.premier_bien` | Publier un premier bien | Publish a first property |
| `etapes.espace.kyc` | Faire vérifier l’agence | Get the agency verified |
| `etapes.espace.equipe` | Inviter un premier membre | Invite a first member |
| `etapes.bailleur.premier_bien` | Proposer un premier bien | Propose a first property |
| `etapes.bailleur.kyc` | Envoyer vos pièces d’identité | Send your ID documents |
| `etapes.bailleur.equipe` | Inviter un premier membre | Invite a first member |

(`etapes.bailleur.equipe` n'est rendue par aucune réponse de l'API d'aujourd'hui ; elle existe pour que
toute clé que `etapesARendre` peut former soit traduite.)

- [ ] **Étape 2 : écrire les tests qui échouent** — `DemarrerDeLEspace.test.tsx` :

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { withIntl } from '@/test/intl';
import { DemarrerDeLEspace } from '../DemarrerDeLEspace';

type Reponse = { data?: { data: { etapes: { code: string; faite: boolean }[] } }; isError?: boolean };

const etat = vi.hoisted(() => ({ reponse: {} as Reponse, profil: null as string | null, options: [] as { enabled: boolean }[] }));
vi.mock('@/lib/queries/demarrage-espace', () => ({
  useDemarrageDeLEspace: (options: { enabled: boolean }) => (etat.options.push(options), etat.reponse),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ activeProfileId: etat.profil }) }));

const CODES = ['premier_bien', 'kyc', 'equipe'];
const avec = (...faites: boolean[]): Reponse => ({
  data: { data: { etapes: faites.map((faite, i) => ({ code: CODES[i]!, faite })) } },
});
const ui = (mode: 'espace' | 'bailleur' = 'espace') => withIntl(<DemarrerDeLEspace mode={mode} />);

describe('<DemarrerDeLEspace> — TCK-2479 (AC5)', () => {
  beforeEach(() => {
    etat.reponse = {};
    etat.profil = null;
    etat.options = [];
  });

  it('une agence neuve : un groupe « Démarrer », trois liens vers l’écran qui fait chaque étape', () => {
    etat.reponse = avec(false, false, false);
    render(ui());
    const groupe = screen.getByRole('group', { name: 'Démarrer' });
    expect(within(groupe).getByRole('link', { name: /Publier un premier bien/ })).toHaveAttribute('href', '/app/properties/new');
    expect(within(groupe).getByRole('link', { name: /Faire vérifier l’agence/ })).toHaveAttribute('href', '/app/agency/kyc');
    expect(within(groupe).getByRole('link', { name: /Inviter un premier membre/ })).toHaveAttribute('href', '/app/agency/team');
    expect(within(groupe).getByText('0 sur 3')).toBeInTheDocument();
  });

  it('AC5 — disparaît étape par étape, puis en entier', () => {
    etat.reponse = avec(false, false, false);
    const { rerender, container } = render(ui());
    expect(screen.getAllByRole('link')).toHaveLength(3);

    etat.reponse = avec(true, false, false);
    rerender(ui());
    expect(screen.queryByRole('link', { name: /Publier un premier bien/ })).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByText('1 sur 3')).toBeInTheDocument();

    etat.reponse = avec(true, true, true);
    rerender(ui());
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['au chargement', {}],
    ['sur une erreur', { isError: true }],
    ['pour `etapes: []`', { data: { data: { etapes: [] } } }],
  ] as const)('rien %s', (_cas, reponse) => {
    etat.reponse = reponse as Reponse;
    const { container } = render(ui());
    expect(container).toBeEmptyDOMElement();
  });

  it('bailleur : ses libellés, et le KYC rouvre SON assistant', () => {
    etat.reponse = { data: { data: { etapes: [{ code: 'premier_bien', faite: false }, { code: 'kyc', faite: false }] } } };
    etat.profil = 'owner:3';
    render(ui('bailleur'));
    expect(screen.getByRole('link', { name: /Proposer un premier bien/ })).toHaveAttribute('href', '/app/properties/new');
    expect(screen.getByRole('link', { name: /Envoyer vos pièces d’identité/ })).toHaveAttribute('href', '/onboarding/owner?owner=3');
  });

  it('un geste le masque, et il cesse de se lire ; il revient au remontage tant que TCK-2480 ne l’enregistre pas', async () => {
    etat.reponse = avec(false, false, false);
    const { container, unmount } = render(ui());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Masquer « Démarrer »' }));
    expect(container).toBeEmptyDOMElement();
    expect(etat.options.at(-1)).toEqual({ enabled: false });

    unmount();
    render(ui());
    expect(screen.getByRole('group', { name: 'Démarrer' })).toBeInTheDocument();
  });

  it('a11y : aucune violation', async () => {
    etat.reponse = avec(true, false, false);
    const { container } = render(ui());
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
```

Dans `AppSidebar.test.tsx`, un bloc :

```tsx
describe('TCK-2479 — « Démarrer » dans la barre', () => {
  it('admin d’agence : le premier bloc du menu, avant le premier groupe', () => {
    demarrageMock.mockReturnValue({ data: { data: { etapes: [{ code: 'kyc', faite: false }] } } });
    const { container } = renderSidebar('admin-agence', '/app');
    const nav = container.querySelector('nav')!;
    expect(nav.firstElementChild).toHaveAttribute('data-slot', 'demarrer');
    expect(demarrageMock).toHaveBeenCalledWith({ enabled: true });
  });

  it.each(['client', 'locataire', 'agent', 'prestataire', 'plateforme'] as const)('%s : ni groupe ni lecture', (persona) => {
    renderSidebar(persona, '/app');
    expect(demarrageMock).not.toHaveBeenCalled();
  });

  it('espace suspendu : ni groupe ni lecture', () => {
    renderSidebar('admin-agence', '/app', { agencySuspended: true });
    expect(demarrageMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Étape 3 : lancer, constater l'échec**

Run : `npx vitest run src/components/layout/__tests__/DemarrerDeLEspace.test.tsx src/components/layout/__tests__/AppSidebar.test.tsx`
Attendu : FAIL.

- [ ] **Étape 4 : `src/lib/queries/demarrage-espace.ts`**

```ts
'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useApiQuery } from '@/hooks/useApiQuery';
import type { EtapeDeDemarrage } from '@/lib/navigation/demarrer';

/** TCK-2479 — `GET /api/me/espace/demarrage` (`EspaceDemarrageController`). */
export interface DemarrageDeLEspaceResponse {
  readonly data: { readonly etapes: readonly EtapeDeDemarrage[] };
}

/** Sans le profil : changer de profil oublie tout le cache de l'espace (`oublierLeCacheDEspace`). */
export const CLE_DEMARRAGE = ['me', 'espace', 'demarrage'] as const;

const FRAICHEUR_MS = 30_000;

/**
 * Les étapes du groupe « Démarrer ». Aucun sondage : la lecture se refait à la NAVIGATION quand elle a
 * plus de 30 s — une étape faite sur sa page (publier, inviter) disparaît au retour dans le menu, que
 * la barre, montée par le layout, ne remonte pas.
 *
 * ⚠ Le préfixe `/api` est écrit ici : `useApiQuery` ne l'ajoute pas (CLAUDE.md racine).
 */
export function useDemarrageDeLEspace({ enabled }: { readonly enabled: boolean }) {
  const { token } = useAuth();
  const pathname = usePathname();
  const client = useQueryClient();
  const actif = enabled && Boolean(token);
  const requete = useApiQuery<DemarrageDeLEspaceResponse>(CLE_DEMARRAGE, '/api/me/espace/demarrage', {
    enabled: actif,
    staleTime: FRAICHEUR_MS,
    retry: false,
  });
  useEffect(() => {
    if (actif) void client.refetchQueries({ queryKey: CLE_DEMARRAGE, type: 'active', stale: true });
  }, [pathname, actif, client]);
  return requete;
}
```

- [ ] **Étape 5 : `DemarrerDeLEspace.tsx`**

```tsx
'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight, Circle, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { etapesARendre, type ModeDemarrer } from '@/lib/navigation/demarrer';
import { useDemarrageDeLEspace } from '@/lib/queries/demarrage-espace';
import { cn } from '@/lib/utils';
import { FOCUS_RING, STYLE_TITRE } from './styles-de-la-barre';

interface DemarrerDeLEspaceProps {
  readonly mode: ModeDemarrer;
  readonly onNavigate?: () => void;
}

/**
 * TCK-2479 (ADR-0089 §5) — « Démarrer » : les étapes qui restent pour mettre l'espace en service,
 * chacune un lien vers l'écran qui la fait. Premier bloc du `<nav>` : il défile avec le menu et se lit
 * à l'arrivée d'un espace neuf.
 *
 * AC5 — une étape faite SORT du groupe ; le groupe disparaît quand tout est fait. Rien pendant le
 * chargement, sur une erreur, ni pour `etapes: []` (un profil sans étape) : il accompagne, il ne
 * bloque pas — comme la carte « Mise en service » du tableau de bord (TCK-589), dont il reprend trois
 * étapes.
 *
 * ⚠ Le masquage vit dans cet état local : il ne survit ni au rechargement ni à l'autre montage de la
 * barre (le tiroir). TCK-2480 l'enregistre sur le compte (`preferences.navigation…demarrer_masque`).
 */
export function DemarrerDeLEspace({ mode, onNavigate }: DemarrerDeLEspaceProps) {
  const t = useTranslations('nav.sidebar.demarrer');
  const idTitre = useId();
  const { activeProfileId } = useAuth();
  const [masque, setMasque] = useState(false);
  const { data, isError } = useDemarrageDeLEspace({ enabled: !masque });
  if (masque || isError || !data) return null;

  const { restantes, faites, total } = etapesARendre(data.data.etapes, mode, activeProfileId);
  if (restantes.length === 0) return null;

  return (
    <div
      role="group"
      aria-labelledby={idTitre}
      data-slot="demarrer"
      className="mb-4 rounded-lg border border-border bg-muted/40 p-2"
    >
      <div className="flex items-center gap-2 pl-1">
        <p id={idTitre} className={cn('min-w-0 flex-1 truncate', STYLE_TITRE)}>
          {t('titre')}
        </p>
        <span className="text-xs tabular-nums text-muted-foreground">{t('progression', { faites, total })}</span>
        <button
          type="button"
          onClick={() => setMasque(true)}
          aria-label={t('masquer')}
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-md:size-9',
            FOCUS_RING,
          )}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <ul className="mt-1 space-y-0.5">
        {restantes.map((etape) => (
          <li key={etape.code}>
            <Link
              href={etape.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-2 rounded-md px-1 py-1.5 text-sm text-foreground transition-colors hover:bg-muted max-md:py-2',
                FOCUS_RING,
              )}
            >
              <Circle className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 text-pretty">{t(etape.cle)}</span>
              <span className="sr-only">{t('aFaire')}</span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Étape 6 : `AppSidebar.tsx`** — importer `DemarrerDeLEspace` ; en tête du `<nav>`, avant
  `groupes.map(…)` :

```tsx
        {/* TCK-2479 — « Démarrer » : un espace neuf sait par où commencer. Dans le `<nav>`, il défile
            avec le menu ; il n'en réordonne aucune entrée. */}
        {menu.demarrer ? <DemarrerDeLEspace mode={menu.demarrer} onNavigate={onNavigate} /> : null}
```

- [ ] **Étape 7 : lancer, constater le vert** — commande de l'étape 3, puis le périmètre :
  `npx vitest run src/lib/navigation src/components/layout src/components/chat-widget src/components/leads src/components/visits src/components/admin/__tests__/ModerationWorkspace.test.tsx src/components/dashboard/admin/__tests__/AgencyQueues.source-unique.test.tsx "src/app/(dashboard)/app"`
  — attendu : PASS. Un fichier qui monte `AppShell`/`AppSidebar` sans moquer `demarrage-espace` reste
  muet (`token` absent → lecture désactivée) ; s'il rougit, y ajouter le mock de l'étape 2, et l'écrire.

- [ ] **Étape 8 : ablations**
  1. Retirer `if (restantes.length === 0) return null;` → « AC5 … puis en entier » rougit (un groupe vide reste).
  2. Lier le KYC du bailleur à `/onboarding/owner` sans `?owner=` → « bailleur : … SON assistant » rougit.
  3. Monter `DemarrerDeLEspace` sans la condition `menu.demarrer` (mode `'espace'` en dur) → « client : ni groupe ni lecture » rougit.
  4. Retirer `masque ||` du `return null` → « un geste le masque » rougit.

- [ ] **Étape 9 : `npx tsc --noEmit && npm run lint && npm run check:i18n`**, puis commit —
  `feat(web): le groupe « Démarrer » d'un espace neuf, étape par étape (TCK-2479)`.

---

### Tâche 6 : mesure au navigateur, notes et livraison

- [ ] **Étape 1 : mesure** — `./dev.sh` (API + front ; la tâche 1 doit être sur la branche). Un compte
  par persona du seeder (relever les e-mails dans `takussan-api/database/seeders/`), plus un admin d'une
  agence NEUVE (créée par l'assistant hôte ou agence). Méthode : `docs/qa/responsive-2026-09-02.md`
  (CDP direct, cf. mémoire « Mesure au navigateur par CDP direct »). À 390, 768 et 1366 px :
  1. `scrollWidth − innerWidth = 0` sur `/app`, barre fixe et tiroir ouvert ; la bande et « Démarrer »
     présents dans le TIROIR aussi.
  2. Chaque pastille ouvre sa page sur ce qui attend : visites → onglet « Demandées » ; demandes →
     « À traiter » ; avis → filtre « En attente » ; biens → la file ; messages → la liste.
  3. Ordre clavier : en-tête d'espace → action principale → pastilles → « Démarrer » → menu.
  4. **Arbitrage 3** : le lien KYC du bailleur (`/onboarding/owner?owner=…`) sur un profil DÉJÀ actif —
     l'assistant s'ouvre-t-il sur le KYC, et sa fin (`complete`) réussit-elle ? Sinon : retirer `kyc`
     des étapes du bailleur côté API (et son test), l'écrire, revenir à la session.
  5. Une étape faite (publier un premier bien) : revenir sur `/app` après 30 s → elle a disparu.
  Joindre les relevés aux notes du ticket.

- [ ] **Étape 2 : notes du ticket** — dans TCK-2479, « Notes d'implémentation » : les relevés R1-R3
  (résumés, avec fichier:ligne) ; les arbitrages tels que validés ; les écarts écrits : messages vers la
  liste entière, visites passées `scheduled` comptées hors de l'onglet « Demandées », avis sur l'agence
  listés non comptés, avis `reported` comptés pour le super-admin hors du filtre `pending`, masquage de
  « Démarrer » non persistant avant TCK-2480, clé `counters.unhandledLeads` ajoutée (bogue antérieur) ;
  les ablations et leur résultat ; les relevés au navigateur. Proposer en une ligne chacun les tickets de
  suite : filtre « non lus » de la messagerie (API + liste) ; clôture ou affichage des visites
  `scheduled` passées. `status: doing`, `node docs/backlog/ranger-tickets.mjs`.

- [ ] **Étape 3 : gardes du dépôt** — `for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done`,
  `node docs/backlog/gen-index.mjs --check`, `node docs/gen-features-by-actor.mjs --check`.

- [ ] **Étape 4 :** commit des notes — `docs(backlog): notes et mesures de TCK-2479`. Puis rendre la main
  à la session : push, PR vers `dev` et `/sync-specs`
  (`docs/features.md#navigation-de-la-console-selon-le-profil-actif` : la bande et « Démarrer ») se
  font avec l'accord du porteur.

<?php

namespace Tests\Unit\Http\Resources;

use App\Models\User;
use DateTimeInterface;
use Illuminate\Contracts\Support\Arrayable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Routing\Route;
use Illuminate\Support\Collection;
use JsonSerializable;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\ResourceInventory;
use Tests\Support\ResourceSubjects;
use Tests\Support\WireDateForm;
use Tests\TestCase;

/**
 * TCK-327 / AC2 — **l'inventaire des dates émises, par VALEUR et non par NOM.**
 *
 * `DateRepresentationTest`, à côté, fige la correspondance cast ↔ forme **champ par champ** : ses
 * deux `#[DataProvider]` sont écrits à la main, délibérément, parce qu'ils énumèrent les champs
 * dont la forme est un contrat. Ce fichier-ci répond à l'autre moitié de la question, celle qu'un
 * provider manuel ne peut pas atteindre : *y a-t-il une date que personne n'a pensé à lister ?*
 *
 * **Pourquoi ni ce test ni la garde statique ne suffisent seuls.**
 * `scripts/check-resource-date-format.mjs` lit le SOURCE et reconnaît une date à son NOM de clé
 * (`*_at`, `*_date`, `*_since`…). Il voit donc les branches jamais exécutées — un `whenLoaded`
 * dont la relation n'est pas chargée ici — et il rate tout ce qu'on n'a pas pensé à nommer :
 * `member_since` lui a échappé jusqu'à ce qu'on ajoute `_since` à sa liste de suffixes.
 * Ce test-ci EXÉCUTE la ressource et lit la VALEUR : il ne peut pas rater une date à cause de son
 * nom, et il ne voit que ce qui a été exécuté. *Les deux gardes se trompent différemment, et
 * c'est la seule raison d'en avoir deux.*
 *
 * Le cas qui le prouve est dans l'arbre : `Accounting/MatchCandidateResource::paid_at` émet
 * `2026-08-17` pour un champ dont le cast amont est `datetime`. **Par valeur, c'est conforme** —
 * une date calendaire est l'une des deux formes d'ADR-0018 — et ce test le laisse passer à juste
 * titre. Seule la garde statique, qui connaît le cast, peut le compter ; elle le fait, en
 * exception écrite.
 */
class DateInventoryByValueTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Les clés qu'AUCUNE des 96 résolutions n'atteint, et pourquoi elles ne compromettent pas AC2.
     *
     * Ce n'est pas une liste d'exemptions de format : c'est l'inventaire ÉCRIT de ce que le
     * parcours ne regarde pas. Il est gardé à l'égalité stricte — une clé de plus fait rougir,
     * une clé de moins aussi.
     *
     * @var array<string,string>
     */
    private const CLES_JAMAIS_ATTEINTES = [
        'App\Http\Resources\CustomerResource::tasks_count' => "`whenCounted('tasks')` — un compteur ENTIER, jamais une date. "
            .'Il exige un `withCount()` sur la requête ; le sujet vient d\'une factory, pas d\'un contrôleur.',
        'App\Http\Resources\LeaseResource::renewals_count' => "`whenCounted('renewals')` — même forme, même absence de date.",
    ];

    /** Profondeur maximale du parcours — un garde-fou contre un graphe cyclique, pas une limite métier. */
    private const PROFONDEUR_MAX = 8;

    /**
     * **La garde qui empêche le dispositif de se vider en silence.**
     *
     * Une ressource nouvelle que ni la convention `<Modele>Resource`, ni les modèles explicites,
     * ni les recettes sur mesure, ni les non-énumérables ne couvrent fait rougir ICI — sans quoi
     * elle sortirait du périmètre sans que rien ne l'annonce, et le vert des autres tests
     * continuerait de s'afficher. Symétriquement, une entrée de registre qui ne correspond plus à
     * un fichier réel rougit aussi : *une autorisation qui survit à son motif est le mécanisme par
     * lequel une liste d'exemptions devient une passoire.*
     */
    public function test_le_registre_suit_encore_l_arborescence_des_ressources(): void
    {
        $anomalies = ResourceInventory::anomaliesDuRegistre();

        $this->assertSame(
            [],
            $anomalies,
            "Le registre de Tests\\Support\\ResourceInventory ne décrit plus l'arborescence :\n  - "
            .implode("\n  - ", $anomalies),
        );

        // Non-vacuité : un registre parfaitement cohérent avec un dossier VIDE serait vert.
        $this->assertGreaterThanOrEqual(
            40,
            count(ResourceInventory::toutes()),
            'app/Http/Resources/ ne rend plus le nombre de ressources attendu — '
            .'44 concrètes mesurées le 2026-08-22. Le parcours ne mesure plus ce qu\'il prétend.',
        );
    }

    /**
     * **AC2 par la valeur : rien de ce qui EST une date ne sort sous une autre forme.**
     *
     * Chaque ressource énumérable est instanciée sur un sujet dont TOUTES les colonnes de type
     * date/datetime portent l'instant ou le jour de référence — lus dans le conteneur par
     * `getCasts()`, jamais devinés. La sortie de `resolve()` est ensuite parcourue
     * RÉCURSIVEMENT : `ConditionallyLoadsAttributes::filter()` ne descend que dans les
     * `MergeValue` et les `JsonResource`, jamais dans un tableau PHP nu — un Carbon imbriqué dans
     * un tableau littéral survit donc à `resolve()`, et c'est le cas de `CustomerResource:52` et
     * `KycDossierResource:34`.
     */
    public function test_aucune_ressource_n_emet_de_date_hors_des_deux_formes_d_adr_0018(): void
    {
        $requete = Request::create('/', 'GET');
        $utilisateur = User::factory()->create();

        $violations = [];
        $datesConformes = 0;
        $ressourcesParcourues = 0;
        /** @var array<string,bool> $vues */
        $vues = [];

        // **Deuxième appelant : une requête dont la route répond « oui » à tout `routeIs()`.**
        // Huit clés de `PropertyResource` — dont `documents`, `photos` et `price_history`, qui
        // portent des dates imbriquées — ne sont émises que sur les routes de DÉTAIL. Une seule
        // variante de requête laisserait donc ces branches non exécutées, et l'inventaire les
        // compterait comme « pas de date » alors qu'il ne les a pas regardées.
        $routeQuiDitOui = new class(['GET'], '/', []) extends Route
        {
            public function named(...$patterns): bool
            {
                return true;
            }
        };

        $detail = Request::create('/', 'GET');
        $detail->setRouteResolver(fn () => $routeQuiDitOui);

        foreach (ResourceInventory::enumerables() as $resource) {
            foreach (ResourceSubjects::pour($resource) as $etiquette => $sujet) {
                foreach (['liste' => $requete, 'détail' => $detail] as $variante => $appelant) {
                    $this->activerLAppelant($appelant, $utilisateur);

                    $instance = new $resource($sujet);
                    $declarees = (array) $instance->toArray($appelant);
                    $sortie = $instance->resolve($appelant);

                    foreach (array_keys($declarees) as $cle) {
                        $vues["{$resource}::{$cle}"] ??= false;
                    }

                    foreach (array_keys($sortie) as $cle) {
                        $vues["{$resource}::{$cle}"] = true;
                    }

                    $this->parcourir(
                        $sortie,
                        $resource,
                        "{$etiquette}/{$variante}",
                        '',
                        0,
                        $violations,
                        $datesConformes,
                        $appelant,
                    );

                    $ressourcesParcourues++;
                }
            }
        }

        $this->assertSame(
            [],
            $violations,
            "Des dates sortent hors des deux formes d'ADR-0018 :\n  - ".implode("\n  - ", $violations),
        );

        // ── Ce que le parcours n'a PAS regardé, et qui doit rester écrit ─────────────────────────
        //
        // Une clé déclarée par `toArray()` mais filtrée par `resolve()` dans TOUTES les résolutions
        // est une branche que l'inventaire n'a jamais exécutée : il ne peut rien dire de ce qu'elle
        // émettrait. Sans cette assertion, ce trou grandirait en silence à chaque `when*()` ajouté —
        // et le vert des lignes ci-dessus continuerait de s'afficher, ce qui est exactement le
        // motif pour lequel AC2 a été décoché le 2026-08-20.
        $jamaisEmises = array_keys(array_filter($vues, fn (bool $vue) => ! $vue));
        sort($jamaisEmises);

        $this->assertSame(
            array_keys(self::CLES_JAMAIS_ATTEINTES),
            $jamaisEmises,
            "L'ensemble des clés que le parcours n'atteint jamais a changé. Toute entrée nouvelle "
            .'est une branche dont ce test ne sait RIEN — la rendre atteignable, ou l\'inscrire dans '
            .'CLES_JAMAIS_ATTEINTES avec la raison écrite et la vérification qu\'elle ne porte pas de date.',
        );

        // ── Non-vacuité — sans ces deux planchers, un `resolve()` qui rendrait `[]` passerait ────
        $this->assertGreaterThanOrEqual(
            90,
            $ressourcesParcourues,
            'Moins de résolutions parcourues qu\'au 2026-08-22 (96 : 44 ressources → 48 sujets, '
            .'ProfileResource comptant pour ses cinq profils polymorphes, × 2 variantes d\'appelant). '
            .'Le parcours a perdu de la portée.',
        );

        $this->assertGreaterThanOrEqual(
            360,
            $datesConformes,
            "Le parcours n'a vu que {$datesConformes} dates conformes, contre 386 mesurées le "
            .'2026-08-22 (la garde statique, elle, compte 146 CLÉS de date — les deux nombres ne '
            .'se comparent pas : celui-ci compte des VALEURS, tableaux imbriqués inclus). '
            .'Un inventaire qui ne trouve plus ses dates est vert pour la mauvaise raison — '
            .'c\'est le défaut exact qui a fait décocher AC2 le 2026-08-20.',
        );
    }

    /**
     * Rend `$appelant` courant pour la ressource qu'on s'apprête à résoudre.
     *
     * Deux choses, et **l'ORDRE des deux est load-bearing — l'inverse est silencieux.**
     * `MediaResource::conversionUrl()` lit `request()`, le helper GLOBAL et non son argument : il
     * faut donc lier l'instance au conteneur. Or `Application::instance()` déclenche les rappels de
     * rebinding, et `AuthServiceProvider::registerRequestRebindHandler()` REMPLACE à cette occasion
     * le résolveur d'utilisateur de la requête par celui du garde. Poser `setUserResolver()` avant
     * cette liaison le fait donc écraser : `$request->user()` redevient `null`, et les quatre clés
     * que `PropertyResource` conditionne à un appelant authentifié — dont TROIS DATES — quittent la
     * sortie sans que rien ne rougisse.
     *
     * Mesuré le 2026-08-22 : dans le mauvais ordre le parcours voit 176 dates, dans le bon 191.
     */
    private function activerLAppelant(Request $appelant, User $utilisateur): void
    {
        $this->app->instance('request', $appelant);
        $appelant->setUserResolver(fn () => $utilisateur);
    }

    /**
     * Le parcours récursif d'une sortie de ressource.
     *
     * @param  array<int,string>  $violations
     */
    private function parcourir(
        mixed $valeur,
        string $resource,
        string $etiquette,
        string $chemin,
        int $profondeur,
        array &$violations,
        int &$datesConformes,
        Request $requete,
    ): void {
        if ($profondeur > self::PROFONDEUR_MAX) {
            return;
        }

        $ou = $chemin === '' ? '(racine)' : $chemin;

        if ($valeur instanceof DateTimeInterface) {
            $violations[] = "{$resource} [{$etiquette}] → {$ou} : objet ".$valeur::class
                .' NON CONVERTI. Sérialisé par Laravel, il rendra `2026-08-17T12:34:56.000000Z` — '
                .'passer par $this->iso() ou $this->calendarDate().';

            return;
        }

        if (is_string($valeur)) {
            $ecart = WireDateForm::ecart($valeur);

            if ($ecart !== null) {
                $violations[] = "{$resource} [{$etiquette}] → {$ou} : « {$valeur} » — {$ecart}. "
                    .'Attendu : `2026-08-17T12:34:56+00:00` (instant) ou `2026-08-17` (jour calendaire).';
            } elseif (WireDateForm::estConforme($valeur) && WireDateForm::ressembleAUneDate($valeur)) {
                $datesConformes++;
            }

            return;
        }

        if (is_array($valeur)) {
            foreach ($valeur as $cle => $enfant) {
                $this->parcourir(
                    $enfant, $resource, $etiquette,
                    $chemin === '' ? (string) $cle : "{$chemin}.{$cle}",
                    $profondeur + 1, $violations, $datesConformes, $requete,
                );
            }

            return;
        }

        // Une ressource imbriquée n'est résolue qu'au moment de la réponse : on la résout ici.
        if ($valeur instanceof JsonResource) {
            $this->parcourir(
                $valeur->resolve($requete), $resource, $etiquette, $chemin,
                $profondeur + 1, $violations, $datesConformes, $requete,
            );

            return;
        }

        // Un modèle laissé brut dans la sortie est sérialisé par `Model::serializeDate()`, donc
        // en `…T12:34:56.000000Z` : on descend dedans plutôt que de l'ignorer.
        if ($valeur instanceof Model || $valeur instanceof Collection || $valeur instanceof Arrayable) {
            $this->parcourir(
                $valeur->toArray(), $resource, $etiquette, $chemin,
                $profondeur + 1, $violations, $datesConformes, $requete,
            );

            return;
        }

        if ($valeur instanceof JsonSerializable) {
            $this->parcourir(
                $valeur->jsonSerialize(), $resource, $etiquette, $chemin,
                $profondeur + 1, $violations, $datesConformes, $requete,
            );
        }
    }

    /**
     * **La reconnaissance de forme est elle-même une garde : elle doit être éprouvée.**
     *
     * Un test d'inventaire dont le détecteur ne détecte rien est vert sur tout. Les quatre formes
     * ci-dessous sont celles que le dépôt a réellement payées, plus deux variantes voisines.
     */
    public static function formesInterdites(): array
    {
        return [
            'Carbon::toISOString' => ['2026-08-17T12:34:56.000000Z'],
            'chaîne SQL brute' => ['2026-08-17 12:34:56'],
            'suffixe Z sans microsecondes' => ['2026-08-17T12:34:56Z'],
            'jour/mois/année' => ['17/08/2026'],
            'décalage local conservé' => ['2026-08-17T14:34:56+02:00'],
            'sans fuseau du tout' => ['2026-08-17T12:34:56'],
            'RFC 2822' => ['Mon, 17 Aug 2026 12:34:56 +0000'],
            'en toutes lettres' => ['17 August 2026'],
            'heure seule' => ['12:34:56'],
            'jour-mois-année' => ['17-08-2026'],
        ];
    }

    #[DataProvider('formesInterdites')]
    public function test_la_reconnaissance_attrape_les_formes_interdites(string $valeur): void
    {
        $this->assertTrue(
            WireDateForm::ressembleAUneDate($valeur),
            "« {$valeur} » n'est plus reconnue comme une date : l'inventaire deviendrait muet dessus.",
        );

        $this->assertNotNull(
            WireDateForm::ecart($valeur),
            "« {$valeur} » est acceptée comme conforme alors qu'ADR-0018 ne connaît que "
            .'`2026-08-17T12:34:56+00:00` et `2026-08-17`.',
        );
    }

    /**
     * L'autre moitié : une reconnaissance qui crie sur un identifiant finit désarmée pour cause de
     * faux positifs, c'est-à-dire supprimée. Ces valeurs traversent l'API tous les jours.
     */
    public static function valeursQuiNeSontPasDesDates(): array
    {
        return [
            'numéro de version' => ['1.2.3'],
            'version longue' => ['2026.8.17'],
            'uuid' => ['9f1c2f3a-1b2c-4d5e-8f90-0a1b2c3d4e5f'],
            'téléphone sénégalais' => ['+221 77 123 45 67'],
            'montant' => ['150000.00'],
            'identifiant composite' => ['agent:5'],
            'slug' => ['villa-ngor-2026'],
            'référence' => ['REF-2026-08'],
            'url signée' => ['https://takussan.test/kyc/1?expires=1755434096&signature=abc'],
            'phrase contenant une année' => ['Bail signé en 2026 pour 12 mois'],
            'chaîne vide' => [''],
            'iban' => ['SN08SN0100152000048500003035'],
        ];
    }

    #[DataProvider('valeursQuiNeSontPasDesDates')]
    public function test_la_reconnaissance_ne_crie_pas_sur_ce_qui_n_est_pas_une_date(string $valeur): void
    {
        $this->assertFalse(
            WireDateForm::ressembleAUneDate($valeur),
            "« {$valeur} » est prise pour une date : un faux positif désarme la garde plus sûrement "
            .'qu\'un trou, parce qu\'on finit par la retirer.',
        );
    }

    /** Les deux formes d'ADR-0018 sont reconnues comme des dates ET comme conformes. */
    public function test_les_deux_formes_d_adr_0018_sont_conformes(): void
    {
        foreach (['2026-08-17T12:34:56+00:00', '2026-08-17'] as $valeur) {
            $this->assertTrue(WireDateForm::ressembleAUneDate($valeur));
            $this->assertTrue(WireDateForm::estConforme($valeur));
            $this->assertNull(WireDateForm::ecart($valeur));
        }
    }
}

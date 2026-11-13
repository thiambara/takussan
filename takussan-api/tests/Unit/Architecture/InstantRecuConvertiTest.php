<?php

namespace Tests\Unit\Architecture;

use App\Http\Requests\Concerns\ConvertitLesInstantsRecus;
use App\Rules\InstantIso;
use App\Rules\JourIso;
use App\Support\FinInclusive;
use App\Support\InstantRecu;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * TCK-2743 (lot 4) — une date-heure REÇUE par une FormRequest et destinée à une colonne `datetime` passe
 * par LA conversion du dépôt ({@see InstantRecu}) avant l'écriture. Le cast `datetime` écrit l'heure
 * MURALE de la valeur qu'on lui donne : `…T11:00:00+01:00` s'écrivait 11:00, l'instant d'une heure trop
 * tard, et une règle `after:now` ou `before_or_equal:now` jugeait un autre instant que celui écrit.
 *
 * Le croisement est celui du relevé du ticket : un champ dont la règle contient `date` (sans
 * `date_format`, qui ne laisse passer aucun décalage) et dont le nom — son dernier segment, pour
 * `visits.*.scheduled_at` — est celui d'une colonne castée `datetime` dans `app/Models`. Un tel champ est
 * converti par l'une de ces voies :
 *
 * - le trait {@see ConvertitLesInstantsRecus}, le champ listé dans `instantsRecus()` ;
 * - un accesseur de la FormRequest : une méthode qui nomme le champ et appelle `InstantRecu::` (ou
 *   `MaintenanceRequest::scheduledInstant()`, son cas particulier) ;
 * - {@see FinInclusive::de()}, pour une FIN qui peut être une date seule ({@see self::FINS_INCLUSIVES}) ;
 *   ce champ-là n'est JAMAIS dans `instantsRecus()` — converti en amont, une date seule arriverait en
 *   objet (minuit) et perdrait sa fin de jour ;
 * - une conversion à l'écriture, hors de la FormRequest ({@see self::CONVERTIS_A_L_ECRITURE}) ;
 * - une exception motivée ({@see self::EXCEPTIONS}).
 *
 * Chaque liste est vérifiée dans les deux sens : une entrée qui ne s'applique plus à rien, ou dont le
 * fichier lecteur ne convertit plus, fait rougir la garde.
 *
 * Le trait ne convertit que pour qui le LIT : chaque FormRequest qui l'emploie a au moins un lecteur
 * `validatedAvecInstants()` dans `app/Http/Controllers` ou `app/Services`, et aucun lecteur `validated()`
 * ni `safe()` du même type ({@see self::test_chaque_requete_au_trait_est_lue_par_sa_conversion()}).
 *
 * **Limites** : le croisement est par NOM — une date reçue sous un autre nom que sa colonne lui échappe ;
 * une règle construite ailleurs (méthode, variable) n'est pas lue, ni une clé écrite par constante
 * (`self::CHAMP => ['required', 'date']`) : seules les clés littérales entre guillemets simples le sont
 * (Pint réécrit les doubles). Le lecteur est reconnu par le TYPE de son paramètre (`StoreTaskRequest
 * $request`) : une requête relue par `app(StoreTaskRequest::class)` ou passée sans type ne l'est pas, et
 * `input()` / `all()` ne sont pas jugés — ils lisent aussi les champs qui ne sont pas des dates. Les
 * lectures sont cherchées sur le NOM du paramètre typé : un alias (`$r = $request; $r->validated()`)
 * échappe au refus de `validated()`, et un appel à `validatedAvecInstants()` dont le résultat n'est pas
 * utilisé — un appel mort, suivi de la lecture de l'alias — compte comme un lecteur (vérification adverse
 * de TCK-2743). La garde est un plancher.
 *
 * TCK-2752 — chaque champ relevé porte aussi la FORME ISO 8601 stricte ({@see InstantIso}), dans chaque
 * branche d'une règle conditionnelle, exceptions et fins inclusives comprises
 * ({@see self::test_toute_date_heure_recue_porte_la_forme_iso()}). Mêmes limites de lecture.
 *
 * TCK-2768 — AUCUNE date reçue n'est nue, quelle que soit sa colonne : chaque `date` d'un tableau de règles
 * de `app/` porte {@see JourIso} (un jour) ou {@see InstantIso} (un jour ou un instant)
 * ({@see self::test_aucune_date_recue_n_est_nue()}). La lecture est par TABLEAU, donc par branche, et vaut
 * hors des FormRequests (`Validator::make`, filtres, critères sauvegardés).
 *
 * TCK-2768 (r1 de la vérification de 7981e617d) — même règle pour `date_format:Y-m-d`, qui admet toute année à
 * quatre chiffres (l'an 1, 9999) : il porte {@see JourIso}. Les autres `date_format` (des mois) sont épinglés
 * ({@see self::FORMATS_HORS_JOUR}).
 */
class InstantRecuConvertiTest extends TestCase
{
    /**
     * Les fins lues par `FinInclusive::de()` : le champ, puis le fichier qui l'appelle et l'appel exact.
     *
     * @var array<string, array{0: string, 1: string}>
     */
    private const FINS_INCLUSIVES = [
        'Http/Requests/Agency/StoreAgentAbsenceRequest.php:ends_at' => ['Services/Agency/AgentAbsenceService.php', "FinInclusive::de(\$data['ends_at'])"],
        'Http/Requests/Agency/UpdateAgentAbsenceRequest.php:ends_at' => ['Services/Agency/AgentAbsenceService.php', "FinInclusive::de(\$data['ends_at'])"],
        'Http/Requests/Permissions/StoreRoleDelegationRequest.php:ends_at' => ['Services/Permissions/RoleDelegationService.php', "FinInclusive::de(\$data['ends_at'])"],
    ];

    /**
     * Converti à l'écriture, hors de la FormRequest : le champ, puis le fichier qui convertit et l'appel.
     *
     * @var array<string, array{0: string, 1: string}>
     */
    private const CONVERTIS_A_L_ECRITURE = [
        // TCK-2700 — le `PATCH` d'une intervention convertit dans le contrôleur, au même endroit que la
        // garde des champs de planification (`SCHEDULING_FIELDS`).
        'Http/Requests/Api/UpdateMaintenanceRequestRequest.php:scheduled_at' => ['Http/Controllers/Api/MaintenanceRequestController.php', "MaintenanceRequest::scheduledInstant((string) \$data['scheduled_at'])"],
    ];

    /**
     * Les champs qui ne s'écrivent jamais, avec leur raison.
     *
     * @var array<string, string>
     */
    private const EXCEPTIONS = [
        // Bornes d'un rapport (décision du porteur, 2026-11-12) : une LECTURE, jamais écrite dans la colonne
        // homonyme ; elles se lisent par jour.
        'Http/Requests/Api/Admin/GrowthReportingRequest.php:starts_at' => 'bornes de rapport',
        'Http/Requests/Api/Admin/GrowthReportingRequest.php:ends_at' => 'bornes de rapport',
        'Http/Requests/Api/Admin/RevenueReportingRequest.php:starts_at' => 'bornes de rapport',
        'Http/Requests/Api/Admin/RevenueReportingRequest.php:ends_at' => 'bornes de rapport',
        'Http/Requests/Api/Admin/ReportExportRequest.php:starts_at' => 'bornes de rapport',
        'Http/Requests/Api/Admin/ReportExportRequest.php:ends_at' => 'bornes de rapport',
    ];

    public function test_toute_date_heure_recue_vers_une_colonne_datetime_est_convertie(): void
    {
        $app = dirname(__DIR__, 3).'/app';
        $colonnes = $this->colonnesDatetime($app.'/Models');
        $this->assertGreaterThan(100, count($colonnes), 'Trop peu de colonnes `datetime` : la lecture des casts ne voit plus les modèles.');

        $fautes = [];
        $vus = [];
        $lus = 0;
        foreach ($this->fichiers($app.'/Http/Requests') as $chemin) {
            $lus++;
            $relatif = substr($chemin, strlen($app) + 1);
            $code = $this->sansCommentaires((string) file_get_contents($chemin));
            foreach ($this->champsDate($code) as $champ) {
                $nom = preg_replace('/^.*\./', '', $champ);
                if (! isset($colonnes[$nom])) {
                    continue;
                }
                $cle = $relatif.':'.$nom;
                $vus[$cle] = true;
                $parTrait = in_array($nom, $this->instantsRecus($code), true);

                if (isset(self::FINS_INCLUSIVES[$cle])) {
                    if ($parTrait) {
                        $fautes[] = "{$cle} : une fin lue par `FinInclusive::de()` est convertie en amont par `instantsRecus()` — une date seule y perdrait sa fin de jour.";
                    }

                    continue;
                }
                if (isset(self::CONVERTIS_A_L_ECRITURE[$cle]) || isset(self::EXCEPTIONS[$cle])) {
                    continue;
                }
                if (! $parTrait && ! $this->accesseurConvertit($code, $nom)) {
                    $fautes[] = "{$cle} : règle `date` vers une colonne `datetime`, sans conversion. Lister le champ dans `instantsRecus()` (trait ConvertitLesInstantsRecus) ou l'exposer par un accesseur qui passe par `InstantRecu::`.";
                }
            }
        }

        // Non-vacuité : un chemin faux ou une lecture des règles cassée ne doit pas rendre un vert vide.
        $this->assertGreaterThan(300, $lus, 'Trop peu de FormRequests lues : la garde ne regarde plus le bon dossier.');
        $this->assertGreaterThan(35, count($vus), 'Trop peu de champs date-heure relevés : la lecture des règles ne voit plus les champs.');

        foreach ([...self::FINS_INCLUSIVES, ...self::CONVERTIS_A_L_ECRITURE] as $cle => [$lecteur, $appel]) {
            if (! isset($vus[$cle])) {
                $fautes[] = "{$cle} : l'entrée ne s'applique plus à aucun champ relevé — la retirer.";
            }
            $this->assertFileExists($app.'/'.$lecteur);
            if (! str_contains($this->sansCommentaires((string) file_get_contents($app.'/'.$lecteur)), $appel)) {
                $fautes[] = "{$cle} : {$lecteur} n'appelle plus `{$appel}` — le champ n'est plus converti.";
            }
        }
        foreach (array_keys(self::EXCEPTIONS) as $cle) {
            if (! isset($vus[$cle])) {
                $fautes[] = "{$cle} : l'exception ne s'applique plus à aucun champ relevé — la retirer.";
            }
        }

        $this->assertSame([], $fautes, "Date-heure reçue écrite sans conversion (TCK-2743) :\n".implode("\n", $fautes));
    }

    /**
     * Vérification adverse de TCK-2743 — `TaskController::store` relu par `validated()` gardait la garde
     * verte : seule la FormRequest était jugée, et le trait ne convertit que pour `validatedAvecInstants()`.
     */
    public function test_chaque_requete_au_trait_est_lue_par_sa_conversion(): void
    {
        $app = dirname(__DIR__, 3).'/app';
        $auTrait = [];
        foreach ($this->fichiers($app.'/Http/Requests') as $chemin) {
            $code = (string) file_get_contents($chemin);
            if (str_contains($this->sansCommentaires($code), 'use ConvertitLesInstantsRecus;')
                && preg_match('/^namespace\s+([\w\\\\]+);/m', $code, $ns) === 1
                && preg_match('/\bclass\s+(\w+)/', $code, $classe) === 1) {
                $auTrait[$ns[1].'\\'.$classe[1]] = 0;
            }
        }
        $this->assertGreaterThan(15, count($auTrait), 'Trop peu de FormRequests au trait : la lecture ne les voit plus.');

        $fautes = [];
        foreach ([...$this->fichiers($app.'/Http/Controllers'), ...$this->fichiers($app.'/Services')] as $chemin) {
            $code = $this->sansCommentaires((string) file_get_contents($chemin));
            $relatif = substr($chemin, strlen($app) + 1);
            foreach ($this->methodes($code) as [$nom, $parametres, $corps]) {
                foreach ($this->parametresTypes($code, $parametres) as $variable => $type) {
                    if (! array_key_exists($type, $auTrait)) {
                        continue;
                    }
                    $v = preg_quote($variable, '/');
                    if (preg_match('/\$'.$v.'\s*->\s*validatedAvecInstants\s*\(/', $corps) === 1) {
                        $auTrait[$type]++;
                    }
                    if (preg_match('/\$'.$v.'\s*->\s*(validated|safe)\s*\(/', $corps, $lu) === 1) {
                        $fautes[] = "{$relatif}::{$nom}() lit `\${$variable}->{$lu[1]}()` d'une {$type} : les dates-heures y arrivent sans conversion — lire `validatedAvecInstants()`.";
                    }
                }
            }
        }
        foreach ($auTrait as $type => $lecteurs) {
            if ($lecteurs === 0) {
                $fautes[] = "{$type} emploie ConvertitLesInstantsRecus, mais aucun contrôleur ni service ne lit son `validatedAvecInstants()`.";
            }
        }

        $this->assertSame([], $fautes, "Conversion déclarée et non lue (TCK-2743) :\n".implode("\n", $fautes));
    }

    public function test_la_lecture_des_lecteurs_voit_les_formes_du_depot(): void
    {
        $code = <<<'PHP'
            <?php
            namespace App\Http\Controllers\Api;
            use App\Http\Requests\Api\StoreTaskRequest;
            use App\Http\Requests\Api\UpdateTaskRequest as Modifier;
            class X {
                public function store(StoreTaskRequest $request, int $id = 0): void { if ($a) { $b = []; } }
                public function update(Modifier $req, \App\Models\Task $task): void {}
                public function sansType($request): void {}
            }
            PHP;
        $methodes = $this->methodes($code);
        $this->assertSame(['store', 'update', 'sansType'], array_column($methodes, 0));
        $this->assertSame(' if ($a) { $b = []; } ', $methodes[0][2]);
        $this->assertSame(['request' => 'App\\Http\\Requests\\Api\\StoreTaskRequest', 'id' => 'int'], $this->parametresTypes($code, $methodes[0][1]));
        $this->assertSame(['req' => 'App\\Http\\Requests\\Api\\UpdateTaskRequest', 'task' => 'App\\Models\\Task'], $this->parametresTypes($code, $methodes[1][1]));
        $this->assertSame([], $this->parametresTypes($code, $methodes[2][1]));
    }

    /** @return list<array{0: string, 1: string, 2: string}> nom, liste des paramètres, corps — des méthodes à corps */
    private function methodes(string $code): array
    {
        $methodes = [];
        preg_match_all('/function\s+(\w+)\s*\(/', $code, $m, PREG_OFFSET_CAPTURE);
        foreach ($m[0] as $i => [$tout, $position]) {
            $debut = $position + strlen($tout);
            $profondeur = 1;
            for ($j = $debut, $n = strlen($code); $j < $n && $profondeur > 0; $j++) {
                $profondeur += match ($code[$j]) {
                    '(' => 1,
                    ')' => -1,
                    default => 0,
                };
            }
            $parametres = substr($code, $debut, $j - 1 - $debut);
            $accolade = strpos($code, '{', $j);
            $pointVirgule = strpos($code, ';', $j);
            if ($accolade === false || ($pointVirgule !== false && $pointVirgule < $accolade)) {
                continue; // méthode abstraite ou d'interface
            }
            $profondeur = 1;
            for ($k = $accolade + 1; $k < $n && $profondeur > 0; $k++) {
                $profondeur += match ($code[$k]) {
                    '{' => 1,
                    '}' => -1,
                    default => 0,
                };
            }
            $methodes[] = [$m[1][$i][0], $parametres, substr($code, $accolade + 1, $k - 1 - $accolade - 1)];
        }

        return $methodes;
    }

    /** @return array<string, string> variable => type résolu (FQCN pour une classe, sans `\` de tête) */
    private function parametresTypes(string $code, string $parametres): array
    {
        preg_match_all('/^use\s+([\w\\\\]+)(?:\s+as\s+(\w+))?;/m', $code, $u, PREG_SET_ORDER);
        $imports = [];
        foreach ($u as $import) {
            $imports[$import[2] ?? preg_replace('/^.*\\\\/', '', $import[1])] = $import[1];
        }
        $espace = preg_match('/^namespace\s+([\w\\\\]+);/m', $code, $ns) === 1 ? $ns[1] : '';

        $types = [];
        preg_match_all('/(\\\\?[\w\\\\]+)\s+&?(?:\.\.\.)?\$(\w+)/', $parametres, $p, PREG_SET_ORDER);
        foreach ($p as [, $type, $variable]) {
            $types[$variable] = match (true) {
                str_starts_with($type, '\\') => substr($type, 1),
                in_array(strtolower($type), ['int', 'string', 'bool', 'float', 'array', 'mixed', 'callable', 'iterable', 'object', 'self', 'static'], true) => $type,
                isset($imports[$type]) => $imports[$type],
                str_contains($type, '\\') => $espace.'\\'.$type,
                default => $espace.'\\'.$type,
            };
        }

        return $types;
    }

    /**
     * TCK-2752 (AC3) — chaque date-heure que cette garde relève porte AUSSI la forme ISO 8601 stricte
     * ({@see InstantIso}) : `date` laisse passer « 99999-01-01 », relu 2009-01-01. Aucune liste
     * n'en exempte : `FINS_INCLUSIVES`, `CONVERTIS_A_L_ECRITURE` et `EXCEPTIONS` dispensent de la
     * CONVERSION, pas de la forme reçue.
     */
    public function test_toute_date_heure_recue_porte_la_forme_iso(): void
    {
        $app = dirname(__DIR__, 3).'/app';
        $colonnes = $this->colonnesDatetime($app.'/Models');

        $fautes = [];
        $vus = 0;
        foreach ($this->fichiers($app.'/Http/Requests') as $chemin) {
            $relatif = substr($chemin, strlen($app) + 1);
            $code = $this->sansCommentaires((string) file_get_contents($chemin));
            foreach ($this->reglesDate($code) as $champ => $regle) {
                if (! isset($colonnes[preg_replace('/^.*\./', '', $champ)])) {
                    continue;
                }
                $vus++;
                if (! $this->porteLaFormeIso($regle)) {
                    $fautes[] = "{$relatif}:{$champ} : règle `date` sans `new InstantIso` (dans chaque branche) — `date` relit « 99999-01-01 » en 2009-01-01.";
                }
            }
        }

        $this->assertGreaterThan(35, $vus, 'Trop peu de champs date-heure relevés : la lecture des règles ne voit plus les champs.');
        $this->assertSame([], $fautes, "Date-heure reçue sans sa forme ISO 8601 stricte (TCK-2752) :\n".implode("\n", $fautes));
    }

    /**
     * TCK-2768 — les occurrences hors FormRequest, épinglées : une lecture qui ne les verrait plus rendrait
     * un vert vide. Le fichier, puis le nombre de tableaux de règles qui y portent `date`.
     *
     * @var array<string, int>
     */
    private const DATES_HORS_FORM_REQUESTS = [
        'Http/Filters/DateBoundaryFilter.php' => 1,
        'Http/Filters/RangeFilter.php' => 1,
        'Models/PropertyVisit.php' => 1, // TCK-2768 r1 — `filter.day` en `date_format:Y-m-d`
        'Support/SavedSearchCriteria.php' => 1,
    ];

    /**
     * TCK-2768 r1 — les `date_format` qui ne désignent pas un JOUR (`Y-m` : un mois de relevé), épinglés par
     * fichier. Ils ne s'écrivent nulle part : une lecture au mois. Un `date_format` neuf qui n'est pas `Y-m-d`
     * rougit ici, pour qu'on décide de sa forme bornée au lieu de le laisser passer.
     *
     * @var array<string, list<string>>
     */
    private const FORMATS_HORS_JOUR = [
        'Http/Requests/Api/Commissions/CommissionSummaryRequest.php' => ["'date_format:Y-m'"],
        'Http/Requests/Api/ShowTeamPerformanceRequest.php' => ["'date_format:Y-m'"],
    ];

    /**
     * TCK-2768 (AC4) — une `date` nue rougit, où qu'elle soit dans `app/` : chaque tableau de règles qui
     * contient l'élément `'date'` contient aussi `new JourIso` ou `new InstantIso` (autant que de `date`).
     * `date` seule relit « 99999-01-01 » en 2009 et « 12/11/2026 » le 11 décembre. Une règle en chaîne
     * (`'nullable|date'`) ne peut pas porter d'objet : elle rougit toujours, et se réécrit en tableau.
     */
    public function test_aucune_date_recue_n_est_nue(): void
    {
        $app = dirname(__DIR__, 3).'/app';

        $fautes = [];
        $tableaux = 0;
        $tableauxJour = 0; // TCK-2768 r1
        $horsRequetes = [];
        $horsJour = []; // TCK-2768 r1
        foreach ($this->fichiers($app) as $chemin) {
            $relatif = substr($chemin, strlen($app) + 1);
            $code = $this->sansCommentaires((string) file_get_contents($chemin));
            if (($formats = $this->formatsHorsJour($code)) !== []) {
                $horsJour[$relatif] = $formats;
            }
            foreach ($this->tableauxDeReglesDate($code) as $tableau) {
                $tableaux++;
                $tableauxJour += str_contains($tableau, "'date_format:Y-m-d'") ? 1 : 0;
                if (! str_starts_with($relatif, 'Http/Requests/')) {
                    $horsRequetes[$relatif] = ($horsRequetes[$relatif] ?? 0) + 1;
                }
                if (! $this->porteUneForme($tableau)) {
                    $fautes[] = "{$relatif} : `date` nue dans ".preg_replace('/\s+/', ' ', $tableau).' — poser `new JourIso` (un jour ; seul admis après `date_format:Y-m-d`) ou `new InstantIso` (un jour ou un instant) juste après.';
                }
            }
            foreach ($this->reglesEnChaineDate($code) as $regle) {
                $fautes[] = "{$relatif} : règle en chaîne {$regle} — une chaîne ne porte pas d'objet ; la réécrire en tableau avec `new JourIso` ou `new InstantIso`.";
            }
        }

        $this->assertGreaterThan(80, $tableaux, 'Trop peu de tableaux de règles `date` lus : la lecture ne voit plus les règles.');
        $this->assertGreaterThanOrEqual(19, $tableauxJour, 'Trop peu de `date_format:Y-m-d` lus : la lecture ne les voit plus (TCK-2768 r1).');
        ksort($horsJour);
        $this->assertSame(self::FORMATS_HORS_JOUR, $horsJour, 'Un `date_format` qui n\'est pas un jour a changé : lui donner une forme bornée, ou l\'épingler (TCK-2768 r1).');
        $this->assertSame(self::DATES_HORS_FORM_REQUESTS, $horsRequetes, 'Les `date` hors FormRequest ont changé : épingler la nouvelle occurrence ici (et lui donner sa forme).');
        $this->assertSame([], $fautes, "Date reçue sans sa forme stricte (TCK-2768) :\n".implode("\n", $fautes));
    }

    public function test_la_lecture_des_tableaux_de_regles_voit_les_formes_du_depot(): void
    {
        $code = <<<'PHP'
            <?php
            protected $fillable = ['property_boost_id', 'date', 'clicks'];
            protected $casts = ['date' => 'date'];
            $q->upsert([$v], ['date'], ['updated_at']);
            if (in_array($champ, ['date', 'amount'], true)) { return ['date', true]; }
            $regles = [
                'a' => ['required', 'date'],
                'b' => ['required', 'date', new JourIso],
                "filter.{$p}" => ['string', 'date', new \App\Rules\InstantIso],
                $attribut.'.c' => ['sometimes', 'nullable', 'date'],
                'd' => $estUneDate ? ['string', 'date', $horodatage ? new InstantIso : new JourIso] : ['numeric'],
                'e' => $x ? ['string', 'date'] : ['numeric'],
                'f' => ['nullable', 'date_format:Y-m-d'],
                'g' => [Rule::requiredIf($k), 'nullable', 'date', new JourIso, 'after_or_equal:today'],
                'k' => ['nullable', 'date_format:Y-m-d', new JourIso],
                'l' => ['nullable', 'date_format:Y-m-d', new InstantIso],
                'm' => ['nullable', 'date_format:Y-m'],
                'date_format' => ['required', 'string', 'max:32'],
            ];
            protected $guarded = ['date', 'date_format:Y-m-d'];
            $paye = ['nullable', 'date_format:Y-m-d', 'before_or_equal:'.$jour];
            $chaine = ['h' => 'nullable|date', 'i' => 'date|after:now', 'j' => 'required_without_all:date,x', 'n' => 'nullable|date_format:Y-m-d'];
            PHP;

        // TCK-2768 r1 : f, k, l, m (`date_format`) et `$paye` (un tableau posé dans une variable) sont lus ;
        // `date_format` sans `JourIso`, ou avec `InstantIso` seul, rougit ; un mois n'a rien à porter.
        $tableaux = $this->tableauxDeReglesDate($code);
        $this->assertSame(
            [false, true, true, false, true, false, false, true, true, false, true, false],
            array_map(fn (string $t): bool => $this->porteUneForme($t), $tableaux),
            'Douze tableaux de règles (d compte une fois), ni $fillable, ni $guarded, ni upsert, ni in_array, ni return, ni la clé `date_format`.',
        );
        $this->assertSame(["'nullable|date'", "'date|after:now'", "'nullable|date_format:Y-m-d'"], $this->reglesEnChaineDate($code));
        $this->assertSame(["'date_format:Y-m'"], $this->formatsHorsJour($code));
    }

    public function test_la_lecture_de_la_forme_iso_voit_chaque_branche(): void
    {
        $code = <<<'PHP'
            <?php
            return [
                'a_at' => ['required', 'date', new InstantIso, 'after:now'],
                'b_at' => ['required', 'date'],
                'c_at' => $manager
                    ? ['required', 'date', new InstantIso]
                    : ['required', 'date', new Regle],
                'd_at' => $manager
                    ? ['required', 'date', new InstantIso]
                    : ['required', 'date', new \App\Rules\InstantIso, new Regle],
                'e_at' => 'nullable|date',
                'f_at' => ['nullable', 'required_without_all:date,x', 'date', new InstantIso],
            ];
            PHP;

        $regles = $this->reglesDate($code);
        $this->assertSame(
            ['a_at' => true, 'b_at' => false, 'c_at' => false, 'd_at' => true, 'e_at' => false, 'f_at' => true],
            array_map(fn (string $r): bool => $this->porteLaFormeIso($r), $regles),
        );
    }

    public function test_la_lecture_des_regles_voit_les_formes_du_depot(): void
    {
        $code = <<<'PHP'
            <?php
            return [
                'a_at' => ['required', 'date', 'after:now'],
                'b_at' => 'nullable|date',
                'c_at' => $manager
                    ? ['required', 'date']
                    : ['required', 'date', new Regle],
                'd_at' => ['nullable', 'date_format:Y-m-d'],
                'visits.*.e_at' => ['required', 'date'],
                'f_at' => ['nullable', 'string'],
            ];
            $rules['g_at'] = ['sometimes', 'date'];
            PHP;

        $this->assertSame(['a_at', 'b_at', 'c_at', 'visits.*.e_at', 'g_at'], $this->champsDate($code));
    }

    /**
     * TCK-2768 — les tableaux de règles qui contiennent l'ÉLÉMENT `'date'` (entre `[`/`,` et `,`/`]`, jamais
     * une clé ni une valeur de clé). Un tableau est de règles quand il est la valeur d'une clé (`=> [`) ou
     * une branche d'un ternaire (`? [`, `: [`) : ni `$fillable = [`, ni un argument (`upsert(…, ['date'])`),
     * ni `in_array(…, ['date'])`, ni `return ['date', …]`.
     *
     * @return list<string>
     */
    private function tableauxDeReglesDate(string $code): array
    {
        $tableaux = [];
        preg_match_all(self::ELEMENT_DATE, $code, $m, PREG_OFFSET_CAPTURE);
        foreach ($m[0] as [, $position]) {
            $ouverture = $this->ouvertureDuTableau($code, $position);
            $avant = $ouverture === null ? '' : substr($code, max(0, $ouverture - 80), min(80, $ouverture));
            // TCK-2768 r1 — une affectation à une variable (`$paye = [`) est un tableau de règles ; une
            // déclaration de propriété (`protected $fillable = [`) ne l'est pas.
            if ($ouverture === null
                || preg_match('/(=>|\?|(?<!:):|(?<![=!<>])=)\s*$/', $avant) !== 1
                || preg_match('/\b(?:public|protected|private|var|const)\s+(?:static\s+)?(?:[\w?\\\\|]+\s+)?\$?\w+\s*=\s*$/', $avant) === 1) {
                continue;
            }
            $tableaux[$ouverture] = $this->tableauEntier($code, $ouverture);
        }

        return array_values($tableaux);
    }

    /** La position du `[` qui ouvre le tableau contenant `$position`, ou null. */
    private function ouvertureDuTableau(string $code, int $position): ?int
    {
        $profondeur = 0;
        for ($j = $position - 1; $j >= 0; $j--) {
            $c = $code[$j];
            if (in_array($c, [']', ')', '}'], true)) {
                $profondeur++;
            } elseif (in_array($c, ['[', '(', '{'], true)) {
                if ($profondeur === 0) {
                    return $c === '[' ? $j : null;
                }
                $profondeur--;
            }
        }

        return null;
    }

    /** Le tableau entier qui s'ouvre à `$ouverture`, crochets compris (guillemets respectés). */
    private function tableauEntier(string $code, int $ouverture): string
    {
        $profondeur = 0;
        $guillemet = null;
        for ($j = $ouverture, $n = strlen($code); $j < $n; $j++) {
            $c = $code[$j];
            if ($guillemet !== null) {
                if ($c === '\\') {
                    $j++;
                } elseif ($c === $guillemet) {
                    $guillemet = null;
                }

                continue;
            }
            if ($c === "'" || $c === '"') {
                $guillemet = $c;
            } elseif (in_array($c, ['[', '(', '{'], true)) {
                $profondeur++;
            } elseif (in_array($c, [']', ')', '}'], true) && --$profondeur === 0) {
                break;
            }
        }

        return substr($code, $ouverture, $j - $ouverture + 1);
    }

    /** TCK-2768 — l'ÉLÉMENT `'date'` ou `'date_format:…'` d'un tableau (r1 : `date_format` compris). */
    private const ELEMENT_DATE = "/(?<=[\[,])\s*'(?:date|date_format:[^']*)'\s*(?=[,\]])/";

    /**
     * Chaque `date` du tableau a sa forme : autant de `new JourIso` / `new InstantIso` que de `'date'` et de
     * `'date_format:Y-m-d'`, et pour chaque `date_format:Y-m-d` un `new JourIso` (TCK-2768 r1 : c'est un jour).
     */
    private function porteUneForme(string $tableau): bool
    {
        $dates = preg_match_all("/(?<=[\[,])\s*'date'\s*(?=[,\]])/", $tableau);
        $jours = preg_match_all("/(?<=[\[,])\s*'date_format:Y-m-d'\s*(?=[,\]])/", $tableau);
        $formes = preg_match_all('/new\s+(?:\\\\?App\\\\Rules\\\\)?(?:InstantIso|JourIso)\b/', $tableau);
        $joursIso = preg_match_all('/new\s+(?:\\\\?App\\\\Rules\\\\)?JourIso\b/', $tableau);

        return $formes >= $dates + $jours && $joursIso >= $jours;
    }

    /** @return list<string> TCK-2768 r1 — les `'date_format:…'` qui ne sont pas un jour (`Y-m-d`). */
    private function formatsHorsJour(string $code): array
    {
        preg_match_all("/'date_format:(?!Y-m-d')[^']*'/", $code, $m);

        return $m[0];
    }

    /** @return list<string> les règles en chaîne qui contiennent `date` ou `date_format:…` (`'nullable|date'`). */
    private function reglesEnChaineDate(string $code): array
    {
        preg_match_all("/'(?:[\w:,.*-]+\|)+date(?:_format:[\w-]+)?(?:\|[\w:,.*-]+)*'|'date(?:_format:[\w-]+)?(?:\|[\w:,.*-]+)+'/", $code, $m);

        return $m[0];
    }

    /** @return array<string, true> */
    private function colonnesDatetime(string $dossier): array
    {
        $colonnes = [];
        foreach ($this->fichiers($dossier) as $chemin) {
            preg_match_all("/'(\\w+)'\\s*=>\\s*'(?:immutable_)?datetime(?::[^']*)?'/", (string) file_get_contents($chemin), $m);
            foreach ($m[1] as $colonne) {
                $colonnes[$colonne] = true;
            }
        }

        return $colonnes;
    }

    /**
     * Les champs dont la règle contient `date` sans `date_format` : `'champ' => <expression>` ou
     * `$rules['champ'] = <expression>`, l'expression lue jusqu'à sa virgule (ou son `;`) de profondeur 0.
     *
     * @return list<string>
     */
    private function champsDate(string $code): array
    {
        return array_keys($this->reglesDate($code));
    }

    /**
     * TCK-2752 — {@see champsDate()}, avec l'expression de la règle de chaque champ (les expressions
     * d'un champ déclaré deux fois sont mises bout à bout).
     *
     * @return array<string, string>
     */
    private function reglesDate(string $code): array
    {
        $regles = [];
        preg_match_all("/(?:'([\\w.*]+)'\\s*=>|\\[\\s*'([\\w.*]+)'\\s*\\]\\s*=(?!=))\\s*/", $code, $m, PREG_OFFSET_CAPTURE);
        foreach ($m[0] as $i => [$tout, $position]) {
            $champ = $m[1][$i][0] !== '' ? $m[1][$i][0] : $m[2][$i][0];
            $regle = $this->expression($code, $position + strlen($tout));
            if (preg_match("/'date'|['|]date['|]|Rule::date\\(/", $regle) === 1 && ! str_contains($regle, 'date_format')) {
                $regles[$champ] = isset($regles[$champ]) ? $regles[$champ]."\n".$regle : $regle;
            }
        }

        return $regles;
    }

    /**
     * TCK-2752 — chaque `date` de l'expression a sa règle {@see InstantIso} : une règle conditionnelle
     * la porte dans CHAQUE branche. Une règle en chaîne (`'nullable|date'`) ne peut pas porter un objet :
     * elle compte zéro, et se réécrit en tableau.
     */
    private function porteLaFormeIso(string $regle): bool
    {
        $dates = preg_match_all("/(?<=['|])date(?=['|])|Rule::date\\(/", $regle);
        $formes = preg_match_all('/new\s+(?:\\\\?App\\\\Rules\\\\)?InstantIso\b/', $regle);

        return $dates > 0 && $formes >= $dates;
    }

    private function expression(string $code, int $debut): string
    {
        $profondeur = 0;
        $guillemet = null;
        for ($j = $debut, $n = strlen($code); $j < $n; $j++) {
            $c = $code[$j];
            if ($guillemet !== null) {
                if ($c === '\\') {
                    $j++;
                } elseif ($c === $guillemet) {
                    $guillemet = null;
                }

                continue;
            }
            if ($c === "'" || $c === '"') {
                $guillemet = $c;
            } elseif (in_array($c, ['[', '(', '{'], true)) {
                $profondeur++;
            } elseif (in_array($c, [']', ')', '}'], true)) {
                if ($profondeur === 0) {
                    break;
                }
                $profondeur--;
            } elseif (($c === ',' || $c === ';') && $profondeur === 0) {
                break;
            }
        }

        return substr($code, $debut, $j - $debut);
    }

    /** @return list<string> les champs que `instantsRecus()` renvoie, si la FormRequest emploie le trait */
    private function instantsRecus(string $code): array
    {
        if (! str_contains($code, 'use ConvertitLesInstantsRecus;')) {
            return [];
        }
        $corps = $this->corpsDeMethode($code, 'instantsRecus');
        preg_match_all("/'(\\w+)'/", $corps ?? '', $m);

        return $m[1];
    }

    /** Une méthode de la FormRequest nomme-t-elle le champ ET passe-t-elle par la conversion ? */
    private function accesseurConvertit(string $code, string $champ): bool
    {
        preg_match_all('/function\s+(\w+)\s*\(/', $code, $m);
        foreach ($m[1] as $methode) {
            $corps = $this->corpsDeMethode($code, $methode) ?? '';
            if (str_contains($corps, "'{$champ}'") && (str_contains($corps, 'InstantRecu::') || str_contains($corps, 'scheduledInstant('))) {
                return true;
            }
        }

        return false;
    }

    private function corpsDeMethode(string $code, string $methode): ?string
    {
        if (preg_match('/function\s+'.preg_quote($methode, '/').'\s*\([^{;]*\{/', $code, $m, PREG_OFFSET_CAPTURE) !== 1) {
            return null;
        }
        $debut = $m[0][1] + strlen($m[0][0]);
        $profondeur = 1;
        for ($j = $debut, $n = strlen($code); $j < $n && $profondeur > 0; $j++) {
            $profondeur += match ($code[$j]) {
                '{' => 1,
                '}' => -1,
                default => 0,
            };
        }

        return substr($code, $debut, $j - $debut);
    }

    /** @return list<string> */
    private function fichiers(string $dossier): array
    {
        $chemins = [];
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dossier, RecursiveDirectoryIterator::SKIP_DOTS)) as $fichier) {
            if ($fichier->getExtension() === 'php') {
                $chemins[] = $fichier->getPathname();
            }
        }
        sort($chemins);

        return $chemins;
    }

    private function sansCommentaires(string $source): string
    {
        $code = '';
        foreach (token_get_all($source) as $jeton) {
            if (is_array($jeton) && in_array($jeton[0], [T_COMMENT, T_DOC_COMMENT], true)) {
                continue;
            }
            $code .= is_array($jeton) ? $jeton[1] : $jeton;
        }

        return $code;
    }
}

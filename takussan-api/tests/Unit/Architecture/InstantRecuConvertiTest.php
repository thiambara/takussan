<?php

namespace Tests\Unit\Architecture;

use App\Http\Requests\Concerns\ConvertitLesInstantsRecus;
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
 * **Limites** : le croisement est par NOM — une date reçue sous un autre nom que sa colonne lui échappe ;
 * une règle construite ailleurs (méthode, variable) n'est pas lue. La garde est un plancher.
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
        $champs = [];
        preg_match_all("/(?:'([\\w.*]+)'\\s*=>|\\[\\s*'([\\w.*]+)'\\s*\\]\\s*=(?!=))\\s*/", $code, $m, PREG_OFFSET_CAPTURE);
        foreach ($m[0] as $i => [$tout, $position]) {
            $champ = $m[1][$i][0] !== '' ? $m[1][$i][0] : $m[2][$i][0];
            $regle = $this->expression($code, $position + strlen($tout));
            if (preg_match("/'date'|['|]date['|]|Rule::date\\(/", $regle) === 1 && ! str_contains($regle, 'date_format')) {
                $champs[] = $champ;
            }
        }

        return array_values(array_unique($champs));
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

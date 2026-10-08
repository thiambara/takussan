<?php

namespace Tests\Unit\Architecture;

use PHPUnit\Framework\TestCase;
use Tests\Support\ProseLitteraleScanner;

/**
 * TCK-588 (ADR-0032) — l'API n'écrit plus de prose : une erreur est un code (`abort_code()`), une
 * notification un code rendu dans la langue du destinataire. Cette garde refuse une phrase écrite
 * en dur aux sept positions de {@see ProseLitteraleScanner}.
 *
 * Elle se garde elle-même : un scan qui ne lit rien, ou une exemption qui n'exempte plus rien,
 * la font rougir — une garde muette est verte pour de mauvaises raisons.
 */
class ProseLitteraleInterditeTest extends TestCase
{
    /**
     * Les seules exemptions, chacune portée par un ticket et EXPIRANTE : dès que le fichier n'a
     * plus de littéral à la forme exemptée, le test rougit et l'exemption doit partir.
     *
     * @var array<string, array{forms: list<string>, ticket: string}>
     */
    private const EXEMPTIONS = [];

    /**
     * Positifs attendus sur les fixtures, par fichier et par forme — comptés EXACTEMENT.
     *
     * @var array<string, array<string, int>>
     */
    private const FIXTURES = [
        'Positifs.php' => [
            // (a) abort, abort_if, et les deux littéraux de la concaténation
            ProseLitteraleScanner::ABORT => 4,
            ProseLitteraleScanner::NOTIFY => 1,
            // (d) 'message' => littéral, et l'interpolation sur deux lignes (deux segments)
            ProseLitteraleScanner::MESSAGE_KEY => 3,
            // (e) HttpException, et le sprintf imbriqué dans withMessages
            ProseLitteraleScanner::HTTP_EXCEPTION => 2,
            ProseLitteraleScanner::HTTP_RESPONSE_EXCEPTION => 1,
        ],
        'Notifications/PositifsNotification.php' => [
            ProseLitteraleScanner::NOTIFICATION_CLASS => 3,
            ProseLitteraleScanner::NUMBER_FORMAT => 1,
        ],
        'Negatifs.php' => [],
        'Notifications/NegatifsNotification.php' => [],
    ];

    private function root(string $path): string
    {
        return dirname(__DIR__, 3).'/'.$path;
    }

    /**
     * Le verdict, séparé de l'assertion pour que ses propres cas d'échec soient testables.
     *
     * @param  list<array{file: string, line: int, form: string, literal: string}>  $findings
     * @param  array<string, array{forms: list<string>, ticket: string}>  $exemptions
     * @return list<string>
     */
    private function verdict(ProseLitteraleScanner $scanner, array $findings, array $exemptions): array
    {
        if ($scanner->fichiersLus === 0 || $scanner->appelsReconnus === 0) {
            return ["scan vide : {$scanner->fichiersLus} fichier(s), {$scanner->appelsReconnus} appel(s) reconnu(s)"];
        }

        $errors = [];
        $used = [];
        foreach ($findings as $finding) {
            $exemption = $exemptions[$finding['file']] ?? null;
            if ($exemption !== null && in_array($finding['form'], $exemption['forms'], true)) {
                $used[$finding['file']] = true;

                continue;
            }
            $errors[] = sprintf('(%s) %s:%d « %s »', $finding['form'], $finding['file'], $finding['line'], trim($finding['literal']));
        }
        foreach ($exemptions as $file => $exemption) {
            if (! isset($used[$file])) {
                $errors[] = "exemption périmée : {$file} ({$exemption['ticket']}) n'a plus de littéral — retirer l'exemption";
            }
        }

        return $errors;
    }

    public function test_app_ne_contient_aucune_prose_hors_exemption(): void
    {
        $scanner = new ProseLitteraleScanner;
        $findings = $scanner->scanDirectory($this->root('app'));

        $errors = $this->verdict($scanner, $findings, self::EXEMPTIONS);

        $this->assertSame([], $errors, "Prose écrite en dur dans app/ — passer par abort_code() ou un NotificationCode (ADR-0032) :\n".implode("\n", $errors));
        $this->assertGreaterThan(500, $scanner->fichiersLus);
    }

    /**
     * Un `abort*()` à message TRADUIT n'est pas de la prose en dur, mais son message est PERDU :
     * `bootstrap/app.php` rend toute `HttpException` hors `ApiError` en `http.<statut>`. Le
     * relevé est à part des formes (a)-(g) — `abort(403, __('…'))` reste un négatif des fixtures —
     * et il doit être vide sur `app/` : un tel abort passe par `abort_code()`.
     */
    public function test_aucun_abort_ne_porte_un_message_que_le_rendu_jetterait(): void
    {
        $scanner = new ProseLitteraleScanner;
        $scanner->scanDirectory($this->root('app'));

        $lieux = array_map(fn (array $p) => "{$p['file']}:{$p['line']}", $scanner->messagesPerdus);
        $this->assertSame([], $lieux, "abort*() à message non littéral — le message serait perdu, passer par abort_code() :\n".implode("\n", $lieux));

        $fixtures = new ProseLitteraleScanner;
        $fixtures->scanDirectory($this->root('tests/fixtures/ProseLitterale'));
        $this->assertSame([['file' => 'Negatifs.php', 'line' => 13]], $fixtures->messagesPerdus);
    }

    public function test_les_fixtures_rendent_exactement_les_positifs_attendus(): void
    {
        $scanner = new ProseLitteraleScanner;
        $findings = $scanner->scanDirectory($this->root('tests/fixtures/ProseLitterale'));

        $counts = array_fill_keys(array_keys(self::FIXTURES), []);
        foreach ($findings as $finding) {
            $counts[$finding['file']][$finding['form']] = ($counts[$finding['file']][$finding['form']] ?? 0) + 1;
        }
        foreach ($counts as &$byForm) {
            ksort($byForm);
        }
        $expected = self::FIXTURES;
        foreach ($expected as &$byForm) {
            ksort($byForm);
        }

        $this->assertSame($expected, $counts);
        $this->assertSame(4, $scanner->fichiersLus);
    }

    public function test_chaque_forme_a_g_a_au_moins_un_positif_dans_les_fixtures(): void
    {
        $forms = [];
        foreach (self::FIXTURES as $byForm) {
            $forms = [...$forms, ...array_keys($byForm)];
        }

        $this->assertEqualsCanonicalizing(['a', 'b', 'c', 'd', 'e', 'f', 'g'], array_values(array_unique($forms)));
    }

    public function test_un_scan_vide_rougit(): void
    {
        $empty = sys_get_temp_dir().'/prose-litterale-vide-'.getmypid();
        @mkdir($empty);
        try {
            $scanner = new ProseLitteraleScanner;
            $errors = $this->verdict($scanner, $scanner->scanDirectory($empty), []);
        } finally {
            @rmdir($empty);
        }

        $this->assertCount(1, $errors);
        $this->assertStringStartsWith('scan vide', $errors[0]);
    }

    public function test_une_exemption_perimee_rougit(): void
    {
        $scanner = new ProseLitteraleScanner;
        $findings = $scanner->scanDirectory($this->root('tests/fixtures/ProseLitterale'));
        $clean = array_values(array_filter($findings, fn (array $f) => $f['file'] !== 'Positifs.php' && $f['file'] !== 'Notifications/PositifsNotification.php'));

        $errors = $this->verdict($scanner, $clean, ['Negatifs.php' => ['forms' => [ProseLitteraleScanner::NOTIFY], 'ticket' => 'TCK-000']]);

        $this->assertSame(["exemption périmée : Negatifs.php (TCK-000) n'a plus de littéral — retirer l'exemption"], $errors);
    }
}

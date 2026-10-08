<?php

namespace Tests\Unit;

use App\Models\Enums\RelationshipType;
use App\Models\User;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;

/**
 * TCK-586 — le courtier a quitté le code et la base (ADR-0030).
 *
 * ADR-0027 l'avait retiré de ce qui se CHOISIT en gardant ce qui se LIT ; les
 * lectures gardées ont continué de décider — trois affirmations publiques
 * fausses (`PropertyResource`, `PublicProfileFacts`, `PublicAgencyController`)
 * et une colonne fantôme lue en silence (`UserDetailResource`). *Une donnée
 * gardée « pour plus tard » n'est pas inerte.* Cette garde refuse qu'une partie
 * revienne sans que la décision soit rouverte.
 *
 * **Le mot est cherché partout, commentaires compris** : un docblock qui décrit
 * le courtier comme présent est la façon dont il revient. Le seul homonyme
 * légitime est le *password broker* de Laravel, admis LIGNE PAR LIGNE — par
 * contenu, pas par numéro (qui bouge) ni par fichier (une exception par fichier
 * laisserait passer toute ligne ajoutée à `config/auth.php`).
 */
class CourtierAbsentTest extends TestCase
{
    /** @var list<string> */
    private const SCANNED = ['app', 'config', 'routes', 'database/factories', 'database/seeders'];

    /**
     * Le password broker de Laravel — homonyme sans rapport avec l'acteur
     * (ADR-0030, « Hors décision »). Chaque entrée admet UNE occurrence de la
     * ligne, espaces de tête retirés.
     *
     * @var list<array{0: string, 1: string}>
     */
    private const PASSWORD_BROKER_LINES = [
        ['config/auth.php', '| reset "broker" for your application. You may change these values'],
        ['config/auth.php', "'passwords' => env('AUTH_PASSWORD_BROKER', 'users'),"],
        ['app/Services/Admin/UserSupportService.php', "\$status = Password::broker()->sendResetLink(['email' => \$target->email]);"],
        ['app/Services/Admin/AgencyProvisioningService.php', "\$status = Password::broker()->sendResetLink(['email' => \$admin->email]);"],
    ];

    public function test_aucune_ligne_ne_nomme_le_courtier_hors_du_password_broker(): void
    {
        $this->assertSame(
            [],
            $this->offenders(),
            'Le courtier a quitté le code (ADR-0030). Ces lignes contiennent `broker` sans être '
            ."le password broker de Laravel — réintroduire l'acteur est une fonctionnalité neuve, "
            ."à instruire de zéro :\n  ".implode("\n  ", $this->offenders()),
        );
    }

    /**
     * Les exceptions doivent toutes exister : une ligne du password broker
     * réécrite sans mettre la liste à jour laisserait une exception orpheline,
     * qu'une ligne courtier de même contenu viendrait occuper.
     */
    public function test_chaque_exception_designe_une_ligne_qui_existe(): void
    {
        $root = dirname(__DIR__, 2);

        foreach (self::PASSWORD_BROKER_LINES as [$file, $line]) {
            $lines = array_map('trim', file("{$root}/{$file}") ?: []);

            $this->assertContains($line, $lines, "exception orpheline : {$file} ne contient plus « {$line} »");
        }
    }

    public function test_les_classes_la_relation_et_le_cas_d_enumeration_ont_disparu(): void
    {
        $this->assertFalse(class_exists('App\Models\Profiles\BrokerProfile'));
        $this->assertFalse(class_exists('App\Models\Profiles\BrokerAgencyCollaboration'));
        $this->assertFalse(method_exists(User::class, 'brokerProfile'));
        $this->assertNull(RelationshipType::tryFrom('broker_client'));
    }

    /**
     * @return list<string>
     */
    private function offenders(): array
    {
        $root = dirname(__DIR__, 2);
        $allowed = array_map(fn (array $entry): string => $entry[0].'|'.$entry[1], self::PASSWORD_BROKER_LINES);
        $offenders = [];

        foreach (self::SCANNED as $directory) {
            foreach ($this->filesUnder("{$root}/{$directory}") as $path) {
                $relative = substr($path, strlen($root) + 1);

                foreach (file($path) ?: [] as $index => $line) {
                    if (stripos($line, 'broker') === false) {
                        continue;
                    }

                    $key = array_search($relative.'|'.trim($line), $allowed, true);
                    if ($key !== false) {
                        unset($allowed[$key]);

                        continue;
                    }

                    $offenders[] = $relative.':'.($index + 1).' → '.trim($line);
                }
            }
        }

        return $offenders;
    }

    /**
     * @return list<string>
     */
    private function filesUnder(string $directory): array
    {
        $files = [];

        /** @var SplFileInfo $file */
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory)) as $file) {
            if ($file->isFile()) {
                $files[] = $file->getPathname();
            }
        }

        sort($files);

        return $files;
    }
}

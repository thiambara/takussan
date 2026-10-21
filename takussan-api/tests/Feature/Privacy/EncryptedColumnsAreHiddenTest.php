<?php

namespace Tests\Feature\Privacy;

use App\Models\AgencyUpgradeRequest;
use App\Models\DataExport;
use App\Models\DocumentShareLink;
use App\Models\ReportExport;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;
use Tests\TestCase;

/**
 * TCK-1132 (P84.02, ADR-0044 § 1) — une colonne castée `encrypted*` ne sort pas en clair par
 * `toArray()` : elle est dans `$hidden` (ou hors d'un `$visible` déclaré). Les ressources lisent
 * les attributs un à un et ne sont pas concernées ; ce qui l'est, c'est le jour où un `include`,
 * un `$paginator->items()` ou un export sérialiserait le modèle brut.
 */
class EncryptedColumnsAreHiddenTest extends TestCase
{
    /**
     * Exceptions motivées : `modèle => [colonne => raison]`.
     *
     * @var array<class-string<Model>, array<string, string>>
     */
    private const EXCEPTIONS = [
        DataExport::class => [
            'archive_path' => "chemin d'archive sur le disque privé, lu par les seuls contrôleurs de téléchargement : pas une donnée d'ADR-0044",
        ],
        ReportExport::class => [
            'archive_path' => "chemin d'archive sur le disque privé, lu par les seuls contrôleurs de téléchargement : pas une donnée d'ADR-0044",
        ],
    ];

    public function test_every_encrypted_cast_is_hidden_from_to_array(): void
    {
        $fautes = [];
        $vues = 0;

        foreach (self::models() as $class) {
            $model = new $class;
            foreach ($model->getCasts() as $column => $cast) {
                if (! is_string($cast) || ! Str::startsWith($cast, 'encrypted')) {
                    continue;
                }
                $vues++;
                if (isset(self::EXCEPTIONS[$class][$column])) {
                    continue;
                }
                $visible = $model->getVisible();
                $cachee = in_array($column, $model->getHidden(), true)
                    || ($visible !== [] && ! in_array($column, $visible, true));
                if (! $cachee) {
                    $fautes[] = "{$class}::\${$column} (cast {$cast})";
                }
            }
        }

        $this->assertGreaterThan(0, $vues, 'aucune colonne chiffrée trouvée : le parcours de app/Models ne lit plus rien');
        $this->assertSame([], $fautes, "Colonnes chiffrées rendues en clair par toArray() :\n".implode("\n", $fautes));
    }

    public function test_exceptions_still_name_an_encrypted_column(): void
    {
        foreach (self::EXCEPTIONS as $class => $columns) {
            $casts = (new $class)->getCasts();
            foreach (array_keys($columns) as $column) {
                $this->assertStringStartsWith('encrypted', (string) ($casts[$column] ?? ''), "exception périmée : {$class}::\${$column}");
            }
        }
    }

    public function test_upgrade_request_to_array_omits_ninea_and_rib(): void
    {
        $array = (new AgencyUpgradeRequest([
            'ninea' => '005012345',
            'rib_pro' => 'SN012 01001 000123456789 12',
            'rc' => 'RC-DKR-2026-001',
        ]))->toArray();

        $this->assertArrayNotHasKey('ninea', $array);
        $this->assertArrayNotHasKey('rib_pro', $array);
        $this->assertSame('RC-DKR-2026-001', $array['rc']);
    }

    public function test_share_link_to_array_omits_token(): void
    {
        $link = new DocumentShareLink(['token' => 'jeton-temoin']);

        $this->assertArrayNotHasKey('token', $link->toArray());
        $this->assertSame('jeton-temoin', $link->token, "l'attribut reste lisible un à un");
    }

    /**
     * @return list<class-string<Model>>
     */
    private static function models(): array
    {
        $root = app_path('Models');
        $classes = [];
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root));
        foreach ($files as $file) {
            if (! $file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }
            $relative = Str::after($file->getPathname(), $root.DIRECTORY_SEPARATOR);
            $class = 'App\\Models\\'.str_replace([DIRECTORY_SEPARATOR, '.php'], ['\\', ''], $relative);
            if (! class_exists($class)) {
                continue;
            }
            $reflection = new ReflectionClass($class);
            if ($reflection->isAbstract() || ! $reflection->isSubclassOf(Model::class)) {
                continue;
            }
            $classes[] = $class;
        }

        return $classes;
    }
}

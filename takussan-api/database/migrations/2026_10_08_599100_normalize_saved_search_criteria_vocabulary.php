<?php

use App\Support\SavedSearchCriteria;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * TCK-599 (ADR-0050 §2) — `saved_searches.criteria` passe au vocabulaire de `/properties`.
 *
 * Seul un test écrivait `min_price` / `max_price` / `min_area` ; le seeder écrivait `neighborhoods`.
 * Ces lignes sont réécrites ; une clé déjà présente sous son nom réel n'est jamais écrasée.
 * Une ligne qui garde une clé hors de `SavedSearchCriteria::KEYS` n'est PAS modifiée : elle est
 * comptée, et ses clés journalisées (des NOMS de clés, aucune valeur) — le moteur l'ignorera.
 */
return new class extends Migration
{
    /** @var array<string, string> ancien nom → nom de `/properties` */
    private const RENAMES = [
        'min_price' => 'price_min',
        'max_price' => 'price_max',
        'min_area' => 'area_min',
        'max_area' => 'area_max',
    ];

    public function up(): void
    {
        $unknown = [];
        $unknownRows = 0;

        DB::table('saved_searches')->orderBy('id')->select(['id', 'criteria'])->each(function (object $row) use (&$unknown, &$unknownRows): void {
            $criteria = json_decode((string) $row->criteria, true);
            if (! is_array($criteria)) {
                return;
            }
            $next = $criteria;
            foreach (self::RENAMES as $old => $new) {
                if (array_key_exists($old, $next)) {
                    $next[$new] ??= $next[$old];
                    unset($next[$old]);
                }
            }
            if (array_key_exists('neighborhoods', $next)) {
                $first = is_array($next['neighborhoods']) ? ($next['neighborhoods'][0] ?? null) : $next['neighborhoods'];
                if (is_string($first) && $first !== '' && ! isset($next['location'])) {
                    $next['location'] = $first;
                }
                unset($next['neighborhoods']);
            }

            $hors = array_diff(array_keys($next), SavedSearchCriteria::KEYS);
            if ($hors !== []) {
                $unknownRows++;
                $unknown = array_values(array_unique([...$unknown, ...$hors]));
            }
            if ($next !== $criteria) {
                DB::table('saved_searches')->where('id', $row->id)->update(['criteria' => json_encode($next)]);
            }
        });

        if ($unknownRows > 0) {
            Log::warning('saved_search_criteria.unknown_keys', ['rows' => $unknownRows, 'keys' => $unknown]);
        }
    }

    /**
     * L'inverse des renommages, pour que l'ancien lecteur (`SearchService::search()`) relise ses
     * clés. ⚠ Une ligne écrite d'emblée au vocabulaire réel est elle aussi renommée : c'est le
     * vocabulaire que lisait l'ancien moteur, pas une restauration à l'identique.
     */
    public function down(): void
    {
        DB::table('saved_searches')->orderBy('id')->select(['id', 'criteria'])->each(function (object $row): void {
            $criteria = json_decode((string) $row->criteria, true);
            if (! is_array($criteria)) {
                return;
            }
            $next = $criteria;
            foreach (self::RENAMES as $old => $new) {
                if (array_key_exists($new, $next)) {
                    $next[$old] ??= $next[$new];
                    unset($next[$new]);
                }
            }
            if (isset($next['location']) && ! isset($next['neighborhoods'])) {
                $next['neighborhoods'] = [$next['location']];
                unset($next['location']);
            }
            if ($next !== $criteria) {
                DB::table('saved_searches')->where('id', $row->id)->update(['criteria' => json_encode($next)]);
            }
        });
    }
};

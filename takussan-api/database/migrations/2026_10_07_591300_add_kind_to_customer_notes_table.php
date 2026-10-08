<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-591 — la nature d'une note épinglée (`conversion` | `loss`), au lieu d'un préfixe français
 * écrit dans le corps. Le préfixe se rend désormais côté front, dans la langue du lecteur.
 *
 * `up()` reprend les notes existantes dont le corps commence par `Conversion : ` / `Perte : ` :
 * préfixe retiré, `kind` posé. `down()` les réécrit à l'identique, puis retire la colonne.
 */
return new class extends Migration
{
    /** @var array<string, string> nature → préfixe d'origine */
    private const PREFIXES = [
        'conversion' => 'Conversion : ',
        'loss' => 'Perte : ',
    ];

    public function up(): void
    {
        Schema::table('customer_notes', function (Blueprint $table) {
            $table->string('kind', 20)->nullable();
        });

        foreach (self::PREFIXES as $kind => $prefix) {
            DB::table('customer_notes')
                ->where('body', 'like', str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $prefix).'%')
                ->update([
                    'kind' => $kind,
                    'body' => DB::raw('substr(body, '.(mb_strlen($prefix) + 1).')'),
                ]);
        }
    }

    public function down(): void
    {
        foreach (self::PREFIXES as $kind => $prefix) {
            DB::table('customer_notes')
                ->where('kind', $kind)
                ->update(['body' => DB::raw(DB::getPdo()->quote($prefix).' || body')]);
        }

        Schema::table('customer_notes', function (Blueprint $table) {
            $table->dropColumn('kind');
        });
    }
};

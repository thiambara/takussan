<?php

use App\Domain\Settings\AgencySettings;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Revue de TCK-2487 — les clés `bool` du catalogue `AgencySettings` déjà stockées en `1`, `"1"`,
 * `"0"`… passent en vrai booléen JSON. Depuis la même revue, `AgencyController::update` normalise à
 * l'écriture ; ce qui avait été écrit avant restait vrai pour `AgencySettings::read()` mais faux pour
 * un lecteur SQL strict (`TwoFactorRequirement` : `settings->require_team_two_factor = true`).
 *
 * La décision clé par clé est celle d'`AgencySettings::normalize()`, pas une logique recopiée. Seules
 * les clés qu'elle change sont réécrites, par `jsonb_set` : les autres clés de `settings` ne sont ni
 * relues ni réencodées (un objet vide resterait sinon un tableau vide). Idempotente : une seconde
 * passe ne trouve rien à changer. Par lots de 500.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('agencies')
            ->select(['id', 'settings'])
            ->whereNotNull('settings')
            ->orderBy('id')
            ->chunkById(500, function ($rows): void {
                foreach ($rows as $row) {
                    $settings = json_decode((string) $row->settings, true);
                    if (! is_array($settings) || array_is_list($settings)) {
                        continue;
                    }
                    foreach (AgencySettings::normalize($settings) as $key => $value) {
                        if ($value !== $settings[$key]) {
                            DB::update(
                                'update agencies set settings = jsonb_set(settings, ?::text[], ?::jsonb) where id = ?',
                                ['{'.$key.'}', json_encode($value), $row->id],
                            );
                        }
                    }
                }
            });
    }

    /**
     * ⚠ La conversion n'est PAS défaite : rien ne dit plus, après elle, quelle clé était `1` et
     * laquelle `"1"`, et `AgencySettings::read()` lit les deux formes comme le booléen écrit. Le
     * retour ne fait rien, et ne lève pas (le job `migrations-pgsql` rejoue les `down()` au-dessus
     * de la borne TCK-278).
     */
    public function down(): void
    {
        //
    }
};

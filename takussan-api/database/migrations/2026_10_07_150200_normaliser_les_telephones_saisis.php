<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-590 — les numéros déjà saisis au format national (« 77 123 45 67 ») ramenés à E.164.
 *
 * Avant ce ticket, `visitor_phone` et le téléphone d'une piste étaient enregistrés TELS QUELS
 * (`string`, sans règle) : relevé par TCK-588, le rappel de visite d'un tel visiteur ne partait
 * jamais. La saisie est normalisée depuis (`App\Support\TelephoneSaisi`) ; cette migration
 * rattrape l'existant. La règle est RECOPIÉE ici, et non appelée : une migration rejoue ce
 * qu'elle a fait le jour où elle a été écrite, pas ce que la classe sera devenue.
 *
 * Seul un numéro dont la forme normalisée est un E.164 est réécrit ; tout autre reste tel quel —
 * on ne devine rien. `customers.phone` n'est pas touché (TCK-591).
 */
return new class extends Migration
{
    private const COLONNES = [
        'property_visits' => 'visitor_phone',
        'property_contact_leads' => 'phone',
    ];

    public function up(): void
    {
        foreach (self::COLONNES as $table => $colonne) {
            DB::table($table)
                ->whereNotNull($colonne)
                ->select(['id', $colonne])
                ->orderBy('id')
                ->chunkById(500, function ($lignes) use ($table, $colonne) {
                    foreach ($lignes as $ligne) {
                        $normalise = self::normaliser($ligne->{$colonne});
                        if ($normalise !== $ligne->{$colonne} && preg_match('/^\+[1-9]\d{7,14}$/', $normalise) === 1) {
                            DB::table($table)->where('id', $ligne->id)->update([$colonne => $normalise]);
                        }
                    }
                });
        }
    }

    /**
     * Rien à défaire : la forme saisie (espaces, points, format national) ne portait aucune
     * information que la forme E.164 n'ait pas. Un `down()` qui la « restaurerait » devrait
     * l'inventer.
     */
    public function down(): void {}

    private static function normaliser(string $value): string
    {
        $numero = preg_replace('/[\s.\-()\/]+/u', '', $value) ?? $value;
        if (str_starts_with($numero, '00')) {
            $numero = '+'.substr($numero, 2);
        }
        if (preg_match('/^221\d{9}$/', $numero) === 1) {
            return '+'.$numero;
        }
        if (preg_match('/^(?:7[05678]|33)\d{7}$/', $numero) === 1) {
            return '+221'.$numero;
        }

        return $numero;
    }
};

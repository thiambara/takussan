<?php

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-954 (ADR-0070 § 2) — la pièce et le revenu d'une caution sont chiffrés.
 *
 * Même forme que `encrypt_id_number_on_customers` : les colonnes passent en `text` AVANT le
 * chiffrement, puis l'existant est chiffré par `Crypt::encryptString`, ce que relit le cast
 * `encrypted`. Le revenu est chiffré sous la forme texte que PostgreSQL rend du `numeric`
 * (`800000.00`).
 *
 * Idempotente : une valeur déjà déchiffrable est laissée telle quelle. Le `down()` DÉCHIFFRE puis
 * rend `varchar(255)` et `numeric(14,2)`. Le retour de `text` vers `numeric` demande un `USING`
 * explicite (PostgreSQL refuse la conversion implicite, 42804) ; les requêtes bornent les deux
 * valeurs pour qu'elles tiennent dans ces types. Aller-retour : `GuarantorSensitiveDataTest`.
 */
return new class extends Migration
{
    private const COLUMNS = ['id_number', 'monthly_income'];

    public function up(): void
    {
        Schema::table('guarantors', function (Blueprint $table): void {
            foreach (self::COLUMNS as $column) {
                $table->text($column)->nullable()->change();
            }
        });

        $this->rewrite(static fn (string $value): string => self::isEncrypted($value) ? $value : Crypt::encryptString($value));
    }

    public function down(): void
    {
        $this->rewrite(static fn (string $value): string => self::isEncrypted($value) ? Crypt::decryptString($value) : $value);

        Schema::table('guarantors', function (Blueprint $table): void {
            $table->string('id_number')->nullable()->change();
        });
        DB::statement('ALTER TABLE guarantors ALTER COLUMN monthly_income TYPE numeric(14,2) USING monthly_income::numeric(14,2)');
    }

    /** @param  callable(string): string  $transform */
    private function rewrite(callable $transform): void
    {
        DB::table('guarantors')
            ->select(array_merge(['id'], self::COLUMNS))
            ->orderBy('id')
            ->chunkById(500, function ($rows) use ($transform): void {
                foreach ($rows as $row) {
                    $changes = [];
                    foreach (self::COLUMNS as $column) {
                        $value = $row->{$column};
                        if ($value === null || $value === '') {
                            continue;
                        }
                        $next = $transform((string) $value);
                        if ($next !== $value) {
                            $changes[$column] = $next;
                        }
                    }
                    if ($changes !== []) {
                        DB::table('guarantors')->where('id', $row->id)->update($changes);
                    }
                }
            });
    }

    private static function isEncrypted(string $value): bool
    {
        try {
            Crypt::decryptString($value);

            return true;
        } catch (DecryptException) {
            return false;
        }
    }
};

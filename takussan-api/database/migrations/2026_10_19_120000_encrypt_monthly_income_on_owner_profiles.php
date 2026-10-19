<?php

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-956 (ADR-0070 § 2) — le revenu mensuel du bailleur est chiffré.
 *
 * Même forme que `encrypt_identity_and_income_on_guarantors` : la colonne passe en `text` AVANT le
 * chiffrement, puis l'existant est chiffré sous la forme texte que PostgreSQL rend du `numeric`
 * (`350000.00`), ce que relit le cast `encrypted`.
 *
 * Idempotente : une valeur déjà déchiffrable est laissée telle quelle. Le `down()` DÉCHIFFRE puis
 * rend `numeric(14,2)` par un `USING` explicite (PostgreSQL refuse la conversion implicite de
 * `text`, 42804). Aucune requête de l'API n'écrit cette colonne. Aller-retour :
 * `OwnerProfileSensitiveDataTest`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('owner_profiles', function (Blueprint $table): void {
            $table->text('monthly_income')->nullable()->change();
        });

        $this->rewrite(static fn (string $value): string => self::isEncrypted($value) ? $value : Crypt::encryptString($value));
    }

    public function down(): void
    {
        $this->rewrite(static fn (string $value): string => self::isEncrypted($value) ? Crypt::decryptString($value) : $value);

        DB::statement('ALTER TABLE owner_profiles ALTER COLUMN monthly_income TYPE numeric(14,2) USING monthly_income::numeric(14,2)');
    }

    /** @param  callable(string): string  $transform */
    private function rewrite(callable $transform): void
    {
        DB::table('owner_profiles')
            ->select(['id', 'monthly_income'])
            ->whereNotNull('monthly_income')
            ->orderBy('id')
            ->chunkById(500, function ($rows) use ($transform): void {
                foreach ($rows as $row) {
                    $value = (string) $row->monthly_income;
                    if ($value === '') {
                        continue;
                    }
                    $next = $transform($value);
                    if ($next !== $value) {
                        DB::table('owner_profiles')->where('id', $row->id)->update(['monthly_income' => $next]);
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

<?php

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-953 (ADR-0070 § 2) — le numéro de pièce du client est chiffré.
 *
 * Même forme que `encrypt_sensitive_columns_on_owner_profiles` : la colonne passe en `text` AVANT
 * le chiffrement (une valeur chiffrée ne tient pas dans un `varchar(255)`), puis l'existant est
 * chiffré par `Crypt::encryptString`, ce que relit le cast `encrypted`.
 *
 * Idempotente : une valeur déjà déchiffrable est laissée telle quelle. Le `down()` DÉCHIFFRE puis
 * rend `varchar(255)` : les requêtes bornent la valeur à 100 caractères, elle y tient toujours.
 * L'aller-retour est éprouvé par `CustomerIdNumberEncryptionTest`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table): void {
            $table->text('id_number')->nullable()->change();
        });

        $this->rewrite(static fn (string $value): string => self::isEncrypted($value) ? $value : Crypt::encryptString($value));
    }

    public function down(): void
    {
        $this->rewrite(static fn (string $value): string => self::isEncrypted($value) ? Crypt::decryptString($value) : $value);

        Schema::table('customers', function (Blueprint $table): void {
            $table->string('id_number')->nullable()->change();
        });
    }

    /** @param  callable(string): string  $transform */
    private function rewrite(callable $transform): void
    {
        DB::table('customers')
            ->select(['id', 'id_number'])
            ->whereNotNull('id_number')
            ->where('id_number', '!=', '')
            ->orderBy('id')
            ->chunkById(500, function ($rows) use ($transform): void {
                foreach ($rows as $row) {
                    $next = $transform((string) $row->id_number);
                    if ($next !== $row->id_number) {
                        DB::table('customers')->where('id', $row->id)->update(['id_number' => $next]);
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

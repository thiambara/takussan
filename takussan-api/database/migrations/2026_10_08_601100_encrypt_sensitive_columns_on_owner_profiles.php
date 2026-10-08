<?php

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-601 (ADR-0044 §1) — le RIB, le NINEA et le numéro de pièce d'un bailleur sont chiffrés.
 *
 * Les colonnes passent en `text` AVANT le chiffrement : une valeur chiffrée ne tient pas dans un
 * `varchar(255)` (mesuré : 34 caractères en clair → 256 chiffrés), et PostgreSQL applique la
 * longueur. Le chiffrement est celui du cast `encrypted` (`Crypt::encryptString`, sans
 * sérialisation) : le modèle relit ce que la migration écrit.
 *
 * Idempotente : une valeur déjà déchiffrable est laissée telle quelle. Le `down()` DÉCHIFFRE puis
 * rend `string` — l'aller-retour est éprouvé par `OwnerProfileSensitiveDataTest`.
 */
return new class extends Migration
{
    private const COLUMNS = ['rib', 'tax_id', 'id_document_number'];

    public function up(): void
    {
        Schema::table('owner_profiles', function (Blueprint $table): void {
            foreach (self::COLUMNS as $column) {
                $table->text($column)->nullable()->change();
            }
        });

        $this->rewrite(static fn (string $value): string => self::isEncrypted($value) ? $value : Crypt::encryptString($value));
    }

    public function down(): void
    {
        $this->rewrite(static fn (string $value): string => self::isEncrypted($value) ? Crypt::decryptString($value) : $value);

        Schema::table('owner_profiles', function (Blueprint $table): void {
            foreach (self::COLUMNS as $column) {
                $table->string($column)->nullable()->change();
            }
        });
    }

    /** @param  callable(string): string  $transform */
    private function rewrite(callable $transform): void
    {
        DB::table('owner_profiles')
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
                        DB::table('owner_profiles')->where('id', $row->id)->update($changes);
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

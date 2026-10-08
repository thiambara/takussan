<?php

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-601 (ADR-0044 §1) — le NINEA et le RIB professionnel d'une demande de passage en agence
 * `standard` sont chiffrés, et la COPIE du RIB dans `agencies.metadata.legal_info.rib_pro` est
 * supprimée : elle n'avait aucun lecteur, et `AgencyResource` la rendait à tout membre de l'agence.
 * La seule source du RIB professionnel reste la demande, chiffrée.
 *
 * Même procédé idempotent que pour les profils de bailleur. Le `down()` DÉCHIFFRE, rend `string`,
 * et recopie `rib_pro` depuis la demande `approved` de chaque agence — l'état d'avant, entier.
 */
return new class extends Migration
{
    private const COLUMNS = ['ninea', 'rib_pro'];

    public function up(): void
    {
        Schema::table('agency_upgrade_requests', function (Blueprint $table): void {
            foreach (self::COLUMNS as $column) {
                $table->text($column)->change();
            }
        });

        $this->rewrite(static fn (string $value): string => self::isEncrypted($value) ? $value : Crypt::encryptString($value));

        DB::statement("UPDATE agencies SET metadata = metadata #- '{legal_info,rib_pro}' WHERE metadata #> '{legal_info,rib_pro}' IS NOT NULL");
    }

    public function down(): void
    {
        $this->rewrite(static fn (string $value): string => self::isEncrypted($value) ? Crypt::decryptString($value) : $value);

        Schema::table('agency_upgrade_requests', function (Blueprint $table): void {
            foreach (self::COLUMNS as $column) {
                $table->string($column)->change();
            }
        });

        // La dernière demande approuvée de chaque agence fait foi, comme au flip.
        DB::statement(<<<'SQL'
            UPDATE agencies a
            SET metadata = jsonb_set(
                COALESCE(a.metadata, '{}'::jsonb),
                '{legal_info}',
                COALESCE(a.metadata->'legal_info', '{}'::jsonb) || jsonb_build_object('rib_pro', r.rib_pro)
            )
            FROM (
                SELECT DISTINCT ON (agency_id) agency_id, rib_pro
                FROM agency_upgrade_requests
                WHERE status = 'approved'
                ORDER BY agency_id, reviewed_at DESC NULLS LAST, id DESC
            ) r
            WHERE r.agency_id = a.id
        SQL);
    }

    /** @param  callable(string): string  $transform */
    private function rewrite(callable $transform): void
    {
        DB::table('agency_upgrade_requests')
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
                        DB::table('agency_upgrade_requests')->where('id', $row->id)->update($changes);
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

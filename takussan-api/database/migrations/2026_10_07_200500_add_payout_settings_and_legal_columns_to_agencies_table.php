<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-594 (ADR-0039 §4, §7) — le seuil d'approbation des reversements, la TVA par défaut et les
 * mentions légales d'une agence.
 *
 * ⚠ `payout_approval_threshold` n'a NI défaut NI reprise : il vaut `null` pour toute agence,
 * existante ou créée ensuite (décision du porteur, 2026-10-06). C'est l'agence qui l'active. Une
 * colonne et non une clé de `settings` : `AgencyUpdateRequest` remplace le tableau `settings` entier.
 *
 * Les mentions légales sont reprises de `metadata.legal_info` — `company_legal_name`, `ninea`, `rc`,
 * `address_fiscale` — et JAMAIS `rib_pro` : TCK-601 le retire de `metadata`, et un RIB n'a rien à
 * faire dans une colonne lue en clair par chaque facture.
 */
return new class extends Migration
{
    /** @var array<string, string> clé de `metadata.legal_info` → colonne */
    private const LEGAL_COLUMNS = [
        'company_legal_name' => 'legal_name',
        'ninea' => 'ninea',
        'rc' => 'rccm',
        'address_fiscale' => 'legal_address',
    ];

    public function up(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->decimal('payout_approval_threshold', 14, 2)->nullable();
            $table->decimal('default_tax_rate', 5, 2)->nullable();
            $table->string('legal_name')->nullable();
            $table->string('ninea', 30)->nullable();
            $table->string('rccm', 30)->nullable();
            $table->text('legal_address')->nullable();
        });

        $this->backfill();
    }

    /** La reprise seule, rejouable par le test (AC14) : elle n'écrit que dans des colonnes vides. */
    public function backfill(): void
    {
        foreach (self::LEGAL_COLUMNS as $key => $column) {
            // `->>` rend le texte de la clé ; `NULLIF` écarte la chaîne vide. La longueur est bornée
            // comme la colonne : une valeur plus longue reste dans `metadata`, non tronquée en silence.
            $limit = in_array($column, ['ninea', 'rccm'], true) ? 30 : 255;
            $limitClause = $column === 'legal_address' ? '' : "AND length(metadata->'legal_info'->>'{$key}') <= {$limit}";

            DB::statement(<<<SQL
                UPDATE agencies
                SET {$column} = NULLIF(btrim(metadata->'legal_info'->>'{$key}'), '')
                WHERE {$column} IS NULL
                  AND metadata->'legal_info'->>'{$key}' IS NOT NULL
                  {$limitClause}
            SQL);
        }
    }

    public function down(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->dropColumn([
                'payout_approval_threshold', 'default_tax_rate',
                'legal_name', 'ninea', 'rccm', 'legal_address',
            ]);
        });
    }
};

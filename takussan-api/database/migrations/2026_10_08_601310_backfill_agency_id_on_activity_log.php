<?php

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-601 (ADR-0044 §3) — rattrapage d'`activity_log.agency_id` pour les lignes antérieures, dans
 * l'ordre de `AuditAgencyResolver` : `properties.agency_id` explicite, puis l'agence du parent
 * pour les modèles enfants, puis la colonne `agency_id` du sujet, puis le sujet `Agency` lui-même.
 * Une ligne déjà rattachée n'est jamais réécrite (`agency_id IS NULL` partout).
 *
 * La liste des sujets à colonne `agency_id` est DÉRIVÉE du schéma (les `subject_type` présents dont
 * la table porte la colonne), pas recopiée : un modèle neuf est rattrapé sans qu'on y pense.
 *
 * `down()` remet la colonne à `null` : la colonne elle-même appartient à la migration précédente.
 */
return new class extends Migration
{
    /** Modèle enfant → [table, clé vers le parent, table du parent]. */
    private const CHILDREN = [
        'App\\Models\\LeasePayment' => ['lease_payments', 'lease_id', 'leases'],
        'App\\Models\\BookingPayment' => ['booking_payments', 'booking_id', 'bookings'],
        'App\\Models\\BankStatementLine' => ['bank_statement_lines', 'bank_statement_id', 'bank_statements'],
        'App\\Models\\MaintenanceRequest' => ['maintenance_requests', 'property_id', 'properties'],
        'App\\Models\\CustomerNote' => ['customer_notes', 'customer_id', 'customers'],
    ];

    public function up(): void
    {
        // 1. explicite — et seulement vers une agence qui existe encore (la FK le refuserait). Le
        //    `CASE` garde le transtypage : PostgreSQL n'évalue pas un `AND` dans l'ordre écrit.
        DB::statement(<<<'SQL'
            UPDATE activity_log a SET agency_id = g.id
            FROM agencies g
            WHERE a.agency_id IS NULL
              AND g.id = CASE WHEN a.properties->>'agency_id' ~ '^[0-9]{1,18}$' THEN (a.properties->>'agency_id')::bigint END
        SQL);

        // 2. modèles enfants.
        foreach (self::CHILDREN as $class => [$table, $foreignKey, $parent]) {
            DB::update(
                "UPDATE activity_log a SET agency_id = p.agency_id FROM {$table} c JOIN {$parent} p ON p.id = c.{$foreignKey}
                 WHERE a.agency_id IS NULL AND a.subject_type = ? AND a.subject_id = c.id AND p.agency_id IS NOT NULL",
                [$class],
            );
        }
        DB::update(
            'UPDATE activity_log a SET agency_id = d.subject_id FROM kyc_dossiers d JOIN agencies g ON g.id = d.subject_id
             WHERE a.agency_id IS NULL AND a.subject_type = ? AND a.subject_id = d.id AND d.subject_type = ?',
            ['App\\Models\\KycDossier', 'App\\Models\\Agency'],
        );

        // 3. sujets à colonne `agency_id` réelle.
        $types = DB::table('activity_log')->whereNull('agency_id')->whereNotNull('subject_type')->distinct()->pluck('subject_type');
        foreach ($types as $class) {
            if (! class_exists($class) || ! is_subclass_of($class, Model::class)) {
                continue;
            }
            $table = (new $class)->getTable();
            if (! Schema::hasColumn($table, 'agency_id')) {
                continue;
            }
            DB::update(
                "UPDATE activity_log a SET agency_id = s.agency_id FROM {$table} s
                 WHERE a.agency_id IS NULL AND a.subject_type = ? AND a.subject_id = s.id AND s.agency_id IS NOT NULL",
                [$class],
            );
        }

        // 4. sujet `Agency`.
        DB::update(
            'UPDATE activity_log a SET agency_id = a.subject_id
             WHERE a.agency_id IS NULL AND a.subject_type = ? AND EXISTS (SELECT 1 FROM agencies g WHERE g.id = a.subject_id)',
            ['App\\Models\\Agency'],
        );
    }

    public function down(): void
    {
        DB::table('activity_log')->update(['agency_id' => null]);
    }
};

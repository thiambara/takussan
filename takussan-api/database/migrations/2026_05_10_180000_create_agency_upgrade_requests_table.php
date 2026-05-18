<?php

use App\Models\Enums\AgencyUpgradeRequestStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-252 — `agency_upgrade_requests` table.
 *
 * Trace les demandes d'upgrade d'une agence `individual` vers `standard`,
 * soumises par l'`agency_admin` et reviewées par un super-admin.
 *
 * Voir `docs/models-spec.md#49-agencyupgraderequest-` pour la référence
 * canonique des colonnes.
 *
 * Contrainte critique : **une seule demande `pending` par agence** — exposée
 * comme index unique partiel `(agency_id) WHERE status = 'pending'` sur
 * Postgres ; sur SQLite (utilisé en tests locaux) on retombe sur un check
 * applicatif via `AgencyUpgradeRequest::booted()`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agency_upgrade_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('agency_id')
                ->constrained('agencies')->cascadeOnDelete();
            $table->foreignId('submitted_by')
                ->constrained('users')->cascadeOnDelete();

            // Champs légaux requis pour qualifier une agence en `standard`.
            // Ils sont copiés sur `Agency` à l'approbation (TCK-269) si
            // les colonnes équivalentes y sont vides.
            $table->string('rc');
            $table->string('ninea');
            $table->string('rib_pro');
            $table->string('address_fiscale');
            $table->string('company_legal_name');

            $table->unsignedInteger('planned_agents_count')->nullable();

            $table->string('status')->default(AgencyUpgradeRequestStatus::Pending->value);
            $table->timestamp('submitted_at');

            $table->foreignId('reviewed_by')->nullable()
                ->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_comment')->nullable();

            $table->timestamps();

            // Index de lookup côté agence (toutes statuts confondus) et de
            // workflow super-admin (queue de revue).
            $table->index(['agency_id', 'status']);
            $table->index(['status', 'submitted_at']);
        });

        // Postgres: index unique partiel `WHERE status = 'pending'` pour
        // garantir au niveau DB qu'une agence n'a jamais 2 demandes
        // pending simultanées. Pas d'équivalent natif SQLite — fallback au
        // check applicatif dans le modèle.
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement(<<<'SQL'
                CREATE UNIQUE INDEX agency_upgrade_requests_one_pending_per_agency
                ON agency_upgrade_requests (agency_id)
                WHERE status = 'pending'
            SQL);
        }
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS agency_upgrade_requests_one_pending_per_agency');
        }

        Schema::dropIfExists('agency_upgrade_requests');
    }
};

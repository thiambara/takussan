<?php

use App\Support\VisitorFingerprint;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-597 (ADR-0043 §4, §6) — un signalement d'annonce garde la décision qui l'a clos, qui l'a
 * prise et pour quel motif codé ; et son auteur anonyme n'est plus connu que par une EMPREINTE.
 *
 * `reporter_fingerprint` (HMAC-SHA256 de l'IP, clé applicative) sert au dédoublonnage sur 24 h.
 * La reprise calcule l'empreinte des lignes existantes puis EFFACE l'IP en clair : le `down()` ne
 * peut pas la rendre — c'est le but.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('property_reports', function (Blueprint $table) {
            $table->string('decision', 20)->nullable()->after('resolved_at');
            $table->unsignedBigInteger('resolved_by_id')->nullable()->after('decision');
            $table->foreign('resolved_by_id', 'property_reports_resolved_by_fk')
                ->references('id')->on('users')->nullOnDelete();
            $table->string('reason_code', 40)->nullable()->after('resolved_by_id');
            $table->string('reporter_fingerprint', 64)->nullable()->after('reporter_ip');
            $table->index(['property_id', 'reporter_fingerprint', 'created_at'], 'property_reports_fingerprint_idx');
        });

        DB::table('property_reports')->whereNotNull('reporter_ip')->orderBy('id')
            ->each(function (object $row): void {
                DB::table('property_reports')->where('id', $row->id)->update([
                    'reporter_fingerprint' => VisitorFingerprint::ofIp((string) $row->reporter_ip),
                    'reporter_ip' => null,
                ]);
            });
    }

    public function down(): void
    {
        Schema::table('property_reports', function (Blueprint $table) {
            $table->dropIndex('property_reports_fingerprint_idx');
            $table->dropForeign('property_reports_resolved_by_fk');
            $table->dropColumn(['decision', 'resolved_by_id', 'reason_code', 'reporter_fingerprint']);
        });
    }
};

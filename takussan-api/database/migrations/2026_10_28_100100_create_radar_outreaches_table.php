<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2388 (ADR-0077 §3, §4) — un message de démarchage : le texte EXACT envoyé, la version des clauses,
 * l'auteur, l'envoi, l'issue et la chaîne de relances.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('radar_outreaches', function (Blueprint $table) {
            $table->id();
            // restrictOnDelete : une preuve d'accord ne disparaît pas avec son annonceur (ADR-0077 §3, §9).
            $table->foreignId('radar_advertiser_id')->constrained('radar_advertisers', 'id', 'radar_outreaches_advertiser_fk')->restrictOnDelete();
            $table->string('channel', 30)->default('whatsapp_manual');
            $table->string('locale', 5);
            $table->string('clauses_version', 30);
            $table->text('salutation');
            $table->text('summary');
            // Le texte EXACT du lien `wa.me` : la concaténation des segments du composeur, rien d'autre ne l'écrit.
            $table->text('message');
            $table->foreignId('follow_up_of_id')->nullable()->constrained('radar_outreaches', 'id', 'radar_outreaches_follow_up_fk')->nullOnDelete();
            $table->unsignedSmallInteger('follow_up_rank')->default(0);
            $table->foreignId('created_by_id')->nullable()->constrained('users', 'id', 'radar_outreaches_created_by_fk')->nullOnDelete();
            $table->timestamp('sent_at')->nullable();
            $table->foreignId('sent_by_id')->nullable()->constrained('users', 'id', 'radar_outreaches_sent_by_fk')->nullOnDelete();
            $table->string('outcome', 20)->nullable();
            $table->timestamp('outcome_at')->nullable();
            $table->foreignId('outcome_by_id')->nullable()->constrained('users', 'id', 'radar_outreaches_outcome_by_fk')->nullOnDelete();
            $table->timestamps();

            $table->index('radar_advertiser_id', 'radar_outreaches_advertiser_idx');
            // Une relance au plus par message : la chaîne est une liste, jamais un arbre.
            $table->unique('follow_up_of_id', 'radar_outreaches_follow_up_unique');
            $table->index('created_by_id', 'radar_outreaches_created_by_idx');
            $table->index('sent_by_id', 'radar_outreaches_sent_by_idx');
            $table->index('outcome_by_id', 'radar_outreaches_outcome_by_idx');
        });

        // La file « à relancer » : les messages envoyés sans issue.
        DB::statement('CREATE INDEX radar_outreaches_awaiting_idx ON radar_outreaches (sent_at) WHERE outcome IS NULL AND sent_at IS NOT NULL');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS radar_outreaches_awaiting_idx');
        Schema::dropIfExists('radar_outreaches');
    }
};

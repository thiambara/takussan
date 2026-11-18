<?php

namespace Tests\Feature\Database;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\MaintenanceRequest;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * TCK-2957 (AC1, ADR-0128 § 1) — la reprise du sujet : après la migration, tout fil qui porte
 * `maintenance_request_id` porte le sujet `maintenance_request` de cette demande, et AUCUN autre fil
 * n'a de sujet.
 *
 * Le parc est construit, puis la migration rejouée : `down()` (les colonnes et leur contenu
 * disparaissent), `up()` (la reprise). Le DDL de PostgreSQL est transactionnel : `RefreshDatabase`
 * remet tout en place. La comparaison est EXHAUSTIVE : chaque fil, supprimés compris.
 *
 * « Tout fil » comprend les directes qui portent une demande (rien ne les interdit,
 * `FilDeLInterventionParLaRelationTest` en crée) : la reprise suit la colonne, pas le type.
 */
class ConversationSubjectMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = 'database/migrations/2026_11_18_295701_add_subject_to_conversations_table.php';

    private function migration(): Migration
    {
        return require base_path(self::MIGRATION);
    }

    private function fil(ConversationType $type, ?MaintenanceRequest $mr): Conversation
    {
        return Conversation::create([
            'type' => $type->value,
            'status' => ConversationStatus::Active->value,
            'subject' => $type === ConversationType::Group ? 'Fil' : null,
            'created_by' => User::factory()->create()->id,
            'maintenance_request_id' => $mr?->id,
        ]);
    }

    public function test_tout_fil_d_intervention_recoit_son_sujet_et_aucun_autre(): void
    {
        $mr = MaintenanceRequest::factory()->create();
        $autre = MaintenanceRequest::factory()->create();

        $attendu = [];
        $attendu[$this->fil(ConversationType::Group, $mr)->id] = ['maintenance_request', $mr->id];
        $attendu[$this->fil(ConversationType::Group, $autre)->id] = ['maintenance_request', $autre->id];
        $attendu[$this->fil(ConversationType::Direct, $mr)->id] = ['maintenance_request', $mr->id];
        $supprime = $this->fil(ConversationType::Group, $autre);
        $supprime->delete();
        $attendu[$supprime->id] = ['maintenance_request', $autre->id];

        // Sans demande : aucun sujet, même avec un bien ou un bail de contexte.
        $attendu[$this->fil(ConversationType::Group, null)->id] = [null, null];
        $attendu[$this->fil(ConversationType::Direct, null)->id] = [null, null];

        $this->migration()->down();
        $this->assertFalse(Schema::hasColumn('conversations', 'subject_type'));
        $this->assertFalse(Schema::hasColumn('conversations', 'subject_id'));
        $this->migration()->up();

        $obtenu = DB::table('conversations')->orderBy('id')->get(['id', 'subject_type', 'subject_id'])
            ->mapWithKeys(fn ($l) => [$l->id => [$l->subject_type, $l->subject_id === null ? null : (int) $l->subject_id]])
            ->all();
        ksort($attendu);

        $this->assertSame($attendu, $obtenu);
    }

    public function test_l_index_porte_un_nom_explicite(): void
    {
        $index = collect(Schema::getIndexes('conversations'))->firstWhere('name', 'conversations_subject_idx');

        $this->assertNotNull($index);
        $this->assertSame(['subject_type', 'subject_id'], $index['columns']);
    }
}

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
use Tests\TestCase;

/**
 * TCK-2958 (ADR-0128 § 3) — la conversion des avis d'intervention en `event`, et du texte des avis en
 * leur code. Le parc est écrit par `DB::table` dans sa forme d'AVANT (l'observateur refuse d'écrire
 * un `system` et l'écrivain d'aujourd'hui n'écrit plus cette forme), lignes bizarres comprises :
 * cause absente ou inconnue, identifiant de demande non numérique, fil sans demande, message
 * supprimé. La comparaison est exhaustive (chaque message).
 */
class ConvertMaintenanceNoticesMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = 'database/migrations/2026_11_18_295801_convert_maintenance_notices_to_events.php';

    private User $auteur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->auteur = User::factory()->create();
    }

    private function migration(): Migration
    {
        return require base_path(self::MIGRATION);
    }

    private function fil(?MaintenanceRequest $sujet = null, ?MaintenanceRequest $colonne = null): Conversation
    {
        $fil = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Fil',
            'created_by' => $this->auteur->id,
        ]);
        DB::table('conversations')->where('id', $fil->id)->update([
            'subject_type' => $sujet ? 'maintenance_request' : null,
            'subject_id' => $sujet?->id,
            'maintenance_request_id' => $colonne?->id ?? $sujet?->id,
        ]);

        return $fil;
    }

    /** @param  array<string, mixed>|null  $metadata */
    private function message(Conversation $fil, string $type, string $content, ?array $metadata, bool $supprime = false, bool $dernier = false): int
    {
        $id = DB::table('messages')->insertGetId([
            'conversation_id' => $fil->id,
            'sender_id' => $type === 'system' ? null : $this->auteur->id,
            'type' => $type,
            'content' => $content,
            'metadata' => $metadata === null ? null : json_encode($metadata),
            'created_at' => now(),
            'updated_at' => now(),
            'deleted_at' => $supprime ? now() : null,
        ]);
        if ($dernier) {
            DB::table('conversations')->where('id', $fil->id)->update(['last_message_id' => $id, 'last_message_preview' => $content]);
        }

        return $id;
    }

    /** @return array{type: string, content: string, metadata: mixed} */
    private function lu(int $id): array
    {
        $ligne = DB::table('messages')->where('id', $id)->first();

        return ['type' => $ligne->type, 'content' => $ligne->content, 'metadata' => $ligne->metadata === null ? null : json_decode($ligne->metadata, true)];
    }

    public function test_les_avis_d_intervention_deviennent_des_evenements_et_les_avis_leur_code(): void
    {
        $mr = MaintenanceRequest::factory()->create();
        $sujet = MaintenanceRequest::factory()->create();
        $colonne = MaintenanceRequest::factory()->create();

        $filMr = $this->fil($mr);
        $filSujet = $this->fil($sujet);
        $filColonne = $this->fil(null, $colonne);
        $filNu = $this->fil();

        $complet = $this->message($filMr, 'system', 'Intervention confiée à Awa', [
            'event' => 'maintenance', 'maintenance_request_id' => $mr->id, 'cause' => 'assigned',
            'from' => 'open', 'status' => 'open', 'provider_name' => 'Awa', 'actor_name' => 'Moussa', 'actor_id' => 7,
        ], dernier: true);
        $sansCause = $this->message($filSujet, 'system', 'Statut : en cours', ['event' => 'maintenance', 'status' => 'in_progress']);
        $causeInconnue = $this->message($filColonne, 'system', 'Archivée', ['event' => 'maintenance', 'maintenance_request_id' => 'abc', 'cause' => 'archived', 'status' => 'closed']);
        $sansDemande = $this->message($filNu, 'system', 'Close', ['event' => 'maintenance', 'cause' => 'completed', 'status' => 'completed']);
        $supprime = $this->message($filMr, 'system', 'Acceptée', ['event' => 'maintenance', 'maintenance_request_id' => $mr->id, 'cause' => 'accepted', 'status' => 'open'], supprime: true);
        $ajout = $this->message($filNu, 'system', 'Alice a ajouté Bob au groupe', ['event' => 'participant_added', 'actor_id' => 1], dernier: true);
        $nu = $this->message($filSujet, 'system', 'Avis sans métadonnée', null);
        $texte = $this->message($filColonne, 'text', 'Bonjour', null, dernier: true);

        $this->migration()->up();

        $donnees = fn (?string $status, ?string $from = null, ?string $provider = null, ?string $actor = null) => ['status' => $status, 'from' => $from, 'provider_name' => $provider, 'actor_name' => $actor];
        $evenement = fn (string $code, ?int $objet, array $data) => [
            'type' => 'event',
            'content' => $code,
            'metadata' => ['object' => ['type' => 'maintenance_request', 'id' => $objet], 'code' => $code, 'data' => $data],
        ];

        $this->assertEquals($evenement('maintenance.assigned', $mr->id, $donnees('open', 'open', 'Awa', 'Moussa')), $this->lu($complet));
        $this->assertEquals($evenement('maintenance.transition', $sujet->id, $donnees('in_progress')), $this->lu($sansCause));
        $this->assertEquals($evenement('maintenance.transition', $colonne->id, $donnees('closed')), $this->lu($causeInconnue));
        $this->assertEquals($evenement('maintenance.completed', null, $donnees('completed')), $this->lu($sansDemande));
        $this->assertEquals($evenement('maintenance.accepted', $mr->id, $donnees('open')), $this->lu($supprime));
        // La forme est fermée : ni `actor_id`, ni `cause`, ni `maintenance_request_id`.
        $this->assertEqualsCanonicalizing(['object', 'code', 'data'], array_keys($this->lu($complet)['metadata']));

        $this->assertSame(['type' => 'system', 'content' => 'participant_added', 'metadata' => ['event' => 'participant_added', 'actor_id' => 1]], $this->lu($ajout));
        $this->assertSame(['type' => 'system', 'content' => 'system', 'metadata' => null], $this->lu($nu));
        $this->assertSame(['type' => 'text', 'content' => 'Bonjour', 'metadata' => null], $this->lu($texte));

        $this->assertSame('maintenance.assigned', DB::table('conversations')->where('id', $filMr->id)->value('last_message_preview'));
        $this->assertSame('participant_added', DB::table('conversations')->where('id', $filNu->id)->value('last_message_preview'));
        $this->assertSame('Bonjour', DB::table('conversations')->where('id', $filColonne->id)->value('last_message_preview'));

        // Rejouée, la migration ne change rien.
        $avant = DB::table('messages')->orderBy('id')->get()->toArray();
        $this->migration()->up();
        $this->assertEquals($avant, DB::table('messages')->orderBy('id')->get()->toArray());
    }

    /** `down()` rend la forme d'avis système ; le texte français, non (il n'est gardé nulle part). */
    public function test_down_rend_la_forme_d_avis_sans_le_texte(): void
    {
        $mr = MaintenanceRequest::factory()->create();
        $fil = $this->fil($mr);
        $id = $this->message($fil, 'system', 'Intervention confiée à Awa', [
            'event' => 'maintenance', 'maintenance_request_id' => $mr->id, 'cause' => 'assigned',
            'from' => 'open', 'status' => 'open', 'provider_name' => 'Awa', 'actor_name' => 'Moussa', 'actor_id' => 7,
        ]);
        $texte = $this->message($fil, 'text', 'Bonjour', null);

        $this->migration()->up();
        $this->migration()->down();

        $this->assertEquals([
            'type' => 'system',
            'content' => 'maintenance.assigned',
            'metadata' => [
                'event' => 'maintenance', 'maintenance_request_id' => $mr->id, 'cause' => 'assigned',
                'from' => 'open', 'status' => 'open', 'provider_name' => 'Awa', 'actor_name' => 'Moussa', 'actor_id' => null,
            ],
        ], $this->lu($id));
        $this->assertSame(['type' => 'text', 'content' => 'Bonjour', 'metadata' => null], $this->lu($texte));
    }
}

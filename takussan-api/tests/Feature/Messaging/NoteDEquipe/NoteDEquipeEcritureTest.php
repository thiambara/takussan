<?php

namespace Tests\Feature\Messaging\NoteDEquipe;

use App\Exceptions\ApiError;
use App\Models\Enums\MessageType;
use App\Models\Enums\MessageVisibility;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Services\Messaging\ConversationWriter;
use App\Services\Messaging\EquipeDuFil;
use App\Services\Messaging\EvenementsDuFil;
use App\Services\Messaging\SallesDuFil;
use App\Services\Messaging\SujetsDuFil;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Support\SceneDeNoteDEquipe;

/**
 * TCK-2965 (ADR-0128 § 6, AC5) — l'écriture d'une note d'équipe : `POST …/messages` avec `visibility`,
 * refusée en 422 par `ConversationWriter` hors du personnel actif de l'agence du fil, dans un fil sans
 * agence, et pour un type qui n'est ni un texte, ni une note vocale, ni une pièce jointe.
 */
class NoteDEquipeEcritureTest extends ApiTestCase
{
    use RefreshDatabase, SceneDeNoteDEquipe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
    }

    public function test_le_personnel_actif_ecrit_une_note(): void
    {
        $note = $this->ecrireUneNote('Le bailleur relance pour la caution.');

        $this->assertSame(MessageVisibility::Team, $note->visibility);
        $this->assertSame($this->agence->id, EquipeDuFil::agence($this->fil));
    }

    public function test_sans_visibility_le_message_est_pour_tous(): void
    {
        Sanctum::actingAs($this->auteur);
        $this->postJson("/api/conversations/{$this->fil->id}/messages", ['content' => 'Bonjour à tous.'])
            ->assertCreated()
            ->assertJsonPath('data.visibility', 'all');

        $this->assertSame('all', Message::query()->sole()->getRawOriginal('visibility'));
    }

    public function test_une_visibility_inconnue_est_refusee(): void
    {
        Sanctum::actingAs($this->auteur);
        $this->postJson("/api/conversations/{$this->fil->id}/messages", ['content' => 'x', 'visibility' => 'secret'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('visibility');
    }

    /** @return array<string, array{string}> */
    public static function nonPersonnel(): array
    {
        return [
            'le locataire' => ['locataire'],
            'le bailleur' => ['bailleur'],
            'l\'agent d\'une autre agence' => ['agentAilleurs'],
        ];
    }

    #[DataProvider('nonPersonnel')]
    public function test_hors_du_personnel_la_note_est_refusee(string $qui): void
    {
        Sanctum::actingAs($this->{$qui});
        $this->postJson("/api/conversations/{$this->fil->id}/messages", ['content' => 'Entre nous.', 'visibility' => 'team'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'messaging.team_note_not_staff');

        $this->assertSame(0, Message::query()->count(), 'aucun message écrit');
    }

    public function test_un_fil_sans_agence_refuse_la_note(): void
    {
        $sansAgence = $this->groupe([$this->auteur, $this->collegue]);
        $this->assertNull(EquipeDuFil::agence($sansAgence));

        Sanctum::actingAs($this->auteur);
        $this->postJson("/api/conversations/{$sansAgence->id}/messages", ['content' => 'Entre nous.', 'visibility' => 'team'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'messaging.team_note_no_agency');
    }

    /** @return array<string, array{MessageType}> */
    public static function typesHorsNote(): array
    {
        return [
            'card' => [MessageType::Card],
            'event' => [MessageType::Event],
            'system' => [MessageType::System],
        ];
    }

    /** Le point d'écriture refuse lui-même les types codés : la route ne les accepte déjà pas. */
    #[DataProvider('typesHorsNote')]
    public function test_un_type_code_ne_peut_pas_etre_une_note(MessageType $type): void
    {
        try {
            app(ConversationWriter::class)->post($this->auteur, $this->fil, ['content' => 'x', 'type' => $type->value, 'visibility' => 'team']);
            $this->fail('La note de type '.$type->value.' aurait dû être refusée.');
        } catch (ApiError $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame('messaging.team_note_type', $e->errorCode);
        }

        $this->assertSame(0, Message::query()->count());
    }

    public function test_par_la_route_un_type_code_est_refuse_aussi(): void
    {
        Sanctum::actingAs($this->auteur);
        $this->postJson("/api/conversations/{$this->fil->id}/messages", ['content' => 'x', 'type' => 'system', 'visibility' => 'team'])
            ->assertStatus(422);
    }

    /** Une note vocale, une photo ou un PDF peuvent être des notes : les types de pièce passent la règle. */
    public function test_les_types_de_note(): void
    {
        $this->assertSame(
            [MessageType::Text, MessageType::Audio, MessageType::Image, MessageType::Document],
            MessageVisibility::typesDeNote(),
        );
    }

    /** Un événement (et donc une carte) passe par `EvenementsDuFil` : toujours `all`. */
    public function test_un_evenement_est_toujours_pour_tous(): void
    {
        $evenement = app(EvenementsDuFil::class)->ecrire($this->fil, MaintenanceRequest::factory()->create(), 'maintenance.transition', ['status' => 'in_progress']);

        $this->assertSame(MessageVisibility::All, $evenement->fresh()->visibility);
    }

    /** L'agence du fil : celle du sujet, sinon du bien, sinon du bail — chaque type sujet a sa branche. */
    public function test_l_agence_du_fil_couvre_chaque_type_de_sujet(): void
    {
        $sql = EquipeDuFil::agenceSql('c');
        foreach (SujetsDuFil::typesSujets() as $type) {
            $this->assertStringContainsString("WHEN '{$type}'", $sql);
        }

        $salle = $this->bail->fresh();
        $salleDuBail = app(SallesDuFil::class)->salleDe($salle);
        $this->assertSame($this->agence->id, EquipeDuFil::agence($salleDuBail), 'le sujet bail');

        $intervention = MaintenanceRequest::factory()->create(['property_id' => $this->bien->id]);
        $filDIntervention = $this->groupe([$this->auteur], ['maintenance_request_id' => $intervention->id, 'subject_type' => 'maintenance_request', 'subject_id' => $intervention->id]);
        $this->assertSame($this->agence->id, EquipeDuFil::agence($filDIntervention), 'la demande, par son bien');
    }
}

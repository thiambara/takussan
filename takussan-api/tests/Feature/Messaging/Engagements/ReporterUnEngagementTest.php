<?php

namespace Tests\Feature\Messaging\Engagements;

use App\Models\Commitment;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\Support\SceneDEngagement;
use Tests\TestCase;

/**
 * TCK-2970 (ADR-0130 §§ 3 et 4, AC6) — reporter (ou renommer) un engagement `open`, en retard compris : le
 * porteur ou le personnel. Une nouvelle échéance écrit `commitment.rescheduled` (`data.due_at`) et fait
 * tomber les marqueurs du signal ; `overdue_at`, l'historique du retard, ne tombe jamais.
 */
class ReporterUnEngagementTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase, SceneDEngagement;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-19 10:00:00');
        $this->monterLaScene();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function ouvert(array $attributs = []): Commitment
    {
        return $this->engagement($attributs + [
            'status' => CommitmentStatus::Open,
            'beneficiary_id' => $this->voisin->id,
            'due_at' => now()->addDays(2),
        ]);
    }

    /** @param  array<string, mixed>  $corps */
    private function reporter(Commitment $engagement, User $acteur, array $corps): TestResponse
    {
        Sanctum::actingAs($acteur);

        return $this->putJson("/api/commitments/{$engagement->id}", $corps);
    }

    private static function iso(Carbon $instant): string
    {
        return $instant->copy()->utc()->format('Y-m-d\TH:i:s\Z');
    }

    /** @return list<Message> */
    private function evenements(): array
    {
        return Message::query()->where('conversation_id', $this->fil->id)->where('type', MessageType::Event->value)->orderBy('id')->get()->all();
    }

    public function test_le_porteur_reporte_et_l_evenement_porte_la_nouvelle_echeance(): void
    {
        $engagement = $this->ouvert();
        $nouvelle = now()->addDays(6)->startOfMinute();

        $this->reporter($engagement, $this->locataire, ['due_at' => self::iso($nouvelle)])
            ->assertOk()->assertJsonPath('data.due_at', $nouvelle->copy()->utc()->toIso8601String());

        $this->assertTrue($nouvelle->equalTo($engagement->refresh()->due_at));
        $evenements = $this->evenements();
        $this->assertCount(1, $evenements);
        $this->assertSame('commitment.rescheduled', $evenements[0]->metadata['code']);
        $this->assertSame(['due_at' => $nouvelle->copy()->utc()->toIso8601String()], $evenements[0]->metadata['data']);
        $this->assertSame([], $evenements[0]->metadata['action_for']);
    }

    public function test_le_personnel_reporte_le_beneficiaire_ne_le_peut_pas(): void
    {
        $engagement = $this->ouvert();

        $this->reporter($engagement, $this->voisin, ['due_at' => self::iso(now()->addDays(5))])->assertForbidden();
        $this->reporter($engagement, $this->agent, ['due_at' => self::iso(now()->addDays(5))])->assertOk();
    }

    public function test_un_titre_seul_n_ecrit_aucun_evenement(): void
    {
        $engagement = $this->ouvert();

        $this->reporter($engagement, $this->locataire, ['title' => 'Repasser vendredi'])->assertOk()->assertJsonPath('data.title', 'Repasser vendredi');

        $this->assertSame([], $this->evenements());
    }

    public function test_une_echeance_passee_est_refusee(): void
    {
        $engagement = $this->ouvert();

        $this->reporter($engagement, $this->locataire, ['due_at' => self::iso(now()->subHour())])
            ->assertStatus(422)->assertJsonPath('code', 'commitment.due_in_past');
    }

    public function test_un_engagement_qui_n_est_pas_ouvert_ne_se_reporte_pas(): void
    {
        $engagement = $this->ouvert(['status' => CommitmentStatus::Kept]);

        $this->reporter($engagement, $this->agent, ['due_at' => self::iso(now()->addDays(4))])
            ->assertStatus(422)->assertJsonPath('code', 'commitment.invalid_state');
    }

    /** AC6 — reporter fait tomber les marqueurs du signal, jamais `overdue_at`. */
    public function test_reporter_fait_tomber_les_marqueurs_jamais_overdue_at(): void
    {
        $historique = now()->subDays(8);
        $engagement = $this->ouvert([
            'due_at' => now()->subDays(8),
            'overdue_at' => $historique,
            'due_soon_sent_at' => now()->subDays(9),
            'overdue_signalled_at' => now()->subDays(8),
            'relances' => 2,
            'last_relance_at' => now()->subDays(2),
            'check_requested_at' => now()->subDays(8),
        ]);

        $this->reporter($engagement, $this->locataire, ['due_at' => self::iso(now()->addDays(3))])->assertOk();

        $engagement->refresh();
        $this->assertNull($engagement->due_soon_sent_at);
        $this->assertNull($engagement->overdue_signalled_at);
        $this->assertSame(0, $engagement->relances);
        $this->assertNull($engagement->last_relance_at);
        $this->assertNull($engagement->check_requested_at);
        $this->assertNotNull($engagement->overdue_at, 'L\'historique du retard ne tombe jamais.');
        $this->assertTrue($historique->equalTo($engagement->overdue_at));
    }

    /** Reporté après l'échéance, avant même la commande : le retard reste dans l'historique. */
    public function test_reporter_apres_l_echeance_pose_overdue_at(): void
    {
        $engagement = $this->ouvert(['due_at' => now()->subMinutes(2)]);
        $ancienne = $engagement->due_at->copy();

        $this->reporter($engagement, $this->locataire, ['due_at' => self::iso(now()->addDays(2))])->assertOk();

        $this->assertTrue($ancienne->equalTo($engagement->refresh()->overdue_at));
    }

    public function test_reporter_avant_l_echeance_ne_pose_aucun_retard(): void
    {
        $engagement = $this->ouvert();

        $this->reporter($engagement, $this->locataire, ['due_at' => self::iso(now()->addDays(4))])->assertOk();

        $this->assertNull($engagement->refresh()->overdue_at);
    }
}

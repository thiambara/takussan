<?php

namespace Tests\Feature\Messaging\Engagements;

use App\Models\Commitment;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Services\Messaging\SignalDesEngagements;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\Support\SceneDEngagement;
use Tests\TestCase;

/**
 * TCK-2970 (ADR-0130 § 4, AC5) — `commitments:signal`, horloge figée : le rappel à 24 h, le retard une fois,
 * trois relances espacées de 3 jours, l'idempotence (deux passages, et une instance périmée sous verrou),
 * et un engagement reporté après son retard signalé de nouveau à sa nouvelle échéance.
 */
class SignalDesEngagementsTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase, SceneDEngagement;

    private Carbon $t0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->t0 = Carbon::parse('2026-11-19 10:00:00');
        Carbon::setTestNow($this->t0);
        $this->monterLaScene();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function a(Carbon $instant): void
    {
        Carbon::setTestNow($instant);
    }

    private function passer(): void
    {
        $this->artisan('commitments:signal')->assertSuccessful();
    }

    private function ouvert(Carbon $echeance, array $attributs = []): Commitment
    {
        return $this->engagement($attributs + [
            'status' => CommitmentStatus::Open,
            'due_at' => $echeance,
        ]);
    }

    /** @return list<Message> les événements `$code` du fil, dans l'ordre */
    private function evenements(string $code): array
    {
        return Message::query()->where('conversation_id', $this->fil->id)->where('type', MessageType::Event->value)
            ->whereRaw("metadata->>'code' = ?", [$code])->orderBy('id')->get()->all();
    }

    public function test_le_rappel_part_24_h_avant_l_echeance_au_porteur_seul(): void
    {
        $engagement = $this->ouvert($this->t0->copy()->addDays(3));

        $this->a($this->t0->copy()->addDays(1));
        $this->passer();
        $this->assertCount(0, $this->evenements('commitment.due_soon'), 'Trop tôt.');

        $this->a($this->t0->copy()->addDays(2)->addMinute());
        $this->passer();
        $this->passer();

        $rappels = $this->evenements('commitment.due_soon');
        $this->assertCount(1, $rappels);
        $this->assertSame([$this->locataire->id], $rappels[0]->metadata['action_for']);
        $this->assertEquals(['type' => 'commitment', 'id' => $engagement->id], $rappels[0]->metadata['object']);
        $this->assertNotNull($engagement->refresh()->due_soon_sent_at);
    }

    public function test_aucun_rappel_pour_un_engagement_note_moins_de_24_h_avant_l_echeance(): void
    {
        $this->ouvert($this->t0->copy()->addHours(20));

        $this->a($this->t0->copy()->addHour());
        $this->passer();

        $this->assertCount(0, $this->evenements('commitment.due_soon'));
    }

    public function test_le_retard_est_signale_une_fois(): void
    {
        $echeance = $this->t0->copy()->addDay();
        $engagement = $this->ouvert($echeance);

        $this->a($echeance->copy()->addMinute());
        $this->passer();
        $this->passer();

        $retards = $this->evenements('commitment.overdue');
        $this->assertCount(1, $retards);
        $this->assertSame([$this->locataire->id], $retards[0]->metadata['action_for']);
        $engagement->refresh();
        $this->assertNotNull($engagement->overdue_signalled_at);
        $this->assertTrue($echeance->equalTo($engagement->overdue_at));
        $this->assertSame(CommitmentStatus::Open, $engagement->status, '« En retard » n\'est pas un statut stocké.');
    }

    /** AC5 — trois relances au plus, à J+3, J+6 et J+9, puis plus rien. */
    public function test_trois_relances_espacees_de_trois_jours_puis_plus_rien(): void
    {
        $echeance = $this->t0->copy()->addDay();
        $engagement = $this->ouvert($echeance);
        $this->a($echeance->copy()->addMinute());
        $this->passer();

        $this->a($echeance->copy()->addDays(3)->subHour());
        $this->passer();
        $this->assertCount(0, $this->evenements('commitment.reminded'), 'Pas avant trois jours.');

        foreach ([3, 6, 9] as $rang => $jours) {
            $this->a($echeance->copy()->addDays($jours)->addMinutes(5));
            $this->passer();
            $this->passer();
            $this->assertCount($rang + 1, $this->evenements('commitment.reminded'), "J+{$jours}");
        }

        foreach ([12, 15, 30] as $jours) {
            $this->a($echeance->copy()->addDays($jours)->addMinutes(10));
            $this->passer();
        }
        $relances = $this->evenements('commitment.reminded');
        $this->assertCount(3, $relances);
        $this->assertSame([$this->locataire->id], $relances[2]->metadata['action_for']);
        $this->assertSame(3, $engagement->refresh()->relances);
    }

    /**
     * AC5 — deux passages simultanés : le second tient une instance PÉRIMÉE (lue avant que le premier
     * n'écrive). Le signal se rejuge sur la ligne relue sous verrou, il n'écrit rien.
     */
    public function test_une_instance_perimee_n_ecrit_pas_deux_fois(): void
    {
        $echeance = $this->t0->copy()->addDay();
        $this->ouvert($echeance);
        $this->a($echeance->copy()->addMinute());
        $signal = app(SignalDesEngagements::class);

        // Deux passages lisent leurs candidats avant que l'un n'écrive : deux instances distinctes.
        $duPremier = $signal->candidats(SignalDesEngagements::RETARD, now())->firstOrFail();
        $duSecond = $signal->candidats(SignalDesEngagements::RETARD, now())->firstOrFail();
        $this->assertTrue($signal->signaler($duPremier, SignalDesEngagements::RETARD));
        $this->assertNull($duSecond->overdue_signalled_at, 'L\'instance du second passage est bien périmée.');
        $this->assertFalse($signal->signaler($duSecond, SignalDesEngagements::RETARD));

        $this->assertCount(1, $this->evenements('commitment.overdue'));
    }

    public function test_un_engagement_qui_n_est_pas_ouvert_n_est_pas_signale(): void
    {
        $echeance = $this->t0->copy()->addDay();
        $this->ouvert($echeance, ['status' => CommitmentStatus::Kept, 'beneficiary_id' => $this->voisin->id]);
        $this->ouvert($echeance, ['status' => CommitmentStatus::Proposed]);
        $this->ouvert($echeance, ['status' => CommitmentStatus::Cancelled]);

        $this->a($echeance->copy()->addDays(10));
        $this->passer();

        $this->assertSame(0, Message::query()->where('conversation_id', $this->fil->id)->where('type', MessageType::Event->value)->count());
    }

    public function test_un_engagement_reporte_apres_son_retard_est_signale_a_sa_nouvelle_echeance(): void
    {
        $echeance = $this->t0->copy()->addDay();
        $engagement = $this->ouvert($echeance);
        $this->a($echeance->copy()->addMinute());
        $this->passer();
        $this->assertCount(1, $this->evenements('commitment.overdue'));

        $nouvelle = $echeance->copy()->addDays(2);
        Sanctum::actingAs($this->locataire);
        $this->putJson("/api/commitments/{$engagement->id}", ['due_at' => $nouvelle->copy()->utc()->format('Y-m-d\TH:i:s\Z')])->assertOk();

        $this->passer();
        $this->assertCount(1, $this->evenements('commitment.overdue'), 'Pas avant la nouvelle échéance.');

        $this->a($nouvelle->copy()->addMinute());
        $this->passer();
        $this->assertCount(2, $this->evenements('commitment.overdue'));
        $this->assertTrue($echeance->equalTo($engagement->refresh()->overdue_at), 'L\'historique garde le premier retard.');
    }

    public function test_la_commande_est_planifiee_toutes_les_cinq_minutes(): void
    {
        $evenements = collect(app(Schedule::class)->events())
            ->filter(fn ($e) => str_contains((string) $e->command, 'commitments:signal'));

        $this->assertCount(1, $evenements);
        $this->assertSame('*/5 * * * *', $evenements->first()->expression);
        $this->assertTrue($evenements->first()->withoutOverlapping);
    }
}

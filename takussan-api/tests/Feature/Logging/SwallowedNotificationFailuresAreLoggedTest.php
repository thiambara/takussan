<?php

namespace Tests\Feature\Logging;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Lead\ContactLeadService;
use App\Services\Messaging\GroupConversationService;
use App\Services\Model\NotificationService;
use App\Services\Visit\VisitNotifier;
use Illuminate\Contracts\Notifications\Dispatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Mockery;
use RuntimeException;
use Tests\TestCase;

/**
 * TCK-771 (P14.09) — six `catch (\Throwable) {}` avalaient l'échec d'une notification de prospect,
 * de visite ou d'invitation de groupe sans rien écrire. Ils journalisent désormais sous la forme
 * sûre d'ADR-0044 (`SafeExceptionContext`), jamais le message, et restent non bloquants.
 */
class SwallowedNotificationFailuresAreLoggedTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'secret-destinataire@example.test';

    protected function setUp(): void
    {
        parent::setUp();
        Log::spy();
    }

    public function test_attribution_d_un_prospect(): void
    {
        $this->envoiQuiLeve();
        $lead = PropertyContactLead::factory()->create();

        app(ContactLeadService::class)->assign($lead, User::factory()->create());

        $this->assertJournalise('[ContactLeadService] lead notification failed');
    }

    public function test_demande_de_contact_et_accuse_de_reception(): void
    {
        $this->envoiQuiLeve();

        app(ContactLeadService::class)->forAgent(User::factory()->create(), null, [
            'name' => 'Awa', 'email' => 'awa@example.test', 'message' => 'Bonjour',
        ], Request::create('/'));

        $this->assertJournalise('[ContactLeadService] lead notification failed');
        $this->assertJournalise('[ContactLeadService] lead acknowledgement failed');
    }

    public function test_visite_vers_l_agence(): void
    {
        $this->envoiQuiLeve();
        $visit = PropertyVisit::factory()->create();

        app(VisitNotifier::class)->requested($visit);

        $this->assertJournalise('[VisitNotifier] agency notification failed');
    }

    public function test_visite_vers_le_visiteur(): void
    {
        $this->envoiQuiLeve();
        $visit = PropertyVisit::factory()->create();

        $this->assertNull(app(VisitNotifier::class)->cancelledByAgency($visit));

        $this->assertJournalise('[VisitNotifier] visitor notification failed');
    }

    public function test_invitation_a_un_groupe(): void
    {
        $this->mock(Dispatcher::class, fn ($m) => $m->shouldReceive('send')->andThrow(new RuntimeException('refus SMTP pour '.self::SECRET)));
        $admin = User::factory()->create();
        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Groupe',
            'created_by' => $admin->id,
        ]);
        $conversation->participants()->attach($admin->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $invite = User::factory()->create();

        $added = app(GroupConversationService::class)->addParticipants($conversation, $admin, [$invite->id]);

        $this->assertSame([$invite->id], $added);
        $this->assertJournalise('[GroupConversationService] invite notification failed');
    }

    private function envoiQuiLeve(): void
    {
        $this->mock(NotificationService::class, fn ($m) => $m->shouldReceive('send')->andThrow(new RuntimeException('refus SMTP pour '.self::SECRET)));
    }

    private function assertJournalise(string $message): void
    {
        Log::shouldHaveReceived('warning')->with($message, Mockery::on(function (array $context): bool {
            return ($context['exception'] ?? null) === RuntimeException::class
                && ! str_contains(json_encode($context), self::SECRET);
        }))->atLeast()->once();
    }
}

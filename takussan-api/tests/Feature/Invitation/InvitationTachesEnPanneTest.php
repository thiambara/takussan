<?php

namespace Tests\Feature\Invitation;

use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Services\Invitation\InvitationService;
use ArrayObject;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\Exception\TransportException;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;
use Tests\TestCase;

/**
 * P123.04 (TCK-1251) — les deux tâches horaires des invitations traitent TOUTES les invitations
 * quand un courriel échoue : l'échec est rapporté par invitation, la boucle continue.
 *
 * Avant, `expire()` levait au premier avis à l'invitant (une seule invitation passait `expired`
 * par passage, et son invitant n'était jamais prévenu), et `remindPending()` au premier rappel.
 */
class InvitationTachesEnPanneTest extends TestCase
{
    use RefreshDatabase;

    /** Les envois tentés : chacun lève. */
    private ArrayObject $tentatives;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tentatives = $tentatives = new ArrayObject;
        Mail::extend('panne', fn () => new class($tentatives) extends AbstractTransport
        {
            public function __construct(private readonly ArrayObject $tentatives)
            {
                parent::__construct();
            }

            protected function doSend(SentMessage $message): void
            {
                $this->tentatives->append($message->getEnvelope()->getRecipients()[0]->getAddress());

                throw new TransportException('Transport indisponible (test).');
            }

            public function __toString(): string
            {
                return 'panne://';
            }
        });
        config(['mail.mailers.panne' => ['transport' => 'panne'], 'mail.default' => 'panne']);
        Mail::purge('panne');
    }

    public function test_expire_traite_toutes_les_invitations_echues_malgre_la_panne(): void
    {
        $echues = Invitation::factory()->count(3)->create(['expires_at' => now()->subHour()]);

        app(InvitationService::class)->expire();

        // Chaque invitant a été tenté, pas seulement le premier.
        $this->assertCount(3, $this->tentatives);

        foreach ($echues as $invitation) {
            $this->assertSame(InvitationStatus::Expired->value, $invitation->fresh()->getRawOriginal('status'));
        }
    }

    public function test_les_rappels_continuent_apres_un_envoi_qui_echoue(): void
    {
        $dues = Invitation::factory()->count(3)->create();
        // P132.02 (TCK-1252) — le délai du rappel part de `expires_at` − TTL, plus de `created_at`.
        $this->travel(InvitationService::REMINDER_OFFSET_DAYS + 1)->days();

        $traitees = app(InvitationService::class)->remindPending();

        $this->assertCount(3, $traitees);
        $this->assertCount(3, $this->tentatives, 'chaque invité a été tenté');
        // L'envoi a échoué : aucune n'est marquée, la tâche suivante les reprendra toutes.
        foreach ($dues as $invitation) {
            $this->assertNull($invitation->fresh()->last_reminded_at);
        }
    }
}

<?php

namespace Tests\Feature\Invitation;

use App\Mail\InvitationMailable;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Invitation;
use App\Services\Invitation\InvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\SentMessage;
use Tests\TestCase;

/**
 * P123.01 (TCK-1247) — le courriel d'invitation se REND, sous le mailer `array`, sans `Mail::fake()`.
 *
 * Le gabarit est écrit en composants Markdown (`mail::message`, `mail::button`) mais le Mailable le
 * rendait par `view:` : l'espace `mail::` n'y est pas déclaré, et toute invitation par e-mail
 * répondait 500 (`No hint path defined for [mail]`), rappels compris. La suite restait verte parce
 * que chaque test de l'invitation pose `Mail::fake()`, qui ne rend rien.
 */
class InvitationMailRenduTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['mail.default' => 'array', 'app.frontend_url' => 'https://front.exemple.test']);
        Mail::purge('array');
    }

    /** @return list<SentMessage> */
    private function envoyes(): array
    {
        return app('mailer')->getSymfonyTransport()->messages()->all();
    }

    public function test_une_invitation_d_agent_part_avec_son_lien_d_acceptation(): void
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
            'email' => 'agent.rendu@example.com',
            'role' => 'agent',
            'first_name' => 'Awa',
            'last_name' => 'Diop',
        ])->assertSuccessful();

        $invitation = Invitation::query()->where('email', 'agent.rendu@example.com')->firstOrFail();
        $envoyes = $this->envoyes();
        $this->assertCount(1, $envoyes);
        $corps = $envoyes[0]->getOriginalMessage()->getHtmlBody();
        $this->assertStringContainsString('https://front.exemple.test/invitations/accept?token='.$invitation->token, (string) $corps);
    }

    public function test_le_rappel_part_et_se_marque(): void
    {
        $invitation = Invitation::factory()->create();
        // P132.02 (TCK-1252) — le délai du rappel part de `expires_at` − TTL, plus de `created_at`.
        $this->travel(InvitationService::REMINDER_OFFSET_DAYS + 1)->days();

        app(InvitationService::class)->remindPending();

        $this->assertNotNull($invitation->fresh()->last_reminded_at);
        $this->assertCount(1, $this->envoyes());
    }

    public function test_le_mailable_se_rend(): void
    {
        $invitation = Invitation::factory()->create();

        $html = (new InvitationMailable($invitation))->render();

        $this->assertStringContainsString('/invitations/accept?token='.$invitation->token, $html);
        $this->assertStringNotContainsString('@component', $html);
    }
}

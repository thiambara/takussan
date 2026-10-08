<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Invitation;
use App\Services\Invitation\InvitationService;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse m1 (texte) et raccord TCK-588 — le SMS d'invitation ne porte
 * AUCUN texte libre de l'invitant : seulement le nom de l'agence, filtré (lettres, chiffres,
 * espaces, ponctuation simple) et tronqué, et le lien. Il part par le canal des contacts sans
 * compte (`NotificationService::send(ContactSansCompte)`), donc sous la limite par numéro de
 * `SmsChannel`, sans ligne de cloche.
 *
 * Rouge sur 442050b3 : le SMS interpolait prénom + nom de l'invitant, que l'invitant édite
 * (sonde du vérificateur : « Votre compte Wave est suspendu, rappelez le +221… »), et partait
 * directement par le routeur, sans limite par numéro.
 */
class InvitationSmsContentTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221770000811';

    private Agency $agency;

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        Mail::fake();
        $this->sms = FakeSmsRouter::install();
        $this->agency = Agency::factory()->create([
            'name' => 'Wave <b>Sénégal</b>: http://evil.example/x, sécurité & co (support) urgent',
        ]);
        $this->actingAsRole('agency_admin', ['agency' => $this->agency], null)
            ->forceFill(['first_name' => 'Votre compte Wave est suspendu', 'last_name' => 'rappelez le +221781234567'])
            ->save();
    }

    public function test_le_sms_ne_porte_que_le_nom_de_l_agence_filtre_et_tronque(): void
    {
        $this->inviter()->assertCreated();

        $messages = $this->sms->sentTo(self::NUMERO);
        $this->assertCount(1, $messages);
        $texte = $messages[0]['message'];

        $this->assertStringNotContainsString('suspendu', $texte);
        $this->assertStringNotContainsString('+221781234567', $texte);
        $this->assertStringNotContainsString('evil.example', $texte);
        $this->assertStringNotContainsString('<b>', $texte);
        $this->assertMatchesRegularExpression('#/invitations/accept\?token=[A-Za-z0-9]{64}#', $texte);

        // Le nom filtré commence par « Wave Sénégal » et ne dépasse pas la borne d'un texte SMS.
        $this->assertStringContainsString('Wave Sénégal', $texte);
        preg_match('/^Takussan ?: (.+?) (vous invite|invites you|dafa la woo)/u', $texte, $m);
        $this->assertNotEmpty($m, $texte);
        $this->assertLessThanOrEqual(NotificationRenderer::SMS_TEXT_MAX, mb_strlen($m[1]));
        $this->assertDoesNotMatchRegularExpression('#[<>:/]#', $m[1]);
    }

    public function test_le_sms_part_par_le_canal_des_contacts_sans_ligne_de_cloche(): void
    {
        $this->inviter()->assertCreated();

        $messages = $this->sms->sentTo(self::NUMERO);
        $this->assertCount(1, $messages);
        $this->assertSame('invitation.received', $messages[0]['context']['event_type'] ?? null);
        $this->assertSame(0, AppNotification::query()->count());
    }

    public function test_le_rappel_porte_son_propre_code(): void
    {
        $this->inviter()->assertCreated();

        $this->travel(InvitationService::REMINDER_OFFSET_DAYS + 1)->days();
        app(InvitationService::class)->remindPending();

        $messages = $this->sms->sentTo(self::NUMERO);
        $this->assertCount(2, $messages);
        $this->assertSame('invitation.reminder', $messages[1]['context']['event_type'] ?? null);
        $this->assertStringNotContainsString('suspendu', $messages[1]['message']);
    }

    public function test_la_limite_par_numero_du_canal_s_applique(): void
    {
        config(['sms.rate_limit.per_user_per_hour' => 1]);
        $id = $this->inviter()->assertCreated()->json('data.id');

        $this->travel(11)->minutes();
        $this->postJson("/api/invitations/{$id}/resend")->assertOk();

        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));
        $this->assertSame('sent', Invitation::query()->findOrFail($id)->status->value);
    }

    private function inviter(): TestResponse
    {
        return $this->postJson("/api/agencies/{$this->agency->id}/service-providers/invite", [
            'phone' => self::NUMERO,
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
        ]);
    }
}

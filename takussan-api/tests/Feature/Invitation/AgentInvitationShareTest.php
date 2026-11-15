<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Invitation\InvitationService;
use App\Support\LienFront;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FakeSmsRouter;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-2927 (ADR-0123) — l'admin invite un membre en lui envoyant lui-même le lien (WhatsApp) :
 * `delivery: "share"` crée l'invitation SANS envoi et rend `share_url` à cette seule création ;
 * `POST /api/invitations/{id}/share-link` en rend un neuf (jeton renouvelé). L'invité accepte par
 * le code SMS envoyé au numéro saisi par l'admin, jamais sans preuve de ce numéro.
 */
class AgentInvitationShareTest extends TestCase
{
    use RefreshDatabase;
    use SessionsDImpersonation;

    private const NUMERO = '+221770009271';

    private Agency $agency;

    private User $admin;

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        Cache::flush();
        Mail::fake();
        $this->sms = FakeSmsRouter::install();
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->admin = $this->actingAsRole('agency_admin', ['agency_id' => $this->agency->id]);
    }

    /** AC1 — aucun envoi, `share_url` rendu une fois ; ni la liste ni la fiche ne portent le jeton. */
    public function test_l_invitation_partagee_ne_part_pas_et_rend_le_lien_une_seule_fois(): void
    {
        $reponse = $this->partager()->assertCreated()
            ->assertJsonPath('data.phone', self::NUMERO)
            ->assertJsonPath('data.email', null)
            ->assertJsonPath('data.status', InvitationStatus::Sent->value);
        $this->assertStringContainsString('no-store', (string) $reponse->headers->get('Cache-Control'));

        Mail::assertNothingOutgoing();
        $this->assertSame([], $this->sms->sent);

        $invitation = Invitation::query()->sole();
        $this->assertTrue($invitation->estPartagee());
        $this->assertSame($this->lienAttendu($invitation->token), $reponse->json('data.share_url'));
        $this->assertDatabaseHas('agent_profiles', [
            'id' => $invitation->invitable_id,
            'agency_id' => $this->agency->id,
            'status' => AgentProfileStatus::Draft->value,
        ]);

        foreach (['/api/invitations', "/api/invitations/{$invitation->id}"] as $lecture) {
            $corps = (string) $this->getJson($lecture)->assertOk()->getContent();
            $this->assertStringNotContainsString($invitation->token, $corps, $lecture);
            $this->assertStringNotContainsString('share_url', $corps, $lecture);
        }

        // Le journal ne porte ni le jeton ni le lien.
        $journal = Activity::query()->get()->toJson();
        $this->assertStringNotContainsString($invitation->token, $journal);
        $this->assertStringContainsString('"delivery":"share"', $journal);
    }

    /** Le partage ne consomme pas le plafond journalier des SMS d'invitation de l'agence. */
    public function test_le_partage_ne_consomme_pas_le_plafond_des_sms(): void
    {
        config(['sms.invitation_daily_cap_per_agency' => 1]);
        $this->partager()->assertCreated();
        $this->partager(['phone' => '+221770009272'])->assertCreated();

        $this->postJson("/api/agencies/{$this->agency->id}/agents/invite", [
            'role' => 'agent', 'first_name' => 'Fatou', 'last_name' => 'Sall', 'phone' => '+221770009273',
        ])->assertCreated();
        $this->assertCount(1, $this->sms->sentTo('+221770009273'));
    }

    /** L'invitation partagée est adressée au seul numéro : un e-mail est refusé, le numéro exigé. */
    public function test_le_partage_exige_le_numero_et_refuse_l_email(): void
    {
        $this->partager(['email' => 'awa@example.com'])->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->partager(['phone' => null])->assertUnprocessable()->assertJsonValidationErrors('phone');
        $this->assertSame(0, Invitation::query()->count());
    }

    /** Drapeau éteint, le code ne s'enverrait pas : le partage est refusé. */
    public function test_le_partage_est_refuse_drapeau_eteint(): void
    {
        config(['auth.phone_login.enabled' => false]);

        $this->partager(['email' => null])->assertUnprocessable()->assertJsonValidationErrors('delivery');
        $this->assertSame(0, Invitation::query()->count());
    }

    /** AC2 — un lien neuf ; l'ancien rend 404 sur l'aperçu public ; toujours aucun envoi. */
    public function test_le_renouvellement_rend_un_lien_neuf_et_coupe_l_ancien(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $ancien = $this->partager()->assertCreated()->json('data.share_url');
        $invitation = Invitation::query()->sole();
        $ancienJeton = $invitation->token;

        $reponse = $this->postJson("/api/invitations/{$invitation->id}/share-link")->assertOk()
            ->assertJsonPath('data.id', $invitation->id);
        $this->assertStringContainsString('no-store', (string) $reponse->headers->get('Cache-Control'));
        $invitation->refresh();
        $this->assertNotSame($ancienJeton, $invitation->token);
        $this->assertSame($this->lienAttendu($invitation->token), $reponse->json('data.share_url'));
        $this->assertNotSame($ancien, $reponse->json('data.share_url'));

        $this->app['auth']->forgetGuards();
        $this->getJson("/api/public/invitations/{$ancienJeton}")->assertNotFound();
        $this->getJson("/api/public/invitations/{$invitation->token}")->assertOk()->assertJsonPath('data.code_only', true);

        Mail::assertNothingOutgoing();
        $this->assertSame([], $this->sms->sent);
        $this->assertStringNotContainsString($invitation->token, Activity::query()->get()->toJson());
        $this->assertSame(1, Activity::query()->where('event', 'invitation_share_link_issued')->count());
    }

    /** Une invitation adressée à un e-mail ne se partage pas : la prémisse d'ADR-0094 § 6 tomberait. */
    public function test_le_renouvellement_refuse_une_invitation_par_email(): void
    {
        $this->postJson("/api/agencies/{$this->agency->id}/agents/invite", [
            'email' => 'awa@example.com', 'role' => 'agent', 'first_name' => 'Awa', 'last_name' => 'Ndiaye',
        ])->assertCreated();
        $invitation = Invitation::query()->sole();
        $jeton = $invitation->token;

        $this->postJson("/api/invitations/{$invitation->id}/share-link")->assertUnprocessable();
        $this->assertSame($jeton, $invitation->fresh()->token);
    }

    /** AC3 — un agent sans capacité d'inviter, et l'admin d'une autre agence : 403, rien ne tourne. */
    public function test_sans_capacite_ou_d_une_autre_agence_403(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->partager()->assertCreated();
        $invitation = Invitation::query()->sole();
        $jeton = $invitation->token;

        $this->actingAsRole('agent', ['agency_id' => $this->agency->id]);
        $this->partager(['phone' => '+221770009274'])->assertForbidden();
        $this->postJson("/api/invitations/{$invitation->id}/share-link")->assertForbidden();

        $autre = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agency_admin', ['agency_id' => $autre->id]);
        $this->postJson("/api/agencies/{$this->agency->id}/agents/invite", $this->corps(['phone' => '+221770009275']))->assertForbidden();
        $this->postJson("/api/invitations/{$invitation->id}/share-link")->assertForbidden();

        $this->assertSame($jeton, $invitation->fresh()->token);
        $this->assertSame(1, Invitation::query()->count());
    }

    /** Sous impersonation, aucun des deux gestes ne rend le lien (ADR-0055 § 3). */
    public function test_sous_impersonation_le_lien_ne_sort_pas(): void
    {
        $this->partager()->assertCreated();
        $invitation = Invitation::query()->sole();
        $session = $this->ouvrirUneSession(null, $this->admin);

        $this->avecLeJeton($session['jeton']);
        $this->postJson("/api/invitations/{$invitation->id}/share-link")
            ->assertForbidden()->assertJsonPath('code', 'impersonation.read_only')->assertJsonMissingPath('data.share_url');
        $this->postJson("/api/agencies/{$this->agency->id}/agents/invite", $this->corps(['phone' => '+221770009276']))
            ->assertForbidden()->assertJsonPath('code', 'impersonation.read_only');
    }

    /** AC4 — l'invité accepte par le code SMS envoyé au numéro saisi ; aucun e-mail posé vérifié. */
    public function test_l_invite_accepte_par_le_code_au_numero_saisi(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->partager()->assertCreated();
        $invitation = Invitation::query()->sole();

        $this->app['auth']->forgetGuards();
        $this->postJson("/api/public/invitations/{$invitation->token}/code")->assertStatus(202);
        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));

        $this->postJson("/api/public/invitations/{$invitation->token}/verify", [
            'code' => $this->sms->lastCodeFor(self::NUMERO), 'first_name' => 'Awa', 'last_name' => 'Ndiaye',
        ])->assertOk()->assertJsonPath('invitation.status', 'accepted');

        $compte = User::query()->where('phone', self::NUMERO)->sole();
        $this->assertNotNull($compte->phone_verified_at);
        $this->assertNull($compte->email);
        $this->assertNull($compte->email_verified_at);
        $this->assertSame($compte->id, (int) AgentProfile::query()->findOrFail($invitation->invitable_id)->user_id);
    }

    /**
     * ADR-0123 § 4 — le détenteur du lien (l'admin compris) ne crée pas, sans code, un compte au
     * numéro posé vérifié : l'acceptation sans session est refusée pour une invitation partagée.
     */
    public function test_l_acceptation_sans_code_est_refusee(): void
    {
        $this->partager()->assertCreated();
        $invitation = Invitation::query()->sole();
        $avant = User::query()->count();

        $this->app['auth']->forgetGuards();
        $this->postJson("/api/invitations/{$invitation->token}/accept", ['first_name' => 'Awa', 'last_name' => 'Ndiaye'])
            ->assertForbidden()->assertJsonPath('code', 'invitation.code_required');

        $this->assertSame($avant, User::query()->count());
        $this->assertSame(InvitationStatus::Sent, $invitation->fresh()->status);
    }

    /** ADR-0123 § 5 — la plateforme n'envoie rien d'une invitation partagée : pas de rappel à J+2. */
    public function test_le_rappel_ignore_l_invitation_partagee(): void
    {
        $this->partager()->assertCreated();

        $rappelees = app(InvitationService::class)->remindPending(now()->addDays(InvitationService::REMINDER_OFFSET_DAYS)->addHour());

        $this->assertCount(0, $rappelees);
        $this->assertSame([], $this->sms->sent);
    }

    /** ADR-0123 § 5 — la relance envoie le lien par SMS : l'invitation cesse d'être partagée. */
    public function test_la_relance_envoie_par_sms_et_l_invitation_cesse_d_etre_partagee(): void
    {
        $this->partager()->assertCreated();
        $invitation = Invitation::query()->sole();

        $this->postJson("/api/invitations/{$invitation->id}/resend")->assertOk()->assertJsonMissingPath('data.share_url');

        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));
        $this->assertFalse($invitation->fresh()->estPartagee());
    }

    /** @param  array<string, mixed>  $surcharge */
    private function partager(array $surcharge = []): TestResponse
    {
        return $this->postJson("/api/agencies/{$this->agency->id}/agents/invite", $this->corps($surcharge));
    }

    /**
     * @param  array<string, mixed>  $surcharge
     * @return array<string, mixed>
     */
    private function corps(array $surcharge = []): array
    {
        return array_merge([
            'delivery' => 'share',
            'role' => 'agent',
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            'phone' => self::NUMERO,
        ], $surcharge);
    }

    private function lienAttendu(string $jeton): string
    {
        return LienFront::vers('/invitations/accept?token='.$jeton);
    }
}

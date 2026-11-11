<?php

namespace Tests\Feature\Invitation;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Notifications\CodedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\EnvoisParCode;
use Tests\TestCase;

/**
 * TCK-2609 (ADR-0094 §3) — l'invité dont le lien a EXPIRÉ demande un nouveau lien en un geste :
 * l'invitant en est prévenu (cloche + e-mail), une fois par invitation et par 24 h. Un jeton révoqué
 * ou accepté rend son 410, comme l'acceptation ; un jeton encore valable n'a rien à renouveler.
 */
class InvitationRenewalRequestTest extends TestCase
{
    use EnvoisParCode;
    use RefreshDatabase;

    private Agency $agency;

    private User $inviter;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agency = Agency::factory()->create(['name' => 'Dakar Immo']);
        $this->inviter = User::factory()->create(['first_name' => 'Moussa', 'email' => 'moussa@dakar-immo.sn']);
        // TCK-2726 — l'invitant prévenu est celui qui peut encore renvoyer : un admin actif de l'agence.
        AgencyAdminProfile::factory()->create(['user_id' => $this->inviter->id, 'agency_id' => $this->agency->id]);
    }

    private function demander(string $token): TestResponse
    {
        return $this->postJson('/api/public/invitations/'.$token.'/renewal-request');
    }

    /** @param  array<string, mixed>  $attributs */
    private function invitation(array $attributs = []): Invitation
    {
        return Invitation::factory()->expired()->create([
            'agency_id' => $this->agency->id,
            'invited_by' => $this->inviter->id,
            'role' => 'owner',
            'email' => 'awa.diop@gmail.com',
            ...$attributs,
        ]);
    }

    /** AC3 — expirée : l'invitant est prévenu une fois, avec le lien vers la page où il la renvoie. */
    public function test_un_jeton_expire_previent_l_invitant_une_fois(): void
    {
        $invitation = $this->invitation();

        $this->demander($invitation->token)->assertStatus(202);

        $avis = Notification::sent($this->inviter, CodedNotification::class, self::deCode(NotificationCode::InvitationRenewalRequested));
        $this->assertCount(1, $avis);
        $this->assertSame('awa.diop@gmail.com', $avis->first()->params['invitee']);
        $this->assertSame('owner', $avis->first()->params['role']);
        $this->assertStringEndsWith('/app/owners', $avis->first()->params['url']);
        $this->assertSame(['kind' => 'owners', 'id' => null, 'agency_id' => $this->agency->id], array_intersect_key($avis->first()->target ?? [], array_flip(['kind', 'id', 'agency_id'])));
        $this->assertContains('mail', $avis->first()->via($this->inviter));

        $cloche = AppNotification::query()->where('user_id', $this->inviter->id)->where('code', 'invitation.renewal_requested')->sole();
        $this->assertSame(['invitation_id' => $invitation->id], $cloche->data);
    }

    /** AC3 — la seconde demande du jour rend 202 et ne prévient personne ; après 24 h, de nouveau. */
    public function test_la_seconde_demande_du_jour_ne_previent_pas(): void
    {
        $invitation = $this->invitation();

        $this->demander($invitation->token)->assertStatus(202);
        $this->travel(23)->hours();
        $this->demander($invitation->token)->assertStatus(202)->assertExactJson(['data' => ['status' => 'requested']]);

        $this->assertSame(1, self::nombreDEnvois($this->inviter, NotificationCode::InvitationRenewalRequested));

        $this->travel(2)->hours();
        $this->demander($invitation->token)->assertStatus(202);
        $this->assertSame(2, self::nombreDEnvois($this->inviter, NotificationCode::InvitationRenewalRequested));
    }

    /** Un agent invité : la page de l'équipe. */
    public function test_un_agent_renvoie_vers_l_equipe(): void
    {
        $this->demander($this->invitation(['role' => 'agent'])->token)->assertStatus(202);

        $avis = Notification::sent($this->inviter, CodedNotification::class, self::deCode(NotificationCode::InvitationRenewalRequested))->first();
        $this->assertSame('team', $avis->target['kind'] ?? null);
    }

    /**
     * Révoquée ou acceptée : son 410, comme l'acceptation, et personne n'est prévenu.
     *
     * @return array<string, array{string, array<string, mixed>}>
     */
    public static function etatsSansRenouvellement(): array
    {
        return [
            'révoquée' => ['invitation.token_revoked', ['status' => InvitationStatus::Revoked->value, 'revoked_at' => now(), 'expires_at' => now()->addDay()]],
            'acceptée' => ['invitation.token_accepted', ['status' => InvitationStatus::Accepted->value, 'accepted_at' => now(), 'expires_at' => now()->addDay()]],
        ];
    }

    /** @param  array<string, mixed>  $etat */
    #[DataProvider('etatsSansRenouvellement')]
    public function test_revoquee_ou_acceptee_rend_410_sans_avis(string $code, array $etat): void
    {
        $invitation = $this->invitation($etat);

        $this->demander($invitation->token)->assertStatus(410)->assertJsonPath('code', $code);
        $this->assertSame(0, self::nombreDEnvois($this->inviter, NotificationCode::InvitationRenewalRequested));
    }

    public function test_un_jeton_encore_valable_n_a_rien_a_renouveler(): void
    {
        $invitation = $this->invitation(['status' => InvitationStatus::Sent->value, 'expires_at' => now()->addDay()]);

        $this->demander($invitation->token)->assertStatus(410)->assertJsonPath('code', 'invitation.token_sent');
        $this->assertSame(0, self::nombreDEnvois($this->inviter, NotificationCode::InvitationRenewalRequested));
    }

    public function test_un_jeton_inconnu_rend_404(): void
    {
        $this->demander(Str::random(64))->assertNotFound()->assertJsonPath('code', 'invitation.token_not_found');
    }

    /** TCK-1339 — l'agence supprimée depuis : personne n'y renverrait le lien. */
    public function test_une_agence_supprimee_rend_410_revoque_sans_avis(): void
    {
        $invitation = $this->invitation();
        $this->agency->delete();

        $this->demander($invitation->token)->assertStatus(410)->assertJsonPath('code', 'invitation.token_revoked');
        $this->assertSame(0, self::nombreDEnvois($this->inviter, NotificationCode::InvitationRenewalRequested));
    }

    /** 5 demandes par heure et par IP ; la 6ᵉ rend 429. */
    public function test_la_sixieme_demande_de_l_heure_rend_429(): void
    {
        $invitation = $this->invitation();
        for ($i = 0; $i < 5; $i++) {
            $this->demander($invitation->token)->assertStatus(202);
        }

        $this->demander($invitation->token)->assertStatus(429);
    }
}

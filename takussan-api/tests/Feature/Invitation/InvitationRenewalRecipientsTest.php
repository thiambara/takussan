<?php

namespace Tests\Feature\Invitation;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\UserStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Invitation\InvitationRenewalRequests;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\EnvoisParCode;
use Tests\TestCase;

/**
 * TCK-2726 (décision du porteur du 2026-11-11, option a) — la demande d'un nouveau lien va à qui
 * peut encore le renvoyer : l'invitant s'il est PERSONNEL ACTIF de l'agence et passe
 * `InvitationPolicy::resend` ; sinon le personnel actif de l'agence qui la passe. Pour une
 * invitation sans agence, l'invitant s'il le peut encore, sinon personne. La borne de 24 h n'est
 * consommée que si quelqu'un est prévenu ; la réponse est toujours `202 {status: requested}`.
 */
class InvitationRenewalRecipientsTest extends TestCase
{
    use CreatesAgencyMembers;
    use EnvoisParCode;
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agency = Agency::factory()->create();
    }

    private function demander(Invitation $invitation): TestResponse
    {
        return $this->postJson('/api/public/invitations/'.$invitation->token.'/renewal-request')
            ->assertStatus(202)
            ->assertExactJson(['data' => ['status' => 'requested']]);
    }

    private function invitation(?User $inviter, ?Agency $agency = null, string $role = 'agent'): Invitation
    {
        return Invitation::factory()->expired()->create([
            'agency_id' => $agency?->id,
            'invited_by' => $inviter?->id,
            'role' => $role,
            'email' => 'awa.diop@gmail.com',
        ]);
    }

    private function avis(User $user): int
    {
        return self::nombreDEnvois($user, NotificationCode::InvitationRenewalRequested);
    }

    private function cloches(User $user): int
    {
        return AppNotification::query()->where('user_id', $user->id)->where('code', 'invitation.renewal_requested')->count();
    }

    private function principal(User $user): void
    {
        $this->agency->forceFill(['primary_admin_id' => $user->id])->save();
    }

    private function suspendre(User $admin): void
    {
        AgencyAdminProfile::query()->where('user_id', $admin->id)->where('agency_id', $this->agency->id)
            ->update(['status' => AgencyAdminProfileStatus::Suspended->value]);
    }

    /** AC1 — l'invitant a quitté l'agence : l'admin principal actif est prévenu, pas lui. */
    public function test_l_invitant_parti_ne_recoit_rien_l_admin_principal_si(): void
    {
        $invitant = $this->agencyAdmin($this->agency);
        $principal = $this->agencyAdmin($this->agency);
        $this->principal($principal);
        $agent = $this->agencyAgent($this->agency);
        $invitation = $this->invitation($invitant, $this->agency);
        AgencyAdminProfile::query()->where('user_id', $invitant->id)->delete();

        $this->demander($invitation);

        $this->assertSame(1, $this->avis($principal));
        $this->assertSame(1, $this->cloches($principal));
        $this->assertSame(0, $this->avis($invitant));
        $this->assertSame(0, $this->cloches($invitant), 'aucune notification créée pour l\'invitant parti');
        $this->assertSame(0, $this->avis($agent), 'un agent sans team.invite ne renvoie pas');
    }

    /** AC1 bis — l'invitant reste `primary_admin_id`, mais son profil est suspendu. */
    public function test_l_admin_principal_suspendu_n_est_pas_prevenu(): void
    {
        $invitant = $this->agencyAdmin($this->agency);
        $this->principal($invitant);
        $a2 = $this->agencyAdmin($this->agency);
        $agent = $this->agencyAgent($this->agency);
        $invitation = $this->invitation($invitant, $this->agency);
        $this->suspendre($invitant);

        $this->demander($invitation);

        $this->assertSame(1, $this->avis($a2));
        $this->assertSame(0, $this->avis($invitant));
        $this->assertSame(0, $this->avis($agent));
    }

    /** AC2 — l'invitant toujours personnel, qui tient `team.invite` : lui seul. */
    public function test_l_invitant_en_place_est_seul_prevenu(): void
    {
        $invitant = $this->agencyAdmin($this->agency);
        $autre = $this->agencyAdmin($this->agency);
        $this->principal($autre);
        $invitation = $this->invitation($invitant, $this->agency);

        $this->demander($invitation);

        $this->assertSame(1, $this->avis($invitant));
        $this->assertSame(0, $this->avis($autre));
    }

    /** AC2 — un agent dont le rôle porte `team.invite` est un invitant en place ; un admin qui l'a perdue ne l'est plus. */
    public function test_le_jugement_est_celui_de_la_policy(): void
    {
        $agentQuiInvite = $this->agentWith($this->agency, Capability::TeamInvite);
        $principal = $this->agencyAdmin($this->agency);
        $this->principal($principal);

        $this->demander($this->invitation($agentQuiInvite, $this->agency));
        $this->assertSame(1, $this->avis($agentQuiInvite));
        $this->assertSame(0, $this->avis($principal));

        $adminSansInvitation = $this->adminWithout($this->agency, Capability::TeamInvite);
        $this->demander($this->invitation($adminSansInvitation, $this->agency));
        $this->assertSame(0, $this->avis($adminSansInvitation));
        $this->assertSame(1, $this->avis($principal));
        $this->assertSame(2, $this->avis($agentQuiInvite), 'par repli, tout le personnel qui passe resend, dont l\'agent qui invite');
    }

    /** Invitation sans agence : l'invitant, qui la renvoie lui-même (la règle de la policy). */
    public function test_sans_agence_l_invitant_est_prevenu(): void
    {
        $invitant = User::factory()->create();

        $this->demander($this->invitation($invitant, null, 'service_provider'));

        $this->assertSame(1, $this->avis($invitant));
    }

    /** AC3 — sans agence, invitant supprimé : personne, et la borne n'est pas posée. */
    public function test_sans_agence_ni_invitant_rien_n_est_ecrit(): void
    {
        $invitant = User::factory()->create();
        $invitation = $this->invitation($invitant, null, 'service_provider');
        $invitant->delete();

        $this->demander($invitation);

        $this->assertSame(0, AppNotification::query()->where('code', 'invitation.renewal_requested')->count());
        Notification::assertNothingSent();
        $this->assertNull(data_get($invitation->fresh()->metadata, 'renewal_requested_at'));
    }

    /**
     * Reprise (verif-commercial, M1) — sans agence, l'invitant existe encore mais n'est plus
     * joignable (bloqué, ou `deleted` sans suppression douce) : `NotificationService` ne lui
     * écrirait rien, donc la borne ne se pose pas. Débloqué, la demande suivante le prévient.
     */
    public function test_sans_agence_l_invitant_injoignable_ne_consomme_pas_la_borne(): void
    {
        foreach ([UserStatus::Blocked, UserStatus::Deleted] as $statut) {
            $invitant = User::factory()->create();
            $invitation = $this->invitation($invitant, null, 'service_provider');
            $invitant->forceFill(['status' => $statut])->save();

            $this->demander($invitation);

            $this->assertSame(0, $this->cloches($invitant), $statut->value);
            $this->assertNull(data_get($invitation->fresh()->metadata, 'renewal_requested_at'), "{$statut->value} : borne consommée sans destinataire");

            $invitant->forceFill(['status' => UserStatus::Active])->save();
            $this->demander($invitation);

            $this->assertSame(1, $this->avis($invitant), "{$statut->value} puis réactivé");
            $this->assertNotNull(data_get($invitation->fresh()->metadata, 'renewal_requested_at'));
        }
    }

    /**
     * Reprise (m2) — le repli écarte un membre au profil actif dont le COMPTE est bloqué. Seul
     * candidat (l'admin principal), il ne recevrait rien : la borne reste libre. Débloqué, la
     * demande suivante le prévient. (Compter ses cloches ne suffirait pas : `NotificationService`
     * n'écrit déjà rien vers un compte bloqué. C'est la borne qui dit s'il a été retenu.)
     */
    public function test_le_repli_ecarte_un_membre_injoignable(): void
    {
        $invitant = $this->agencyAdmin($this->agency);
        $principal = $this->agencyAdmin($this->agency);
        $this->principal($principal);
        $principal->forceFill(['status' => UserStatus::Blocked])->save();
        $this->agencyAgent($this->agency);
        $invitation = $this->invitation($invitant, $this->agency);
        AgencyAdminProfile::query()->where('user_id', $invitant->id)->delete();

        $this->demander($invitation);

        $this->assertNull(data_get($invitation->fresh()->metadata, 'renewal_requested_at'), 'un compte bloqué retenu par le repli');

        $principal->forceFill(['status' => UserStatus::Active])->save();
        $this->demander($invitation);

        $this->assertSame(1, $this->avis($principal));
    }

    /**
     * Reprise (m1) — le repli passe aussi par les délégations en vigueur. Une délégation n'est en
     * vigueur que si le délégué a un profil actif dans l'agence : le seul membre que les profils
     * d'agent et d'admin ne ramènent pas, c'est un BAILLEUR de l'agence à qui le principal a délégué
     * le rôle d'admin. Il renvoie l'invitation (team.invite par délégation), il est prévenu.
     */
    public function test_le_repli_previent_un_delegue_en_vigueur(): void
    {
        $invitant = $this->agencyAdmin($this->agency);
        $principal = $this->agencyAdmin($this->agency);
        $this->principal($principal);
        $delegue = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $delegue->id, 'agency_id' => $this->agency->id]);
        RoleDelegation::factory()->create([
            'user_id' => $delegue->id,
            'delegator_id' => $principal->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
        ]);
        $invitation = $this->invitation($invitant, $this->agency);
        AgencyAdminProfile::query()->where('user_id', $invitant->id)->delete();

        $this->demander($invitation);

        $this->assertSame(1, $this->avis($principal));
        $this->assertSame(1, $this->avis($delegue), 'le délégué en vigueur du rôle d\'admin renvoie, il est prévenu');
    }

    /**
     * Reprise (m3) — la borne se lit et s'écrit sous le verrou de la ligne de l'invitation : deux
     * demandes simultanées n'écrivent qu'un avis. La sérialisation elle-même est celle de
     * PostgreSQL (`SELECT … FOR UPDATE`) ; deux connexions concurrentes ne se montent pas sous
     * `RefreshDatabase`, qui enferme le test dans une transaction. Ce test garde que le verrou
     * est PRIS, sur la ligne de l'invitation, avant la lecture de la borne.
     */
    public function test_la_borne_se_lit_sous_le_verrou_de_la_ligne(): void
    {
        $invitant = $this->agencyAdmin($this->agency);
        $invitation = $this->invitation($invitant, $this->agency);
        $verrous = [];
        DB::listen(function ($requete) use (&$verrous): void {
            if (preg_match('/^select .* from "invitations" .* for update$/i', $requete->sql) === 1) {
                $verrous[] = $requete->bindings;
            }
        });

        $this->demander($invitation);

        $this->assertSame([[$invitation->id]], $verrous);
        $this->assertSame(1, $this->avis($invitant));
    }

    /** AC3 bis — le seul admin suspendu : rien d'écrit ; réactivé, la demande suivante le prévient. */
    public function test_personne_ne_passe_la_regle_la_borne_reste_libre(): void
    {
        $seul = $this->agencyAdmin($this->agency);
        $this->principal($seul);
        $this->agencyAgent($this->agency);
        $invitation = $this->invitation($seul, $this->agency);
        $this->suspendre($seul);

        $this->demander($invitation);
        $this->assertSame(0, AppNotification::query()->where('code', 'invitation.renewal_requested')->count());
        $this->assertNull(data_get($invitation->fresh()->metadata, 'renewal_requested_at'));

        AgencyAdminProfile::query()->where('user_id', $seul->id)->update(['status' => AgencyAdminProfileStatus::Active->value]);
        $this->demander($invitation);
        $this->assertSame(1, $this->avis($seul));
        $this->assertNotNull(data_get($invitation->fresh()->metadata, 'renewal_requested_at'));
    }

    /** AC4 — deux demandes dans les 24 h, prévenus par repli : un seul avis. */
    public function test_deux_demandes_du_jour_un_seul_avis(): void
    {
        $invitant = $this->agencyAdmin($this->agency);
        $principal = $this->agencyAdmin($this->agency);
        $this->principal($principal);
        $invitation = $this->invitation($invitant, $this->agency);
        AgencyAdminProfile::query()->where('user_id', $invitant->id)->delete();

        $this->demander($invitation);
        $borne = data_get($invitation->fresh()->metadata, 'renewal_requested_at');
        $this->travel(3)->hours();
        $this->demander($invitation);

        $this->assertSame(1, $this->avis($principal));
        $this->assertSame($borne, data_get($invitation->fresh()->metadata, 'renewal_requested_at'));
    }

    /**
     * AC5 — le coût de la résolution, équipe de 2 et de 10. Cas nominal (l'invitant en place) : il
     * ne dépend pas de l'équipe. Par repli (l'invitant parti), chaque membre est jugé par la policy :
     * le coût croît avec l'équipe (mesuré : 29 et 93 requêtes) tant que le résolveur de capacités
     * n'amorce pas les rôles — décision de la session, voir le rapport de TCK-2726.
     */
    public function test_le_cout_nominal_ne_croit_pas_avec_l_equipe(): void
    {
        $mesurer = function (int $agents): int {
            $agency = Agency::factory()->create();
            $invitant = $this->agencyAdmin($agency);
            $agency->forceFill(['primary_admin_id' => $this->agencyAdmin($agency)->id])->save();
            foreach (range(1, $agents) as $_) {
                $this->agencyAgent($agency);
            }
            $invitation = $this->invitation($invitant, $agency);

            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->demander($invitation);
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();
            $this->assertSame(1, $this->avis($invitant));

            return $n;
        };

        $deux = $mesurer(0);
        $dix = $mesurer(8);

        $this->assertSame($deux, $dix, "équipe de 2 : {$deux} requêtes, de 10 : {$dix}");
    }

    /**
     * Vérification adverse de TCK-2726 (m3) — la borne se juge sur la ligne VERROUILLÉE, pas sur
     * l'instance chargée avant : une demande concurrente qui pose la borne entre le chargement et le
     * verrou doit être vue. Lire `$invitation` au lieu de `$locked` laisse le reste de la classe vert.
     */
    public function test_la_borne_se_lit_sur_la_ligne_verrouillee_pas_sur_l_instance(): void
    {
        Notification::fake();
        $agency = Agency::factory()->create();
        $invitant = $this->agencyAdmin($agency);
        $invitation = Invitation::factory()->expired()->create(['agency_id' => $agency->id, 'invited_by' => $invitant->id, 'role' => 'agent', 'email' => 'awa.diop@gmail.com']);

        $perimee = Invitation::query()->findOrFail($invitation->id); // chargée avant la demande concurrente
        $this->assertTrue(app(InvitationRenewalRequests::class)->request($invitation)); // la concurrente passe et pose la borne

        $this->assertFalse(app(InvitationRenewalRequests::class)->request($perimee));
        $this->assertSame(1, self::nombreDEnvois($invitant, NotificationCode::InvitationRenewalRequested));
    }
}

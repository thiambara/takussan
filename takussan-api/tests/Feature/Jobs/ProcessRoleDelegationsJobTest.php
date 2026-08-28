<?php

namespace Tests\Feature\Jobs;

use App\Events\Permissions\RoleDelegationActivated;
use App\Events\Permissions\RoleDelegationExpired;
use App\Jobs\Permissions\ProcessRoleDelegationsJob;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Permissions\RoleDelegationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\ApiTestCase;

/**
 * TCK-285 — `ProcessRoleDelegationsJob`, exécuté TOUTES LES 5 MINUTES en
 * production (`routes/console.php:62`), était à 0 %, et avec lui
 * `RoleDelegationService::activate` (0/12) et `::expire` (0/12).
 *
 * Ce job est ce qui ACCORDE et RETIRE des privilèges sans qu'aucun humain
 * n'intervienne. Un `activate` qui ne s'exécute pas laisse un remplaçant
 * sans droits pendant l'absence du patron ; un `expire` qui ne s'exécute pas
 * laisse ces droits ouverts APRÈS son retour, indéfiniment.
 *
 * ⚠ **Ce bloc affirmait le contraire jusqu'au 2026-08-27**, et il faut le lire
 * comme périmé partout où il subsisterait : *« `MembershipCapabilityResolver`
 * ne consulte à aucun moment la table `role_delegations` »*. **TCK-395 l'a
 * câblé.** Le résolveur consulte désormais les délégations actives, et les
 * borne par les capacités que le DÉLÉGANT détient en propre.
 *
 * Deux conséquences pour ce fichier :
 *
 *  1. `canActAt()` — et donc `can('invite', …)` — est devenu une probe VALIDE :
 *     il distingue bien l'avant et l'après du job. C'est ce que la ligne 78
 *     exerce.
 *  2. Le délégant ne peut plus être un `User::factory()` nu. Il l'était, et le
 *     privilège s'ouvrait quand même — c'est exactement le défaut n°2 de
 *     TCK-395 : la délégation accordait l'`agency_admin` plein sans que
 *     personne ne le détienne. {@see self::delegation()} en fait désormais un
 *     administrateur réel de l'agence.
 */
class ProcessRoleDelegationsJobTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $beneficiary;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->beneficiary = User::factory()->create();
        OwnerProfile::factory()->create([
            'user_id' => $this->beneficiary->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    // ─── Activation ──────────────────────────────────────────────

    public function test_a_scheduled_delegation_whose_start_has_passed_becomes_active_and_grants_the_privilege(): void
    {
        $delegation = $this->delegation(RoleDelegationStatus::Scheduled, [
            'starts_at' => now()->subMinute(),
            'ends_at' => now()->addDays(7),
        ]);

        // Avant : le bénéficiaire n'a rien.
        $this->assertFalse($this->beneficiary->hasActiveAgencyDelegation($this->agency->id, 'agency_admin'));
        $this->assertFalse($this->beneficiary->can('invite', [OwnerProfile::class, $this->agency]));

        $this->runJob();

        $this->assertSame(RoleDelegationStatus::Active, $delegation->refresh()->status);
        $this->assertNotNull($delegation->activated_at);

        // Après : le privilège est RÉELLEMENT ouvert, pas seulement la colonne.
        $this->beneficiary->refresh();
        $this->assertTrue($this->beneficiary->hasActiveAgencyDelegation($this->agency->id, 'agency_admin'));
        $this->assertTrue($this->beneficiary->can('invite', [OwnerProfile::class, $this->agency]));
    }

    public function test_a_scheduled_delegation_whose_start_is_in_the_future_is_left_alone(): void
    {
        $delegation = $this->delegation(RoleDelegationStatus::Scheduled, [
            'starts_at' => now()->addDay(),
            'ends_at' => now()->addDays(7),
        ]);

        $this->runJob();

        $this->assertSame(RoleDelegationStatus::Scheduled, $delegation->refresh()->status);
        $this->assertFalse($this->beneficiary->hasActiveAgencyDelegation($this->agency->id, 'agency_admin'));
    }

    public function test_the_privilege_is_scoped_to_the_delegating_agency(): void
    {
        $other = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->delegation(RoleDelegationStatus::Scheduled, [
            'starts_at' => now()->subMinute(),
            'ends_at' => now()->addDays(7),
        ]);

        $this->runJob();

        $this->beneficiary->refresh();
        $this->assertTrue($this->beneficiary->hasActiveAgencyDelegation($this->agency->id, 'agency_admin'));
        $this->assertFalse($this->beneficiary->hasActiveAgencyDelegation($other->id, 'agency_admin'));
    }

    // ─── Expiration ──────────────────────────────────────────────

    public function test_an_active_delegation_past_its_end_expires_and_withdraws_the_privilege(): void
    {
        $delegation = $this->delegation(RoleDelegationStatus::Active, [
            'starts_at' => now()->subDays(7),
            'ends_at' => now()->subMinute(),
            'activated_at' => now()->subDays(7),
        ]);

        $this->runJob();

        $this->assertSame(RoleDelegationStatus::Expired, $delegation->refresh()->status);
        $this->assertNotNull($delegation->expired_at);

        // Le privilège est RETIRÉ. C'est la moitié qui coûte le plus cher : un
        // droit qu'on n'a pas retiré ne se voit nulle part.
        $this->beneficiary->refresh();
        $this->assertFalse($this->beneficiary->hasActiveAgencyDelegation($this->agency->id, 'agency_admin'));
        $this->assertFalse($this->beneficiary->can('invite', [OwnerProfile::class, $this->agency]));
    }

    public function test_an_active_delegation_still_within_its_window_is_left_alone(): void
    {
        $delegation = $this->delegation(RoleDelegationStatus::Active, [
            'starts_at' => now()->subDay(),
            'ends_at' => now()->addDay(),
            'activated_at' => now()->subDay(),
        ]);

        $this->runJob();

        $this->assertSame(RoleDelegationStatus::Active, $delegation->refresh()->status);
        $this->assertTrue($this->beneficiary->hasActiveAgencyDelegation($this->agency->id, 'agency_admin'));
    }

    public function test_a_revoked_delegation_is_never_reactivated_by_the_job(): void
    {
        // Une révocation manuelle ne doit pas être défaite par le planificateur
        // cinq minutes plus tard.
        $delegation = $this->delegation(RoleDelegationStatus::Revoked, [
            'starts_at' => now()->subMinute(),
            'ends_at' => now()->addDays(7),
        ]);

        $this->runJob();

        $this->assertSame(RoleDelegationStatus::Revoked, $delegation->refresh()->status);
        $this->assertFalse($this->beneficiary->hasActiveAgencyDelegation($this->agency->id, 'agency_admin'));
    }

    // ─── Idempotence ─────────────────────────────────────────────

    public function test_replaying_the_job_changes_nothing_and_emits_no_second_event(): void
    {
        // Le job tourne toutes les 5 minutes : il rejoue en permanence. Un
        // second `activated_at` ou un second événement fausserait la piste
        // d'audit et renotifierait le bénéficiaire à chaque passage.
        $delegation = $this->delegation(RoleDelegationStatus::Scheduled, [
            'starts_at' => now()->subMinute(),
            'ends_at' => now()->addDays(7),
        ]);

        $this->runJob();
        $activatedAt = $delegation->refresh()->activated_at;

        Event::fake([RoleDelegationActivated::class, RoleDelegationExpired::class]);
        $this->travel(1)->minutes();
        $this->runJob();

        Event::assertNotDispatched(RoleDelegationActivated::class);
        Event::assertNotDispatched(RoleDelegationExpired::class);
        $this->assertSame(RoleDelegationStatus::Active, $delegation->refresh()->status);
        $this->assertEquals($activatedAt, $delegation->activated_at);
    }

    public function test_one_pass_activates_and_expires_the_right_delegations_side_by_side(): void
    {
        $toActivate = $this->delegation(RoleDelegationStatus::Scheduled, [
            'starts_at' => now()->subMinute(),
            'ends_at' => now()->addDays(7),
        ]);
        $toExpire = $this->delegation(RoleDelegationStatus::Active, [
            'starts_at' => now()->subDays(7),
            'ends_at' => now()->subMinute(),
            'activated_at' => now()->subDays(7),
        ], 'agent');

        $this->runJob();

        $this->assertSame(RoleDelegationStatus::Active, $toActivate->refresh()->status);
        $this->assertSame(RoleDelegationStatus::Expired, $toExpire->refresh()->status);
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private function runJob(): void
    {
        (new ProcessRoleDelegationsJob)->handle(
            app(RoleDelegationService::class),
        );
    }

    /**
     * TCK-395 — le délégant est un `agency_admin` RÉEL de l'agence, et non plus
     * un `User::factory()` nu sans le moindre profil. Une délégation ne confère
     * désormais que ce que son délégant détient : émise par un compte vide,
     * elle n'accorderait rien, et le job aurait l'air de ne rien faire.
     *
     * Ce n'est pas un contournement du durcissement, c'est sa contrepartie
     * fidèle — `RoleDelegationService::create()` exige déjà un délégant
     * autorisé, si bien qu'aucune délégation émise par l'API ne ressemblait à
     * celle que ce helper fabriquait.
     *
     * @param  array<string,mixed>  $attributes
     */
    private function delegation(RoleDelegationStatus $status, array $attributes, string $role = 'agency_admin'): RoleDelegation
    {
        $delegant = User::factory()->create();
        $this->materializeRoleProfile($delegant, 'agency_admin', $this->agency);

        return RoleDelegation::create(array_merge([
            'user_id' => $this->beneficiary->id,
            'delegator_id' => $delegant->id,
            'agency_id' => $this->agency->id,
            'role' => $role,
            'status' => $status,
            'user_native_roles_snapshot' => ['owner'],
        ], $attributes));
    }
}

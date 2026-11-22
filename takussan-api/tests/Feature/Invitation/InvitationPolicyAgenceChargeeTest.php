<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\Capability;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2739 — `InvitationPolicy::revoke()`/`resend()` réutilisent l'agence chargée sur l'invitation au lieu
 * de la relire pour chaque membre jugé. Le verdict doit être celui d'une invitation SANS relation : une
 * relation chargée en champs restreints (`fields[agencies]=id`, `include=agency`) ou portant une agence
 * supprimée ne juge pas autrement que `Agency::find()`.
 */
class InvitationPolicyAgenceChargeeTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    /** @return array{0: bool, 1: bool, 2: bool} sans relation, relation complète, relation en champs restreints */
    private function verdicts(User $user, Agency $agency, bool $supprimee = false): array
    {
        $invitation = Invitation::factory()->create(['agency_id' => $agency->id, 'role' => 'agent']);
        if ($supprimee) {
            $agency->delete();
        }
        $juger = fn (?Agency $relation): bool => Gate::forUser($user)->allows('resend', tap(
            Invitation::query()->findOrFail($invitation->id),
            fn (Invitation $i) => $relation === null ? null : $i->setRelation('agency', $relation),
        ));

        return [
            $juger(null),
            $juger(Agency::withTrashed()->findOrFail($agency->id)),
            $juger(Agency::withTrashed()->select('id')->findOrFail($agency->id)),
        ];
    }

    public function test_l_admin_principal_garde_son_raccourci_meme_en_champs_restreints(): void
    {
        $agency = Agency::factory()->create();
        $principal = $this->agentWithout($agency, ...Capability::cases());
        $agency->forceFill(['primary_admin_id' => $principal->id])->save();

        $this->assertSame([true, true, true], $this->verdicts($principal, $agency));
    }

    public function test_une_agence_suspendue_reste_verrouillee_meme_en_champs_restreints(): void
    {
        $agency = Agency::factory()->create(['primary_admin_id' => null]);
        $admin = $this->agencyAdmin($agency);
        $agency->forceFill(['status' => AgencyStatus::Suspended->value])->save();

        $this->assertSame([false, false, false], $this->verdicts($admin, $agency));
    }

    public function test_une_agence_supprimee_ne_se_juge_pas_sur_la_relation(): void
    {
        $agency = Agency::factory()->create(['primary_admin_id' => null]);
        $admin = $this->agencyAdmin($agency);

        $this->assertSame([false, false, false], $this->verdicts($admin, $agency, supprimee: true));
    }

    /** Le versant qui empêche un « toujours faux » de passer : la même règle accorde dans une agence normale. */
    public function test_l_admin_d_une_agence_active_renvoie(): void
    {
        $agency = Agency::factory()->create(['primary_admin_id' => null]);
        $admin = $this->agencyAdmin($agency);

        $this->assertSame([true, true, true], $this->verdicts($admin, $agency));
    }
}

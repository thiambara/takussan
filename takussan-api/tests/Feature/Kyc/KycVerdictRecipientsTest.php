<?php

namespace Tests\Feature\Kyc;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Kyc\KycWorkflowService;
use App\Services\Membership\AgencyRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-1763 (P161.05) — le verdict KYC mène à `/app/agency/kyc`, qui exige `agency.update_kyc`
 * (TCK-1274). Il part aux admins actifs qui tiennent la capacité, et à l'admin principal en
 * repli seulement quand aucun ne la tient. Avant, il partait au seul admin principal, quelle que
 * soit sa capacité.
 */
class KycVerdictRecipientsTest extends TestCase
{
    use RefreshDatabase;

    private function admin(Agency $agency, ?array $capabilities = null): User
    {
        $user = User::factory()->create();
        $roleId = null;
        if ($capabilities !== null) {
            $roles = app(AgencyRoleService::class);
            $role = $roles->create($agency, ['name' => 'Rôle '.uniqid(), 'base_profile_type' => AgencyRoleBaseType::AgencyAdmin->value]);
            $roleId = $roles->replaceCapabilities($role, $capabilities)->id;
        }
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id, 'agency_role_id' => $roleId]);

        return $user;
    }

    private function verifier(Agency $agency): void
    {
        Notification::fake();
        $dossier = KycDossier::query()->create([
            'subject_type' => Agency::class,
            'subject_id' => $agency->id,
            'status' => KycDossierStatus::Submitted,
            'submitted_at' => now(),
        ]);
        foreach (['rccm', 'ninea', 'director_id'] as $type) {
            $dossier->addMedia(UploadedFile::fake()->create("{$type}.pdf", 10, 'application/pdf'))
                ->usingFileName("{$type}.pdf")
                ->withCustomProperties(['document_type' => $type])
                ->toMediaCollection('documents');
        }
        AppNotification::query()->delete();

        app(KycWorkflowService::class)->verify($dossier->refresh(), User::factory()->create());
    }

    private function recus(User $user): int
    {
        return AppNotification::query()->where('user_id', $user->id)->where('code', NotificationCode::KycVerified->value)->count();
    }

    public function test_le_verdict_part_aux_admins_qui_tiennent_la_capacite(): void
    {
        $agency = Agency::factory()->create();
        $principal = $this->admin($agency, [Capability::TeamInvite]);
        $agency->update(['primary_admin_id' => $principal->id]);
        $collegue = $this->admin($agency, [Capability::AgencyUpdateKyc]);

        $this->verifier($agency);

        $this->assertSame(0, $this->recus($principal));
        $this->assertSame(1, $this->recus($collegue));
    }

    public function test_l_admin_principal_le_recoit_en_repli(): void
    {
        $agency = Agency::factory()->create();
        $principal = $this->admin($agency, [Capability::TeamInvite]);
        $agency->update(['primary_admin_id' => $principal->id]);

        $this->verifier($agency);

        $this->assertSame(1, $this->recus($principal));
    }
}

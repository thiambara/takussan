<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * P234.05 (TCK-2280) — un prestataire déjà inscrit, invité par une seconde agence, garde ses
 * métiers (TCK-262 préserve le profil maître) : ceux que l'agence saisit étaient jetés sans le lui
 * dire. Décision du porteur : la réponse (et le toast) nomment les métiers retenus, ceux du profil.
 */
class MetiersRetenusALInvitationTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_reponse_nomme_les_metiers_du_profil_reutilise(): void
    {
        Mail::fake();
        $compte = User::factory()->create(['email' => 'plombier@example.sn']);
        $profil = ServiceProviderProfile::factory()->create([
            'user_id' => $compte->id,
            'status' => ServiceProviderProfileStatus::Active->value,
            'specialties' => ['plumbing'],
            'service_areas' => ['Dakar'],
        ]);

        $this->inviter(['email' => 'plombier@example.sn', 'trades' => ['electricity'], 'intervention_zones' => ['Thiès']])
            ->assertCreated()
            ->assertJsonPath('meta.existing_sp_other_agency', true)
            ->assertJsonPath('meta.retained_trades', ['plumbing']);

        $this->assertSame(['plumbing'], $profil->fresh()->specialties);
    }

    public function test_un_brouillon_neuf_retient_les_metiers_saisis(): void
    {
        Mail::fake();

        $this->inviter(['email' => 'neuf@example.sn', 'trades' => ['electricity']])
            ->assertCreated()
            ->assertJsonPath('meta.existing_sp_other_agency', false)
            ->assertJsonPath('meta.retained_trades', ['electricity']);
    }

    /** @param array<string, mixed> $champs */
    private function inviter(array $champs): TestResponse
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        return $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            ...$champs,
        ]);
    }
}

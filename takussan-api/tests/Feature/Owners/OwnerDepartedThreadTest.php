<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2753 (q1 de la contre-vérification ; décision de team-lead du 2026-11-13, en attente du
 * porteur) — le bailleur parti lit encore le fil de son bail, il n'y écrit plus. Avant la garde,
 * `POST /api/conversations/{id}/messages` lui rendait 201 après le départ. Le locataire, lui, y
 * écrit toujours ; le bailleur suspendu est traité comme le parti (ADR-0108 § 5).
 *
 * Fixture : une agence A, son administrateur Ad, le bailleur L (profil P dans A), un locataire T, un
 * bien SUPPRIMÉ portant un bail `terminated`, et le fil de ce bail entre L et T.
 */
class OwnerDepartedThreadTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $landlord;

    private User $tenant;

    private OwnerProfile $profile;

    private Conversation $fil;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-20 10:00:00');
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard, 'commission_rate' => 8, 'is_verified' => true]);
        $this->admin = $this->agencyAdmin($this->agency);
        $this->landlord = User::factory()->withOwnerProfile($this->agency)->create(['phone_verified_at' => now()]);
        $this->profile = OwnerProfile::query()->where('user_id', $this->landlord->id)->firstOrFail();
        $this->tenant = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $this->tenant->id, 'agency_id' => $this->agency->id]);
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id, 'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id,
            'tenant_id' => $customer->id, 'status' => LeaseStatus::Terminated, 'commission_rate' => 10,
        ]);
        $property->delete();
        $this->fil = Conversation::factory()->create(['created_by' => $this->landlord->id, 'lease_id' => $lease->id]);
        $this->fil->participants()->attach($this->landlord->id, ['joined_at' => now()]);
        $this->fil->participants()->attach($this->tenant->id, ['joined_at' => now()]);
    }

    private function asUser(User $u): void
    {
        $this->app['auth']->forgetGuards();
        $this->actingAs($u->fresh(), 'sanctum');
    }

    private function ecrire(string $texte): TestResponse
    {
        return $this->postJson("/api/conversations/{$this->fil->id}/messages", ['content' => $texte]);
    }

    private function assertLitSansEcrire(): void
    {
        $this->asUser($this->landlord);
        $this->getJson("/api/conversations/{$this->fil->id}/messages")->assertOk()
            ->assertJsonFragment(['content' => 'avant']);
        $this->getJson("/api/conversations/{$this->fil->id}")->assertOk()
            ->assertJsonPath('data.abilities.can_send_message', false);
        $this->ecrire('après')->assertForbidden();
        $this->assertSame(0, $this->fil->messages()->where('content', 'après')->count());

        $this->asUser($this->tenant);
        $this->ecrire('le locataire écrit')->assertCreated();
        $this->getJson("/api/conversations/{$this->fil->id}")->assertOk()
            ->assertJsonPath('data.abilities.can_send_message', true);
    }

    public function test_temoin_le_bailleur_actif_ecrit_dans_le_fil_de_son_bail(): void
    {
        $this->asUser($this->landlord);
        $this->ecrire('avant')->assertCreated();
        $this->getJson("/api/conversations/{$this->fil->id}")->assertOk()
            ->assertJsonPath('data.abilities.can_send_message', true);
    }

    public function test_le_bailleur_parti_lit_le_fil_de_son_bail_sans_y_ecrire(): void
    {
        $this->asUser($this->landlord);
        $this->ecrire('avant')->assertCreated();

        $this->asUser($this->admin);
        $this->deleteJson("/api/owners/{$this->profile->id}")->assertOk();
        $this->assertSame(OwnerProfileStatus::Inactive, $this->profile->fresh()->status);

        $this->assertLitSansEcrire();
    }

    public function test_le_bailleur_suspendu_aussi(): void
    {
        $this->asUser($this->landlord);
        $this->ecrire('avant')->assertCreated();
        $this->profile->forceFill(['status' => OwnerProfileStatus::Blocked])->save();

        $this->assertLitSansEcrire();
    }

    /** Le locataire qui fut lui-même bailleur de l'agence, et en est parti, écrit toujours au fil de SON bail. */
    public function test_le_locataire_parti_comme_bailleur_ecrit_toujours_au_fil_de_son_bail(): void
    {
        OwnerProfile::query()->create([
            'user_id' => $this->tenant->id, 'agency_id' => $this->agency->id, 'status' => OwnerProfileStatus::Inactive,
        ]);
        $this->asUser($this->tenant);

        $this->ecrire('le locataire écrit')->assertCreated();
        $this->getJson("/api/conversations/{$this->fil->id}")->assertOk()
            ->assertJsonPath('data.abilities.can_send_message', true);
    }
}

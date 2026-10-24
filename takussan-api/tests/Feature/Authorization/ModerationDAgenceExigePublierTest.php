<?php

namespace Tests\Feature\Authorization;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2022 (P116.05, décision du porteur) — approuver un bien en attente le publie : la file, l'
 * approbation et le rejet ne jugeaient que « admin de l'agence du bien », si bien que l'admin dont
 * le rôle retire `properties.publish` publiait quand même. La modération d'agence exige désormais
 * l'admin ET `properties.publish` ; aucun agent ne la gagne.
 */
class ModerationDAgenceExigePublierTest extends TestCase
{
    use CreatesAgencyMembers, RefreshDatabase;

    private Agency $agency;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create(['moderation_required' => true]);
        $this->property = Property::factory()->create([
            'agency_id' => $this->agency->id,
            'user_id' => User::factory()->create()->id,
        ]);
        $this->property->forceFill(['status' => PropertyStatus::PendingReview, 'submitted_at' => now()])->save();
    }

    private function assertNeModerePas(User $user): void
    {
        Sanctum::actingAs($user);
        $this->postJson("/api/properties/{$this->property->id}/approve")->assertForbidden();
        $this->postJson("/api/properties/{$this->property->id}/reject", [
            'rejection_reason' => 'Photos insuffisantes pour publication sur la plateforme.',
        ])->assertForbidden();
        $this->assertSame(PropertyStatus::PendingReview, $this->property->fresh()->status);
        $this->getJson('/api/properties/moderation')->assertForbidden();
    }

    public function test_l_admin_sans_properties_publish_ne_modere_pas(): void
    {
        $this->assertNeModerePas($this->adminWithout($this->agency, Capability::PropertiesPublish));
    }

    public function test_l_agent_qui_tient_properties_publish_ne_modere_pas(): void
    {
        $agent = $this->agentWith($this->agency, Capability::PropertiesPublish);
        $this->assertTrue($agent->canActAt(Capability::PropertiesPublish, $this->agency));

        $this->assertNeModerePas($agent);
    }

    /** Témoin : l'admin qui tient `properties.publish` lit la file et approuve. */
    public function test_l_admin_qui_tient_properties_publish_modere(): void
    {
        Sanctum::actingAs($this->agencyAdmin($this->agency));

        $this->getJson('/api/properties/moderation')->assertOk()->assertJsonPath('data.0.id', $this->property->id);
        $this->postJson("/api/properties/{$this->property->id}/approve")->assertOk();
        $this->assertNotSame(PropertyStatus::PendingReview, $this->property->fresh()->status);
    }

    /** Témoin : l'admin qui tient `properties.publish` rejette. */
    public function test_l_admin_qui_tient_properties_publish_rejette(): void
    {
        Sanctum::actingAs($this->agencyAdmin($this->agency));

        $this->postJson("/api/properties/{$this->property->id}/reject", [
            'rejection_reason' => 'Photos insuffisantes pour publication sur la plateforme.',
        ])->assertOk();
        $this->assertSame(PropertyStatus::Rejected, $this->property->fresh()->status);
    }
}

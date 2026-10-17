<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Support\PubliePret;

/**
 * TCK-782 (P15.10) — un bien qui passe en `pending_review` prévient les admins actifs de son
 * agence, comme un avis à modérer (`review.to_moderate`). Avant, seuls `property.approved` et
 * `property.rejected` existaient : l'admin ne découvrait une soumission qu'en ouvrant la file.
 */
class PropertySubmittedForReviewNotificationTest extends ApiTestCase
{
    use PubliePret, RefreshDatabase;

    private const CODE = 'property.submitted_for_review';

    private Agency $agency;

    private User $agent;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create(['moderation_required' => true]);
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);
        $this->admin = User::factory()->create();
        $this->materializeRoleProfile($this->admin, 'agency_admin', $this->agency);
        $this->rendrePubliable($this->agent, $this->admin);
    }

    public function test_publier_dans_une_agence_moderee_previent_ses_admins_actifs(): void
    {
        $suspendu = User::factory()->create();
        $this->materializeRoleProfile($suspendu, 'agency_admin', $this->agency);
        AgencyAdminProfile::query()->where('user_id', $suspendu->id)->update(['status' => AgencyAdminProfileStatus::Suspended->value]);
        $ailleurs = User::factory()->create();
        $this->materializeRoleProfile($ailleurs, 'agency_admin', Agency::factory()->create());

        $property = $this->brouillon();
        $this->actingAsApi($this->agent);
        $this->postJson("/api/properties/{$property->id}/publish")->assertOk();
        $this->assertSame(PropertyStatus::PendingReview, $property->refresh()->status);

        $lignes = AppNotification::query()->where('code', self::CODE)->get();
        $this->assertSame([$this->admin->id], $lignes->pluck('user_id')->all());
        $this->assertSame(['property' => $property->title], $lignes->first()->params);
        $this->assertSame('property_moderation', $lignes->first()->target['kind'] ?? null);
    }

    public function test_la_resoumission_d_un_bien_refuse_previent_les_admins(): void
    {
        $property = $this->brouillon(PropertyStatus::Rejected, ['rejected_at' => now(), 'rejection_reason' => 'Photos floues']);

        $this->actingAsApi($this->agent);
        $this->postJson("/api/properties/{$property->id}/resubmit")->assertOk();

        $this->assertSame(1, AppNotification::query()->where('code', self::CODE)->where('user_id', $this->admin->id)->count());
    }

    public function test_un_bien_deja_en_attente_ne_previent_pas_deux_fois_ni_l_auteur_du_geste(): void
    {
        // Né en attente : c'est une entrée dans la file, prévenue une fois.
        $property = $this->brouillon(PropertyStatus::PendingReview, ['submitted_at' => now()]);
        $this->assertSame(1, AppNotification::query()->where('code', self::CODE)->count());

        $this->actingAs($this->agent);
        $property->update(['title' => 'Titre retouché pendant l\'attente']);
        $this->assertSame(1, AppNotification::query()->where('code', self::CODE)->count());

        // L'admin qui soumet lui-même n'est pas prévenu de son propre geste.
        $autre = $this->brouillon();
        $avant = AppNotification::query()->where('code', self::CODE)->where('user_id', $this->admin->id)->count();
        $this->actingAs($this->admin);
        $autre->update(['status' => PropertyStatus::Available, 'visibility' => PropertyVisibility::Public, 'published_at' => now()]);
        $this->assertSame(PropertyStatus::PendingReview, $autre->refresh()->status);
        $this->assertSame($avant, AppNotification::query()->where('code', self::CODE)->where('user_id', $this->admin->id)->count());
    }

    private function brouillon(PropertyStatus $status = PropertyStatus::Draft, array $attributes = []): Property
    {
        return Property::factory()->create(array_merge([
            'agency_id' => $this->agency->id,
            'user_id' => $this->agent->id,
            'status' => $status,
            'visibility' => PropertyVisibility::Private,
            'published_at' => null,
            'is_test' => false,
        ], $attributes));
    }
}

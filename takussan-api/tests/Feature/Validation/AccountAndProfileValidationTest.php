<?php

namespace Tests\Feature\Validation;

use App\Models\Conversation;
use App\Models\Integration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\SavedSearch;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-305 — les règles de validation du compte, des profils et des préférences, **avant** leur
 * déplacement en FormRequest.
 *
 * Même motif que {@see AdminConsoleValidationTest} : ces sites n'avaient aucun test 422 sur leur
 * URI. Ils sont joués verts sur le code d'avant le déplacement, puis rejoués après.
 */
class AccountAndProfileValidationTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_forgot_password_requires_a_well_formed_email(): void
    {
        $this->postJson('/api/auth/forgot-password', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        $this->postJson('/api/auth/forgot-password', ['email' => 'pas-une-adresse'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_changing_a_user_role_requires_a_role_from_the_allowed_list(): void
    {
        $this->apiActingAsRole('super_admin');
        $target = User::factory()->create();

        $this->apiPut("/api/users/{$target->id}/role", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['role']);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'grand-manitou'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['role']);
    }

    public function test_bulk_notification_preferences_require_a_complete_matrix(): void
    {
        $this->apiActingAsRole('agent');

        $this->apiPatch('/api/me/notification-preferences', ['preferences' => 'pas-un-tableau'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['preferences']);

        $this->apiPatch('/api/me/notification-preferences', ['preferences' => [[]]])
            ->assertStatus(422)
            ->assertJsonValidationErrors([
                'preferences.0.event_type',
                'preferences.0.channel',
                'preferences.0.enabled',
            ]);
    }

    public function test_flat_notification_preferences_reject_non_booleans(): void
    {
        $this->apiActingAsRole('agent');

        $this->apiPatch('/api/me/notification-preferences', [
            'notifications_email_enabled' => 'peut-être',
            'notifications_push_enabled' => 'peut-être',
            'notifications_sms_enabled' => 'peut-être',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors([
                'notifications_email_enabled',
                'notifications_push_enabled',
                'notifications_sms_enabled',
            ]);
    }

    public function test_service_provider_trades_bound_their_lengths_and_rates(): void
    {
        $user = $this->apiActingAsRole('agent');
        $profile = ServiceProviderProfile::factory()->create(['user_id' => $user->id]);

        $this->apiPatch("/api/me/profiles/{$profile->id}/trades", [
            'trades' => [str_repeat('a', 61)],
            'intervention_zones' => [str_repeat('b', 121)],
            'hourly_rate' => -1,
            'visit_fee' => 'gratuit',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors([
                'trades.0',
                'intervention_zones.0',
                'hourly_rate',
                'visit_fee',
            ]);
    }

    public function test_service_provider_availability_requires_well_formed_slots(): void
    {
        $user = $this->apiActingAsRole('agent');
        $profile = ServiceProviderProfile::factory()->create(['user_id' => $user->id]);

        $this->apiPatch("/api/me/profiles/{$profile->id}/availability", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['available_slots']);

        $this->apiPatch("/api/me/profiles/{$profile->id}/availability", [
            'available_slots' => [['day' => 'lundi', 'from' => '9h', 'to' => '18h']],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors([
                'available_slots.0.day',
                'available_slots.0.from',
                'available_slots.0.to',
            ]);
    }

    public function test_muting_a_conversation_requires_a_boolean(): void
    {
        $user = $this->apiActingAsRole('agent');
        $conversation = Conversation::factory()->create();
        $conversation->participants()->attach($user->id, ['role' => 'member']);

        $this->apiPut("/api/conversations/{$conversation->id}/mute", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['is_muted']);

        $this->apiPut("/api/conversations/{$conversation->id}/mute", ['is_muted' => 'peut-être'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['is_muted']);
    }

    public function test_creating_a_saved_search_requires_a_name_and_criteria(): void
    {
        $this->apiActingAsRole('agent');

        $this->apiPost('/api/saved-searches', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'criteria']);

        $this->apiPost('/api/saved-searches', [
            'name' => 'Dakar',
            'criteria' => ['city' => 'Dakar'],
            'notification_frequency' => 'toutes-les-heures',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['notification_frequency']);
    }

    public function test_updating_a_saved_search_rejects_ill_typed_fields(): void
    {
        $user = $this->apiActingAsRole('agent');
        $search = SavedSearch::factory()->create(['user_id' => $user->id]);

        $this->apiPut("/api/saved-searches/{$search->id}", [
            'name' => ['pas-une-chaîne'],
            'criteria' => 'pas-un-tableau',
            'notification_frequency' => 'toutes-les-heures',
            'is_active' => 'peut-être',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'criteria', 'notification_frequency', 'is_active']);
    }

    public function test_creating_an_integration_requires_a_provider_and_credentials(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiPost('/api/integrations', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['provider', 'credentials']);

        $this->apiPost('/api/integrations', [
            'provider' => str_repeat('a', 256),
            'credentials' => 'pas-un-tableau',
            'agency_id' => 999999,
            'is_active' => 'peut-être',
            'metadata' => 'pas-un-tableau',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['provider', 'credentials', 'agency_id', 'is_active', 'metadata']);
    }

    public function test_updating_an_integration_rejects_scalars_where_arrays_are_expected(): void
    {
        $this->apiActingAsRole('super_admin');
        $integration = Integration::factory()->create();

        $this->apiPut("/api/integrations/{$integration->id}", [
            'credentials' => 'pas-un-tableau',
            'is_active' => 'peut-être',
            'metadata' => 'pas-un-tableau',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['credentials', 'is_active', 'metadata']);
    }
}

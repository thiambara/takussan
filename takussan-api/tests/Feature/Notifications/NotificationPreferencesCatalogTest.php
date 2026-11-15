<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\PreferenceCatalog;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2863 (AC4) — le catalogue des préférences : la rangée imposée « Vérification d'identité ·
 * Toujours envoyée », et, pour chaque événement, les personas qui le reçoivent.
 */
class NotificationPreferencesCatalogTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array<string, mixed>> */
    private function catalog(string $query = ''): array
    {
        Sanctum::actingAs(User::factory()->create());

        return collect($this->getJson('/api/me/notification-preferences'.$query)->assertOk()->json('data.catalog'))
            ->keyBy('event_type')->all();
    }

    public function test_ac4_identity_verification_est_imposee_avec_ses_canaux_fixes(): void
    {
        $row = $this->catalog()['identity_verification'] ?? null;

        $this->assertNotNull($row);
        $this->assertTrue($row['locked']);
        $this->assertSame('always_sent', $row['reason']);
        $this->assertSame(['inapp', 'email'], $row['channels']);
        // La matrice réglable, elle, ne change pas : la rangée imposée n'a pas d'interrupteur.
        $this->assertNotContains('identity_verification', PreferenceResolver::EVENTS);
    }

    public function test_la_rangee_imposee_dit_vrai_le_verdict_kyc_part_malgre_une_preference_coupee(): void
    {
        $user = User::factory()->create();
        $imposed = PreferenceCatalog::IMPOSED['identity_verification'];
        foreach ($imposed['channels'] as $channel) {
            NotificationPreference::query()->create(['user_id' => $user->id, 'event_type' => $imposed['event_type'], 'channel' => $channel, 'enabled' => false]);
        }

        foreach ($imposed['channels'] as $channel) {
            $this->assertTrue(app(PreferenceResolver::class)->shouldSend($user, $imposed['event_type'], $channel), $channel);
        }
        // Et c'est bien l'événement des codes KYC.
        $this->assertSame($imposed['event_type'], NotificationCode::KycVerified->preferenceEvent());
    }

    public function test_ac4_un_agent_ne_voit_pas_les_evenements_reserves_au_locataire(): void
    {
        $agent = $this->catalog('?persona=agent');

        $this->assertArrayNotHasKey('lease_payment_due', $agent);
        $this->assertArrayNotHasKey('invoice_reminder_sent', $agent);
        $this->assertArrayHasKey('visit_reminder', $agent);
        $this->assertArrayHasKey('identity_verification', $agent);

        $locataire = $this->catalog('?persona=locataire');
        $this->assertArrayHasKey('lease_payment_due', $locataire);
        $this->assertArrayNotHasKey('task_due_reminder', $locataire);
    }

    public function test_une_persona_inconnue_est_refusee(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/me/notification-preferences?persona=pirate')->assertStatus(422);
    }

    public function test_chaque_evenement_reglable_a_sa_ligne_de_personas_et_rien_d_autre(): void
    {
        $this->assertEqualsCanonicalizing(PreferenceResolver::EVENTS, array_keys(PreferenceCatalog::EVENT_PERSONAS));
        foreach ([...PreferenceCatalog::EVENT_PERSONAS, ...array_column(PreferenceCatalog::IMPOSED, 'personas')] as $event => $personas) {
            $this->assertNotEmpty($personas, (string) $event);
            $this->assertSame([], array_values(array_diff($personas, PreferenceCatalog::PERSONAS)), (string) $event);
        }
    }
}

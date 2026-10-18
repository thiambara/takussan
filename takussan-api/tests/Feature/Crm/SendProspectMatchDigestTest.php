<?php

namespace Tests\Feature\Crm;

use App\Jobs\Crm\SendProspectMatchDigest;
use App\Models\Address;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\RelationshipType;
use App\Models\Property;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use App\Services\Crm\ProspectMatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Events\NotificationSending;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Tests\ApiTestCase;

/**
 * TCK-591 AC11 (récapitulatif) — le référent est notifié une fois ; personne quand rien ne
 * correspond ; un rejeu du même jour ne renotifie pas.
 */
class SendProspectMatchDigestTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $referent;

    private User $creator;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->referent = User::factory()->create(['preferred_language' => 'en']);
        $this->materializeRoleProfile($this->referent, 'agent', $this->agency);
        $this->creator = User::factory()->create();
        $this->materializeRoleProfile($this->creator, 'agent', $this->agency);

        $prospect = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => $this->creator->id,
            'pipeline_stage' => CustomerPipelineStage::Prospect,
            'seeking_contract_type' => 'rent',
            'budget_max' => 300000,
            'seeking_cities' => ['Dakar'],
            'min_bedrooms' => 2,
        ]);
        UserCustomerRelationship::query()->create([
            'user_id' => $this->referent->id,
            'customer_id' => $prospect->id,
            'relationship_type' => RelationshipType::cases()[0],
            'status' => RelationshipStatus::Active,
            'is_primary' => true,
        ]);
    }

    /** @param array<string, mixed> $overrides */
    private function property(array $overrides = []): Property
    {
        $property = Property::factory()->create(array_merge([
            'agency_id' => $this->agency->id,
            'contract_type' => ContractType::Rent,
            'type' => PropertyType::Apartment,
            'price' => 250000,
            'bedrooms' => 3,
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Private,
        ], $overrides));
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'city' => 'Dakar',
        ]);

        return $property;
    }

    private function age(Property $property, int $days): void
    {
        DB::table('properties')->where('id', $property->id)->update([
            'created_at' => now()->subDays($days),
            'published_at' => now()->subDays($days),
        ]);
    }

    public function test_the_referent_is_notified_once_in_his_language(): void
    {
        $this->property();
        $this->property(['price' => 280000]);

        dispatch_sync(new SendProspectMatchDigest);
        dispatch_sync(new SendProspectMatchDigest);

        $notification = AppNotification::query()->sole();
        $this->assertSame($this->referent->id, $notification->user_id);
        $this->assertSame('Properties match your prospects', $notification->title);
        $this->assertStringContainsString('2 new or repriced', $notification->body);
        $this->assertSame(1, $notification->data['prospects_count']);
    }

    public function test_nobody_is_notified_when_nothing_matches(): void
    {
        $this->property(['price' => 350000]);
        $this->age($this->property(), 3);

        dispatch_sync(new SendProspectMatchDigest);

        $this->assertSame(0, AppNotification::query()->count());
    }

    public function test_a_price_change_brings_an_old_property_back(): void
    {
        $property = $this->property(['price' => 350000]);
        $this->age($property, 30);

        $property->update(['price' => 290000]);

        dispatch_sync(new SendProspectMatchDigest);

        $this->assertSame($this->referent->id, AppNotification::query()->sole()->user_id);
    }

    public function test_without_a_staff_referent_the_creator_is_notified(): void
    {
        UserCustomerRelationship::query()->update(['status' => RelationshipStatus::Ended]);
        $this->property();

        dispatch_sync(new SendProspectMatchDigest);

        $this->assertSame($this->creator->id, AppNotification::query()->sole()->user_id);
    }

    /**
     * TCK-941 (P05.08) — la clé d'idempotence du jour est posée AVANT l'envoi : un envoi qui
     * échoue en cours de route ne fait pas partir un second récapitulatif au rejeu. Le compromis
     * est voulu : ce récapitulatif-là est perdu pour la journée, plutôt que d'être reçu deux fois.
     */
    public function test_a_send_failing_mid_way_is_not_sent_again_on_retry(): void
    {
        $this->property();
        $echoue = false;
        Event::listen(NotificationSending::class, function () use (&$echoue) {
            if (! $echoue) {
                $echoue = true;
                throw new RuntimeException('transport en panne');
            }
        });

        try {
            dispatch_sync(new SendProspectMatchDigest);
            $this->fail('le premier passage devait échouer à l\'envoi');
        } catch (RuntimeException $e) {
            $this->assertSame('transport en panne', $e->getMessage());
        }
        dispatch_sync(new SendProspectMatchDigest);

        $notification = AppNotification::query()->sole();
        $this->assertSame(now()->toDateString(), $notification->data['digest_date'] ?? null);
        $this->assertSame(SendProspectMatchDigest::KIND, $notification->data['kind'] ?? null);
    }

    /** TCK-941 (P05.08) — l'échec d'un bien se journalise sans le message de l'exception (TCK-601). */
    public function test_a_failing_property_is_logged_without_the_exception_message(): void
    {
        $property = $this->property();
        $this->mock(ProspectMatcher::class, function ($mock) {
            $mock->shouldReceive('customersFor')->andThrow(new RuntimeException('awa.diop@example.sn'));
        });
        Log::spy();

        dispatch_sync(new SendProspectMatchDigest);

        Log::shouldHaveReceived('error')->once()->withArgs(function (string $event, array $context) use ($property) {
            return $event === 'prospect_match_digest.failed'
                && $context['property_id'] === $property->id
                && $context['exception'] === RuntimeException::class
                && ! str_contains(json_encode($context), 'awa.diop');
        });
        $this->assertSame(0, AppNotification::query()->count());
    }
}

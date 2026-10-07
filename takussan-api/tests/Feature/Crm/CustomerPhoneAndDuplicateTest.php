<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\User;
use App\Services\Crm\CustomerPhoneNormalizer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-591 AC1 — un numéro de client fiable : normalisé en E.164 à l'écriture, jugé par
 * `TelephoneJoignable`, dédoublonné dans l'agence (téléphone normalisé ou e-mail replié).
 */
class CustomerPhoneAndDuplicateTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = $this->agentOf($this->agency);
    }

    private function agentOf(Agency $agency): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, 'agent', $agency);

        return $user;
    }

    /** @param array<string, mixed> $body */
    private function create(User $as, array $body)
    {
        return $this->actingAsApi($as)->apiPost('/api/customers', array_merge([
            'first_name' => 'Awa',
            'last_name' => 'Diop',
        ], $body));
    }

    public function test_a_national_number_is_stored_in_e164(): void
    {
        $id = $this->create($this->agent, ['phone' => '77 123 45 67'])
            ->assertCreated()
            ->assertJsonPath('data.phone', '+221771234567')
            ->json('data.id');

        $this->assertSame('+221771234567', DB::table('customers')->where('id', $id)->value('phone'));
    }

    public function test_a_number_with_a_national_trunk_prefix_is_refused(): void
    {
        $this->create($this->agent, ['phone' => '+330612345678'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('phone');
    }

    public function test_a_duplicate_phone_in_the_same_agency_is_a_409_that_can_be_overridden(): void
    {
        $first = $this->create($this->agent, ['phone' => '77 123 45 67'])->assertCreated()->json('data.id');

        $this->create($this->agent, ['first_name' => 'Awa', 'phone' => '+221 77 123 45 67'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'customer_duplicate')
            ->assertJsonPath('existing.0.id', $first)
            ->assertJsonPath('existing.0.name', 'Awa Diop')
            ->assertJsonPath('existing.0.matched_on', 'phone');

        $this->create($this->agent, ['phone' => '+221 77 123 45 67', 'allow_duplicate' => true])->assertCreated();

        $this->create($this->agentOf(Agency::factory()->create()), ['phone' => '+221 77 123 45 67'])->assertCreated();
    }

    public function test_a_duplicate_email_is_matched_case_insensitively(): void
    {
        $first = $this->create($this->agent, ['email' => 'awa@x.sn'])->assertCreated()->json('data.id');

        $this->create($this->agent, ['email' => 'AWA@x.sn'])
            ->assertStatus(409)
            ->assertJsonPath('existing.0.id', $first)
            ->assertJsonPath('existing.0.matched_on', 'email');

        $this->create($this->agent, ['email' => 'AWA@x.sn', 'allow_duplicate' => true])->assertCreated();
        $this->create($this->agentOf(Agency::factory()->create()), ['email' => 'AWA@x.sn'])->assertCreated();
    }

    public function test_an_update_that_takes_a_colleague_number_is_a_409(): void
    {
        $this->create($this->agent, ['phone' => '771234567'])->assertCreated();
        $other = $this->create($this->agent, ['first_name' => 'Fatou', 'phone' => '781234567'])->assertCreated()->json('data.id');

        $this->actingAsApi($this->agent)->apiPut("/api/customers/{$other}", ['phone' => '77 123 45 67'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'customer_duplicate');

        // Rester sur son propre numéro n'est pas un doublon.
        $this->actingAsApi($this->agent)->apiPut("/api/customers/{$other}", ['phone' => '78 123 45 67', 'last_name' => 'Fall'])
            ->assertOk();
    }

    public function test_every_write_path_normalizes(): void
    {
        $customer = Customer::factory()->create(['phone' => '00221 76 000 00 00', 'emergency_contact_phone' => '70-111-22-33']);

        $this->assertSame('+221760000000', $customer->fresh()->phone);
        $this->assertSame('+221701112233', $customer->fresh()->emergency_contact_phone);
    }

    public function test_the_command_counts_and_never_erases(): void
    {
        $customer = Customer::factory()->create();
        $broken = Customer::factory()->create();
        $clean = Customer::factory()->create(['phone' => '+221770000001']);
        DB::table('customers')->where('id', $customer->id)->update(['phone' => '77 555 44 33']);
        DB::table('customers')->where('id', $broken->id)->update(['phone' => 'appeler le gardien']);

        $this->artisan('crm:normalize-customer-phones', ['--dry-run' => true])
            ->expectsOutputToContain('[dry-run] normalized=1 unchanged=1 unnormalizable=1')
            ->expectsOutputToContain("unnormalizable: {$broken->id}:phone")
            ->assertSuccessful();
        $this->assertSame('77 555 44 33', DB::table('customers')->where('id', $customer->id)->value('phone'));

        $this->artisan('crm:normalize-customer-phones')->assertSuccessful();
        $this->assertSame('+221775554433', DB::table('customers')->where('id', $customer->id)->value('phone'));
        $this->assertSame('appeler le gardien', DB::table('customers')->where('id', $broken->id)->value('phone'));
        $this->assertSame('+221770000001', DB::table('customers')->where('id', $clean->id)->value('phone'));

        $this->artisan('crm:normalize-customer-phones')
            ->expectsOutputToContain('normalized=0 unchanged=2 unnormalizable=1')
            ->assertSuccessful();
    }

    public function test_normalizer_cases(): void
    {
        $this->assertSame('+221771234567', CustomerPhoneNormalizer::normalize('77.123.45.67'));
        $this->assertSame('+221338211234', CustomerPhoneNormalizer::normalize('33 821 12 34'));
        $this->assertSame('+221771234567', CustomerPhoneNormalizer::normalize('221771234567'));
        $this->assertSame('+33612345678', CustomerPhoneNormalizer::normalize('0033 6 12 34 56 78'));
        $this->assertSame('n/a', CustomerPhoneNormalizer::normalize(' n/a '));
        $this->assertNull(CustomerPhoneNormalizer::normalize('   '));
    }
}

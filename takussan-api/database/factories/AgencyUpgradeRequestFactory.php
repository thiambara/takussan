<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<AgencyUpgradeRequest>
 */
class AgencyUpgradeRequestFactory extends Factory
{
    protected $model = AgencyUpgradeRequest::class;

    public function definition(): array
    {
        return [
            // Default to an `individual` agency since that's the only kind
            // that can legitimately submit an upgrade request — keeps tests
            // realistic and avoids surprising fixture states.
            'agency_id' => Agency::factory()->state(['kind' => AgencyKind::Individual]),
            'submitted_by' => User::factory(),
            'rc' => 'RC-'.strtoupper(Str::random(8)),
            'ninea' => fake()->numerify('##########'),
            'rib_pro' => fake()->numerify('SN### ##### ########### ##'),
            'address_fiscale' => fake()->address(),
            'company_legal_name' => fake()->company().' SARL',
            'planned_agents_count' => fake()->numberBetween(1, 20),
            'status' => AgencyUpgradeRequestStatus::Pending->value,
            'submitted_at' => now(),
            'reviewed_by' => null,
            'reviewed_at' => null,
            'review_comment' => null,
        ];
    }

    public function pending(): self
    {
        return $this->state(fn () => [
            'status' => AgencyUpgradeRequestStatus::Pending->value,
            'reviewed_by' => null,
            'reviewed_at' => null,
            'review_comment' => null,
        ]);
    }

    public function approved(): self
    {
        return $this->state(fn () => [
            'status' => AgencyUpgradeRequestStatus::Approved->value,
            'reviewed_by' => User::factory(),
            'reviewed_at' => now(),
        ]);
    }

    public function rejected(): self
    {
        return $this->state(fn () => [
            'status' => AgencyUpgradeRequestStatus::Rejected->value,
            'reviewed_by' => User::factory(),
            'reviewed_at' => now(),
            'review_comment' => fake()->sentence(),
        ]);
    }

    public function revoked(): self
    {
        return $this->state(fn () => [
            'status' => AgencyUpgradeRequestStatus::Revoked->value,
        ]);
    }
}

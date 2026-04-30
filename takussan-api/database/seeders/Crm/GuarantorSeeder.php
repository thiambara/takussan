<?php

namespace Database\Seeders\Crm;

use App\Models\Guarantor;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

class GuarantorSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $customers = $this->ctx->customersByAgency[$agency->id] ?? collect();
            // ~30% of customers have a guarantor on file.
            foreach ($customers as $customer) {
                if (! $this->ctx->faker()->boolean(30)) {
                    continue;
                }

                $createdAt = Timeline::randomDateBetween(
                    $customer->created_at,
                    Timeline::seedEnd(),
                );

                Guarantor::create([
                    'first_name' => $this->ctx->faker()->senegaleseFirstName(),
                    'last_name' => $this->ctx->faker()->senegaleseLastName(),
                    'phone' => $this->ctx->faker()->senegalesePhoneNumber(),
                    'email' => $this->ctx->faker()->unique()->safeEmail(),
                    'occupation' => $this->ctx->faker()->jobTitle(),
                    'employer' => $this->ctx->faker()->company(),
                    'monthly_income' => $this->ctx->faker()->numberBetween(250_000, 3_000_000),
                    'relationship_to_tenant' => $this->ctx->faker()->randomElement([
                        'parent', 'sibling', 'employer', 'friend',
                    ]),
                    'added_by_id' => $customer->added_by_id,
                    'created_at' => $createdAt,
                    'updated_at' => $createdAt,
                ]);
            }
        }
    }
}

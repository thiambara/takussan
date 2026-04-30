<?php

namespace Database\Seeders\Crm;

use App\Models\CustomerNote;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

class CustomerNoteSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $customers = $this->ctx->customersByAgency[$agency->id] ?? collect();
            foreach ($customers as $customer) {
                $noteCount = random_int(0, 4);
                for ($i = 0; $i < $noteCount; $i++) {
                    $createdAt = Timeline::randomDateBetween(
                        $customer->created_at,
                        Timeline::seedEnd(),
                    );
                    CustomerNote::create([
                        'customer_id' => $customer->id,
                        'author_id' => $customer->added_by_id,
                        'body' => $this->ctx->faker()->paragraph(),
                        'pinned' => $i === 0 && $this->ctx->faker()->boolean(15),
                        'created_at' => $createdAt,
                        'updated_at' => $createdAt,
                    ]);
                }
            }
        }
    }
}

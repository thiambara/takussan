<?php

namespace Database\Factories;

use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class PropertyVisitFactory extends Factory
{
    protected $model = PropertyVisit::class;

    public function definition(): array
    {
        return [
            'property_id' => Property::factory(),
            'visitor_id' => User::factory(),
            'scheduled_at' => now()->addDays(3),
            'status' => VisitStatus::Scheduled,
        ];
    }
}

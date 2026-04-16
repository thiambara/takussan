<?php

namespace Database\Seeders;

use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class PropertySeeder extends Seeder
{
    public function run(): void
    {
        $quarters = ['Almadies', 'Mermoz', 'Sacré-Cœur', 'Plateau', 'Fann', 'Ouakam', 'Yoff', 'Ngor', 'Point E', 'Liberté'];
        $types = PropertyType::cases();

        for ($i = 1; $i <= 10; $i++) {
            $title = "Bel appartement F{$i} - ".fake()->randomElement($quarters);
            Property::create([
                'title' => $title,
                'slug' => Str::slug($title).'-'.Str::random(6),
                'description' => fake()->paragraphs(3, true),
                'type' => fake()->randomElement($types)->value,
                'status' => PropertyStatus::Published->value,
                'price' => fake()->numberBetween(150_000, 2_000_000),
                'location_quarter' => fake()->randomElement($quarters),
                'location_city' => 'Dakar',
                'bedrooms' => fake()->numberBetween(1, 5),
                'bathrooms' => fake()->numberBetween(1, 3),
                'area' => fake()->numberBetween(30, 300),
                'featured' => $i <= 2,
                'owner_phone' => '+221'.fake()->numerify('7########'),
                'main_photo_url' => "https://picsum.photos/seed/{$i}/800/533",
                'published_at' => now(),
            ]);
        }
    }
}

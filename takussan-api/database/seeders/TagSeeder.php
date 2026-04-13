<?php

namespace Database\Seeders;

use App\Models\Tag;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class TagSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Create property tags
        $propertyTags = [
            ['name' => 'Luxury', 'color' => '#FFD700', 'type' => 'property'],
            ['name' => 'Waterfront', 'color' => '#1E90FF', 'type' => 'property'],
            ['name' => 'Modern', 'color' => '#808080', 'type' => 'property'],
            ['name' => 'New Construction', 'color' => '#32CD32', 'type' => 'property'],
            ['name' => 'Historic', 'color' => '#B8860B', 'type' => 'property'],
            ['name' => 'Family Friendly', 'color' => '#FF69B4', 'type' => 'property'],
            ['name' => 'Investment', 'color' => '#8A2BE2', 'type' => 'property'],
            ['name' => 'Beachfront', 'color' => '#00BFFF', 'type' => 'property'],
            ['name' => 'Downtown', 'color' => '#DC143C', 'type' => 'property'],
            ['name' => 'Countryside', 'color' => '#228B22', 'type' => 'property'],
        ];

        // Create customer tags
        $customerTags = [
            ['name' => 'VIP', 'color' => '#FFD700', 'type' => 'customer'],
            ['name' => 'Investor', 'color' => '#4B0082', 'type' => 'customer'],
            ['name' => 'First-time Buyer', 'color' => '#32CD32', 'type' => 'customer'],
            ['name' => 'Repeat Client', 'color' => '#1E90FF', 'type' => 'customer'],
            ['name' => 'International', 'color' => '#FF4500', 'type' => 'customer'],
            ['name' => 'High Budget', 'color' => '#9932CC', 'type' => 'customer'],
        ];

        // Combine all tags
        $tags = array_merge($propertyTags, $customerTags);

        // Create tags with slugs
        foreach ($tags as $tag) {
            Tag::create([
                'name' => $tag['name'],
                'slug' => Str::slug($tag['name']),
                'description' => fake()->sentence(),
                'type' => $tag['type'],
                'color' => $tag['color'],
            ]);
        }

        // Create some random tags
        Tag::factory()->count(10)->create();
    }
}

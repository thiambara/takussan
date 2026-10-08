<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertyContactTest extends TestCase
{
    use RefreshDatabase;

    /**
     * TCK-590 AC19 — `/contact` ne rend plus que le numéro : le message prérempli était un texte
     * français figé, construit côté API ; il est désormais traduit par le front.
     */
    public function test_returns_phone_only(): void
    {
        $owner = User::factory()->create(['phone' => '+221771234567']);
        $property = Property::factory()->published()->create([
            'user_id' => $owner->id,
            'title' => 'Appartement Almadies',
            'price' => 350_000,
        ]);
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'neighborhood' => 'Almadies',
            'city' => 'Dakar',
        ]);

        $response = $this->getJson("/api/public/properties/{$property->slug}/contact");

        $response->assertOk()
            ->assertExactJson(['phone' => '+221771234567']);
        $this->assertArrayNotHasKey('message', $response->json());
    }

    public function test_contact_returns_404_for_draft(): void
    {
        $property = Property::factory()->draft()->create();
        $response = $this->getJson("/api/public/properties/{$property->slug}/contact");
        $response->assertNotFound();
    }
}

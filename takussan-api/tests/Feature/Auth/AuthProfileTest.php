<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AuthProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_get_own_profile(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/auth/me');

        $response->assertStatus(200)
            ->assertJsonFragment([
                'email' => $user->email,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
            ]);
    }

    public function test_unauthenticated_request_returns_401(): void
    {
        $response = $this->getJson('/api/auth/me');

        $response->assertStatus(401);
    }

    public function test_authenticated_user_can_update_profile(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->putJson('/api/auth/profile', [
            'first_name' => 'Updated',
            'last_name' => 'Name',
            'bio' => 'My updated bio.',
        ]);

        $response->assertStatus(200)
            ->assertJsonFragment([
                'first_name' => 'Updated',
                'last_name' => 'Name',
            ]);

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'first_name' => 'Updated',
            'last_name' => 'Name',
        ]);
    }

    public function test_profile_update_requires_authentication(): void
    {
        $response = $this->putJson('/api/auth/profile', [
            'first_name' => 'Updated',
            'last_name' => 'Name',
        ]);

        $response->assertStatus(401);
    }

    public function test_profile_update_validates_required_fields(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->putJson('/api/auth/profile', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['first_name', 'last_name']);
    }

    public function test_hidden_fields_are_not_returned(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/auth/me');

        $response->assertStatus(200);
        $data = $response->json();

        $this->assertArrayNotHasKey('password', $data);
        $this->assertArrayNotHasKey('remember_token', $data);
        $this->assertArrayNotHasKey('two_factor_secret', $data);
        $this->assertArrayNotHasKey('two_factor_recovery_codes', $data);
    }

    public function test_profile_update_accepts_valid_e164_phone(): void
    {
        $user = User::factory()->create(['phone' => null, 'phone_verified_at' => null]);
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->putJson('/api/auth/profile', [
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'phone' => '+221770000000',
        ]);

        $response->assertStatus(200)
            ->assertJsonFragment(['phone' => '+221770000000']);
    }

    public function test_profile_update_stores_avatar_in_media_collection(): void
    {
        Storage::fake('public');

        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->post('/api/auth/profile', [
            '_method' => 'PUT',
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'avatar' => UploadedFile::fake()->image('avatar.jpg', 256, 256),
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('avatar_url', fn (?string $url) => filled($url));

        $this->assertCount(1, $user->fresh()->getMedia('avatar'));
    }

    public function test_profile_update_can_remove_avatar(): void
    {
        Storage::fake('public');

        $user = User::factory()->create();
        $user->addMedia(UploadedFile::fake()->image('avatar.jpg'))
            ->toMediaCollection('avatar');
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->post('/api/auth/profile', [
            '_method' => 'PUT',
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'avatar_remove' => '1',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('avatar_url', null);

        $this->assertCount(0, $user->fresh()->getMedia('avatar'));
    }

    public function test_profile_update_rejects_non_e164_phone(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->putJson('/api/auth/profile', [
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'phone' => '0770000000',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);
    }

    /**
     * TCK-574 — le profil enregistrait `+330612345678` (forme E.164, aucun réseau ne l'achemine)
     * et `+2217801437100` (dix chiffres après `+221`) ; `send-otp` refusait ensuite d'y envoyer.
     * Le profil juge désormais par les mêmes règles.
     *
     * @return array<string, array{0: string}>
     */
    public static function numerosInjoignables(): array
    {
        return [
            'préfixe national sous +33' => ['+330612345678'],
            'numéro sénégalais trop long' => ['+2217801437100'],
            'numéro sénégalais trop court' => ['+22178014371'],
        ];
    }

    #[DataProvider('numerosInjoignables')]
    public function test_profile_update_refuse_un_numero_injoignable(string $numero): void
    {
        $user = User::factory()->create(['phone' => null]);
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)->putJson('/api/auth/profile', [
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'phone' => $numero,
        ])->assertStatus(422)->assertJsonValidationErrors(['phone']);

        $this->assertNull($user->fresh()->phone);
    }

    public function test_profile_update_garde_le_zero_significatif_italien_et_l_effacement(): void
    {
        $user = User::factory()->create(['phone' => '+221770000000']);
        $token = $user->createToken('test')->plainTextToken;
        $corps = ['first_name' => $user->first_name, 'last_name' => $user->last_name];

        $this->withToken($token)->putJson('/api/auth/profile', $corps + ['phone' => '+390612345678'])->assertOk();
        $this->assertSame('+390612345678', $user->fresh()->phone);

        $this->withToken($token)->putJson('/api/auth/profile', $corps + ['phone' => ''])->assertOk();
        $this->assertNull($user->fresh()->phone);
    }

    public function test_changing_phone_resets_phone_verified_at(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => now(),
        ]);
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->putJson('/api/auth/profile', [
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'phone' => '+221780000000',
        ]);

        $response->assertStatus(200)
            ->assertJsonFragment([
                'phone' => '+221780000000',
                'phone_verified_at' => null,
            ]);

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'phone' => '+221780000000',
            'phone_verified_at' => null,
        ]);
    }

    public function test_keeping_phone_unchanged_keeps_verification_intact(): void
    {
        $verifiedAt = now()->subDay();
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => $verifiedAt,
        ]);
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->putJson('/api/auth/profile', [
            'first_name' => 'Same',
            'last_name' => 'Name',
            'phone' => '+221770000000',
        ]);

        $response->assertStatus(200);
        $this->assertNotNull($user->fresh()->phone_verified_at);
    }

    public function test_clearing_phone_with_empty_string_sets_null(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => now(),
        ]);
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->putJson('/api/auth/profile', [
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'phone' => '',
        ]);

        $response->assertStatus(200);
        $fresh = $user->fresh();
        $this->assertNull($fresh->phone);
        $this->assertNull($fresh->phone_verified_at);
    }
}

<?php

namespace Tests\Feature\Auth\TwoFactor;

use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\ReviewStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\PersonalAccessToken;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-609 (ADR-0033 §8, amendement du 2026-11-16 ; option (b) du porteur) — un pouvoir de la
 * plateforme exercé hors de `/api/admin` exige le second facteur du JETON.
 *
 * Avant (verif-597 passe 4 n5, verif-596 passe 4 Q4a) : `Gate::before` ouvrait au super-admin, sans
 * second facteur, la réécriture ou l'effacement de la réponse d'une agence à un avis, la résiliation
 * d'un bail, le loyer forcé et l'envoi en signature. La famille d'agence reçoit `terminate` et
 * `rent` (`force`) ; `signature-request` reste hors de la famille (plateforme seule).
 */
class PlatformPowerTwoFactorTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Bus::fake([GenerateLeasePaymentSchedule::class]);
        Storage::fake(config('media-library.disk_name'));
        $this->mock(DocumentPdfService::class, function ($mock) {
            $mock->shouldReceive('render')->andReturn('%PDF-1.4 contrat');
        });

        $this->agency = Agency::factory()->create();
        $this->owner = User::factory()->withOwnerProfile($this->agency)->create();
    }

    /** Un bail actif d'agence, antérieur aux plafonds contractuels (`force` y a prise). */
    private function lease(array $attributes = []): Lease
    {
        $property = Property::factory()->create(['user_id' => $this->owner->id, 'agency_id' => $this->agency->id]);

        return Lease::factory()->active()->create($attributes + [
            'property_id' => $property->id,
            'landlord_id' => $this->owner->id,
            'tenant_id' => Customer::factory()->create(['user_id' => User::factory()->create()->id])->id,
            'agency_id' => $this->agency->id,
            'monthly_rent' => 200_000,
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->addMonths(6)->toDateString(),
        ]);
    }

    private function draftLease(): Lease
    {
        return $this->lease(['status' => 'draft']);
    }

    private function repliedReview(): Review
    {
        $property = Property::factory()->published()->create(['agency_id' => $this->agency->id, 'user_id' => $this->owner->id]);

        $review = Review::factory()->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $property->id,
            'agency_id' => $this->agency->id,
            'status' => ReviewStatus::Approved,
            'is_approved' => true,
            'rating' => 2,
        ]);
        $review->forceFill(['reply_content' => "Réponse de l'agence", 'replied_at' => now()])->saveQuietly();

        return $review;
    }

    /** @return array<string, array{bool, string}> */
    public static function withoutSecondFactor(): array
    {
        return [
            'super-admin sans 2FA' => [false, 'two_factor_required'],
            'jeton qui n\'a pas vu le second facteur' => [true, 'two_factor_step_up_required'],
        ];
    }

    /**
     * Un VRAI jeton jamais vérifié (le compte à 2FA entré par OAuth, ou d'avant l'enrôlement), ou un
     * compte sans 2FA. Rend les en-têtes et le jeton, que {@see self::verify()} vérifie ensuite.
     *
     * @return array{array<string, string>, PersonalAccessToken}
     */
    private function platformToken(bool $hasTwoFactor, string $role = 'super_admin'): array
    {
        $user = $hasTwoFactor ? User::factory()->withTwoFactor()->create() : User::factory()->create();
        $this->materializeRoleProfile($user, $role, $role === 'agency_admin' ? $this->agency : null);
        $new = $user->createToken('oauth');

        return [['Authorization' => 'Bearer '.$new->plainTextToken], $new->accessToken];
    }

    /** Le même jeton, après la saisie du second facteur (`POST /auth/two-factor/step-up`). */
    private function verify(PersonalAccessToken $token): void
    {
        $token->forceFill(['two_factor_verified_at' => now()->subHour()])->save();
        $this->app['auth']->forgetGuards();
    }

    private function assertRefused(TestResponse $response, string $code): void
    {
        $response->assertForbidden();
        $this->assertSame($code, $response->json('code') ?? $response->json('error_code'));
    }

    // ─── AC1 — la plateforme ──────────────────────────────────────────────────────────────

    #[DataProvider('withoutSecondFactor')]
    public function test_the_platform_cannot_rewrite_or_erase_an_agency_reply_without_its_second_factor(bool $hasTwoFactor, string $code): void
    {
        $review = $this->repliedReview();
        [$headers] = $this->platformToken($hasTwoFactor);

        $this->assertRefused($this->postJson("/api/reviews/{$review->id}/reply", ['reply_content' => 'Réécrite par la plateforme'], $headers), $code);
        $this->assertRefused($this->deleteJson("/api/reviews/{$review->id}/reply", [], $headers), $code);

        $this->assertSame("Réponse de l'agence", $review->refresh()->reply_content);
    }

    #[DataProvider('withoutSecondFactor')]
    public function test_the_platform_cannot_terminate_force_or_send_a_lease_without_its_second_factor(bool $hasTwoFactor, string $code): void
    {
        [$headers] = $this->platformToken($hasTwoFactor);

        $lease = $this->lease();
        $this->assertRefused($this->postJson("/api/leases/{$lease->id}/terminate", ['reason' => 'mutual agreement'], $headers), $code);
        // Lu comme le service le lit : `"1"` vaut `true`.
        $this->assertRefused($this->patchJson("/api/leases/{$lease->id}/rent", ['new_rent' => 260_000, 'reason' => 'Big bump', 'force' => '1'], $headers), $code);
        $this->assertSame('active', $lease->refresh()->status->value);
        $this->assertSame(200_000.0, (float) $lease->monthly_rent);

        $draft = $this->draftLease();
        $this->assertRefused($this->postJson("/api/leases/{$draft->id}/signature-request", [], $headers), $code);
        $this->assertSame('draft', $draft->refresh()->status->value);
    }

    public function test_the_same_token_acts_once_its_second_factor_is_verified(): void
    {
        [$headers, $token] = $this->platformToken(true);
        $review = $this->repliedReview();
        $lease = $this->lease();
        $draft = $this->draftLease();
        $this->assertRefused($this->deleteJson("/api/reviews/{$review->id}/reply", [], $headers), 'two_factor_step_up_required');

        $this->verify($token);

        $this->postJson("/api/reviews/{$review->id}/reply", ['reply_content' => 'Réponse corrigée par le support'], $headers)->assertOk();
        $this->deleteJson("/api/reviews/{$review->id}/reply", [], $headers)->assertOk();
        $this->assertNull($review->refresh()->reply_content);

        $this->patchJson("/api/leases/{$lease->id}/rent", ['new_rent' => 260_000, 'reason' => 'Big bump', 'force' => true], $headers)->assertOk();
        $this->postJson("/api/leases/{$lease->id}/terminate", ['reason' => 'mutual agreement'], $headers)
            ->assertOk()->assertJsonPath('data.status', 'terminated');
        $this->postJson("/api/leases/{$draft->id}/signature-request", [], $headers)->assertSuccessful();
    }

    /** Décision (b) : une révision de loyer SANS `force` n'est pas dans la liste — elle reste ouverte. */
    public function test_a_rent_review_without_force_stays_outside_the_list(): void
    {
        [$headers] = $this->platformToken(true);
        $lease = $this->lease();

        $this->patchJson("/api/leases/{$lease->id}/rent", ['new_rent' => 210_000, 'reason' => 'Annual review', 'force' => false], $headers)->assertOk();
    }

    // ─── AC3 — l'admin d'agence ───────────────────────────────────────────────────────────

    public function test_an_agency_admin_without_two_factor_still_replies_on_its_own_agency(): void
    {
        $review = $this->repliedReview();
        [$headers] = $this->platformToken(false, 'agency_admin');

        $this->postJson("/api/reviews/{$review->id}/reply", ['reply_content' => 'Merci pour votre retour'], $headers)->assertOk();
        $this->deleteJson("/api/reviews/{$review->id}/reply", [], $headers)->assertOk();
    }

    /** Décision de famille : `terminate` et `rent` (`force`) oui, `signature-request` et `rent` ordinaire non. */
    public function test_an_agency_admin_needs_its_second_factor_to_terminate_or_force_but_not_to_send(): void
    {
        [$headers, $token] = $this->platformToken(false, 'agency_admin');
        $lease = $this->lease();

        $this->assertRefused($this->postJson("/api/leases/{$lease->id}/terminate", ['reason' => 'mutual agreement'], $headers), 'two_factor_required');
        $this->assertRefused($this->patchJson("/api/leases/{$lease->id}/rent", ['new_rent' => 260_000, 'reason' => 'Big bump', 'force' => true], $headers), 'two_factor_required');
        $this->assertSame('active', $lease->refresh()->status->value);

        $this->patchJson("/api/leases/{$lease->id}/rent", ['new_rent' => 210_000, 'reason' => 'Annual review'], $headers)->assertOk();
        $this->postJson("/api/leases/{$this->draftLease()->id}/signature-request", [], $headers)->assertSuccessful();

        // L'autre sens : la même agence, un admin à deux facteurs sur ce jeton, résilie.
        $token->tokenable->forceFill(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET])->save();
        $this->verify($token);
        $this->postJson("/api/leases/{$lease->id}/terminate", ['reason' => 'mutual agreement'], $headers)
            ->assertOk()->assertJsonPath('data.status', 'terminated');
    }

    // ─── AC4 — le bailleur, le client ─────────────────────────────────────────────────────

    public function test_a_landlord_and_a_tenant_without_two_factor_see_no_change(): void
    {
        $lease = $this->lease();
        $this->actingAsApi($this->owner);

        // `force` ne refuse le bailleur que par le service (422), jamais par le second facteur.
        $forced = $this->patchJson("/api/leases/{$lease->id}/rent", ['new_rent' => 260_000, 'reason' => 'Big bump', 'force' => true]);
        $this->assertNotSame(403, $forced->status(), (string) $forced->getContent());
        $this->postJson("/api/leases/{$lease->id}/terminate", ['reason' => 'mutual agreement'])
            ->assertOk()->assertJsonPath('data.status', 'terminated');

        $tenant = $lease->tenant->user;
        $this->actingAsApi($tenant);
        $refus = $this->postJson("/api/leases/{$this->lease()->id}/terminate", ['reason' => 'je pars']);
        $this->assertNotContains($refus->json('code') ?? $refus->json('error_code'), ['two_factor_required', 'two_factor_step_up_required']);
    }
}

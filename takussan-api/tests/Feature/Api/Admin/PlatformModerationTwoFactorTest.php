<?php

namespace Tests\Feature\Api\Admin;

use App\Http\Controllers\Api\ReviewController;
use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\ReviewStatus;
use App\Models\Property;
use App\Models\PropertyReport;
use App\Models\Review;
use App\Models\User;
use App\Support\Security\ProtectedActions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-597 (verif-597 passe 3, M5 ; ADR-0043 §4, ADR-0033) — la modération que 597 réserve à la
 * plateforme exige la 2FA de 589 HORS de `/api/admin/*` comme dessous.
 *
 * Avant : le verrou plateforme se posait sous 2FA (`/api/admin/moderation/…/decide`) et se levait
 * sans elle (`POST /api/properties/{id}/approve`) ; un avis publié de n'importe quelle agence se
 * retirait sans second facteur (`PATCH /api/reviews/{id}/moderate`), y compris par un jeton OAuth
 * qui n'a jamais vu le TOTP. L'admin d'agence, lui, garde ses gestes d'agence sans 2FA.
 */
class PlatformModerationTwoFactorTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create(['moderation_required' => true]);
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);
    }

    private function listing(): Property
    {
        return Property::factory()->published()->create([
            'agency_id' => $this->agency->id,
            'user_id' => $this->agent->id,
            'is_test' => false,
        ]);
    }

    private function heldListing(): Property
    {
        $property = $this->listing();
        $property->forceFill([
            'status' => PropertyStatus::PendingReview,
            'visibility' => PropertyVisibility::Public,
            'platform_hold_at' => now(),
            'platform_hold_reason' => 'fraud',
        ])->saveQuietly();

        return $property->refresh();
    }

    private function review(ReviewStatus $status): Review
    {
        return Review::factory()->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $this->listing()->id,
            'agency_id' => $this->agency->id,
            'status' => $status,
            'is_approved' => $status === ReviewStatus::Approved,
            'rating' => 1,
        ]);
    }

    /**
     * `[2FA du compte, jeton réel sans second facteur, code attendu]`.
     *
     * @return array<string, array{bool, string}>
     */
    public static function withoutSecondFactor(): array
    {
        return [
            'super-admin sans 2FA' => [false, 'two_factor_required'],
            'jeton qui n\'a pas vu le second facteur' => [true, 'two_factor_step_up_required'],
        ];
    }

    /** Authentifie le super-admin : sans 2FA par `actingAs`, ou par un VRAI jeton jamais vérifié. */
    private function superAdmin(bool $hasTwoFactor): array
    {
        $super = $hasTwoFactor ? User::factory()->withTwoFactor()->create() : User::factory()->create();
        $this->materializeRoleProfile($super, 'super_admin');

        if (! $hasTwoFactor) {
            $this->actingAsApi($super);

            return [];
        }

        return ['Authorization' => 'Bearer '.$super->createToken('oauth')->plainTextToken];
    }

    private function assertRefused(TestResponse $response, string $code): void
    {
        $response->assertForbidden();
        $this->assertSame($code, $response->json('code') ?? $response->json('error_code'));
    }

    #[DataProvider('withoutSecondFactor')]
    public function test_the_platform_cannot_take_down_a_published_review_without_its_second_factor(bool $hasTwoFactor, string $code): void
    {
        $review = $this->review(ReviewStatus::Approved);
        $headers = $this->superAdmin($hasTwoFactor);

        $this->assertRefused(
            $this->patchJson("/api/reviews/{$review->id}/moderate", ['decision' => 'delete', 'reason_code' => 'spam'], $headers),
            $code,
        );
        $this->assertTrue(Review::query()->whereKey($review->id)->exists());

        $pending = $this->review(ReviewStatus::Pending);
        $this->assertRefused($this->postJson("/api/reviews/{$pending->id}/approve", [], $headers), $code);
        $this->assertRefused($this->postJson("/api/reviews/{$pending->id}/reject", ['reason' => 'spam'], $headers), $code);
        $this->assertSame(ReviewStatus::Pending, $pending->refresh()->status);
    }

    #[DataProvider('withoutSecondFactor')]
    public function test_the_platform_cannot_lift_a_hold_without_its_second_factor(bool $hasTwoFactor, string $code): void
    {
        $held = $this->heldListing();
        $headers = $this->superAdmin($hasTwoFactor);

        $this->assertRefused($this->postJson("/api/properties/{$held->id}/approve", [], $headers), $code);
        $this->assertRefused($this->postJson("/api/properties/{$held->id}/reject", ['reason' => 'Annonce frauduleuse'], $headers), $code);

        $held->refresh();
        $this->assertNotNull($held->platform_hold_at);
        $this->assertSame(PropertyStatus::PendingReview, $held->status);
    }

    /**
     * Les deux sens au même niveau : une session à deux facteurs (sans step-up récent) tranche ici
     * comme sous `/api/admin/moderation`, qui n'exige pas de step-up non plus.
     */
    public function test_a_two_factor_session_decides_here_as_under_the_admin_console(): void
    {
        $super = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($super, 'super_admin');
        $this->actingAsApi($super);

        $report = PropertyReport::create([
            'property_id' => $this->listing()->id,
            'reason' => 'fraud',
            'reporter_fingerprint' => str_repeat('a', 64),
        ]);
        $this->postJson("/api/admin/moderation/property_report:{$report->id}/decide", ['decision' => 'reject', 'reason_code' => 'spam'])
            ->assertOk();

        $held = $this->heldListing();
        $this->postJson("/api/properties/{$held->id}/approve")->assertOk();
        $this->assertNull($held->refresh()->platform_hold_at);

        $review = $this->review(ReviewStatus::Approved);
        $this->patchJson("/api/reviews/{$review->id}/moderate", ['decision' => 'delete', 'reason_code' => 'spam'])->assertOk();
        $this->assertFalse(Review::query()->whereKey($review->id)->exists());
    }

    /**
     * verif-597 passe 4, n5 — `reply` et `deleteReply` sont exemptés, mais un super-admin sans 2FA
     * réécrit ou efface encore la réponse d'une agence (`Gate::before`, pouvoir antérieur à 597).
     * Le motif doit le dire, pour que le ticket de suite les trouve en partant de la liste ; si le
     * geste passe un jour sous 2FA, ce test tombe et le motif se réécrit avec lui.
     */
    public function test_the_reply_exemption_names_the_platform_path_it_leaves_open(): void
    {
        $review = $this->review(ReviewStatus::Approved);
        $review->forceFill(['reply_content' => "Réponse de l'agence", 'replied_at' => now()])->saveQuietly();
        $this->superAdmin(false);

        $this->deleteJson("/api/reviews/{$review->id}/reply")->assertOk();
        $this->assertNull($review->refresh()->reply_content);

        foreach (['reply', 'deleteReply'] as $method) {
            $reason = ProtectedActions::PLATFORM_TWO_FACTOR_EXEMPT[ReviewController::class.'@'.$method];
            $this->assertStringContainsString('Gate::before', $reason, "Motif de @{$method}");
            $this->assertStringContainsString('ticket de suite', $reason, "Motif de @{$method}");
        }
    }

    /** Témoin : la liste ne vaut que pour la plateforme ; l'admin d'agence sans 2FA garde ses gestes. */
    public function test_an_agency_admin_without_two_factor_keeps_the_agency_gestures(): void
    {
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agency);
        $this->actingAsApi($admin);

        $toApprove = $this->review(ReviewStatus::Pending);
        $this->patchJson("/api/reviews/{$toApprove->id}/moderate", ['decision' => 'approve'])->assertOk();
        $toHide = $this->review(ReviewStatus::Pending);
        $this->patchJson("/api/reviews/{$toHide->id}/moderate", ['decision' => 'hide', 'reason_code' => 'spam'])->assertOk();

        $queued = $this->listing();
        $queued->forceFill(['status' => PropertyStatus::PendingReview, 'submitted_at' => now()])->saveQuietly();
        $this->postJson("/api/properties/{$queued->id}/approve")->assertOk();
        $this->assertSame(PropertyStatus::Available, $queued->refresh()->status);
    }
}

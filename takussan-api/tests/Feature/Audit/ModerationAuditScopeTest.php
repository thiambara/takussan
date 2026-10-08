<?php

namespace Tests\Feature\Audit;

use App\Models\Activity;
use App\Models\Agency;
use App\Models\DuplicateSuspicion;
use App\Models\Enums\ReviewStatus;
use App\Models\Property;
use App\Models\PropertyReport;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-601 (ADR-0044 §3) × TCK-597 — les décisions de la file de modération super-admin se rangent
 * dans le journal par l'agence de leur SUJET, comme tout acte : l'agence du bien ou de l'avis les
 * lit, aucune autre ; le doublon soupçonné ne révèle pas le bien recopié, ni le signalement son auteur.
 */
class ModerationAuditScopeTest extends ApiTestCase
{
    use RefreshDatabase;

    private const SIGNALEUR = 'TEMOIN-SIGNALEUR';

    private const IP = '203.0.113.77';

    public function test_les_decisions_de_moderation_restent_dans_l_agence_de_leur_sujet(): void
    {
        Notification::fake();
        [$a, $b] = [Agency::factory()->create(), Agency::factory()->create()];
        $signale = Property::factory()->published()->create(['agency_id' => $a->id]);
        $copie = Property::factory()->published()->create(['agency_id' => $a->id]);
        $original = Property::factory()->published()->create(['agency_id' => $b->id]);

        $report = PropertyReport::create([
            'property_id' => $signale->id, 'reason' => 'fraud',
            'details' => self::SIGNALEUR, 'reporter_ip' => self::IP,
        ]);
        $suspicion = DuplicateSuspicion::create([
            'property_id' => $copie->id, 'matched_property_id' => $original->id, 'signal' => 'photo', 'distance' => 3,
        ]);
        $review = Review::factory()->create(['agency_id' => $a->id, 'status' => ReviewStatus::Pending, 'is_approved' => false]);

        $moderator = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($moderator, 'super_admin');
        $this->actingAsApi($moderator);
        foreach ([
            "property_report:{$report->id}" => 'hide',
            "suspected_duplicate:{$suspicion->id}" => 'reject',
            "review:{$review->id}" => 'remove',
        ] as $item => $decision) {
            $this->postJson("/api/admin/moderation/{$item}/decide", ['decision' => $decision, 'reason_code' => 'fraud'])->assertOk();
        }

        // À l'écriture : l'agence du sujet, jamais celle du bien recopié, jamais nulle.
        $rows = Activity::query()->whereIn('event', ['super_admin_moderation_decision', 'property.report_resolved'])->get();
        $this->assertCount(4, $rows);
        $this->assertSame([$a->id], $rows->pluck('agency_id')->unique()->values()->all());

        $this->apiActingAsRole('agency_admin', ['agency' => $a]);
        $chezA = $this->apiGet('/api/activity-log?per_page=100')->assertOk();
        $this->assertCount(4, collect($chezA->json('data'))->whereIn('event', ['super_admin_moderation_decision', 'property.report_resolved']));
        foreach ([self::SIGNALEUR, self::IP] as $temoin) {
            $this->assertStringNotContainsString($temoin, $chezA->getContent());
        }

        $this->apiActingAsRole('agency_admin', ['agency' => $b]);
        $chezB = $this->apiGet('/api/activity-log?per_page=100')->assertOk();
        $this->assertSame([], collect($chezB->json('data'))->whereIn('event', ['super_admin_moderation_decision', 'property.report_resolved'])->all());
    }
}

<?php

namespace Tests\Feature\Api;

use App\Models\Enums\ReviewStatus;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use App\Support\VisitorFingerprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-597 (ADR-0043 §6, AC6) — signaler un avis sans compte.
 *
 * Avant : seule la route authentifiée existait ; le visiteur du site public ne pouvait rien
 * signaler, et le seuil lisait un réglage `config('takussan.reviews.report_threshold')` qu'aucun
 * fichier ne déclarait.
 */
class PublicReportTest extends ApiTestCase
{
    use RefreshDatabase;

    private Property $property;

    private Review $five;

    private Review $three;

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear('public:report:127.0.0.1');

        $this->property = Property::factory()->published()->create(['is_test' => false]);
        $this->five = $this->approved(5);
        $this->three = $this->approved(3);
    }

    private function approved(int $rating): Review
    {
        return Review::factory()->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $this->property->id,
            'rating' => $rating,
            'status' => ReviewStatus::Approved,
            'is_approved' => true,
        ]);
    }

    private function publicReviews(): TestResponse
    {
        return $this->getJson("/api/public/properties/{$this->property->slug}/reviews")->assertOk();
    }

    public function test_an_anonymous_report_is_recorded_and_moves_neither_the_listing_nor_the_average(): void
    {
        $this->assertEquals(4.0, $this->publicReviews()->json('meta.average'));

        $this->postJson("/api/public/reviews/{$this->three->id}/report", ['reason' => 'Faux avis'])
            ->assertOk();

        $review = $this->three->refresh();
        $this->assertSame(ReviewStatus::Reported, $review->status);
        $this->assertTrue($review->is_approved);
        $this->assertSame(1, $review->reported_count);
        $this->assertNull($review->metadata['reports'][0]['user_id']);
        $this->assertSame(VisitorFingerprint::ofIp('127.0.0.1'), $review->metadata['reports'][0]['fingerprint']);
        $this->assertArrayNotHasKey('ip', $review->metadata['reports'][0]);

        $public = $this->publicReviews();
        $this->assertContains($this->three->id, collect($public->json('data'))->pluck('id')->all(), 'l\'avis signalé reste publié');
        $this->assertEquals(4.0, $public->json('meta.average'), 'la moyenne ne bouge pas');
    }

    public function test_the_same_visitor_reporting_twice_counts_once(): void
    {
        $url = "/api/public/reviews/{$this->five->id}/report";

        $this->withHeader('X-Forwarded-For', '203.0.113.9')->postJson($url, ['reason' => 'Spam'])->assertOk();
        $this->withHeader('X-Forwarded-For', '203.0.113.9')->postJson($url, ['reason' => 'Spam encore'])->assertOk();
        $this->assertSame(1, $this->five->refresh()->reported_count);

        $this->withHeader('X-Forwarded-For', '203.0.113.10')->postJson($url, ['reason' => 'Spam'])->assertOk();
        $this->assertSame(2, $this->five->refresh()->reported_count);
    }

    public function test_a_filled_honeypot_answers_204_and_records_nothing(): void
    {
        $this->postJson("/api/public/reviews/{$this->five->id}/report", ['reason' => 'x', 'company' => 'Bot'])
            ->assertNoContent();

        $this->assertSame(0, $this->five->refresh()->reported_count);
        $this->assertSame(ReviewStatus::Approved, $this->five->status);
    }

    public function test_a_bearer_token_attaches_the_account_and_dedupes_by_account(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('report')->plainTextToken;
        $url = "/api/public/reviews/{$this->five->id}/report";

        $this->withHeaders(['Authorization' => "Bearer {$token}", 'X-Forwarded-For' => '203.0.113.1'])
            ->postJson($url, ['reason' => 'Spam'])->assertOk();
        $this->withHeaders(['Authorization' => "Bearer {$token}", 'X-Forwarded-For' => '203.0.113.2'])
            ->postJson($url, ['reason' => 'Spam'])->assertOk();

        $review = $this->five->refresh();
        $this->assertSame(1, $review->reported_count);
        $this->assertSame($user->id, $review->metadata['reports'][0]['user_id']);
    }

    public function test_an_unpublished_review_cannot_be_reported_publicly(): void
    {
        $pending = Review::factory()->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $this->property->id,
            'status' => ReviewStatus::Pending,
            'is_approved' => false,
        ]);

        $this->postJson("/api/public/reviews/{$pending->id}/report", ['reason' => 'x'])->assertNotFound();
        $this->assertSame(0, $pending->refresh()->reported_count);
    }

    /** La route authentifiée partage la règle : même compte, deux envois, une unité. */
    public function test_the_authenticated_route_shares_the_rule(): void
    {
        $user = User::factory()->create();
        $this->actingAsApi($user);

        $this->postJson("/api/reviews/{$this->five->id}/report", ['reason' => 'Spam'])->assertOk();
        $this->postJson("/api/reviews/{$this->five->id}/report", ['reason' => 'Spam'])->assertOk();

        $review = $this->five->refresh();
        $this->assertSame(1, $review->reported_count);
        $this->assertSame(ReviewStatus::Reported, $review->status);
    }

    /**
     * verif-597 m3 — la route AUTHENTIFIÉE refuse aussi un avis non publié. Avant, elle rendait 200
     * et le faisait passer `pending → reported` : un oracle d'existence sur les identifiants, et un
     * avis encore en attente qui changeait de statut.
     */
    public function test_an_unpublished_review_cannot_be_reported_by_an_account_either(): void
    {
        $pending = Review::factory()->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $this->property->id,
            'status' => ReviewStatus::Pending,
            'is_approved' => false,
        ]);
        $this->actingAsApi(User::factory()->create());

        $this->postJson("/api/reviews/{$pending->id}/report", ['reason' => 'spam'])->assertNotFound();

        $pending->refresh();
        $this->assertSame(ReviewStatus::Pending, $pending->status);
        $this->assertSame(0, $pending->reported_count);
    }

    /**
     * verif-597 m6 — un visiteur IPv6 dispose d'un /64 entier : l'empreinte et la clé du limiteur
     * se prennent sur le /64, pas sur l'adresse. Avant, chaque adresse neuve du même abonné donnait
     * une empreinte neuve (un signalement de plus) et un compteur de limiteur neuf.
     */
    public function test_two_ipv6_addresses_of_the_same_64_are_one_visitor(): void
    {
        $a = '2001:db8:abcd:12::1';
        $b = '2001:db8:abcd:12:ffff:ffff:ffff:fffe';
        $other = '2001:db8:abcd:13::1';

        $this->assertSame(VisitorFingerprint::ofIp($a), VisitorFingerprint::ofIp($b));
        $this->assertNotSame(VisitorFingerprint::ofIp($a), VisitorFingerprint::ofIp($other));
        $this->assertSame(hash_hmac('sha256', '203.0.113.7', (string) config('app.key')), VisitorFingerprint::ofIp('203.0.113.7'));

        $key = fn (string $ip): string => RateLimiter::limiter('public-report')(
            Request::create('/api/public/reviews/1/report', 'POST', server: ['REMOTE_ADDR' => $ip])
        )->key;
        $this->assertSame($key($a), $key($b));
        $this->assertNotSame($key($a), $key($other));

        // De bout en bout : le même visiteur, deux adresses de son /64, compte une fois.
        $this->withServerVariables(['REMOTE_ADDR' => $a])
            ->postJson("/api/public/reviews/{$this->five->id}/report", ['reason' => 'spam'])->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => $b])
            ->postJson("/api/public/reviews/{$this->five->id}/report", ['reason' => 'spam'])->assertOk();
        $this->assertSame(1, $this->five->refresh()->reported_count);
    }

    /**
     * verif-597 passe 2 n1 — une IPv4 vue sous sa forme IPv4-mappée (`::ffff:a.b.c.d`, pile
     * d'écoute double) est une IPv4 : tronquée au /64, elle donnait `::/64` à TOUS ces visiteurs,
     * donc une seule empreinte (un seul signalement) et un seul compteur de limiteur.
     */
    public function test_ipv4_mapped_addresses_are_ipv4_visitors(): void
    {
        $a = '::ffff:203.0.113.5';
        $b = '::ffff:198.51.100.9';

        $this->assertNotSame(VisitorFingerprint::ofIp($a), VisitorFingerprint::ofIp($b));
        $this->assertSame(VisitorFingerprint::ofIp('203.0.113.5'), VisitorFingerprint::ofIp($a));

        // verif-597 passe 3, n1′ — le déballage juge la forme BINAIRE : les écritures hexadécimale,
        // en majuscules ou développée de la même adresse sont le même visiteur IPv4. Un déballage
        // textuel (`::ffff:` suivi d'un point) les laissait au `/64` commun.
        foreach (['::ffff:cb00:7105', '::FFFF:203.0.113.5', '0:0:0:0:0:ffff:cb00:7105'] as $spelling) {
            $this->assertSame('203.0.113.5', VisitorFingerprint::network($spelling), $spelling);
            $this->assertSame(VisitorFingerprint::ofIp('203.0.113.5'), VisitorFingerprint::ofIp($spelling), $spelling);
        }
        $this->assertNotSame(VisitorFingerprint::ofIp('::ffff:cb00:7105'), VisitorFingerprint::ofIp('::ffff:c633:6409'));

        $key = fn (string $ip): string => RateLimiter::limiter('public-report')(
            Request::create('/api/public/reviews/1/report', 'POST', server: ['REMOTE_ADDR' => $ip])
        )->key;
        $this->assertNotSame($key($a), $key($b));
        $this->assertSame($key('203.0.113.5'), $key($a));

        // De bout en bout : deux visiteurs distincts comptent deux fois.
        $this->withServerVariables(['REMOTE_ADDR' => $a])
            ->postJson("/api/public/reviews/{$this->five->id}/report", ['reason' => 'spam'])->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => $b])
            ->postJson("/api/public/reviews/{$this->five->id}/report", ['reason' => 'spam'])->assertOk();
        $this->assertSame(2, $this->five->refresh()->reported_count);
    }
}

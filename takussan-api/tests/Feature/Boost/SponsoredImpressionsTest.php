<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Admin\PlatformSettingService;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Boost\BoostStatsRecorder;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2569 (amendement d'ADR-0061 du 2026-11-16, option (a) du porteur) — une impression se compte
 * quand le NAVIGATEUR déclare avoir affiché l'emplacement, jamais quand l'API le sert : le front
 * retire l'emplacement de tête sous des places réservées et les doublons de la suite continue
 * (TCK-2500), et l'accueil comme la recherche servaient des impressions qui n'avaient pas eu lieu.
 *
 * TCK-708 (P01.04, décision du porteur) — une fois par visiteur et par bien sur 30 min.
 */
class SponsoredImpressionsTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private Property $property;

    private PropertyBoost $boost;

    protected function setUp(): void
    {
        parent::setUp();
        // Début d'heure : les 31 minutes restent dans la même clé horaire du compteur.
        $this->travelTo(now()->utc()->startOfHour()->addMinute());
        $agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $this->property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $this->boost = app(BoostPurchaseService::class)->purchase($this->property, BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole(), $admin);
        Property::factory()->count(2)->published()->create();
        $this->indexProperties();
        app(PlatformSettingService::class)->bulkUpdate(['boost.sponsored_slots_per_page' => 1, 'boost.reserved_top_results' => 0], $this->actingAsRole('super_admin'));
    }

    /** AC3 — servir n'est plus compter : une régression qui recompterait à l'émission rougit ici. */
    public function test_la_recherche_qui_sert_un_emplacement_ne_compte_aucune_impression(): void
    {
        // TCK-2500 — la page 2 d'une carte : le bien boosté est la carte de la page 1, et une vedette déjà parmi les
        // cartes de la page n'est pas servie en emplacement ; ici, elle l'est.
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.1'])
            ->getJson('/api/public/properties/search?per_page=1&page=2')
            ->assertOk()
            ->assertJsonPath('sponsored.0.id', $this->property->id);

        $this->assertSame(0, $this->impressions(), 'servi, pas affiché : rien ne se compte');
    }

    public function test_l_accueil_qui_sert_la_rangee_vedette_ne_compte_aucune_impression(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.1'])
            ->getJson('/api/public/properties/discovery')
            ->assertOk()
            ->assertJsonFragment(['id' => $this->property->id]);

        $this->assertSame(0, $this->impressions());
    }

    /** AC1/AC2 côté API — seul ce qui est déclaré compte, un par emplacement déclaré. */
    public function test_un_emplacement_declare_compte_une_impression(): void
    {
        $this->declarer('198.51.100.1', [$this->property->slug])->assertNoContent();

        $this->assertSame(1, $this->impressions());
    }

    public function test_la_declaration_compte_une_impression_par_visiteur_sur_30_minutes(): void
    {
        $this->declarer('198.51.100.1', [$this->property->slug, $this->property->slug])->assertNoContent();
        $this->declarer('198.51.100.1', [$this->property->slug])->assertNoContent();
        $this->assertSame(1, $this->impressions(), 'le même visiteur ne compte qu’une fois');

        $this->declarer('198.51.100.2', [$this->property->slug]);
        $this->assertSame(2, $this->impressions(), 'un autre visiteur compte');

        $this->travel(31)->minutes();
        $this->declarer('198.51.100.1', [$this->property->slug]);
        $this->assertSame(3, $this->impressions(), 'après 30 minutes, le même visiteur compte de nouveau');
    }

    /**
     * AC4 — un bien qui n'est pas public ne compte rien, et rien ne le distingue d'un slug inconnu :
     * même 204, sans corps. Le boost reste actif : seul le filtre de publication du contrôleur le tient.
     */
    public function test_un_bien_non_public_ou_inconnu_ne_compte_rien_et_ne_fuit_pas(): void
    {
        DB::table('properties')->where('id', $this->property->id)->update(['visibility' => 'private']);
        $this->assertSame(BoostStatus::Active, $this->boost->fresh()->status, 'témoin : la vedette reste active');

        $prive = $this->declarer('198.51.100.1', [$this->property->slug])->assertNoContent();
        $inconnu = $this->declarer('198.51.100.2', ['aucun-bien-de-ce-nom'])->assertNoContent();

        $this->assertSame('', $prive->getContent());
        $this->assertSame($inconnu->getContent(), $prive->getContent());
        $this->assertSame(0, $this->impressions());
    }

    public function test_un_bien_sans_vedette_ne_compte_rien_et_une_declaration_vide_rend_204(): void
    {
        $autre = Property::query()->whereKeyNot($this->property->id)->firstOrFail();

        $this->declarer('198.51.100.1', [$autre->slug])->assertNoContent();
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.1'])->post('/api/public/properties/sponsored-impressions', ['slugs' => 'pas-un-tableau'])->assertNoContent();
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.1'])->post('/api/public/properties/sponsored-impressions')->assertNoContent();

        $this->assertSame(0, $this->impressions());
        $this->assertSame(0, (int) DB::table('property_boost_daily_stats')->count());
    }

    /** @param  list<string>  $slugs */
    private function declarer(string $ip, array $slugs): TestResponse
    {
        // Un formulaire, comme l'envoie le navigateur : une requête « simple », sans pré-vérification CORS.
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->post('/api/public/properties/sponsored-impressions', ['slugs' => $slugs]);
    }

    private function impressions(): int
    {
        return (int) Cache::get(BoostStatsRecorder::key($this->boost->id, now(), 'impressions'));
    }
}

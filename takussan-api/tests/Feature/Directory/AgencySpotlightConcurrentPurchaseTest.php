<?php

namespace Tests\Feature\Directory;

use App\Exceptions\ApiError;
use App\Models\Address;
use App\Models\Agency;
use App\Models\AgencySpotlight;
use App\Models\CreditMovement;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\User;
use App\Services\Boost\SpotlightPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PgSql\Connection;
use Tests\TestCase;

/**
 * TCK-2525 — AC2 : deux achats simultanés de la même place, un seul réussit, un seul débit.
 *
 * La connexion B joue l'autre acheteur, une autre agence : elle prend le verrou de la ville, pose sa
 * place sur Dakar, et ne commite qu'une seconde plus tard. A (l'achat réel, sous la transaction du
 * test) doit l'attendre, puis refuser sans rien débiter. Le verrou de la LIGNE de l'agence ne les
 * sérialise pas — ce sont deux agences : c'est le verrou de la ville (et, à défaut, la contrainte
 * d'exclusion, qui attend elle aussi la transaction de B) qui tranche.
 *
 * B commite la région, la ville, son agence et sa place : `tearDown()` les retire par sa propre
 * connexion. Tout ce que A écrit vit dans la transaction du test et disparaît avec elle.
 */
class AgencySpotlightConcurrentPurchaseTest extends TestCase
{
    use RefreshDatabase;

    /** @var array{region: int, city: int, agency: int}|null */
    private ?array $engage = null;

    protected function tearDown(): void
    {
        if ($this->engage !== null) {
            $b = $this->secondeConnexion();
            pg_query_params($b, 'DELETE FROM agency_spotlights WHERE agency_id = $1 OR geo_city_id = $2', [$this->engage['agency'], $this->engage['city']]);
            pg_query_params($b, 'DELETE FROM agencies WHERE id = $1', [$this->engage['agency']]);
            pg_query_params($b, 'DELETE FROM geo_cities WHERE id = $1', [$this->engage['city']]);
            pg_query_params($b, 'DELETE FROM geo_regions WHERE id = $1', [$this->engage['region']]);
            pg_close($b);
        }
        parent::tearDown();
    }

    public function test_ac2_deux_achats_simultanes_de_la_meme_place_un_seul_reussit_un_seul_debit(): void
    {
        $this->assertTrue(function_exists('pg_send_query'), 'ext-pgsql requise (installée en CI, api-ci.yml:117).');

        // La ville, commitée par B : A doit la voir.
        $b = $this->secondeConnexion();
        $jeton = bin2hex(random_bytes(4));
        $region = (int) pg_fetch_result(pg_query_params($b, "INSERT INTO geo_regions (code, slug, name, created_at, updated_at) VALUES ($1, $2, 'Course', now(), now()) RETURNING id", [$jeton, 'course-'.$jeton]), 0, 0);
        $ville = (int) pg_fetch_result(pg_query_params($b, 'INSERT INTO geo_cities (geo_region_id, slug, name, created_at, updated_at) VALUES ($1, $2, $3, now(), now()) RETURNING id', [$region, 'ville-'.$jeton, 'Ville '.$jeton]), 0, 0);
        $agenceB = (int) pg_fetch_result(pg_query_params($b, 'INSERT INTO agencies (name, slug, properties_count, active_leases_count, reviews_count, created_at, updated_at) VALUES ($1, $1, 0, 0, 0, now(), now()) RETURNING id', ['b-'.$jeton]), 0, 0);
        $this->engage = ['region' => $region, 'city' => $ville, 'agency' => $agenceB];

        // A : une agence de l'annuaire de cette ville, avec de quoi payer.
        $agence = Agency::factory()->create(['status' => AgencyStatus::Active]);
        $bien = Property::factory()->published()->create(['agency_id' => $agence->id]);
        // Sans événements : le rattachement de l'adresse au référentiel écrirait la ligne de la ville
        // dans la transaction du test, et l'INSERT de B (qui la référence) l'attendrait jusqu'au bout.
        Address::withoutEvents(fn () => Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $bien->id, 'city' => 'Ville '.$jeton]));
        $ledger = app(CreditLedger::class);
        $ledger->grant($agence, CreditLotOrigin::AdminGrant, 500, now()->addDays(180));
        $acheteur = User::factory()->create();

        // B : sa propre place sur la ville, tenue une seconde avant le COMMIT.
        pg_query($b, 'BEGIN');
        pg_query_params($b, 'SELECT pg_advisory_xact_lock($1, $2)', [SpotlightPurchaseService::CITY_LOCK_CLASS, $ville]);
        pg_query_params($b, "INSERT INTO agency_spotlights (agency_id, geo_city_id, starts_at, ends_at, origin, price_credits, created_at, updated_at) VALUES ($1, $2, now() - interval '1 hour', now() + interval '30 days', 'purchased', 100, now(), now())", [$agenceB, $ville]);
        pg_send_query($b, 'SELECT pg_sleep(1); COMMIT');

        $debut = microtime(true);
        try {
            app(SpotlightPurchaseService::class)->purchase($agence, $ville, null, $acheteur);
            $this->fail('A a acheté une place que B venait de prendre : la ville n’est pas sérialisée.');
        } catch (ApiError $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame('credits.spotlight_taken', $e->errorCode);
        } finally {
            while (pg_get_result($b) !== false) {
                // vider les résultats de `pg_sleep` puis du COMMIT
            }
            pg_close($b);
        }

        $this->assertGreaterThan(0.5, microtime(true) - $debut, 'A n’a pas attendu la transaction de B.');
        $this->assertSame(500, $ledger->balance($agence));
        $this->assertFalse(CreditMovement::query()->where('agency_id', $agence->id)->where('type', 'spend')->exists());
        $this->assertSame(1, AgencySpotlight::query()->where('geo_city_id', $ville)->count());
    }

    /** @return Connection */
    private function secondeConnexion()
    {
        $cfg = DB::connection()->getConfig();
        $parts = array_filter([
            'host' => $cfg['host'] ?? '127.0.0.1',
            'port' => $cfg['port'] ?? '5432',
            'dbname' => $cfg['database'],
            'user' => $cfg['username'] ?? null,
            'password' => $cfg['password'] ?? null,
        ], fn ($v) => $v !== null && $v !== '');
        $dsn = implode(' ', array_map(fn (string $k, $v) => $k."='".addcslashes((string) $v, "'\\")."'", array_keys($parts), $parts));

        $connexion = pg_connect($dsn, PGSQL_CONNECT_FORCE_NEW);
        $this->assertNotFalse($connexion, 'seconde connexion PostgreSQL impossible');

        return $connexion;
    }
}

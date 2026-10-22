<?php

namespace Tests\Feature\Http;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\PlatformPayout;
use App\Models\User;
use App\Support\Query\DepartageQueryBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1296 (P118.02, P118.03) — une liste paginée de `buildQuery()` rend chaque ligne une fois,
 * même quand sa clé de tri se partage entre des lignes et que la vie des lignes a déplacé leur
 * ordre physique.
 */
class DepartageDesListesPagineesTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<int,int> les `id` lus sur toutes les pages, dans l'ordre */
    private function parcourir(string $url, int $pages): array
    {
        $ids = [];
        for ($page = 1; $page <= $pages; $page++) {
            $sep = str_contains($url, '?') ? '&' : '?';
            $reponse = $this->getJson("{$url}{$sep}page={$page}")->assertOk();
            array_push($ids, ...collect($reponse->json('data'))->pluck('id')->all());
        }

        return $ids;
    }

    private function facturesDeMemeSeconde(User $emetteur, int $nombre): void
    {
        Carbon::setTestNow('2026-10-22 10:00:00');
        $client = Customer::factory()->create();
        $factures = Invoice::factory()->count($nombre)->create([
            'customer_id' => $client->id,
            'issued_by_id' => $emetteur->id,
            'issue_date' => '2026-10-22',
        ]);
        // La vie normale des lignes : une mise à jour sur trois déplace leur position physique.
        $factures->each(function (Invoice $f, int $i) {
            if ($i % 3 === 0) {
                $f->update(['subtotal' => 1000 + $i]);
            }
        });
        Carbon::setTestNow();
    }

    public function test_le_tri_par_defaut_des_factures_rend_chaque_facture_une_fois(): void
    {
        $emetteur = User::factory()->create();
        $this->facturesDeMemeSeconde($emetteur, 150);
        Sanctum::actingAs($emetteur);

        $ids = $this->parcourir('/api/invoices?per_page=15', 10);

        $this->assertCount(150, $ids);
        $this->assertCount(150, array_unique($ids));
    }

    public function test_un_tri_demande_sur_une_colonne_partagee_rend_chaque_facture_une_fois(): void
    {
        $emetteur = User::factory()->create();
        $this->facturesDeMemeSeconde($emetteur, 150);
        Sanctum::actingAs($emetteur);

        $ids = $this->parcourir('/api/invoices?per_page=15&sort=issue_date', 10);

        $this->assertCount(150, array_unique($ids));
        // Le départage suit le sens du dernier tri : `issue_date` croissant, puis l'`id` croissant.
        $this->assertSame(collect($ids)->sort()->values()->all(), $ids);
    }

    public function test_les_reversements_d_une_meme_periode_sortent_chacun_une_fois(): void
    {
        $agences = Agency::factory()->count(60)->create();
        $reversements = $agences->map(fn (Agency $a) => PlatformPayout::factory()->create([
            'agency_id' => $a->id,
            'period_end' => '2026-09-30',
        ]));
        $reversements->each(function (PlatformPayout $p, int $i) {
            if ($i % 3 === 0) {
                $p->update(['net_amount' => 5000 + $i]);
            }
        });
        $this->actingAsRole('super_admin');

        $ids = $this->parcourir('/api/admin/payouts?per_page=20', 3);

        $this->assertCount(60, array_unique($ids));
        // `-period_end` : le départage suit le sens décroissant.
        $this->assertSame(collect($ids)->sortDesc()->values()->all(), $ids);
    }

    public function test_le_departage_ne_s_ajoute_ni_sans_tri_ni_sur_une_cle_deja_triee(): void
    {
        $sansTri = Invoice::buildQuery(Invoice::query(), Request::create('/'));
        $this->assertInstanceOf(DepartageQueryBuilder::class, $sansTri);
        $this->assertEmpty($sansTri->departager()->getQuery()->orders);

        $dejaTriee = Invoice::buildQuery(Invoice::query(), Request::create('/', 'GET', ['sort' => '-id']))
            ->departager();
        $this->assertCount(1, $dejaTriee->getQuery()->orders);

        $groupee = Invoice::buildQuery(Invoice::query()->select('status')->groupBy('status'), Request::create('/'))
            ->defaultSort('status')
            ->departager();
        $this->assertCount(1, $groupee->getQuery()->orders);
    }
}

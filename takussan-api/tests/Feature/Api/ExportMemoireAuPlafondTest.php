<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Export\ExportDataService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-1306 (piste P112.01) — l'export est rendu dans la requête, sous `memory_limit = 256M`
 * (`docker/php.ini:3`). Mesuré : un PDF de paiements passait à 250 lignes (112 Mo de surcroît) et
 * mourait à 400 (« Allowed memory size of 268435456 bytes exhausted »), avec un plafond à 2 000.
 *
 * La garde rend chaque format À SON PLAFOND et borne le surcroît de mémoire RÉELLEMENT ALLOUÉE
 * (`memory_get_peak_usage(true)`, ce que `memory_limit` compte) à la moitié des 256M, l'autre
 * moitié restant au worker. Mesuré sous TCK-1306 : 90 Mo pour 200 lignes, 176 Mo pour 400. Elle rougit si le plafond remonte au-delà de ce que le rendu
 * tient. Le plafond de mémoire du processus est posé à l'occupation courante plus deux fois la borne
 * pendant le rendu : un plafond qui remonte fait échouer l'assertion avant de tuer le processus,
 * sauf s'il remonte de beaucoup.
 */
class ExportMemoireAuPlafondTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const BORNE_OCTETS = 128 * 1024 * 1024;

    private Agency $agency;

    private Lease $lease;

    private Customer $tenant;

    private User $landlord;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->landlord = User::factory()->withOwnerProfile($this->agency)->create();
        $property = Property::factory()->create(['user_id' => $this->landlord->id, 'agency_id' => $this->agency->id]);
        $this->tenant = Customer::factory()->create(['agency_id' => $this->agency->id]);
        $this->lease = Lease::factory()->active()->create([
            'property_id' => $property->id,
            'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->tenant->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    public function test_le_pdf_des_paiements_au_plafond_tient_sous_la_borne_de_memoire(): void
    {
        $this->insererPaiements(ExportDataService::MAX_ROWS_PDF + 5);

        $surcroit = $this->surcroitDeMemoire('/api/export/payments?format=pdf');

        $this->assertLessThan(
            self::BORNE_OCTETS,
            $surcroit,
            sprintf('le PDF de %d lignes coûte %.1f Mo', ExportDataService::MAX_ROWS_PDF, $surcroit / 1048576),
        );
    }

    private function surcroitDeMemoire(string $url): int
    {
        $admin = $this->agencyAdmin($this->agency);
        $avant = ini_get('memory_limit');
        gc_collect_cycles();
        $base = memory_get_usage(true);
        // Relatif à l'occupation, jamais absolu : au milieu de la suite de CI (`memory_limit=4G`,
        // PCOV), le processus occupe déjà des centaines de Mo, et un plafond fixe de 512M y tuait
        // le processus avant toute assertion (« Premature end of PHP process »).
        ini_set('memory_limit', (string) ($base + 2 * self::BORNE_OCTETS));

        try {
            memory_reset_peak_usage();
            $reponse = $this->actingAsApi($admin)->get($url);
            $surcroit = memory_get_peak_usage(true) - $base;
        } finally {
            ini_set('memory_limit', (string) $avant);
        }

        $reponse->assertOk();

        return $surcroit;
    }

    private function insererPaiements(int $n): void
    {
        $now = now();
        foreach (array_chunk(range(1, $n), 1000) as $chunk) {
            DB::table('lease_payments')->insert(array_map(fn (int $i) => [
                'lease_id' => $this->lease->id,
                'payer_id' => $this->tenant->id,
                'reference_number' => sprintf('LPY-%06d', $i),
                'amount' => 150000,
                'currency' => 'XOF',
                'payment_method' => 'wave',
                'payment_type' => 'rent',
                'period_start' => $now->copy()->subMonths($i)->startOfMonth()->toDateString(),
                'period_end' => $now->copy()->subMonths($i)->endOfMonth()->toDateString(),
                'due_date' => $now->copy()->subDays($i)->toDateString(),
                'status' => 'pending',
                'created_at' => $now,
                'updated_at' => $now,
            ], $chunk));
        }
    }
}

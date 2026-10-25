<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\MaintenanceCategory;
use App\Models\LeasePayment;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedFaker;
use Database\Seeders\Support\SeedingConfig;
use Database\Seeders\Support\SeedTexts;
use Database\Seeders\YearOfActivitySeeder;
use Faker\Factory;
use Faker\Provider\Lorem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use ReflectionProperty;
use Tests\TestCase;

/**
 * TCK-2380 — le seed écrit en français de métier, et la même graine rejoue le même jeu.
 *
 * Mesuré le 2026-10-25 : messages, tâches, interventions et avis semés étaient en latin
 * (`faker()->sentence()`), et `random_int()`, `Str::random()` et `Collection::random()` — hors de
 * la graine de Faker — rendaient un jeu différent à chaque seed.
 */
class SeedingTextAndDeterminismTest extends TestCase
{
    use RefreshDatabase;

    /** Colonnes de texte semé que l'interface affiche. */
    private const TEXTES = [
        'messages' => 'content',
        'tasks' => 'title',
        'maintenance_requests' => 'title',
        'reviews' => 'content',
        'customer_notes' => 'body',
        'conversations' => 'subject',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        CarbonImmutable::setTestNow('2026-10-25 12:00:00');
        $this->travelTo(CarbonImmutable::now());
        config(['scout.driver' => null]);
    }

    public function test_aucun_texte_seme_n_est_du_lorem_ipsum(): void
    {
        $this->semer(2026);

        $lorem = array_flip((new ReflectionProperty(Lorem::class, 'wordList'))->getValue());
        $textes = 0;

        foreach (self::TEXTES as $table => $colonne) {
            foreach (DB::table($table)->whereNotNull($colonne)->pluck($colonne) as $texte) {
                $textes++;
                $mots = preg_split('/[^\p{L}]+/u', mb_strtolower($texte), -1, PREG_SPLIT_NO_EMPTY);
                $latins = array_filter($mots, fn (string $mot) => isset($lorem[$mot]));

                // « et », « est », « a » existent dans les deux langues : c'est la PART qui signe le lorem.
                $this->assertFalse(
                    count($latins) >= 3 && count($latins) * 2 >= count($mots),
                    "{$table}.{$colonne} contient du lorem ipsum : « {$texte} »",
                );
            }
        }

        $this->assertGreaterThan(50, $textes, 'Trop peu de textes semés pour que la mesure dise quelque chose.');
    }

    public function test_chaque_categorie_d_intervention_a_sa_propre_banque_de_textes(): void
    {
        $textes = new SeedTexts(SeedFaker::create('fr_FR'));
        $titresParCategorie = [];
        foreach (MaintenanceCategory::cases() as $categorie) {
            for ($i = 0; $i < 60; $i++) {
                $titresParCategorie[$categorie->value][$textes->intervention($categorie)[0]] = true;
            }
        }

        foreach ($titresParCategorie as $a => $titresA) {
            foreach ($titresParCategorie as $b => $titresB) {
                if ($a < $b) {
                    $this->assertSame([], array_keys(array_intersect_key($titresA, $titresB)), "{$a} et {$b} partagent des titres.");
                }
            }
        }
    }

    public function test_la_meme_graine_rejoue_le_meme_jeu_et_une_autre_graine_un_autre(): void
    {
        $premier = $this->empreinteDUnSeed(2026);
        $second = $this->empreinteDUnSeed(2026);
        $autre = $this->empreinteDUnSeed(4242);

        $this->assertSame($premier, $second, 'Deux seeds de même graine ont produit deux jeux différents.');
        $this->assertNotSame($premier, $autre, 'La graine ne gouverne pas les tirages.');
    }

    public function test_les_loyers_passent_par_plusieurs_moyens_de_paiement(): void
    {
        $this->semer(2026);

        // Les LOYERS : les cautions ont leurs propres moyens, et les compter ensemble laissait vert un
        // seed où tous les loyers passaient par Wave (vérifié par ablation).
        $this->assertGreaterThanOrEqual(3, LeasePayment::query()->where('payment_type', LeasePaymentType::Rent)->distinct()->count('payment_method'));
    }

    /** Sème dans une transaction annulée ensuite : chaque seed part d'une base vide. */
    /** @return array<string, string> empreinte par table : la divergence se lit sur la table fautive */
    private function empreinteDUnSeed(int $graine): array
    {
        // Un Faker ORPHELIN, comme en laisse un test voisin : son `__destruct()` ré-initialise
        // `mt_srand()` le jour où le ramasse-miettes le libère — en plein seed si rien ne l'en empêche.
        $orphelin = Factory::create();
        unset($orphelin);

        DB::beginTransaction();
        try {
            $this->semer($graine);

            // Ni identifiant ni horodatage d'écriture : les séquences ne reculent pas au ROLLBACK.
            return array_map(fn ($lignes) => md5(json_encode($lignes)), [
                'properties' => DB::table('properties')->orderBy('reference_number')->get(['reference_number', 'title', 'price', 'status', 'created_at']),
                'customers' => DB::table('customers')->orderBy('email')->get(['first_name', 'last_name', 'email', 'pipeline_stage']),
                'leases' => DB::table('leases')->orderBy('reference_number')->get(['reference_number', 'monthly_rent', 'start_date', 'status']),
                'lease_payments' => DB::table('lease_payments')->orderBy('reference_number')->get(['reference_number', 'amount', 'status', 'payment_method', 'due_date']),
                'messages' => DB::table('messages')->orderBy('created_at')->orderBy('content')->get(['content', 'created_at']),
                'maintenance_requests' => DB::table('maintenance_requests')->orderBy('created_at')->get(['title', 'category', 'status', 'created_at']),
            ]);
        } finally {
            DB::rollBack();
        }
    }

    private function semer(int $graine): void
    {
        app()->instance(SeedingConfig::class, new SeedingConfig(
            agencies: 1,
            propertiesPerAgency: 15,
            customersPerAgency: 10,
            bookingsPerAgency: 8,
            leasesPerAgency: 6,
            maintenanceRequestsPerAgency: 4,
            conversationsPerAgency: 4,
            documentsPerAgency: 2,
            includeDemoUsers: false,
            graine: $graine,
        ));

        $this->seed(YearOfActivitySeeder::class);
    }
}

<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Services\Crm\CustomerDuplicateDetector;
use App\Services\Model\CustomerService;
use App\Support\AdvisoryLock;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2054 (P158.02, ADR-0073) — la détection d'un doublon de client et la création de la fiche se
 * font dans une même transaction, sous un verrou consultatif de clé `(agence, téléphone canonique)`
 * ou `(agence, e-mail replié)`. Avant : `store` et `findOrCreateFromUser` détectaient puis créaient
 * sans transaction ni verrou, et `convert` ne verrouillait que la demande — deux créations
 * simultanées passaient toutes deux le détecteur.
 *
 * La course entre deux processus ne se rejoue pas dans un test (une connexion, dans la transaction
 * de `RefreshDatabase`) : le test établit l'ORDRE des instructions — verrou avant la détection et
 * avant l'insertion — et la transaction propre au chemin (niveau 2 sous `RefreshDatabase`).
 */
class CreationFicheSousVerrouTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites, RefreshDatabase;

    /** @var list<array{sql: string, bindings: array<int, mixed>}> */
    private array $queries = [];

    private ?int $transactionLevelAtInsert = null;

    private function ecouter(): void
    {
        $this->queries = [];
        DB::listen(function (QueryExecuted $q): void {
            $this->queries[] = ['sql' => $q->sql, 'bindings' => $q->bindings];
        });
        Customer::creating(function (): void {
            $this->transactionLevelAtInsert = DB::transactionLevel();
        });
    }

    private function rang(callable $match): ?int
    {
        foreach ($this->queries as $i => $q) {
            if ($match($q)) {
                return $i;
            }
        }

        return null;
    }

    private function rangDuVerrou(int $key): ?int
    {
        return $this->rang(fn ($q) => str_contains($q['sql'], 'pg_advisory_xact_lock') && (int) ($q['bindings'][0] ?? 0) === $key);
    }

    private function rangDeLaDetection(): ?int
    {
        return $this->rang(fn ($q) => str_starts_with($q['sql'], 'select') && str_contains($q['sql'], 'from "customers"'));
    }

    private function rangDeLInsertion(): ?int
    {
        return $this->rang(fn ($q) => str_starts_with($q['sql'], 'insert into "customers"'));
    }

    private function agent(Agency $agency): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, 'agent', $agency);

        return $user;
    }

    public function test_la_cle_est_un_entier_de_64_bits_stable_qui_suit_la_normalisation_du_detecteur(): void
    {
        $key = AdvisoryLock::key('crm.customer', '7', 'tel', '+221771234567');
        $expected = unpack('J', substr(hash('sha256', 'crm.customer:7:tel:+221771234567', true), 0, 8))[1];
        $this->assertSame($expected, $key);
        $this->assertNotSame($key, AdvisoryLock::key('crm.customer', '8', 'tel', '+221771234567'));
        $this->assertGreaterThan(2 ** 32, abs($key), 'La clé ne tient pas sur 32 bits : 64 bits, pas crc32.');

        $this->assertSame(['7', 'tel', '+221771234567'], CustomerDuplicateDetector::lockParts(7, '77 123 45 67', 'Awa@Example.test'));
        $this->assertSame(['7', 'email', 'awa@example.test'], CustomerDuplicateDetector::lockParts(7, null, ' AWA@example.test '));
        $this->assertNull(CustomerDuplicateDetector::lockParts(null, '771234567', null));
        $this->assertNull(CustomerDuplicateDetector::lockParts(7, ' ', ''));
    }

    public function test_store_verrouille_avant_la_detection_et_l_insertion_dans_sa_transaction(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->agent($agency);
        $key = AdvisoryLock::key('crm.customer', (string) $agency->id, 'tel', '+221771234567');
        $this->ecouter();

        $this->actingAsApi($agent)->apiPost('/api/customers', [
            'first_name' => 'Awa', 'last_name' => 'Diop', 'phone' => '77 123 45 67',
        ])->assertCreated();

        $verrou = $this->rangDuVerrou($key);
        $this->assertNotNull($verrou, 'Aucun verrou consultatif de la clé (agence, téléphone canonique).');
        $this->assertLessThan($this->rangDeLaDetection(), $verrou, 'Le verrou vient après la détection.');
        $this->assertLessThan($this->rangDeLInsertion(), $verrou);
        $this->assertSame(2, $this->transactionLevelAtInsert, 'La création n\'est pas dans la transaction du chemin.');
    }

    public function test_store_prend_le_verrou_aussi_sous_allow_duplicate_et_sur_l_email_sans_telephone(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->agent($agency);
        $key = AdvisoryLock::key('crm.customer', (string) $agency->id, 'email', 'awa@example.test');
        $this->ecouter();

        $this->actingAsApi($agent)->apiPost('/api/customers', [
            'first_name' => 'Awa', 'last_name' => 'Diop', 'email' => 'AWA@example.test', 'allow_duplicate' => true,
        ])->assertCreated();

        $verrou = $this->rangDuVerrou($key);
        $this->assertNotNull($verrou, 'allow_duplicate saute la sonde, pas le verrou.');
        $this->assertLessThan($this->rangDeLInsertion(), $verrou);
        $this->assertSame(2, $this->transactionLevelAtInsert);
    }

    public function test_convert_verrouille_apres_la_demande_avant_la_detection_et_la_creation(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe($x)->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id,
            'name' => 'Awa Diop', 'email' => 'awa@example.com', 'phone' => '+221771234567',
        ]);
        $key = AdvisoryLock::key('crm.customer', (string) $x->id, 'tel', '+221771234567');
        Sanctum::actingAs($agent);
        $this->ecouter();

        $this->postJson("/api/contact-leads/{$lead->id}/convert")->assertCreated();

        $verrou = $this->rangDuVerrou($key);
        $demande = $this->rang(fn ($q) => str_contains($q['sql'], 'from "property_contact_leads"') && str_contains($q['sql'], 'for update'));
        $this->assertNotNull($verrou, 'Aucun verrou consultatif dans la conversion.');
        $this->assertLessThan($verrou, $demande, 'Le verrou consultatif se prend après la ligne de la demande.');
        $this->assertLessThan($this->rangDeLaDetection(), $verrou);
        $this->assertLessThan($this->rangDeLInsertion(), $verrou);
    }

    public function test_find_or_create_from_user_verrouille_le_compte_relit_puis_verrouille_la_cle(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->withOwnerProfile($agency)->create(['phone' => '+221771234567', 'email' => 'awa@example.test']);
        $agencyId = (int) $user->agency_id;
        $this->assertSame($agency->id, $agencyId);
        $key = AdvisoryLock::key('crm.customer', (string) $agencyId, 'tel', '+221771234567');
        $this->ecouter();

        $customer = app(CustomerService::class)->findOrCreateFromUser($user);

        $this->assertSame($user->id, $customer->user_id);
        $compte = $this->rang(fn ($q) => str_contains($q['sql'], 'from "users"') && str_contains($q['sql'], 'for update'));
        $relecture = $this->rang(fn ($q) => str_contains($q['sql'], 'from "customers"') && str_contains($q['sql'], '"user_id" = ?'));
        $verrou = $this->rangDuVerrou($key);
        $this->assertNotNull($compte, 'La ligne users du compte n\'est pas verrouillée.');
        $this->assertNotNull($verrou, 'Aucun verrou consultatif pour un compte qui a une agence.');
        $this->assertLessThan($relecture, $compte, 'La recherche par user_id doit se refaire sous le verrou du compte.');
        $this->assertLessThan($verrou, $compte);
        $this->assertLessThan($this->rangDeLInsertion(), $verrou);
        $this->assertSame(2, $this->transactionLevelAtInsert);
    }

    public function test_find_or_create_from_user_rend_la_fiche_existante_sans_en_creer(): void
    {
        $user = User::factory()->create();
        $existing = Customer::factory()->create(['user_id' => $user->id]);

        $this->assertTrue(app(CustomerService::class)->findOrCreateFromUser($user)->is($existing));
        $this->assertSame(1, Customer::query()->where('user_id', $user->id)->count());
    }

    public function test_hors_transaction_le_verrou_leve(): void
    {
        DB::rollBack();
        try {
            $this->assertSame(0, DB::transactionLevel());
            $this->expectException(\LogicException::class);
            AdvisoryLock::acquire('crm.customer', '1', 'tel', '+221771234567');
        } finally {
            DB::beginTransaction();
        }
    }
}

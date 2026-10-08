<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-591 AC19 — la note épinglée d'un passage en « perdu » / « converti » porte sa nature
 * (`kind`) et le seul motif ; la migration reprend les notes préfixées, et son `down()` les rend
 * à l'identique.
 */
class CustomerNoteKindTest extends ApiTestCase
{
    use RefreshDatabase;

    private User $agent;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $agency = Agency::factory()->create();
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $agency);
        $this->customer = Customer::factory()->create([
            'agency_id' => $agency->id,
            'added_by_id' => $this->agent->id,
            'pipeline_stage' => CustomerPipelineStage::Qualified,
        ]);
    }

    public function test_losing_by_the_pipeline_stage_endpoint_writes_kind_loss_and_the_bare_reason(): void
    {
        $this->actingAsApi($this->agent)
            ->apiPatch("/api/customers/{$this->customer->id}/pipeline-stage", ['pipeline_stage' => 'lost', 'reason' => 'Budget'])
            ->assertOk();

        $note = DB::table('customer_notes')->where('customer_id', $this->customer->id)->sole();
        $this->assertSame('loss', $note->kind);
        $this->assertSame('Budget', $note->body);
        $this->assertTrue((bool) $note->pinned);

        $this->actingAsApi($this->agent)->apiGet("/api/customers/{$this->customer->id}/notes")
            ->assertOk()
            ->assertJsonPath('data.0.kind', 'loss')
            ->assertJsonPath('data.0.body', 'Budget');
    }

    public function test_converting_by_update_writes_kind_conversion(): void
    {
        $this->actingAsApi($this->agent)
            ->apiPut("/api/customers/{$this->customer->id}", ['pipeline_stage' => 'converted', 'reason' => 'Bail signé'])
            ->assertOk();

        $note = DB::table('customer_notes')->where('customer_id', $this->customer->id)->sole();
        $this->assertSame('conversion', $note->kind);
        $this->assertSame('Bail signé', $note->body);
    }

    public function test_the_migration_converts_prefixed_notes_and_its_down_restores_them(): void
    {
        $migration = require database_path('migrations/2026_10_07_591300_add_kind_to_customer_notes_table.php');

        $migration->down();
        $rows = [
            'Perte : Budget' => ['loss', 'Budget'],
            'Conversion : Bail signé' => ['conversion', 'Bail signé'],
            'Rappeler lundi' => [null, 'Rappeler lundi'],
            'Perte de temps : à relancer' => [null, 'Perte de temps : à relancer'],
        ];
        foreach (array_keys($rows) as $body) {
            DB::table('customer_notes')->insert([
                'customer_id' => $this->customer->id,
                'body' => $body,
                'pinned' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $migration->up();
        foreach ($rows as $original => [$kind, $body]) {
            $this->assertSame(1, DB::table('customer_notes')->where('kind', $kind)->where('body', $body)->count(), $original);
        }

        $migration->down();
        $this->assertEqualsCanonicalizing(
            array_keys($rows),
            DB::table('customer_notes')->pluck('body')->all(),
        );

        $migration->up();
    }

    public function test_no_french_prefix_is_left_in_the_application_code(): void
    {
        $hits = [];
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(app_path()));
        foreach ($iterator as $file) {
            if ($file->isFile() && str_ends_with($file->getFilename(), '.php')) {
                $content = (string) file_get_contents($file->getPathname());
                if (str_contains($content, "'Perte : '") || str_contains($content, "'Conversion : '")) {
                    $hits[] = $file->getPathname();
                }
            }
        }

        $this->assertSame([], $hits);
    }
}

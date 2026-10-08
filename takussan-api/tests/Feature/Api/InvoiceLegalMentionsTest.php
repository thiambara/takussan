<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsInvoices;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC14) — les mentions légales et la TVA par défaut de l'agence.
 */
class InvoiceLegalMentionsTest extends TestCase
{
    use BuildsInvoices;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private function html(Agency $agency, $invoice): string
    {
        return view('pdf.invoices.default', [
            'invoice' => $invoice->fresh(), 'customer' => $invoice->customer, 'agency' => $agency->fresh(),
        ])->render();
    }

    public function test_ac14_the_ninea_is_printed_when_present_and_no_empty_label_otherwise(): void
    {
        [$agency, , $customer] = $this->invoicingAgency(['ninea' => '0012345 2G3', 'rccm' => 'SN-DKR-2020-B-1']);
        $this->assertStringContainsString('0012345 2G3', $this->html($agency, $this->draftOf($agency, $customer)));

        [$bare, , $other] = $this->invoicingAgency();
        $html = $this->html($bare, $this->draftOf($bare, $other));
        $this->assertStringNotContainsString('NINEA', $html);
        $this->assertStringNotContainsString('RCCM', $html);
    }

    public function test_ac14_the_default_tax_rate_applies_unless_an_explicit_rate_is_sent(): void
    {
        [$agency, $admin, $customer] = $this->invoicingAgency(['default_tax_rate' => 18]);
        Sanctum::actingAs($admin);
        $body = ['customer_id' => $customer->id, 'issue_date' => '2026-10-07', 'subtotal' => 100_000];

        $this->postJson('/api/invoices', $body)->assertCreated()->assertJsonPath('data.tax_amount', 18000);
        $this->postJson('/api/invoices', $body + ['tax_rate' => 0])->assertCreated()->assertJsonPath('data.tax_amount', 0);
    }

    public function test_ac14_the_migration_copies_legal_info_into_columns_never_rib_pro(): void
    {
        $agency = Agency::factory()->create(['metadata' => ['legal_info' => [
            'ninea' => '0012345 2G3', 'rc' => 'SN-DKR-1', 'company_legal_name' => 'SARL Teranga',
            'address_fiscale' => 'Dakar Plateau', 'rib_pro' => 'SN08 SN0100 1520 0000 9999 99',
        ]]]);
        DB::table('agencies')->where('id', $agency->id)->update(['ninea' => null, 'rccm' => null, 'legal_name' => null, 'legal_address' => null]);

        (require database_path('migrations/2026_10_07_200500_add_payout_settings_and_legal_columns_to_agencies_table.php'))->backfill();

        $row = (array) DB::table('agencies')->where('id', $agency->id)->first();
        $this->assertSame('0012345 2G3', $row['ninea']);
        $this->assertSame('SN-DKR-1', $row['rccm']);
        $this->assertSame('SARL Teranga', $row['legal_name']);
        $this->assertSame('Dakar Plateau', $row['legal_address']);
        unset($row['metadata']);
        foreach ($row as $column => $value) {
            $this->assertStringNotContainsString('SN0100', (string) $value, "rib_pro recopié dans agencies.{$column}");
        }
    }

    public function test_ac14_legal_fields_are_prohibited_on_an_individual_agency_and_unchecked_in_form_on_a_standard_one(): void
    {
        $host = Agency::factory()->individual()->create();
        Sanctum::actingAs($this->agencyAdmin($host));
        $this->patchJson("/api/agencies/{$host->id}", ['ninea' => '0012345 2G3'])
            ->assertStatus(422)->assertJsonValidationErrors(['ninea']);

        $standard = Agency::factory()->create();
        Sanctum::actingAs($this->agencyAdmin($standard));
        $this->patchJson("/api/agencies/{$standard->id}", ['ninea' => 'ABC', 'default_tax_rate' => 18])
            ->assertOk()
            ->assertJsonPath('data.ninea', 'ABC')
            ->assertJsonPath('data.default_tax_rate', 18);
    }
}

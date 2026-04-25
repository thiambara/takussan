<?php

namespace Tests\Feature\Services;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\View;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-084 — verify the PDF Blade templates render correctly for each
 * supported currency (AC8 — invoice PDF for an EUR agency uses `€` and a
 * comma decimal separator).
 *
 * The dompdf driver compresses the page stream, so we compare against the
 * pre-compile HTML output (`View::make(...)->render()`) instead of grepping
 * the binary. That keeps the assertion robust without losing fidelity —
 * dompdf just typesets what we hand it.
 */
class CurrencyPdfRegressionTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, array{Currency, array<int, string>, array<int, string>}>
     */
    public static function currencyCases(): array
    {
        return [
            'XOF' => [Currency::XOF, ['F CFA'], ['€', '$']],
            'EUR' => [Currency::EUR, ['€', ','], ['F CFA']],
            'USD' => [Currency::USD, ['$', '.'], ['F CFA', '€']],
        ];
    }

    /**
     * @param  array<int, string>  $expected
     * @param  array<int, string>  $forbidden
     */
    #[DataProvider('currencyCases')]
    public function test_invoice_template_renders_with_currency_symbols(Currency $currency, array $expected, array $forbidden): void
    {
        $agency = Agency::factory()->create(['currency' => $currency]);
        $customerUser = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $invoice = Invoice::factory()->create([
            'customer_id' => $customer->id,
            'agency_id' => $agency->id,
            'currency' => $currency,
            'subtotal' => 150_000,
            'tax_amount' => 0,
            'total_amount' => 150_000,
        ]);

        $html = View::make('pdf.invoices.default', [
            'invoice' => $invoice,
            'customer' => $customer,
            'agency' => $agency,
            'title' => 'Facture',
            'document_label' => 'Facture',
            'generated_at' => now(),
            'footer_note' => 'Test',
        ])->render();

        foreach ($expected as $needle) {
            $this->assertStringContainsString(
                $needle,
                $html,
                "Invoice for {$currency->value} must contain `{$needle}`",
            );
        }
        foreach ($forbidden as $needle) {
            $this->assertStringNotContainsString(
                $needle,
                $html,
                "Invoice for {$currency->value} must NOT contain `{$needle}`",
            );
        }
    }

    /**
     * @param  array<int, string>  $expected
     * @param  array<int, string>  $forbidden
     */
    #[DataProvider('currencyCases')]
    public function test_receipt_template_renders_with_currency_symbols(Currency $currency, array $expected, array $forbidden): void
    {
        $agency = Agency::factory()->create(['currency' => $currency]);
        $landlord = User::factory()->create();
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'tenant_id' => $tenant->id,
            'property_id' => $property->id,
            'agency_id' => $agency->id,
            'currency' => $currency,
        ]);
        $payment = LeasePayment::factory()->paid()->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
            'currency' => $currency,
            'amount' => 250_000,
        ]);

        $html = View::make('pdf.receipts.rent', [
            'lease' => $lease,
            'payment' => $payment,
            'tenant' => $tenant,
            'property' => $property,
            'agency' => $agency,
            'title' => 'Quittance',
            'document_label' => 'Quittance',
            'generated_at' => now(),
            'footer_note' => 'Test',
        ])->render();

        foreach ($expected as $needle) {
            $this->assertStringContainsString($needle, $html);
        }
        foreach ($forbidden as $needle) {
            $this->assertStringNotContainsString($needle, $html);
        }
    }

    /**
     * @param  array<int, string>  $expected
     * @param  array<int, string>  $forbidden
     */
    #[DataProvider('currencyCases')]
    public function test_lease_contract_template_renders_with_currency_symbols(Currency $currency, array $expected, array $forbidden): void
    {
        $agency = Agency::factory()->create(['currency' => $currency]);
        $landlord = User::factory()->create();
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'tenant_id' => $tenant->id,
            'property_id' => $property->id,
            'agency_id' => $agency->id,
            'currency' => $currency,
            'monthly_rent' => 500_000,
            'deposit_amount' => 1_000_000,
        ]);

        $html = View::make('pdf.leases.contract', [
            'lease' => $lease,
            'landlord' => $landlord,
            'tenant' => $tenant,
            'property' => $property,
            'agency' => $agency,
            'guarantors' => collect(),
            'title' => 'Bail',
            'document_label' => 'Bail',
            'generated_at' => now(),
            'footer_note' => 'Test',
        ])->render();

        foreach ($expected as $needle) {
            $this->assertStringContainsString($needle, $html);
        }
        foreach ($forbidden as $needle) {
            $this->assertStringNotContainsString($needle, $html);
        }
    }

    public function test_pdf_service_renders_real_pdf_for_eur_agency(): void
    {
        $agency = Agency::factory()->create(['currency' => Currency::EUR]);
        $customerUser = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $invoice = Invoice::factory()->create([
            'customer_id' => $customer->id,
            'agency_id' => $agency->id,
            'currency' => Currency::EUR,
            'subtotal' => 1_500.5,
            'tax_amount' => 0,
            'total_amount' => 1_500.5,
        ]);

        /** @var DocumentPdfService $service */
        $service = $this->app->make(DocumentPdfService::class);

        $bytes = $service->render('pdf.invoices.default', [
            'invoice' => $invoice,
            'customer' => $customer,
            'agency' => $agency,
            'title' => 'Facture',
            'document_label' => 'Facture',
        ]);

        $this->assertTrue(str_starts_with($bytes, '%PDF-'));
        $this->assertGreaterThan(1000, strlen($bytes));
    }
}

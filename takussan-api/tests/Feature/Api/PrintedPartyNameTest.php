<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2718 — une partie sans nom ne laisse plus de case vide. Depuis TCK-2605, un compte ouvert par
 * e-mail naît sans prénom, comme celui ouvert par téléphone, et la fiche qui en naît aussi : le
 * contrat et la quittance imprimaient `trim(first_name.' '.last_name)`, soit une case vide. Le nom
 * imprimé est le prénom et le nom ; à défaut l'e-mail ; à défaut le téléphone ; à défaut « — ».
 *
 * Le texte se lit dans le vrai gabarit, rendu en HTML par la vraie route.
 */
class PrintedPartyNameTest extends TestCase
{
    use RefreshDatabase;

    private User $landlord;

    protected function setUp(): void
    {
        parent::setUp();

        $this->partialMock(DocumentPdfService::class, function ($mock) {
            $mock->shouldReceive('render')->andReturnUsing(
                fn (string $template, array $data) => view($template, $data)->render()
            );
        });
        $this->landlord = User::factory()->create();
    }

    /** @param  array<string, mixed>  $tenant */
    private function bail(array $tenant): Lease
    {
        return Lease::factory()->create([
            'landlord_id' => $this->landlord->id,
            'property_id' => Property::factory()->create(['user_id' => $this->landlord->id])->id,
            'tenant_id' => Customer::factory()->create($tenant)->id,
        ]);
    }

    private function contrat(Lease $lease): string
    {
        Sanctum::actingAs($this->landlord);

        return (string) $this->get("/api/leases/{$lease->id}/contract/pdf")->assertOk()->getContent();
    }

    private function quittance(Lease $lease, LeasePayment $payment): string
    {
        Sanctum::actingAs($this->landlord);

        return (string) $this->get("/api/leases/{$lease->id}/receipts/{$payment->id}/pdf")->assertOk()->getContent();
    }

    /** Le premier texte de la case qui suit l'en-tête `$th` : ce que la ligne nomme, avant ses détails. */
    private function caseApres(string $html, string $th): string
    {
        $this->assertSame(1, preg_match('~<th>'.preg_quote($th, '~').'</th>\s*<td>\s*(.*?)\s*(?:<div|</td>)~s', $html, $m), "Pas de ligne « {$th} ».");

        return html_entity_decode(trim($m[1]));
    }

    private function sansNom(array $extra): array
    {
        return ['first_name' => '', 'last_name' => ''] + $extra;
    }

    /** AC1 */
    public function test_le_contrat_nomme_le_locataire_sans_nom_par_son_email_puis_son_telephone_puis_un_tiret(): void
    {
        $this->assertSame('a@x.sn', $this->caseApres($this->contrat($this->bail($this->sansNom(['email' => 'a@x.sn']))), 'Locataire'));
        $this->assertSame('+221771234567', $this->caseApres(
            $this->contrat($this->bail($this->sansNom(['email' => null, 'phone' => '+221771234567']))), 'Locataire',
        ));
        $this->assertSame('—', $this->caseApres($this->contrat($this->bail($this->sansNom(['email' => null, 'phone' => null]))), 'Locataire'));
    }

    /** AC1 — le garant sans nom, même repli. */
    public function test_le_contrat_nomme_le_garant_sans_nom(): void
    {
        $lease = $this->bail(['first_name' => 'Awa', 'last_name' => 'Ndiaye']);
        $lease->guarantors()->attach(Guarantor::factory()->create($this->sansNom(['email' => null, 'phone' => '+221770000001']))->id, ['role' => 'guarantor']);

        $html = $this->contrat($lease);

        $this->assertSame(1, preg_match('~<tbody>\s*<tr>\s*<td>(.*?)</td>~s', $html, $m));
        $this->assertSame('+221770000001', trim($m[1]));
    }

    /** AC2 — la quittance, identité figée au règlement comprise. */
    public function test_la_quittance_nomme_le_locataire_sans_nom_par_son_identite_figee(): void
    {
        $lease = $this->bail($this->sansNom(['email' => 'a@x.sn']));
        $payment = LeasePayment::factory()->paid()->create(['lease_id' => $lease->id, 'payer_id' => $lease->tenant_id]);
        $this->assertSame('a@x.sn', $this->caseApres($this->quittance($lease, $payment), 'Nom'));

        // Sans e-mail : le téléphone du jour du règlement, pas celui d'aujourd'hui.
        $lease = $this->bail($this->sansNom(['email' => null, 'phone' => '+221771234567']));
        $payment = LeasePayment::factory()->paid()->create(['lease_id' => $lease->id, 'payer_id' => $lease->tenant_id]);
        $lease->tenant->forceFill(['phone' => '+221779999999'])->save();
        $this->assertSame('+221771234567', $this->caseApres($this->quittance($lease->fresh(), $payment), 'Nom'));
    }

    /** AC3 — un nom présent s'imprime comme avant. */
    public function test_un_locataire_nomme_est_imprime_par_son_nom(): void
    {
        $lease = $this->bail(['first_name' => 'Awa', 'last_name' => 'Ndiaye', 'email' => 'awa@x.sn']);
        $payment = LeasePayment::factory()->paid()->create(['lease_id' => $lease->id, 'payer_id' => $lease->tenant_id]);

        $this->assertSame('Awa Ndiaye', $this->caseApres($this->contrat($lease), 'Locataire'));
        $this->assertSame('Awa Ndiaye', $this->caseApres($this->quittance($lease, $payment), 'Nom'));
    }
}

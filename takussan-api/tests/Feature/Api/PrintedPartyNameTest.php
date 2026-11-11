<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Guarantor;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Pdf\DocumentPdfService;
use App\Services\Pdf\PrintedIdentity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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

    // ─── Contre-vérification de TCK-2718 : ni doublon, ni téléphone figé là où rien ne le lit ───

    /** Le repli n'imprime pas deux fois la même coordonnée : en nom, puis en ligne de détail. */
    public function test_le_repli_ne_repete_pas_sa_coordonnee_en_ligne_de_detail(): void
    {
        $lease = $this->bail($this->sansNom(['email' => 'a@x.sn']));
        $lease->guarantors()->attach(Guarantor::factory()->create($this->sansNom(['email' => 'g@x.sn', 'phone' => '+221770000002']))->id, ['role' => 'guarantor']);
        $lease->guarantors()->attach(Guarantor::factory()->create($this->sansNom(['email' => null, 'phone' => '+221770000003']))->id, ['role' => 'guarantor']);
        $payment = LeasePayment::factory()->paid()->create(['lease_id' => $lease->id, 'payer_id' => $lease->tenant_id]);

        $contrat = $this->contrat($lease);
        $this->assertSame(1, substr_count($contrat, 'a@x.sn'), 'locataire');
        $this->assertSame(1, substr_count($contrat, 'g@x.sn'), 'garant, e-mail en nom');
        $this->assertSame(1, substr_count($contrat, '+221770000002'), 'garant, téléphone en contact');
        $this->assertSame(1, substr_count($contrat, '+221770000003'), 'garant, téléphone en nom');

        $quittance = $this->quittance($lease, $payment);
        $this->assertSame(1, substr_count($quittance, 'a@x.sn'));
        $this->assertStringNotContainsString('<th>Email</th>', $quittance);
    }

    /** Un nom présent garde sa ligne de détail. */
    public function test_un_nom_present_garde_sa_ligne_de_detail(): void
    {
        $lease = $this->bail(['first_name' => 'Awa', 'last_name' => 'Ndiaye', 'email' => 'awa@x.sn']);
        $lease->guarantors()->attach(Guarantor::factory()->create(['first_name' => 'Moussa', 'last_name' => 'Fall', 'email' => 'm@x.sn', 'phone' => '+221770000004'])->id, ['role' => 'guarantor']);
        $payment = LeasePayment::factory()->paid()->create(['lease_id' => $lease->id, 'payer_id' => $lease->tenant_id]);

        $contrat = $this->contrat($lease);
        $this->assertStringContainsString('<div class="muted">awa@x.sn</div>', $contrat);
        $this->assertStringContainsString('m@x.sn<br>+221770000004', $contrat);

        $quittance = $this->quittance($lease, $payment);
        $this->assertStringContainsString('<th>Email</th>', $quittance);
        $this->assertSame(1, substr_count($quittance, 'awa@x.sn'));
    }

    /**
     * Minimisation : seul le gabarit de la quittance de loyer lit le téléphone ; seul son instantané
     * le fige. L'état des lieux et le reçu de réservation ne figent que le nom et l'e-mail.
     */
    public function test_seule_la_quittance_de_loyer_fige_le_telephone(): void
    {
        $tenantUser = User::factory()->create();
        $lease = $this->bail(['user_id' => $tenantUser->id, 'first_name' => 'Awa', 'last_name' => 'Ndiaye', 'phone' => '+221770000005']);
        $this->landlord->forceFill(['phone' => '+221770000006'])->save();

        $quittance = LeasePayment::factory()->paid()->create(['lease_id' => $lease->id, 'payer_id' => $lease->tenant_id]);
        $this->assertSame('+221770000005', $quittance->fresh()->metadata[PrintedIdentity::KEY]['tenant']['phone'] ?? null);

        $booking = Booking::factory()->create(['customer_id' => $lease->tenant_id, 'property_id' => $lease->property_id]);
        $recu = BookingPayment::factory()->paid()->create(['booking_id' => $booking->id]);
        $this->assertArrayNotHasKey('phone', $recu->fresh()->metadata[PrintedIdentity::KEY]['customer']);

        $inventory = Inventory::factory()->pendingSignature()->create([
            'lease_id' => $lease->id, 'property_id' => $lease->property_id, 'tenant_id' => $lease->tenant_id, 'conducted_by' => $this->landlord->id,
        ]);
        $signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';
        Sanctum::actingAs($this->landlord);
        $this->postJson("/api/inventories/{$inventory->id}/sign", ['role' => 'landlord', 'signature' => $signature])->assertOk();
        Sanctum::actingAs($tenantUser);
        $this->postJson("/api/inventories/{$inventory->id}/sign", ['role' => 'tenant', 'signature' => $signature])->assertOk();

        $instantane = $inventory->fresh()->metadata[PrintedIdentity::KEY];
        $this->assertSame('Ndiaye', $instantane['tenant']['last_name']);
        $this->assertArrayNotHasKey('phone', $instantane['tenant']);
        $this->assertArrayNotHasKey('phone', $instantane['landlord']);
    }

    /**
     * Un instantané écrit sous l'ancien schéma (edbaf5d62 : PERSON portait `phone` pour tous les
     * rôles) se rend encore, et la quittance imprime le téléphone FIGÉ, non le courant : la
     * restauration rend toutes les clés de l'instantané, pas la seule liste des champs d'aujourd'hui
     * (vérification adverse de 11c8e88b2).
     */
    public function test_une_quittance_figee_sous_l_ancien_schema_imprime_son_telephone_fige(): void
    {
        $lease = $this->bail($this->sansNom(['email' => null, 'phone' => '+221770000010']));
        $payment = LeasePayment::factory()->paid()->create(['lease_id' => $lease->id, 'payer_id' => $lease->tenant_id]);

        $metadata = json_decode((string) DB::table('lease_payments')->where('id', $payment->id)->value('metadata'), true);
        $metadata[PrintedIdentity::KEY]['tenant'] = ['first_name' => '', 'last_name' => '', 'name' => null, 'email' => null, 'phone' => '+221770000011'];
        DB::table('lease_payments')->where('id', $payment->id)->update(['metadata' => json_encode($metadata)]);
        $lease->tenant->forceFill(['phone' => '+221779999999'])->save();

        $this->assertSame('+221770000011', $this->caseApres($this->quittance($lease->fresh(), $payment), 'Nom'));
    }
}

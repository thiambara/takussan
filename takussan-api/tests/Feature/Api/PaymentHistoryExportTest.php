<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Payments\PaymentHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2721 — « Exporter » le registre des encaissements rend les lignes du registre, avec ses
 * filtres : `GET /api/export/payment_history`, servi par la sélection même de
 * `GET /api/payments/history` (`PaymentHistory`). Le décor : deux baux B1 et B2 encaissés en
 * novembre, un acompte de réservation payé en novembre, un loyer de B1 payé en octobre, un loyer de
 * B2 en retard, et un encaissement de novembre dans une AUTRE agence.
 */
class PaymentHistoryExportTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const NOVEMBRE = 'filter[paid_from]=2026-11-01&filter[paid_to]=2026-11-30';

    private Agency $agency;

    private User $admin;

    private User $l1;

    private User $l2;

    private Lease $b1;

    private Lease $b2;

    private Customer $t2;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->l1 = User::factory()->withOwnerProfile($this->agency)->create();
        $this->l2 = User::factory()->withOwnerProfile($this->agency)->create();
        $t1 = Customer::factory()->create(['agency_id' => $this->agency->id, 'first_name' => 'Awa', 'last_name' => 'Diop']);
        $this->t2 = Customer::factory()->create(['agency_id' => $this->agency->id, 'first_name' => 'Moussa', 'last_name' => 'Sarr']);
        $this->b1 = $this->bail($this->agency, $this->l1, $t1, 'Villa des Almadies');
        $this->b2 = $this->bail($this->agency, $this->l2, $this->t2, 'Studio de Fann');

        $this->echeance($this->b1, 'LPY-B1-NOV', 250_000, PaymentStatus::Paid, '2026-11-03 09:00:00', '2026-11', PaymentMethod::Wave);
        $this->echeance($this->b2, 'LPY-B2-NOV', 180_000, PaymentStatus::Paid, '2026-11-05 09:00:00', '2026-11', PaymentMethod::Cash);
        $this->echeance($this->b1, 'LPY-B1-OCT', 250_000, PaymentStatus::Paid, '2026-10-04 09:00:00', '2026-10', PaymentMethod::Wave);
        $this->echeance($this->b2, 'LPY-B2-RET', 180_000, PaymentStatus::Late, null, '2026-10', null);

        $bien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->l2->id, 'title' => 'Villa de Saly']);
        $reservation = Booking::factory()->create(['property_id' => $bien->id, 'agency_id' => $this->agency->id, 'customer_id' => $this->t2->id]);
        BookingPayment::factory()->create([
            'booking_id' => $reservation->id, 'reference_number' => 'BKP-NOV', 'status' => PaymentStatus::Paid,
            'amount' => 40_000, 'payment_method' => PaymentMethod::Wave, 'paid_at' => '2026-11-08 09:00:00',
        ]);

        $autre = Agency::factory()->create();
        $this->echeance(
            $this->bail($autre, User::factory()->withOwnerProfile($autre)->create(), Customer::factory()->create(['agency_id' => $autre->id]), 'Ailleurs'),
            'LPY-AUTRE', 999_000, PaymentStatus::Paid, '2026-11-04 09:00:00', '2026-11', PaymentMethod::Wave,
        );
    }

    private function bail(Agency $agency, User $landlord, Customer $tenant, string $titre): Lease
    {
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id, 'title' => $titre]);

        return Lease::factory()->active()->create([
            'property_id' => $property->id, 'landlord_id' => $landlord->id, 'tenant_id' => $tenant->id, 'agency_id' => $agency->id,
        ]);
    }

    private function echeance(Lease $lease, string $ref, float $montant, PaymentStatus $statut, ?string $payeLe, string $mois, ?PaymentMethod $moyen): LeasePayment
    {
        $debut = Carbon::parse("{$mois}-01");

        return LeasePayment::factory()->create([
            'lease_id' => $lease->id, 'payer_id' => $lease->tenant_id, 'reference_number' => $ref, 'amount' => $montant,
            'status' => $statut, 'paid_at' => $payeLe, 'payment_method' => $moyen,
            'due_date' => $debut->copy()->addDays(4)->toDateString(),
            'period_start' => $debut->toDateString(), 'period_end' => $debut->copy()->endOfMonth()->toDateString(),
        ]);
    }

    /** @return list<array<string, string>> les lignes du CSV, par nom de colonne */
    private function exporter(string $requete, ?User $lecteur = null): array
    {
        $corps = $this->actingAsApi($lecteur ?? $this->admin)
            ->get("/api/export/payment_history?format=csv&{$requete}")
            ->assertOk()
            ->streamedContent();
        $lignes = array_map('str_getcsv', array_values(array_filter(explode("\n", substr($corps, 3)))));
        $entete = array_shift($lignes);

        return array_map(fn (array $l) => array_combine($entete, $l), $lignes);
    }

    /** @return list<string> */
    private function referencesExportees(string $requete): array
    {
        $refs = array_column($this->exporter($requete), 'reference');
        sort($refs);

        return $refs;
    }

    /** @return list<string> les références du fichier, DANS L'ORDRE du fichier */
    private function ordreExporte(string $requete): array
    {
        return array_column($this->exporter($requete), 'reference');
    }

    /** @return list<string> les références de toutes les pages de la liste, DANS L'ORDRE de la liste */
    private function ordreListe(string $requete): array
    {
        $this->actingAsApi($this->admin);
        $refs = [];
        $page = 1;
        do {
            $reponse = $this->getJson("/api/payments/history?per_page=2&page={$page}&{$requete}")->assertOk();
            $refs = [...$refs, ...array_column($reponse->json('data'), 'reference_number')];
        } while ($page++ < $reponse->json('meta.last_page'));

        return $refs;
    }

    /**
     * TCK-2721 (d1) — le fichier entier rend `$attendu` dans cet ordre, et chaque coupe à `limit=k`
     * en rend les `k` premières lignes : une coupe garde le DÉBUT du registre, jamais des lignes prises
     * au hasard d'une source.
     *
     * @param  list<string>  $attendu
     */
    private function assertCoupesGardentLeDebut(string $requete, array $attendu): void
    {
        $this->assertSame($attendu, $this->ordreExporte($requete), "sans coupe : {$requete}");
        for ($k = 1; $k < count($attendu); $k++) {
            $this->assertSame(array_slice($attendu, 0, $k), $this->ordreExporte("{$requete}&limit={$k}"), "limit={$k} : {$requete}");
        }
    }

    /**
     * TCK-2721 (d1) — la même propriété, sur la sélection elle-même : l'export demande une ligne de plus
     * que sa limite (pour savoir s'il coupe), et cette ligne de marge absorbe une ligne mal rangée
     * par la coupe SQL. Ici, `select()` coupe à `k` exactement.
     *
     * @param  array<string, string|int>  $filtres
     * @param  list<string>  $attendu
     */
    private function assertSelectionCoupeeGardeLeDebut(array $filtres, string $tri, array $attendu): void
    {
        $historique = app(PaymentHistory::class);
        for ($k = 1; $k <= count($attendu); $k++) {
            $selection = $historique->select($this->admin, $filtres, [], $tri, $k);
            $this->assertSame(array_slice($attendu, 0, $k), $selection['rows']->pluck('reference_number')->all(), "select() à {$k} : {$tri}");
            $this->assertSame($k < count($attendu), $selection['truncated'], "truncated à {$k} : {$tri}");
        }
    }

    /** Un acompte de réservation du bien de B2, payé le `$payeLe`. */
    private function acompte(string $ref, float $montant, string $payeLe): BookingPayment
    {
        $bien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->l2->id]);
        $reservation = Booking::factory()->create(['property_id' => $bien->id, 'agency_id' => $this->agency->id, 'customer_id' => $this->t2->id]);

        return BookingPayment::factory()->create([
            'booking_id' => $reservation->id, 'reference_number' => $ref, 'status' => PaymentStatus::Paid,
            'amount' => $montant, 'payment_method' => PaymentMethod::Wave, 'paid_at' => $payeLe,
        ]);
    }

    /** @return list<string> les références de TOUTES les pages de la liste */
    private function referencesListees(string $requete): array
    {
        $this->actingAsApi($this->admin);
        $refs = [];
        $page = 1;
        do {
            $reponse = $this->getJson("/api/payments/history?per_page=2&page={$page}&{$requete}")->assertOk();
            $refs = [...$refs, ...array_column($reponse->json('data'), 'reference_number')];
        } while ($page++ < $reponse->json('meta.last_page'));
        sort($refs);

        return $refs;
    }

    public function test_ac1_le_filtre_d_entite_ne_rend_que_les_lignes_du_bail(): void
    {
        $this->assertSame(['LPY-B1-NOV'], $this->referencesExportees("filter[entity_type]=lease&filter[entity_id]={$this->b1->id}&".self::NOVEMBRE));
        $this->assertSame(['BKP-NOV', 'LPY-B1-NOV', 'LPY-B2-NOV'], $this->referencesExportees(self::NOVEMBRE));
    }

    public function test_ac2_l_export_rend_les_lignes_de_la_liste_pour_cinq_combinaisons(): void
    {
        $combinaisons = [
            'entité' => "filter[entity_type]=lease&filter[entity_id]={$this->b2->id}",
            'payeur' => "filter[payer_id]={$this->t2->id}",
            'bailleur' => "filter[landlord_id]={$this->l2->id}",
            'moyen' => 'filter[payment_method]=wave',
            'recherche' => 'filter[search]=moussa',
        ];

        foreach ($combinaisons as $nom => $filtre) {
            $requete = $filtre.'&'.self::NOVEMBRE;
            $listees = $this->referencesListees($requete);
            $this->assertNotSame([], $listees, "{$nom} : la combinaison doit rendre au moins une ligne");
            $this->assertSame($listees, $this->referencesExportees($requete), $nom);
        }
        // Sans borne d'encaissement : le retard et octobre aussi, comme la liste.
        $this->assertSame($this->referencesListees("filter[landlord_id]={$this->l2->id}"), $this->referencesExportees("filter[landlord_id]={$this->l2->id}"));
    }

    public function test_ac3_un_acompte_de_reservation_paye_en_novembre_est_dans_l_export_du_mois(): void
    {
        $this->assertContains('BKP-NOV', $this->referencesExportees(self::NOVEMBRE));
    }

    public function test_ac4_sans_payments_export_403_meme_avec_un_filtre_mal_forme(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $this->actingAsApi($agent)->get('/api/export/payment_history?format=csv&filter[status]=nope')->assertForbidden();
        $this->actingAsApi($agent)->get('/api/export/payment_history?format=csv&filter[payer_id]=abc')->assertForbidden();
        $this->actingAsApi($agent)->get('/api/export/payment_history?format=csv')->assertForbidden();

        // Le versant autorisé : le même filtre mal formé est refusé en 422, par la sélection de la liste.
        $exportateur = $this->agentWith($this->agency, Capability::PaymentsExport);
        $this->actingAsApi($exportateur)->getJson('/api/export/payment_history?format=csv&filter[status]=nope')
            ->assertStatus(422)->assertJsonPath('code', 'payment.filter_status_invalid');
        $this->actingAsApi($exportateur)->get('/api/export/payment_history?format=csv')->assertOk();
    }

    public function test_le_bailleur_et_le_locataire_n_exportent_pas_le_registre_d_agence(): void
    {
        $this->actingAsApi($this->l1)->get('/api/export/payment_history?format=csv')->assertForbidden();
        $locataire = User::factory()->create();
        $this->t2->update(['user_id' => $locataire->id]);
        $this->actingAsApi($locataire)->get('/api/export/payment_history?format=csv')->assertForbidden();
    }

    public function test_une_autre_agence_ne_sort_jamais(): void
    {
        $this->assertNotContains('LPY-AUTRE', $this->referencesExportees(self::NOVEMBRE));
        $this->assertNotContains('LPY-AUTRE', $this->referencesExportees('filter[search]=LPY'));
    }

    public function test_ac6_au_dela_de_la_limite_le_fichier_est_coupe_et_le_dit(): void
    {
        $reponse = $this->actingAsApi($this->admin)
            ->get('/api/export/payment_history?format=csv&limit=2&'.self::NOVEMBRE)
            ->assertOk()
            ->assertHeader('X-Export-Truncated', '2');
        $this->assertCount(3, array_filter(explode("\n", $reponse->streamedContent())), 'l’en-tête et deux lignes');

        $this->actingAsApi($this->admin)
            ->get('/api/export/payment_history?format=csv&limit=3&'.self::NOVEMBRE)
            ->assertOk()
            ->assertHeaderMissing('X-Export-Truncated');
    }

    public function test_les_colonnes_du_registre_montants_en_nombres_et_dates_iso(): void
    {
        $lignes = $this->exporter("filter[entity_type]=lease&filter[entity_id]={$this->b1->id}&".self::NOVEMBRE);

        $this->assertSame(
            ['paid_at', 'payer', 'property', 'payment_type', 'period_start', 'period_end', 'payment_method', 'amount', 'currency', 'status', 'reference'],
            array_keys($lignes[0]),
        );
        $this->assertSame('2026-11-03', $lignes[0]['paid_at']);
        $this->assertSame('Awa Diop', $lignes[0]['payer']);
        $this->assertSame('Villa des Almadies', $lignes[0]['property']);
        $this->assertSame('2026-11-01', $lignes[0]['period_start']);
        $this->assertSame('2026-11-30', $lignes[0]['period_end']);
        $this->assertSame('wave', $lignes[0]['payment_method']);
        $this->assertSame('250000', $lignes[0]['amount']);
        $this->assertSame('paid', $lignes[0]['status']);
    }

    public function test_le_journal_d_export_garde_les_filtres_du_registre(): void
    {
        $this->exporter("filter[landlord_id]={$this->l2->id}&".self::NOVEMBRE);

        $journal = Activity::query()->where('log_name', 'export')->latest('id')->firstOrFail();
        $this->assertSame('payment_history', $journal->properties['entity']);
        $this->assertSame((string) $this->l2->id, $journal->properties['filters']['filter']['landlord_id']);
        $this->assertSame('2026-11-01', $journal->properties['filters']['filter']['paid_from']);
    }

    /**
     * TCK-2721 (d1) — six encaissements de septembre insérés du plus ANCIEN au plus récent, montants
     * décroissants, deux acomptes de réservation parmi quatre loyers. Sans ordre SQL avant la coupe,
     * `sort=-date&limit=2` rendait R-06 et R-03 (la coupe des loyers gardait R-01 et R-03, les premiers
     * insérés), pas R-06 et R-05.
     */
    public function test_d1_une_coupe_garde_les_premieres_lignes_du_registre_dans_chaque_tri(): void
    {
        $this->echeance($this->b1, 'R-01', 600, PaymentStatus::Paid, '2026-09-01 09:00:00', '2026-09', PaymentMethod::Wave);
        $this->acompte('R-02', 500, '2026-09-02 09:00:00');
        $this->echeance($this->b2, 'R-03', 400, PaymentStatus::Paid, '2026-09-03 09:00:00', '2026-09', PaymentMethod::Cash);
        $this->echeance($this->b1, 'R-04', 300, PaymentStatus::Paid, '2026-09-04 09:00:00', '2026-08', PaymentMethod::Wave);
        $this->echeance($this->b2, 'R-05', 200, PaymentStatus::Paid, '2026-09-05 09:00:00', '2026-08', PaymentMethod::Cash);
        $this->acompte('R-06', 100, '2026-09-06 09:00:00');
        $septembre = 'filter[paid_from]=2026-09-01&filter[paid_to]=2026-09-30';

        $this->assertSame(['R-06', 'R-05'], $this->ordreExporte("sort=-date&limit=2&{$septembre}"));
        $this->assertCoupesGardentLeDebut("sort=-date&{$septembre}", ['R-06', 'R-05', 'R-04', 'R-03', 'R-02', 'R-01']);
        $this->assertCoupesGardentLeDebut("sort=date&{$septembre}", ['R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06']);
        $this->assertCoupesGardentLeDebut("sort=amount&{$septembre}", ['R-06', 'R-05', 'R-04', 'R-03', 'R-02', 'R-01']);
        $this->assertCoupesGardentLeDebut("sort=-amount&{$septembre}", ['R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06']);
        // Un tri inconnu vaut `-date`, pour la coupe comme pour le tri.
        $this->assertSame(['R-06', 'R-05'], $this->ordreExporte("sort=inconnu&limit=2&{$septembre}"));

        $filtres = ['paid_from' => '2026-09-01', 'paid_to' => '2026-09-30'];
        $this->assertSelectionCoupeeGardeLeDebut($filtres, '-date', ['R-06', 'R-05', 'R-04', 'R-03', 'R-02', 'R-01']);
        $this->assertSelectionCoupeeGardeLeDebut($filtres, 'amount', ['R-06', 'R-05', 'R-04', 'R-03', 'R-02', 'R-01']);
    }

    /**
     * TCK-2721 (d1) — la coupe sur `remaining_amount` lit l'accesseur de `HasPaymentAttributes` branche
     * pour branche : `paid` remboursé en partie (X-2), `paid` à `metadata.paid_amount` (X-6),
     * `refunded` en partie (X-5), `partially_paid` (X-3), dû (X-1), soldé (X-4). Chaque branche mal
     * recopiée en SQL déplace une ligne à travers une coupe.
     */
    public function test_d1_la_coupe_sur_le_reste_du_suit_l_accesseur_branche_pour_branche(): void
    {
        $bail = $this->bail($this->agency, $this->l1, $this->t2, 'Résidence du Plateau');
        $ligne = fn (string $ref, float $montant, PaymentStatus $statut, array $plus = []) => $this->echeance($bail, $ref, $montant, $statut, $statut === PaymentStatus::Paid ? '2026-09-10 09:00:00' : null, '2026-09', null)->forceFill($plus)->save();

        $ligne('X-4', 800, PaymentStatus::Paid);                                                     // reste 0
        $ligne('X-1', 250, PaymentStatus::Pending);                                                  // reste 250
        $ligne('X-6', 1000, PaymentStatus::Paid, ['metadata' => ['paid_amount' => 900]]);            // reste 100
        $ligne('X-2', 1000, PaymentStatus::Paid, ['refund_amount' => 300]);                          // reste 300
        $ligne('X-3', 500, PaymentStatus::PartiallyPaid, ['metadata' => ['paid_amount' => 350]]);    // reste 150
        $ligne('X-5', 900, PaymentStatus::Refunded, ['refund_amount' => 200]);                       // reste 200

        $this->assertCoupesGardentLeDebut(
            "sort=-remaining_amount&filter[entity_type]=lease&filter[entity_id]={$bail->id}",
            ['X-2', 'X-1', 'X-5', 'X-3', 'X-6', 'X-4'],
        );
        $filtres = ['entity_type' => 'lease', 'entity_id' => $bail->id];
        $this->assertSelectionCoupeeGardeLeDebut($filtres, '-remaining_amount', ['X-2', 'X-1', 'X-5', 'X-3', 'X-6', 'X-4']);
        $this->assertSelectionCoupeeGardeLeDebut($filtres, 'remaining_amount', ['X-4', 'X-6', 'X-3', 'X-5', 'X-1', 'X-2']);
    }

    /**
     * TCK-2721 (d1) — la coupe sur `days_late` lit `OverdueInstalment::daysLate()` : ni une échéance
     * payée (D-1), ni une restitution de caution (D-3), ni une échéance à venir (D-5) n'ont de retard,
     * et elles se rangent après les retards, dans leur ordre d'insertion.
     */
    public function test_d1_la_coupe_sur_le_retard_suit_les_jours_de_retard(): void
    {
        $bail = $this->bail($this->agency, $this->l1, $this->t2, 'Résidence de Ouakam');
        $ligne = fn (string $ref, PaymentStatus $statut, string $mois, array $plus = []) => $this->echeance($bail, $ref, 100, $statut, $statut === PaymentStatus::Paid ? '2026-08-05 09:00:00' : null, $mois, null)->forceFill($plus)->save();

        $ligne('D-1', PaymentStatus::Paid, '2026-08');                                               // échue le 08-05, payée
        $ligne('D-2', PaymentStatus::Late, '2026-10');                                               // 41 jours
        $ligne('D-3', PaymentStatus::Pending, '2026-07', ['payment_type' => LeasePaymentType::DepositRefund]);
        $ligne('D-4', PaymentStatus::Late, '2026-09');                                               // 71 jours
        $ligne('D-5', PaymentStatus::Pending, '2026-12');                                            // à venir
        $ligne('D-6', PaymentStatus::PartiallyPaid, '2026-11', ['metadata' => ['paid_amount' => 10]]); // 10 jours

        $requete = "filter[entity_type]=lease&filter[entity_id]={$bail->id}";
        $this->assertCoupesGardentLeDebut("sort=-days_late&{$requete}", ['D-4', 'D-2', 'D-6', 'D-1', 'D-3', 'D-5']);
        $this->assertCoupesGardentLeDebut("sort=days_late&{$requete}", ['D-6', 'D-2', 'D-4', 'D-1', 'D-3', 'D-5']);
        $filtres = ['entity_type' => 'lease', 'entity_id' => $bail->id];
        $this->assertSelectionCoupeeGardeLeDebut($filtres, '-days_late', ['D-4', 'D-2', 'D-6', 'D-1', 'D-3', 'D-5']);
        $this->assertSelectionCoupeeGardeLeDebut($filtres, 'days_late', ['D-6', 'D-2', 'D-4', 'D-1', 'D-3', 'D-5']);
        // La date d'une échéance impayée est le début de sa période (`leaseRow()`), pas sa création.
        $this->assertSelectionCoupeeGardeLeDebut($filtres, '-date', ['D-5', 'D-6', 'D-2', 'D-4', 'D-1', 'D-3']);
    }

    /**
     * TCK-2721 (d2) — le fichier suit le tri de la liste, ligne pour ligne. Les quatre tris rendent deux
     * ordres inverses l'un de l'autre : un export qui ignorerait `sort`, ou le forcerait, rougit.
     */
    public function test_d2_l_export_suit_l_ordre_de_la_liste_pour_chaque_tri(): void
    {
        $ordres = [];
        foreach (['-date', 'amount', '-amount', 'date'] as $tri) {
            $requete = "sort={$tri}&".self::NOVEMBRE;
            $ordres[$tri] = $this->ordreListe($requete);
            $this->assertSame($ordres[$tri], $this->ordreExporte($requete), "sort={$tri}");
        }

        $this->assertSame(['BKP-NOV', 'LPY-B2-NOV', 'LPY-B1-NOV'], $ordres['-date']);
        $this->assertSame(array_reverse($ordres['-date']), $ordres['-amount']);
        $this->assertSame(array_reverse($ordres['-date']), $ordres['date']);
    }
}

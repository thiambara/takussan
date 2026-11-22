<?php

namespace Tests\Feature\Lease;

use App\Models\Agency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\TenantOnboardingChecklist;
use App\Models\User;
use App\Services\Lease\LeaseAttention;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2642, AC1, AC2 — la file « À traiter » des baux : chaque motif a son cas, qui met un bail dans
 * la file, et son témoin, qui le manque d'un cran (la signature demandée il y a 2 jours, la grâce
 * pas encore écoulée, la pénalité réglée, la révision faite, la caution rendue, la fin à 5 mois, la
 * liste ouverte il y a 5 jours). `attention[]` de la ligne et `filter[motif]` lisent la même règle
 * (`LeaseAttention`) : la parité est tenue sur tous les baux du jeu.
 *
 * Aujourd'hui : le 11 novembre 2026, 10 h (Dakar = UTC).
 */
class LeaseAttentionQueueTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');
        $this->agency = $this->agence();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->owner = $this->bailleur($this->agency);
    }

    /** Un bail actif qui ne coche aucun motif, sauf ce que `$attributes` change. */
    private function lease(string $ref, array $attributes = []): Lease
    {
        return $this->bail($this->bienLoue($this->agency, $this->owner, 'Bien '.$ref), 'Loc '.$ref, $attributes + [
            'reference_number' => $ref,
            'start_date' => '2026-03-01',
            'end_date' => '2027-12-31',
            'deposit_amount' => 600_000,
        ]);
    }

    /** @return list<string> les références de la liste, triées */
    private function refs(string $query, ?User $as = null): array
    {
        $this->actingAsApi($as ?? $this->admin);
        $refs = array_column($this->getJson('/api/leases?per_page=100&fields[leases]=id,reference_number'.$query)->assertOk()->json('data'), 'reference_number');
        sort($refs);

        return $refs;
    }

    /** @return list<array<string, mixed>> */
    private function attentionOf(Lease $lease, ?User $as = null): array
    {
        $this->actingAsApi($as ?? $this->admin);

        return $this->getJson("/api/leases/{$lease->id}?include=attention")->assertOk()->json('data.attention');
    }

    private function deposit(Lease $lease, float $amount, PaymentStatus $status = PaymentStatus::Paid): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id, 'payer_id' => $lease->tenant_id, 'payment_type' => LeasePaymentType::Deposit,
            'amount' => $amount, 'status' => $status, 'due_date' => '2024-11-01',
            'paid_at' => $status === PaymentStatus::Paid ? '2024-11-01 10:00:00' : null,
        ]);
    }

    /** Le jeu entier : un cas et son témoin par motif, et un bail calme. */
    private function jeu(): void
    {
        $this->lease('CALME');
        // signature_pending
        $this->lease('SIG-4', ['status' => LeaseStatus::PendingSignature, 'signature_requested_at' => '2026-11-07 09:00:00']);
        $this->lease('SIG-2', ['status' => LeaseStatus::PendingSignature, 'signature_requested_at' => '2026-11-09 11:00:00']);
        // notice_received
        $this->lease('NOT', ['status' => LeaseStatus::Terminating, 'early_termination_requested_at' => '2026-11-01 08:00:00']);
        $this->lease('NOT-FINI', ['status' => LeaseStatus::Terminated, 'early_termination_requested_at' => '2026-08-01 08:00:00', 'terminated_at' => '2026-10-31 12:00:00', 'end_date' => '2026-10-31']);
        // rent_late
        $this->loyer($this->lease('RET', ['late_fee_grace_days' => 5]), '2026-11-05', PaymentStatus::Pending);
        $this->loyer($this->lease('RET-GRACE', ['late_fee_grace_days' => 7]), '2026-11-05', PaymentStatus::Pending);
        $this->deposit($this->lease('RET-CAUTION'), 600_000, PaymentStatus::Pending);
        // late_fee_unpaid
        $this->loyer($this->lease('PEN'), '2026-10-05', PaymentStatus::Paid, ['late_fee_amount' => 15_000, 'late_fee_applied_at' => '2026-10-12 00:00:00']);
        $this->loyer($this->lease('PEN-REGLEE'), '2026-10-05', PaymentStatus::Paid, ['late_fee_amount' => 15_000, 'late_fee_applied_at' => '2026-10-12 00:00:00', 'late_fee_paid_at' => '2026-10-20 00:00:00']);
        // rent_review_open
        $this->lease('REV', ['start_date' => '2025-06-01', 'end_date' => '2027-05-31']);
        $faite = $this->lease('REV-FAITE', ['start_date' => '2025-06-01', 'end_date' => '2027-05-31']);
        activity('Lease')->performedOn($faite)->event('lease_rent_reviewed')->log('lease_rent_reviewed');
        // deposit_to_refund
        $ended = ['status' => LeaseStatus::Expired, 'start_date' => '2024-11-01', 'end_date' => '2026-10-31'];
        $this->deposit($this->lease('CAU', $ended), 600_000);
        $this->deposit($this->lease('CAU-RENDUE', $ended + ['deposit_refunded_amount' => 600_000, 'deposit_refunded_at' => '2026-11-02 10:00:00']), 600_000);
        // ending_soon
        $this->lease('FIN', ['end_date' => '2027-02-28']);
        $this->lease('FIN-LOIN', ['end_date' => '2027-03-31']);
        $renouvele = $this->lease('FIN-RENOUVELE', ['end_date' => '2027-02-28']);
        $this->lease('FIN-ENFANT', ['status' => LeaseStatus::Draft, 'renewed_from_lease_id' => $renouvele->id, 'start_date' => '2027-03-01', 'end_date' => '2029-02-28']);
        // onboarding_incomplete
        TenantOnboardingChecklist::factory()->create(['lease_id' => $this->lease('ENT')->id, 'created_at' => '2026-11-03 09:00:00']);
        TenantOnboardingChecklist::factory()->create(['lease_id' => $this->lease('ENT-RECENTE')->id, 'created_at' => '2026-11-06 09:00:00']);
    }

    private const FILE = ['CAU', 'ENT', 'FIN', 'NOT', 'PEN', 'RET', 'REV', 'SIG-4'];

    public function test_ac1_chaque_motif_met_son_cas_dans_la_file_et_pas_son_temoin(): void
    {
        $this->jeu();

        $attendu = [
            'signature_pending' => ['SIG-4'], 'notice_received' => ['NOT'], 'rent_late' => ['RET'],
            'late_fee_unpaid' => ['PEN'], 'rent_review_open' => ['REV'], 'deposit_to_refund' => ['CAU'],
            'ending_soon' => ['FIN'], 'onboarding_incomplete' => ['ENT'],
        ];
        $this->assertSame(LeaseAttention::MOTIFS, array_keys($attendu));
        foreach ($attendu as $motif => $refs) {
            $this->assertSame($refs, $this->refs("&filter[motif]={$motif}"), $motif);
        }

        $this->assertSame(self::FILE, $this->refs('&filter[a_traiter]=1'), 'la file : un cas par motif, aucun témoin, pas le bail calme');
    }

    public function test_ac2_une_signature_attendue_depuis_deux_jours_n_y_est_pas_depuis_quatre_elle_y_est(): void
    {
        $quatre = $this->lease('SIG-4', ['status' => LeaseStatus::PendingSignature, 'signature_requested_at' => '2026-11-07 09:00:00']);
        $deux = $this->lease('SIG-2', ['status' => LeaseStatus::PendingSignature, 'signature_requested_at' => '2026-11-09 11:00:00']);

        $this->assertSame(['SIG-4'], $this->refs('&filter[a_traiter]=1'));
        $this->assertSame([['motif' => 'signature_pending', 'since' => '2026-11-07']], $this->attentionOf($quatre));
        $this->assertSame([], $this->attentionOf($deux));
    }

    /** Les valeurs de chaque entrée : `since` (date), et le montant ou l'échéance quand le motif en porte. */
    public function test_les_entrees_portent_leur_date_leur_montant_et_leur_echeance(): void
    {
        $this->jeu();
        $this->actingAsApi($this->admin);
        $rows = array_column($this->getJson('/api/leases?per_page=100&include=attention')->assertOk()->json('data'), 'attention', 'reference_number');
        ksort($rows);

        $this->assertSame([
            'CAU' => [['motif' => 'deposit_to_refund', 'since' => '2026-10-31', 'amount' => 600000]],
            'ENT' => [['motif' => 'onboarding_incomplete', 'since' => '2026-11-03']],
            'FIN' => [['motif' => 'ending_soon', 'since' => '2026-10-28', 'due_date' => '2027-02-28']],
            'NOT' => [['motif' => 'notice_received', 'since' => '2026-11-01']],
            'PEN' => [['motif' => 'late_fee_unpaid', 'since' => '2026-10-12', 'amount' => 15000, 'due_date' => '2026-10-05']],
            'RET' => [['motif' => 'rent_late', 'since' => '2026-11-05', 'amount' => 300000, 'due_date' => '2026-11-05']],
            'REV' => [['motif' => 'rent_review_open', 'since' => '2026-06-01']],
            'SIG-4' => [['motif' => 'signature_pending', 'since' => '2026-11-07']],
        ], array_filter(array_map(fn (array $a) => array_map(fn (array $e) => array_map(
            fn ($v) => is_float($v) ? (int) $v : $v, $e), $a), $rows), fn (array $a) => $a !== []));
    }

    /**
     * Décision du porteur (2026-11-11) : la pénalité restée due sur un bail FINI (expiré, résilié,
     * renouvelé) ne met plus le bail dans la file — sur la démo, 126 baux en sortaient pour des
     * pénalités de 2024. Un bail en préavis (`terminating`) est encore en cours : il y reste.
     */
    public function test_la_penalite_due_d_un_bail_fini_ne_met_plus_le_bail_dans_la_file(): void
    {
        $fini = ['start_date' => '2024-01-01', 'end_date' => '2025-12-31'];
        $paye = fn (Lease $l) => $this->loyer($l, '2025-10-05', PaymentStatus::Paid, ['late_fee_amount' => 15_000, 'late_fee_applied_at' => '2025-10-12 00:00:00']);
        $paye($expire = $this->lease('PEN-EXP', $fini + ['status' => LeaseStatus::Expired]));
        $paye($renouvele = $this->lease('PEN-REN', $fini + ['status' => LeaseStatus::Renewed]));
        $paye($preavis = $this->lease('PEN-PRE', ['status' => LeaseStatus::Terminating]));

        $this->assertNotContains('late_fee_unpaid', array_column($this->attentionOf($expire), 'motif'));
        $this->assertNotContains('late_fee_unpaid', array_column($this->attentionOf($renouvele), 'motif'));
        $this->assertContains('late_fee_unpaid', array_column($this->attentionOf($preavis), 'motif'));
        $this->assertSame(['PEN-PRE'], $this->refs('&filter[motif]=late_fee_unpaid'));
    }

    /** La pénalité d'une échéance encore due est dans `rent_late` : `late_fee_unpaid` ne vise que les échéances payées. */
    public function test_la_penalite_d_une_echeance_encore_due_reste_dans_le_retard(): void
    {
        $lease = $this->lease('RET-PEN');
        $this->loyer($lease, '2026-10-05', PaymentStatus::Pending, ['late_fee_amount' => 15_000, 'late_fee_applied_at' => '2026-10-12 00:00:00']);

        $this->assertSame(['rent_late'], array_column($this->attentionOf($lease), 'motif'));
        $this->assertSame([], $this->refs('&filter[motif]=late_fee_unpaid'));
    }

    /** La ligne et le filtre lisent la même règle : chaque bail porte un motif SSI le filtre de ce motif le rend. */
    public function test_attention_de_la_ligne_et_filtre_du_motif_designent_les_memes_baux(): void
    {
        $this->jeu();
        $this->actingAsApi($this->admin);
        $rows = $this->getJson('/api/leases?per_page=100&include=attention')->assertOk()->json('data');

        foreach (LeaseAttention::MOTIFS as $motif) {
            $parLigne = array_values(array_map(fn (array $r) => $r['reference_number'], array_filter($rows,
                fn (array $r) => in_array($motif, array_column($r['attention'], 'motif'), true))));
            sort($parLigne);
            $this->assertSame($this->refs("&filter[motif]={$motif}"), $parLigne, $motif);
        }
    }

    /** `sort=attention` : l'argent dû d'abord, puis ce qui presse, puis l'information ; le plus ancien en tête de chaque gravité. */
    public function test_le_tri_attention(): void
    {
        $this->jeu();
        $this->actingAsApi($this->admin);
        $refs = array_column($this->getJson('/api/leases?per_page=100&sort=attention&fields[leases]=id,reference_number')->assertOk()->json('data'), 'reference_number');

        $this->assertSame(['PEN', 'RET', 'FIN', 'CAU', 'ENT', 'SIG-4', 'REV', 'NOT'], array_slice($refs, 0, 8));
        $this->assertEqualsCanonicalizing(array_values(array_diff($refs, self::FILE)), array_slice($refs, 8), 'les baux sans motif ensuite');
        $this->assertSame(['NOT', 'REV'], array_slice(array_column($this->getJson('/api/leases?per_page=100&sort=-attention&filter[a_traiter]=1&fields[leases]=id,reference_number')->assertOk()->json('data'), 'reference_number'), 0, 2));
    }

    /** L'entrée en attente est une file de relance interne (TCK-378) : ni le bailleur ni le locataire ne la lisent. */
    public function test_l_entree_en_attente_ne_se_lit_que_par_le_personnel(): void
    {
        $lease = $this->lease('ENT');
        TenantOnboardingChecklist::factory()->create(['lease_id' => $lease->id, 'created_at' => '2026-11-03 09:00:00']);

        $this->assertSame(['ENT'], $this->refs('&filter[motif]=onboarding_incomplete'));
        $this->assertSame(['ENT'], $this->refs('&filter[motif]=onboarding_incomplete', $this->agencyAgent($this->agency)));
        $this->assertSame(['ENT'], $this->refs('', $this->owner), 'le bailleur lit son bail');
        $this->assertSame([], $this->refs('&filter[motif]=onboarding_incomplete', $this->owner));
        $this->assertSame([], $this->refs('&filter[onboarding_pending]=1', $this->owner));
        $this->assertSame([], $this->attentionOf($lease, $this->owner));
    }

    public function test_un_motif_inconnu_est_refuse(): void
    {
        $this->actingAsApi($this->admin);
        $this->getJson('/api/leases?filter[motif]=nimporte')->assertStatus(422);
        $this->getJson('/api/leases?filter[a_traiter]=peut-etre')->assertStatus(422);
    }

    /** Sans `include=attention`, la clé est absente — liste comme fiche. */
    public function test_rien_sans_include(): void
    {
        $lease = $this->lease('RET');
        $this->loyer($lease, '2026-11-01', PaymentStatus::Pending);
        $this->actingAsApi($this->admin);

        $this->assertArrayNotHasKey('attention', $this->getJson('/api/leases')->assertOk()->json('data.0'));
        $this->assertArrayNotHasKey('attention', $this->getJson("/api/leases/{$lease->id}")->assertOk()->json('data'));
        $this->getJson('/api/leases?fields[leases]=id,attention')->assertStatus(400);
    }

    /** P3 de l'audit : par défaut, un bail en cours passe devant un brouillon plus récent. */
    public function test_par_defaut_les_baux_en_cours_avant_les_brouillons(): void
    {
        $this->lease('EN-COURS');
        $this->travel(1)->hours();
        $this->lease('BROUILLON', ['status' => LeaseStatus::Draft]);
        $this->travel(1)->hours();
        $this->lease('FINI', ['status' => LeaseStatus::Expired, 'end_date' => '2026-10-31']);

        $this->actingAsApi($this->admin);
        $this->assertSame(['EN-COURS', 'BROUILLON', 'FINI'], array_column($this->getJson('/api/leases?fields[leases]=id,reference_number')->assertOk()->json('data'), 'reference_number'));
    }
}

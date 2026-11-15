<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\OperateursPlateforme;

/**
 * TCK-2660, décision 7 (a) du porteur — le PRÉNOM du payeur (`include=payer` de
 * `GET /api/payments/history`, `PaymentHistory::named`) est servi au bailleur du bail et au locataire,
 * comme au personnel de l'agence : la relance s'écrit au prénom.
 *
 * Ce test garde la contrepartie : hors de ce cercle (autre bailleur, autre locataire, personnel d'une
 * autre agence, opérateur `viewer`, auteur d'une réservation qui n'est plus membre…), rien du payeur ne
 * paraît, ni prénom, ni nom de famille, ni téléphone, ni e-mail. Dans le cercle, le bloc du payeur garde ses cinq clés, et aucun
 * e-mail n'y entre.
 *
 * Les noms et les numéros sont choisis sans accent : la réponse JSON échappe les caractères non ASCII
 * (`é`), et un « Mariétou » qui fuirait ne serait pas trouvé tel quel dans le corps.
 */
class PaymentHistoryPrenomDuPayeurTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use OperateursPlateforme;
    use RefreshDatabase;

    /** Tout ce qui désigne le locataire du bail A, dans la réponse brute. */
    private const LOCATAIRE = ['Marietou', 'Thiandoum', '+221771112233', '771112233', 'marietou.fiche@locataire.test', 'marietou.compte@locataire.test'];

    /** Tout ce qui désigne le client de la réservation, dans la réponse brute. */
    private const CLIENT = ['Bineta', 'Sarrbis', '+221774445566', '774445566', 'bineta.fiche@client.test', 'bineta.compte@client.test'];

    private const CLES_DU_PAYEUR = ['id', 'name', 'phone', 'first_name', 'locale'];

    private Agency $agency;

    private User $admin;

    private User $agent;

    private User $bailleurA;

    private User $locataireA;

    private User $bailleurB;

    private User $locataireB;

    private User $clientDeLaReservation;

    private User $proprietaireSansBien;

    /** L'agent qui a saisi la réservation, et qui n'est plus de l'agence (profil suspendu). */
    private User $auteurParti;

    private AgentProfile $profilDeLAuteur;

    private LeasePayment $loyerEnRetard;

    private BookingPayment $acompte;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-13 10:00:00', 'Africa/Dakar'));

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->agent = $this->agencyAgent($this->agency);
        $this->bailleurA = $this->proprietaire('Awa', 'Ndiaye');
        $this->bailleurB = $this->proprietaire('Ibrahima', 'Fall');
        $this->proprietaireSansBien = $this->proprietaire('Cheikh', 'Gaye');

        // Le bail A : son locataire a un compte, et son e-mail est sur la fiche comme sur le compte.
        $this->locataireA = User::factory()->create(['first_name' => 'Marietou', 'last_name' => 'Thiandoum', 'email' => 'marietou.compte@locataire.test']);
        $leaseA = $this->bail($this->bailleurA, Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'user_id' => $this->locataireA->id,
            'first_name' => 'Marietou',
            'last_name' => 'Thiandoum',
            'phone' => '+221771112233',
            'email' => 'marietou.fiche@locataire.test',
        ]));
        $this->loyerEnRetard = LeasePayment::factory()->create([
            'lease_id' => $leaseA->id,
            'payer_id' => $leaseA->tenant_id,
            'status' => PaymentStatus::Pending,
            'amount' => 150_000,
            'due_date' => now('Africa/Dakar')->subDays(20)->toDateString(),
        ]);

        // Le bail B, dans la même agence : un autre bailleur, un autre locataire.
        $this->locataireB = User::factory()->create(['first_name' => 'Khady', 'last_name' => 'Ba']);
        $leaseB = $this->bail($this->bailleurB, Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'user_id' => $this->locataireB->id,
            'first_name' => 'Khady',
            'last_name' => 'Ba',
            'phone' => '+221778889900',
        ]));
        LeasePayment::factory()->create(['lease_id' => $leaseB->id, 'payer_id' => $leaseB->tenant_id, 'status' => PaymentStatus::Pending]);

        // Une réservation sur le bien du bailleur B, saisie par un agent qui a quitté l'agence depuis,
        // et payée par un client qui a un compte.
        $this->auteurParti = User::factory()->create(['first_name' => 'Pape', 'last_name' => 'Kane']);
        $this->profilDeLAuteur = AgentProfile::factory()->suspended()->create(['user_id' => $this->auteurParti->id, 'agency_id' => $this->agency->id]);
        $this->clientDeLaReservation = User::factory()->create(['first_name' => 'Bineta', 'last_name' => 'Sarrbis', 'email' => 'bineta.compte@client.test']);
        $booking = Booking::factory()->create([
            'property_id' => $leaseB->property_id,
            'agency_id' => $this->agency->id,
            'created_by_id' => $this->auteurParti->id,
            'customer_id' => Customer::factory()->create([
                'agency_id' => $this->agency->id,
                'user_id' => $this->clientDeLaReservation->id,
                'first_name' => 'Bineta',
                'last_name' => 'Sarrbis',
                'phone' => '+221774445566',
                'email' => 'bineta.fiche@client.test',
            ])->id,
        ]);
        $this->acompte = BookingPayment::factory()->create(['booking_id' => $booking->id, 'status' => PaymentStatus::Paid, 'paid_at' => now()->subDays(2)]);
    }

    private function proprietaire(string $prenom, string $nom): User
    {
        $user = User::factory()->create(['first_name' => $prenom, 'last_name' => $nom]);
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->agency->id]);

        return $user;
    }

    private function bail(User $bailleur, Customer $locataire): Lease
    {
        return Lease::factory()->create([
            'property_id' => Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agency->id])->id,
            'landlord_id' => $bailleur->id,
            'agency_id' => $this->agency->id,
            'tenant_id' => $locataire->id,
            'status' => LeaseStatus::Active,
            'late_fee_percent' => null,
        ]);
    }

    /** La réponse brute de l'historique nommé, lue par `$user` (`null` : l'appelant déjà authentifié). */
    private function historique(?User $user): string
    {
        if ($user !== null) {
            $this->actingAsApi($user->fresh());
        }

        return $this->getJson('/api/payments/history?per_page=100&include=payer,property,landlord')->assertOk()->getContent();
    }

    /** @return array<string, mixed>|null le bloc du payeur de la ligne `source:id`, tel que `$user` le lit */
    private function payeurLuPar(User $user, string $ligne): ?array
    {
        $rows = collect(json_decode($this->historique($user), true)['data'])->keyBy(fn (array $r) => $r['source'].':'.$r['id']);

        return $rows[$ligne]['payer'] ?? null;
    }

    /** @param list<string> $traces */
    private function assertRienDuPayeur(string $corps, array $traces, string $qui): void
    {
        foreach ($traces as $trace) {
            $this->assertStringNotContainsString($trace, $corps, "{$qui} lit « {$trace} »");
        }
    }

    public function test_le_cercle_du_bail_lit_le_prenom_du_payeur_dans_un_bloc_de_cinq_cles_sans_e_mail(): void
    {
        $cercle = ['admin' => $this->admin, 'agent' => $this->agent, 'bailleur du bail' => $this->bailleurA, 'locataire' => $this->locataireA];

        foreach ($cercle as $qui => $user) {
            $payeur = $this->payeurLuPar($user, 'lease:'.$this->loyerEnRetard->id);

            $this->assertNotNull($payeur, "{$qui} ne lit pas la ligne");
            $this->assertSame('Marietou', $payeur['first_name'], $qui);
            $this->assertSame(self::CLES_DU_PAYEUR, array_keys($payeur), $qui);
            $this->assertStringNotContainsString('@', json_encode($payeur), "{$qui} lit un e-mail du payeur");
        }
    }

    public function test_hors_du_cercle_du_bail_ni_prenom_ni_nom_ni_telephone_ni_e_mail_du_locataire(): void
    {
        $autreAgence = Agency::factory()->create();
        $dehors = [
            'bailleur d’un autre bail de l’agence' => $this->bailleurB,
            'locataire d’un autre bail de l’agence' => $this->locataireB,
            'propriétaire de l’agence sans ce bail' => $this->proprietaireSansBien,
            'client d’une réservation de l’agence' => $this->clientDeLaReservation,
            'admin d’une autre agence' => $this->agencyAdmin($autreAgence),
            'agent d’une autre agence' => $this->agencyAgent($autreAgence),
            'inconnu' => User::factory()->create(),
        ];

        foreach ($dehors as $qui => $user) {
            $this->assertRienDuPayeur($this->historique($user), self::LOCATAIRE, $qui);
        }

        // TCK-600 — un opérateur `viewer` n'est pas super-admin.
        $this->agirEnOperateur(PlatformProfileLevel::Viewer);
        $this->assertRienDuPayeur($this->historique(null), self::LOCATAIRE, 'opérateur viewer');
    }

    public function test_le_client_d_une_reservation_n_est_lu_que_par_le_bailleur_du_bien_lui_meme_et_le_personnel(): void
    {
        foreach (['admin' => $this->admin, 'bailleur du bien' => $this->bailleurB, 'client' => $this->clientDeLaReservation] as $qui => $user) {
            $this->assertSame('Bineta', $this->payeurLuPar($user, 'booking:'.$this->acompte->id)['first_name'] ?? null, $qui);
        }

        $dehors = [
            'bailleur d’un autre bien de l’agence' => $this->bailleurA,
            'locataire d’un bail de l’agence' => $this->locataireA,
            'propriétaire de l’agence sans ce bien' => $this->proprietaireSansBien,
            'admin d’une autre agence' => $this->agencyAdmin(Agency::factory()->create()),
        ];
        foreach ($dehors as $qui => $user) {
            $this->assertRienDuPayeur($this->historique($user), self::CLIENT, $qui);
        }
    }

    /**
     * P233.01 (TCK-2241) — l'auteur d'une réservation ne la garde qu'encore membre de l'agence. Parti
     * (son profil d'agent n'est plus actif), il ne lit plus rien du client ; le témoin le remet en
     * activité, et il lit alors le prénom : c'est bien la branche « auteur » qui est jugée.
     */
    public function test_l_auteur_d_une_reservation_qui_n_est_plus_membre_ne_lit_plus_rien_du_client(): void
    {
        $this->assertRienDuPayeur($this->historique($this->auteurParti), self::CLIENT, 'auteur parti');
        $this->assertRienDuPayeur($this->historique($this->auteurParti), self::LOCATAIRE, 'auteur parti');

        $this->profilDeLAuteur->update(['status' => AgentProfileStatus::Active->value]);
        $this->assertSame('Bineta', $this->payeurLuPar($this->auteurParti, 'booking:'.$this->acompte->id)['first_name'] ?? null, 'auteur encore membre');
    }
}

<?php

namespace Tests\Feature\Lease;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Policies\LeasePolicy;
use App\Services\Property\BailleurDuBien;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-2809 (suite de TCK-2803) — la quittance PDF d'un bail (`GET /api/leases/{lease}/receipts/{payment}/pdf`)
 * juge son bailleur par {@see BailleurDuBien::est()}, comme `LeasePolicy::view`.
 *
 * `leases.landlord_id` recopie le créateur du bien : sur un bien d'agence, l'agent qui l'a saisi
 * (TCK-1926). Lu tel quel par `DocumentPdfController::mayReadReceipts`, il laissait à l'agent créateur
 * PARTI de l'agence la quittance (nom du locataire, bien, montant, date) d'un bail que la fiche lui refuse.
 */
class QuittanceDuBailleurAuSensDeViewTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private Customer $tenant;

    private Lease $lease;

    private LeasePayment $payment;

    private User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildStakeholders();

        $this->tenant = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => $this->agent->id,
            'user_id' => $this->client->id,
            'first_name' => 'Awa',
            'last_name' => 'NDIAYE',
        ]);
        [$this->lease, $this->payment] = $this->bailPaye($this->property, $this->landlord, $this->agency->id);

        $this->superAdmin = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $this->materializeRoleProfile($this->superAdmin, 'super_admin');
    }

    /** @return array{0: Lease, 1: LeasePayment} un bail actif et une échéance de loyer payée */
    private function bailPaye(Property $bien, User $bailleur, ?int $agencyId, ?Customer $locataire = null): array
    {
        $bail = Lease::factory()->create([
            'property_id' => $bien->id,
            'agency_id' => $agencyId,
            'landlord_id' => $bailleur->id,
            'tenant_id' => ($locataire ?? $this->tenant)->id,
            'status' => LeaseStatus::Active,
            'monthly_rent' => 150_000,
        ]);
        $echeance = LeasePayment::factory()->paid()->create([
            'lease_id' => $bail->id,
            'payer_id' => ($locataire ?? $this->tenant)->id,
            'amount' => 150_000,
        ]);

        return [$bail, $echeance];
    }

    /**
     * L'agent qui a saisi un bien d'agence en est le `user_id`, recopié en `landlord_id` du bail
     * (TCK-1926). En poste par défaut ; `$parti` le passe `inactive` dans l'agence.
     *
     * @return array{0: User, 1: Lease, 2: LeasePayment}
     */
    private function agentCreateur(bool $parti): array
    {
        $agent = $this->agencyAgent($this->agency);
        $bien = Property::factory()->create(['user_id' => $agent->id, 'agency_id' => $this->agency->id]);
        [$bail, $echeance] = $this->bailPaye($bien, $agent, $this->agency->id);
        if ($parti) {
            AgentProfile::query()->where('user_id', $agent->id)->update(['status' => AgentProfileStatus::Inactive->value]);
        }

        return [$agent->fresh(), $bail, $echeance];
    }

    private function en(User $qui): static
    {
        $this->app['auth']->forgetGuards();
        $this->actingAs($qui, 'sanctum');

        return $this;
    }

    private function quittance(User $qui, Lease $bail, LeasePayment $echeance): TestResponse
    {
        return $this->en($qui)->get("/api/leases/{$bail->id}/receipts/{$echeance->id}/pdf");
    }

    /**
     * AC1 + AC2 — l'agent créateur parti : la fiche lui rend 403 (témoin), la quittance aussi, sans un
     * octet de PDF. Sur l'arbre d'avant le correctif, la quittance rendait 200 (mesure consignée au ticket).
     */
    public function test_ac2_l_agent_createur_parti_ne_telecharge_plus_la_quittance(): void
    {
        [$parti, $bail, $echeance] = $this->agentCreateur(parti: true);

        $this->en($parti)->getJson("/api/leases/{$bail->id}")->assertForbidden();

        $reponse = $this->quittance($parti, $bail, $echeance);
        $reponse->assertForbidden();
        $this->assertStringNotContainsString('%PDF', (string) $reponse->getContent());
        $this->assertNotSame('application/pdf', $reponse->headers->get('Content-Type'));
    }

    /**
     * AC3 + AC4 — chaque lecteur nommé obtient la quittance (200, un vrai PDF), et le verdict de la
     * route égale celui de `LeasePolicy::view`, l'agent créateur parti (AC2) compris. Seule
     * divergence admise : le collaborateur du bien encore personnel de l'agence, sans profil actif
     * dans celle-ci (branche propre à ce geste, TCK-1154) — `view` juge le personnel par le profil
     * ACTIF (ADR-0031 §3).
     */
    public function test_ac3_ac4_les_lecteurs_et_la_parite_avec_view(): void
    {
        [$createurParti, $bailDuParti, $echeanceDuParti] = $this->agentCreateur(parti: true);
        [$createurEnPoste, $bailDuCreateur, $echeanceDuCreateur] = $this->agentCreateur(parti: false);

        $particulier = User::factory()->create();
        $bienSansAgence = Property::factory()->create(['user_id' => $particulier->id, 'agency_id' => null]);
        $locataireHorsAgence = Customer::factory()->create(['user_id' => User::factory()->create()->id, 'agency_id' => null]);
        [$bailSansAgence, $echeanceSansAgence] = $this->bailPaye($bienSansAgence, $particulier, null, $locataireHorsAgence);

        $manager = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $manager->id, 'agency_id' => $this->agency->id]);
        AgentProfile::factory()->create(['user_id' => $manager->id, 'agency_id' => Agency::factory()->create()->id]);
        PropertyCollaborator::create([
            'property_id' => $this->property->id, 'user_id' => $manager->id,
            'role' => CollaboratorRole::Manager, 'invited_at' => now()->subDay(), 'accepted_at' => now(),
        ]);

        $statutDuBailleur = function (OwnerProfileStatus $statut): Closure {
            return function () use ($statut): User {
                OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => $statut->value]);

                return $this->landlord->fresh();
            };
        };

        /** @var array<string, array{0: Closure(): User, 1: Lease, 2: LeasePayment}> $cas */
        $cas = [
            'agent créateur parti' => [fn () => $createurParti, $bailDuParti, $echeanceDuParti],
            'bailleur actif' => [$statutDuBailleur(OwnerProfileStatus::Active), $this->lease, $this->payment],
            'bailleur suspendu' => [$statutDuBailleur(OwnerProfileStatus::Blocked), $this->lease, $this->payment],
            'bailleur parti' => [$statutDuBailleur(OwnerProfileStatus::Inactive), $this->lease, $this->payment],
            'bailleur d\'un bail sans agence' => [fn () => $particulier->fresh(), $bailSansAgence, $echeanceSansAgence],
            'locataire' => [fn () => $this->client->fresh(), $this->lease, $this->payment],
            'personnel de l\'agence du bail' => [fn () => $this->agent->fresh(), $this->lease, $this->payment],
            'agent créateur en poste' => [fn () => $createurEnPoste, $bailDuCreateur, $echeanceDuCreateur],
            'collaborateur manager encore personnel' => [fn () => $manager->fresh(), $this->lease, $this->payment],
            'super-admin' => [fn () => $this->superAdmin->fresh(), $this->lease, $this->payment],
        ];

        $routes = [];
        $divergences = [];
        foreach ($cas as $qui => [$fabrique, $bail, $echeance]) {
            $user = $fabrique();
            request()->attributes->remove('active_profile');
            $voit = app(LeasePolicy::class)->view($user, $bail->fresh());

            $reponse = $this->quittance($user, $bail, $echeance);
            $routes[$qui] = $reponse->getStatusCode();
            if ($reponse->getStatusCode() === 200) {
                $this->assertStringStartsWith('%PDF-', (string) $reponse->getContent(), $qui);
            }
            if (($reponse->getStatusCode() === 200) !== $voit) {
                $divergences[] = $qui;
            }
        }
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => OwnerProfileStatus::Active->value]);

        $this->assertSame([
            'agent créateur parti' => 403,
            'bailleur actif' => 200,
            'bailleur suspendu' => 200,
            'bailleur parti' => 200,
            'bailleur d\'un bail sans agence' => 200,
            'locataire' => 200,
            'personnel de l\'agence du bail' => 200,
            'agent créateur en poste' => 200,
            'collaborateur manager encore personnel' => 200,
            'super-admin' => 200,
        ], $routes);
        $this->assertSame(['collaborateur manager encore personnel'], $divergences);
    }

    /**
     * AC5 — le coffre ne listait déjà pas les quittances à l'agent créateur parti : sa liste ne les
     * prend que sur les baux dont il est le locataire, et `documents/generated` pose `view` en amont.
     * Relu ici pour que la règle des quittances et celle du coffre ne divergent pas en silence.
     */
    public function test_ac5_le_coffre_de_l_agent_createur_parti_ne_porte_aucune_quittance_du_bail(): void
    {
        [$parti, $bail] = $this->agentCreateur(parti: true);
        $chemin = "/leases/{$bail->id}/receipts/";

        $coffre = $this->en($parti)->getJson('/api/me/document-vault')->assertOk();
        $this->assertSame([], self::cheminsVers($coffre, $chemin));

        $this->en($parti)->getJson("/api/documents/generated?target=lease:{$bail->id}")->assertForbidden();

        // Témoin : le locataire du même bail voit bien la quittance dans le même coffre.
        $duLocataire = $this->en($this->client->fresh())->getJson('/api/me/document-vault')->assertOk();
        $this->assertCount(1, self::cheminsVers($duLocataire, $chemin));
    }

    /** @return list<string> les `download_path` de la réponse qui visent `$chemin` */
    private static function cheminsVers(TestResponse $reponse, string $chemin): array
    {
        $trouves = [];
        $tableau = (array) $reponse->json();
        array_walk_recursive($tableau, function ($valeur, $cle) use (&$trouves, $chemin): void {
            if ($cle === 'download_path' && is_string($valeur) && str_contains($valeur, $chemin)) {
                $trouves[] = $valeur;
            }
        });

        return $trouves;
    }
}

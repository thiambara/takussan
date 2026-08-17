<?php

namespace Tests\Unit\Policies;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Guarantor;
use App\Models\Inventory;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Payout;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use App\Policies\BookingPaymentPolicy;
use App\Policies\BookingPolicy;
use App\Policies\CustomerPolicy;
use App\Policies\DocumentPolicy;
use App\Policies\GuarantorPolicy;
use App\Policies\InventoryPolicy;
use App\Policies\InvoicePolicy;
use App\Policies\LeasePaymentPolicy;
use App\Policies\LeasePolicy;
use App\Policies\MaintenanceRequestPolicy;
use App\Policies\PayoutPolicy;
use App\Policies\PropertyPolicy;
use App\Policies\PropertyVisitPolicy;
use App\Policies\TaskPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\BaseTestCase;

/**
 * TCK-306 — les règles d'autorisation que 25 contrôleurs redéfinissaient chacun de leur côté.
 *
 * **Pourquoi ce fichier, et pourquoi maintenant.** Mesuré le 2026-08-17 : 25 contrôleurs
 * définissaient leurs propres `authorizeAccess()` / `authorizeManage()`, 88 appels, la même
 * logique copiée-collée. Le lot où une erreur n'ouvre pas un test rouge mais **une porte** : une
 * clause perdue en déplaçant une règle ne produit rien de visible — elle produit un accès.
 *
 * Chaque test ci-dessous couvre **une clause** d'une règle migrée, et affirme sa réciproque :
 * l'acteur que la clause désigne passe, et un acteur d'une autre agence ne passe pas. C'est la
 * réciproque qui porte la preuve — sans elle, une policy qui rendrait `true` sans regarder
 * personne serait verte partout.
 *
 * ⚠ **Ces tests précèdent le recâblage des contrôleurs, pas l'écriture des policies** — une
 * assertion ne peut pas s'écrire avant son sujet. Ce qu'ils gardent, c'est l'étape risquée :
 * remplacer 88 `$this->authorizeAccess(...)` par `$this->authorize(...)`. Leur non-vacuité est
 * prouvée par ablation, clause par clause, et la sortie de ces ablations est dans le rapport.
 */
class MigratedAuthorizationRulesTest extends BaseTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Agency $autreAgence;

    /** Membre de l'agence propriétaire — la clause « périmètre d'agence ». */
    private User $membre;

    /** Membre d'une AUTRE agence — la réciproque de toutes les clauses. */
    private User $etranger;

    private User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->autreAgence = Agency::factory()->create();

        $this->membre = User::factory()->create();
        $this->materializeRoleProfile($this->membre, 'agent', $this->agency);

        $this->etranger = User::factory()->create();
        $this->materializeRoleProfile($this->etranger, 'agent', $this->autreAgence);

        $this->superAdmin = User::factory()->create();
        $this->materializeRoleProfile($this->superAdmin, 'super_admin');
    }

    /** Un utilisateur sans aucun profil : `agency_id` vaut null, aucune clause ne le désigne. */
    private function quidam(): User
    {
        return User::factory()->create();
    }

    // -----------------------------------------------------------------
    // Property — la règle la plus copiée : DIX contrôleurs la portaient
    // -----------------------------------------------------------------

    public function test_property_view_admits_owner_agency_and_super_admin_only(): void
    {
        $proprietaire = $this->quidam();
        $property = Property::factory()->create([
            'user_id' => $proprietaire->id,
            'agency_id' => $this->agency->id,
        ]);
        $policy = app(PropertyPolicy::class);

        $this->assertTrue($policy->view($proprietaire, $property), 'propriétaire');
        $this->assertTrue($policy->view($this->membre, $property), "périmètre d'agence");
        $this->assertTrue($policy->view($this->superAdmin, $property), 'super-admin');

        $this->assertFalse($policy->view($this->etranger, $property), 'agence tierce');
        $this->assertFalse($policy->view($this->quidam(), $property), 'sans profil');
    }

    // -----------------------------------------------------------------
    // Lease — la clause LOCATAIRE sépare view de update
    // -----------------------------------------------------------------

    public function test_lease_view_admits_the_tenant_but_update_does_not(): void
    {
        $bailleur = $this->quidam();
        $locataireUser = $this->quidam();
        $customer = Customer::factory()->create([
            'user_id' => $locataireUser->id,
            'agency_id' => $this->agency->id,
        ]);
        $lease = Lease::factory()->create([
            'landlord_id' => $bailleur->id,
            'agency_id' => $this->agency->id,
            'tenant_id' => $customer->id,
        ]);
        $policy = new LeasePolicy;

        $this->assertTrue($policy->view($bailleur, $lease), 'bailleur');
        $this->assertTrue($policy->view($this->membre, $lease), "périmètre d'agence");
        $this->assertTrue($policy->view($locataireUser, $lease), 'LOCATAIRE — la clause propre à view');
        $this->assertFalse($policy->view($this->etranger, $lease), 'agence tierce');

        $this->assertTrue($policy->update($bailleur, $lease), 'bailleur');
        $this->assertTrue($policy->update($this->membre, $lease), "périmètre d'agence");
        $this->assertFalse(
            $policy->update($locataireUser, $lease),
            'le locataire LIT son bail, il ne le modifie pas — la clause absente de update',
        );
    }

    // -----------------------------------------------------------------
    // Booking — le créateur et le client lisent, ils n'administrent pas
    // -----------------------------------------------------------------

    public function test_booking_view_admits_creator_and_customer_but_update_does_not(): void
    {
        $createur = $this->quidam();
        $clientUser = $this->quidam();
        $proprietaire = $this->quidam();
        $customer = Customer::factory()->create([
            'user_id' => $clientUser->id,
            'agency_id' => $this->agency->id,
        ]);
        $property = Property::factory()->create([
            'user_id' => $proprietaire->id,
            'agency_id' => $this->agency->id,
        ]);
        $booking = Booking::factory()->create([
            'created_by_id' => $createur->id,
            'customer_id' => $customer->id,
            'property_id' => $property->id,
            'agency_id' => $this->agency->id,
        ]);
        $policy = new BookingPolicy;

        $this->assertTrue($policy->view($createur, $booking), 'créateur');
        $this->assertTrue($policy->view($clientUser, $booking), 'client');
        $this->assertTrue($policy->view($proprietaire, $booking), 'propriétaire du bien');
        $this->assertTrue($policy->view($this->membre, $booking), "périmètre d'agence");
        $this->assertFalse($policy->view($this->etranger, $booking), 'agence tierce');

        $this->assertFalse($policy->update($createur, $booking), 'le créateur seul n’administre pas');
        $this->assertFalse($policy->update($clientUser, $booking), 'le client n’administre pas');
        $this->assertTrue($policy->update($proprietaire, $booking), 'propriétaire du bien');
        $this->assertTrue($policy->update($this->membre, $booking), "périmètre d'agence");
    }

    // -----------------------------------------------------------------
    // Customer
    // -----------------------------------------------------------------

    public function test_customer_view_admits_the_creator_and_the_agency(): void
    {
        $createur = $this->quidam();
        $customer = Customer::factory()->create([
            'added_by_id' => $createur->id,
            'agency_id' => $this->agency->id,
        ]);
        $policy = new CustomerPolicy;

        $this->assertTrue($policy->view($createur, $customer), 'celui qui l’a ajouté');
        $this->assertTrue($policy->view($this->membre, $customer), "périmètre d'agence");
        $this->assertTrue($policy->view($this->superAdmin, $customer), 'super-admin');
        $this->assertFalse($policy->view($this->etranger, $customer), 'agence tierce');
    }

    // -----------------------------------------------------------------
    // Guarantor — l'agence passe par addedBy, pas par une colonne du modèle
    // -----------------------------------------------------------------

    public function test_guarantor_view_derives_the_agency_from_the_creator(): void
    {
        $guarantor = Guarantor::factory()->create(['added_by_id' => $this->membre->id]);
        $policy = new GuarantorPolicy;

        $this->assertTrue($policy->view($this->membre, $guarantor), 'celui qui l’a ajoutée');
        $this->assertTrue($policy->view($this->superAdmin, $guarantor), 'super-admin');
        $this->assertFalse($policy->view($this->etranger, $guarantor), 'agence tierce');
        $this->assertFalse($policy->view($this->quidam(), $guarantor), 'sans profil');
    }

    // -----------------------------------------------------------------
    // Inventory — le locataire lit, il ne modifie pas
    // -----------------------------------------------------------------

    public function test_inventory_view_admits_the_tenant_but_update_does_not(): void
    {
        $conducteur = $this->quidam();
        $locataireUser = $this->quidam();
        $customer = Customer::factory()->create([
            'user_id' => $locataireUser->id,
            'agency_id' => $this->agency->id,
        ]);
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $inventory = Inventory::factory()->create([
            'property_id' => $property->id,
            'conducted_by' => $conducteur->id,
            'tenant_id' => $customer->id,
        ]);
        $policy = new InventoryPolicy;

        $this->assertTrue($policy->view($conducteur, $inventory), 'celui qui l’a conduit');
        $this->assertTrue($policy->view($locataireUser, $inventory), 'LOCATAIRE — clause propre à view');
        $this->assertTrue($policy->view($this->membre, $inventory), "périmètre d'agence du bien");
        $this->assertFalse($policy->view($this->etranger, $inventory), 'agence tierce');

        $this->assertTrue($policy->update($conducteur, $inventory));
        $this->assertFalse(
            $policy->update($locataireUser, $inventory),
            'le locataire conteste son état des lieux, il ne le réécrit pas',
        );
    }

    // -----------------------------------------------------------------
    // Invoice — le client facturé lit, il n'administre pas
    // -----------------------------------------------------------------

    public function test_invoice_view_admits_the_billed_customer_but_update_does_not(): void
    {
        $emetteur = $this->quidam();
        $clientUser = $this->quidam();
        $customer = Customer::factory()->create([
            'user_id' => $clientUser->id,
            'agency_id' => $this->agency->id,
        ]);
        $invoice = Invoice::factory()->create([
            'issued_by_id' => $emetteur->id,
            'agency_id' => $this->agency->id,
            'customer_id' => $customer->id,
        ]);
        $policy = new InvoicePolicy;

        $this->assertTrue($policy->view($emetteur, $invoice), 'émetteur');
        $this->assertTrue($policy->view($clientUser, $invoice), 'client facturé — clause propre à view');
        $this->assertTrue($policy->view($this->membre, $invoice), "périmètre d'agence");
        $this->assertFalse($policy->view($this->etranger, $invoice), 'agence tierce');

        $this->assertTrue($policy->update($emetteur, $invoice));
        $this->assertFalse($policy->update($clientUser, $invoice), 'le client ne modifie pas sa facture');
    }

    // -----------------------------------------------------------------
    // Payout — le bénéficiaire lit, il ne marque pas « payé »
    // -----------------------------------------------------------------

    public function test_payout_view_admits_the_beneficiary_but_update_does_not(): void
    {
        $beneficiaire = $this->quidam();
        $emetteur = $this->quidam();
        $payout = Payout::factory()->create([
            'landlord_id' => $beneficiaire->id,
            'issued_by_id' => $emetteur->id,
            'agency_id' => $this->agency->id,
        ]);
        $policy = new PayoutPolicy;

        $this->assertTrue($policy->view($beneficiaire, $payout), 'bénéficiaire — clause propre à view');
        $this->assertTrue($policy->view($emetteur, $payout), 'émetteur');
        $this->assertTrue($policy->view($this->membre, $payout), "périmètre d'agence");
        $this->assertFalse($policy->view($this->etranger, $payout), 'agence tierce');

        $this->assertFalse(
            $policy->update($beneficiaire, $payout),
            'un bailleur voit son versement, il ne le déclare pas payé',
        );
        $this->assertTrue($policy->update($emetteur, $payout));
    }

    // -----------------------------------------------------------------
    // MaintenanceRequest — quatre rôles distincts, quatre règles distinctes
    // -----------------------------------------------------------------

    public function test_maintenance_request_separates_requester_provider_and_owner_side(): void
    {
        $demandeur = $this->quidam();
        $prestataire = $this->quidam();
        $proprietaire = $this->quidam();
        $property = Property::factory()->create([
            'user_id' => $proprietaire->id,
            'agency_id' => $this->agency->id,
        ]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => $demandeur->id,
            'assigned_to' => $prestataire->id,
        ]);
        $policy = new MaintenanceRequestPolicy;

        // view : demandeur + prestataire + propriétaire + agence
        $this->assertTrue($policy->view($demandeur, $mr), 'DEMANDEUR — clause propre à view');
        $this->assertTrue($policy->view($prestataire, $mr), 'prestataire assigné');
        $this->assertTrue($policy->view($proprietaire, $mr), 'propriétaire du bien');
        $this->assertTrue($policy->view($this->membre, $mr), "périmètre d'agence");
        $this->assertFalse($policy->view($this->etranger, $mr), 'agence tierce');

        // update : le demandeur sort
        $this->assertFalse(
            $policy->update($demandeur, $mr),
            'celui qui signale une panne ne décide pas de sa résolution',
        );
        $this->assertTrue($policy->update($prestataire, $mr));

        // manageQuotes : côté donneur d'ordre seulement
        $this->assertTrue($policy->manageQuotes($proprietaire, $mr));
        $this->assertTrue($policy->manageQuotes($this->membre, $mr));
        $this->assertFalse($policy->manageQuotes($prestataire, $mr), 'le prestataire n’accepte pas son propre devis');
        $this->assertFalse($policy->manageQuotes($demandeur, $mr));

        // actAsProvider : le prestataire assigné, et lui seul
        $this->assertTrue($policy->actAsProvider($prestataire, $mr));
        $this->assertFalse($policy->actAsProvider($proprietaire, $mr), 'le propriétaire ne soumet pas de devis');
        $this->assertFalse($policy->actAsProvider($this->membre, $mr), "l'agence non plus");
    }

    // -----------------------------------------------------------------
    // PropertyVisit — le visiteur et le client lisent, ils n'administrent pas
    // -----------------------------------------------------------------

    public function test_property_visit_view_admits_visitor_and_customer_but_update_does_not(): void
    {
        $visiteur = $this->quidam();
        $agent = $this->quidam();
        $clientUser = $this->quidam();
        $customer = Customer::factory()->create([
            'user_id' => $clientUser->id,
            'agency_id' => $this->agency->id,
        ]);
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $visiteur->id,
            'agent_id' => $agent->id,
            'customer_id' => $customer->id,
        ]);
        $policy = new PropertyVisitPolicy;

        $this->assertTrue($policy->view($visiteur, $visit), 'VISITEUR — clause propre à view');
        $this->assertTrue($policy->view($clientUser, $visit), 'CLIENT — clause propre à view');
        $this->assertTrue($policy->view($agent, $visit), 'agent');
        $this->assertTrue($policy->view($this->membre, $visit), "périmètre d'agence");
        $this->assertFalse($policy->view($this->etranger, $visit), 'agence tierce');

        $this->assertFalse($policy->update($visiteur, $visit), 'le visiteur ne réécrit pas la visite');
        $this->assertFalse($policy->update($clientUser, $visit));
        $this->assertTrue($policy->update($agent, $visit));
    }

    // -----------------------------------------------------------------
    // Task — la seule règle du lot SANS clause d'agence
    // -----------------------------------------------------------------

    public function test_task_view_is_personal_and_ignores_the_agency(): void
    {
        $createur = $this->quidam();
        $assigne = $this->quidam();
        $task = Task::factory()->create([
            'created_by_id' => $createur->id,
            'assigned_to_id' => $assigne->id,
        ]);
        $policy = new TaskPolicy;

        $this->assertTrue($policy->view($createur, $task), 'créateur');
        $this->assertTrue($policy->view($assigne, $task), 'assigné');
        $this->assertTrue($policy->view($this->superAdmin, $task), 'super-admin');
        $this->assertFalse(
            $policy->view($this->membre, $task),
            "une tâche est PERSONNELLE : l'agence ne la lit pas — seule règle du lot sans clause d'agence",
        );
    }

    public function test_task_attach_to_reads_two_different_ownership_columns(): void
    {
        $policy = new TaskPolicy;

        // Property porte la propriété par `user_id`
        $proprietaire = $this->quidam();
        $property = Property::factory()->create([
            'user_id' => $proprietaire->id,
            'agency_id' => $this->autreAgence->id,
        ]);
        $this->assertTrue($policy->attachTo($proprietaire, $property), 'Property → user_id');

        // Customer porte la propriété par `added_by_id`
        $ajouteur = $this->quidam();
        $customer = Customer::factory()->create([
            'added_by_id' => $ajouteur->id,
            'agency_id' => $this->autreAgence->id,
        ]);
        $this->assertTrue($policy->attachTo($ajouteur, $customer), 'Customer → added_by_id');

        // et l'agence dans les deux cas
        $customerIci = Customer::factory()->create(['agency_id' => $this->agency->id]);
        $this->assertTrue($policy->attachTo($this->membre, $customerIci), "périmètre d'agence");
        $this->assertFalse($policy->attachTo($this->etranger, $customerIci), 'agence tierce');
    }

    // -----------------------------------------------------------------
    // Document — sept branches polymorphes, et update BIEN plus étroit que view
    // -----------------------------------------------------------------

    public function test_document_update_is_narrower_than_view(): void
    {
        $televerseur = $this->quidam();
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $document = Document::factory()->create([
            'uploaded_by' => $televerseur->id,
            'documentable_type' => Property::class,
            'documentable_id' => $property->id,
        ]);
        $policy = new DocumentPolicy;

        $this->assertTrue($policy->view($televerseur, $document), 'celui qui l’a téléversé');
        $this->assertTrue($policy->view($this->membre, $document), 'agence du bien porteur — via attachTo');
        $this->assertFalse($policy->view($this->etranger, $document), 'agence tierce');

        $this->assertTrue($policy->update($televerseur, $document));
        $this->assertFalse(
            $policy->update($this->membre, $document),
            "update est réservé au téléverseur : l'agence lit le document, elle ne le remplace pas",
        );
    }

    public function test_document_attach_to_covers_each_polymorphic_branch(): void
    {
        $policy = new DocumentPolicy;
        $moi = $this->quidam();

        // Les modèles porteurs sont rattachés à `autreAgence` : `membre` (agence A) est donc le
        // tiers, et `etranger` (agence B) serait légitimement admis par la clause d'agence.
        $property = Property::factory()->create(['user_id' => $moi->id, 'agency_id' => $this->autreAgence->id]);
        $this->assertTrue($policy->attachTo($moi, $property), 'Property → user_id');
        $this->assertTrue($policy->attachTo($this->etranger, $property), 'Property → agency_id');
        $this->assertFalse($policy->attachTo($this->membre, $property), 'agence tierce');

        $lease = Lease::factory()->create(['landlord_id' => $moi->id, 'agency_id' => $this->autreAgence->id]);
        $this->assertTrue($policy->attachTo($moi, $lease), 'Lease → landlord_id');

        $booking = Booking::factory()->create(['created_by_id' => $moi->id, 'agency_id' => $this->autreAgence->id]);
        $this->assertTrue($policy->attachTo($moi, $booking), 'Booking → created_by_id');

        $customer = Customer::factory()->create(['added_by_id' => $moi->id, 'agency_id' => $this->autreAgence->id]);
        $this->assertTrue($policy->attachTo($moi, $customer), 'Customer → added_by_id');

        // User : soi-même, et personne d'autre
        $this->assertTrue($policy->attachTo($moi, $moi), 'User → soi-même');
        $this->assertFalse($policy->attachTo($moi, $this->membre), 'User → un autre compte');

        // Agency : l'agence est comparée à l'ID du modèle, pas à une colonne agency_id
        $this->assertTrue($policy->attachTo($this->membre, $this->agency), 'Agency → id');
        $this->assertFalse($policy->attachTo($this->membre, $this->autreAgence));

        // Un type non prévu est refusé — le `return false` final
        $this->assertFalse($policy->attachTo($moi, Payout::factory()->create()), 'type non prévu');
    }

    // -----------------------------------------------------------------
    // Paiements — le test polymorphe devient une policy par modèle
    // -----------------------------------------------------------------

    public function test_booking_payment_update_follows_the_booking(): void
    {
        $clientUser = $this->quidam();
        $customer = Customer::factory()->create(['user_id' => $clientUser->id, 'agency_id' => $this->agency->id]);
        $booking = Booking::factory()->create([
            'agency_id' => $this->agency->id,
            'customer_id' => $customer->id,
        ]);
        $payment = BookingPayment::factory()->create(['booking_id' => $booking->id]);
        $policy = new BookingPaymentPolicy;

        $this->assertTrue($policy->update($this->membre, $payment), "périmètre d'agence de la réservation");
        $this->assertTrue($policy->update($clientUser, $payment), 'client de la réservation');
        $this->assertTrue($policy->update($this->superAdmin, $payment), 'super-admin');
        $this->assertFalse($policy->update($this->etranger, $payment), 'agence tierce');
    }

    public function test_lease_payment_update_follows_the_lease(): void
    {
        $bailleur = $this->quidam();
        $lease = Lease::factory()->create([
            'landlord_id' => $bailleur->id,
            'agency_id' => $this->agency->id,
        ]);
        $payment = LeasePayment::factory()->create(['lease_id' => $lease->id]);
        $policy = new LeasePaymentPolicy;

        $this->assertTrue($policy->update($bailleur, $payment), 'bailleur');
        $this->assertTrue($policy->update($this->membre, $payment), "périmètre d'agence du bail");
        $this->assertFalse($policy->update($this->etranger, $payment), 'agence tierce');
    }
}

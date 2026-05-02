<?php

namespace Tests\Unit;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Inventory;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\Payout;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Relations\MorphOne;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ModelsTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_relationships_and_accessors(): void
    {
        $user = new User(['first_name' => 'John', 'last_name' => 'Doe']);
        $this->assertEquals('John Doe', $user->full_name);

        $this->assertInstanceOf(BelongsTo::class, $user->addedBy());
        $this->assertInstanceOf(HasMany::class, $user->properties());
        $this->assertInstanceOf(HasOne::class, $user->customer());
        $this->assertInstanceOf(MorphMany::class, $user->addresses());
        $this->assertInstanceOf(MorphMany::class, $user->documents());
        $this->assertInstanceOf(HasMany::class, $user->favorites());
        $this->assertInstanceOf(HasMany::class, $user->savedSearches());
        $this->assertInstanceOf(HasMany::class, $user->appNotifications());
        $this->assertInstanceOf(HasMany::class, $user->leases());
        $this->assertInstanceOf(HasMany::class, $user->writtenReviews());
        $this->assertInstanceOf(HasMany::class, $user->payouts());
        $this->assertInstanceOf(HasMany::class, $user->bookings());
        $this->assertInstanceOf(HasMany::class, $user->bookingPayments());
        $this->assertInstanceOf(HasMany::class, $user->customers());
        $this->assertInstanceOf(HasMany::class, $user->customerRelationships());
        $this->assertInstanceOf(BelongsToMany::class, $user->relatedCustomers());
        $this->assertInstanceOf(MorphMany::class, $user->receivedReviews());

        // Note: conversations() might be a belongsToMany or hasMany depending on implementation
        $this->assertNotNull($user->conversations());
    }

    public function test_agency_relationships(): void
    {
        $agency = new Agency;

        $this->assertInstanceOf(BelongsTo::class, $agency->primaryAdmin());
        $this->assertInstanceOf(HasManyThrough::class, $agency->members());
        $this->assertInstanceOf(HasMany::class, $agency->properties());
        $this->assertInstanceOf(HasMany::class, $agency->customers());
        $this->assertInstanceOf(MorphMany::class, $agency->addresses());
        $this->assertInstanceOf(HasMany::class, $agency->invoices());
        $this->assertInstanceOf(HasMany::class, $agency->payouts());
        $this->assertInstanceOf(MorphMany::class, $agency->reviews());
        $this->assertInstanceOf(HasMany::class, $agency->leases());
    }

    public function test_property_relationships(): void
    {
        $property = new Property;

        $this->assertInstanceOf(BelongsTo::class, $property->owner());
        $this->assertInstanceOf(BelongsTo::class, $property->agency());
        $this->assertInstanceOf(BelongsTo::class, $property->parent());
        $this->assertInstanceOf(HasMany::class, $property->children());
        $this->assertInstanceOf(MorphOne::class, $property->address());
        $this->assertInstanceOf(MorphMany::class, $property->documents());
        $this->assertInstanceOf(HasMany::class, $property->visits());
        $this->assertInstanceOf(HasMany::class, $property->bookings());
        $this->assertInstanceOf(HasMany::class, $property->leases());
        $this->assertInstanceOf(HasMany::class, $property->maintenanceRequests());
        $this->assertInstanceOf(MorphToMany::class, $property->tags());
        $this->assertInstanceOf(MorphMany::class, $property->reviews());
        $this->assertInstanceOf(HasMany::class, $property->collaborators());
        $this->assertInstanceOf(HasMany::class, $property->priceHistory());
    }

    public function test_booking_and_lease(): void
    {
        $booking = new Booking;
        $this->assertInstanceOf(BelongsTo::class, $booking->property());
        $this->assertInstanceOf(BelongsTo::class, $booking->customer());
        $this->assertInstanceOf(HasOne::class, $booking->lease());
        $this->assertInstanceOf(HasMany::class, $booking->payments());

        $lease = new Lease;
        $this->assertInstanceOf(BelongsTo::class, $lease->property());
        $this->assertInstanceOf(BelongsTo::class, $lease->agency());
        $this->assertInstanceOf(BelongsTo::class, $lease->tenant());
        $this->assertInstanceOf(BelongsTo::class, $lease->landlord());
        $this->assertInstanceOf(BelongsTo::class, $lease->guarantor());
        $this->assertInstanceOf(BelongsTo::class, $lease->booking());
        $this->assertInstanceOf(BelongsTo::class, $lease->renewedFrom());
        $this->assertInstanceOf(BelongsTo::class, $lease->terminatedBy());
        $this->assertInstanceOf(HasMany::class, $lease->payments());
        $this->assertInstanceOf(HasMany::class, $lease->inventories());
        $this->assertInstanceOf(HasMany::class, $lease->maintenanceRequests());
        $this->assertInstanceOf(MorphMany::class, $lease->documents());

        $payment = new LeasePayment;
        $this->assertInstanceOf(BelongsTo::class, $payment->lease());

        $bpayment = new BookingPayment;
        $this->assertInstanceOf(BelongsTo::class, $bpayment->booking());
    }

    public function test_other_entities(): void
    {
        $customer = new Customer;
        $this->assertInstanceOf(BelongsTo::class, $customer->user());
        $this->assertInstanceOf(BelongsTo::class, $customer->agency());
        $this->assertInstanceOf(BelongsTo::class, $customer->addedBy());
        $this->assertInstanceOf(HasMany::class, $customer->bookings());
        $this->assertInstanceOf(HasMany::class, $customer->leases());
        $this->assertInstanceOf(MorphMany::class, $customer->documents());
        $this->assertInstanceOf(HasMany::class, $customer->notes());
        $this->assertInstanceOf(HasMany::class, $customer->leasePayments());
        $this->assertInstanceOf(HasMany::class, $customer->relationships());
        $this->assertInstanceOf(HasMany::class, $customer->invoices());
        $this->assertInstanceOf(MorphToMany::class, $customer->tags());

        $review = new Review;
        $this->assertInstanceOf(BelongsTo::class, $review->author());
        $this->assertNotNull($review->reviewable());

        $invoice = new Invoice;
        $this->assertInstanceOf(BelongsTo::class, $invoice->agency());
        $this->assertNotNull($invoice->invoiceable());

        $payout = new Payout;
        $this->assertInstanceOf(BelongsTo::class, $payout->agency());

        $visit = new PropertyVisit;
        $this->assertInstanceOf(BelongsTo::class, $visit->property());
        $this->assertInstanceOf(BelongsTo::class, $visit->customer());
        $this->assertInstanceOf(BelongsTo::class, $visit->agent());

        $doc = new Document;
        $this->assertNotNull($doc->documentable());

        $convo = new Conversation;
        $this->assertInstanceOf(BelongsToMany::class, $convo->participants());
        $this->assertInstanceOf(HasMany::class, $convo->messages());

        $msg = new Message;
        $this->assertInstanceOf(BelongsTo::class, $msg->conversation());
        $this->assertInstanceOf(BelongsTo::class, $msg->sender());

        $inv = new Inventory;
        $this->assertInstanceOf(BelongsTo::class, $inv->property());
        $this->assertInstanceOf(BelongsTo::class, $inv->lease());

        $req = new MaintenanceRequest;
        $this->assertInstanceOf(BelongsTo::class, $req->property());
        $this->assertInstanceOf(BelongsTo::class, $req->lease());
    }
}

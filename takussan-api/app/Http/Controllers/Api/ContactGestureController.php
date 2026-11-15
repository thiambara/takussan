<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreContactGestureRequest;
use App\Models\Customer;
use App\Models\PropertyContactLead;
use App\Services\Crm\ContactGestureService;
use Illuminate\Http\Response;

/**
 * TCK-2583 — le geste de contact lancé depuis la console (ADR-0103 § 1) : le bouton WhatsApp,
 * Appeler, E-mail ou SMS d'une demande ou d'une fiche le consigne en même temps qu'il ouvre
 * l'application externe. Autorisé par `StoreContactGestureRequest`. 204.
 */
class ContactGestureController extends Controller
{
    public function __construct(private readonly ContactGestureService $gestures) {}

    public function forLead(StoreContactGestureRequest $request, PropertyContactLead $lead): Response
    {
        $this->gestures->onLead($lead, $request->user(), $request->channel());

        return response()->noContent();
    }

    public function forCustomer(StoreContactGestureRequest $request, Customer $customer): Response
    {
        $this->gestures->onCustomer($customer, $request->user(), $request->channel());

        return response()->noContent();
    }
}

<?php

use App\Http\Controllers\Api\ContactGestureController;
use App\Http\Controllers\Api\ContactLeadController;
use App\Http\Controllers\Api\ContactLeadResponseStatsController;
use Illuminate\Support\Facades\Route;

// TCK-590 — la boîte « Demandes » : les demandes de contact déposées sur le site public.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('contact-leads', [ContactLeadController::class, 'index'])->name('contact-leads.index');
    // TCK-2583 — les délais de première réponse (personnel détenteur de `crm.view_all`). Littérale :
    // avant les routes paramétrées.
    Route::get('contact-leads/response-stats', ContactLeadResponseStatsController::class)->name('contact-leads.response-stats');
    Route::get('contact-leads/{lead}', [ContactLeadController::class, 'show'])->whereNumber('lead')->name('contact-leads.show');
    Route::post('contact-leads/{lead}/handle', [ContactLeadController::class, 'handle'])->whereNumber('lead')->name('contact-leads.handle');
    Route::post('contact-leads/{lead}/assign', [ContactLeadController::class, 'assign'])->whereNumber('lead')->name('contact-leads.assign');
    Route::post('contact-leads/{lead}/convert', [ContactLeadController::class, 'convert'])->whereNumber('lead')->name('contact-leads.convert');
    // TCK-2583 — un geste de contact (WhatsApp, appel, e-mail, SMS) : 204.
    Route::post('contact-leads/{lead}/contacts', [ContactGestureController::class, 'forLead'])->whereNumber('lead')->name('contact-leads.contacts.store');
});

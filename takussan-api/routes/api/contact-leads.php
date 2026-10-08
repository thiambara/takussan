<?php

use App\Http\Controllers\Api\ContactLeadController;
use Illuminate\Support\Facades\Route;

// TCK-590 — la boîte « Demandes » : les demandes de contact déposées sur le site public.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('contact-leads', [ContactLeadController::class, 'index'])->name('contact-leads.index');
    Route::get('contact-leads/{lead}', [ContactLeadController::class, 'show'])->whereNumber('lead')->name('contact-leads.show');
    Route::post('contact-leads/{lead}/handle', [ContactLeadController::class, 'handle'])->whereNumber('lead')->name('contact-leads.handle');
    Route::post('contact-leads/{lead}/assign', [ContactLeadController::class, 'assign'])->whereNumber('lead')->name('contact-leads.assign');
    Route::post('contact-leads/{lead}/convert', [ContactLeadController::class, 'convert'])->whereNumber('lead')->name('contact-leads.convert');
});

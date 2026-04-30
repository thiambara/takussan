<?php

use App\Http\Controllers\Api\HealthController;
use Illuminate\Support\Facades\Route;

// TCK-105 — public health endpoint; no PII, no auth required.
// Always returns HTTP 200; the checks.cdn / checks.queue fields carry
// the actual status so monitoring tools can alert on degraded state.
Route::get('health', HealthController::class)->name('health');

<?php

use App\Http\Controllers\Api\MaintenanceStatusController;
use Illuminate\Support\Facades\Route;

Route::get('maintenance/status', MaintenanceStatusController::class)->name('maintenance.status');

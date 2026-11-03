<?php

use App\Http\Controllers\Api\Admin\AiDashboardController;
use App\Http\Controllers\Api\Admin\AiEvaluationController;
use App\Http\Controllers\Api\Admin\AiModelController;
use App\Http\Controllers\Api\Admin\AiProviderController;
use App\Http\Controllers\Api\Admin\AiRoleController;
use App\Http\Controllers\Api\Admin\AiUsageController;
use App\Models\Enums\PlatformAbility;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Console IA — TCK-2385 (ADR-0076 §12)
|--------------------------------------------------------------------------
| Lecture : `platform.ai.view` ; écriture : `platform.ai.manage`, sous second facteur récent
| (`ProtectedActions::STEP_UP`). Les deux gestes sont du `super_admin` seul. Aucune route ne rend
| ni n'accepte une clé de fournisseur.
*/

Route::middleware(['auth:sanctum', 'super-admin'])->prefix('admin/ai')->group(function () {
    Route::middleware('platform-can:'.PlatformAbility::AiView->value)->group(function () {
        Route::get('roles', [AiRoleController::class, 'index'])->name('admin.ai.roles.index');
        Route::get('usages', [AiUsageController::class, 'index'])->name('admin.ai.usages.index');
        Route::get('providers', [AiProviderController::class, 'index'])->name('admin.ai.providers.index');
        Route::get('models', [AiModelController::class, 'index'])->name('admin.ai.models.index');
        // TCK-2459 — littérale AVANT la paramétrée.
        Route::get('evaluations/suite', [AiEvaluationController::class, 'latestSuite'])->name('admin.ai.evaluations.suite.latest');
        Route::get('evaluations/{evaluation}', [AiEvaluationController::class, 'show'])->name('admin.ai.evaluations.show');
        Route::get('dashboard', AiDashboardController::class)->name('admin.ai.dashboard');
    });

    Route::middleware('platform-can:'.PlatformAbility::AiManage->value)->group(function () {
        Route::put('roles/{role}', [AiRoleController::class, 'update'])->name('admin.ai.roles.update');
        Route::delete('roles/{role}', [AiRoleController::class, 'destroy'])->name('admin.ai.roles.destroy');
        Route::patch('usages/{usage}', [AiUsageController::class, 'update'])->name('admin.ai.usages.update');
        Route::post('providers/{provider}/test', [AiProviderController::class, 'test'])->name('admin.ai.providers.test');
        Route::post('models', [AiModelController::class, 'store'])->name('admin.ai.models.store');
        Route::patch('models/{model}', [AiModelController::class, 'update'])->whereNumber('model')->name('admin.ai.models.update');
        Route::delete('models/{model}', [AiModelController::class, 'destroy'])->whereNumber('model')->name('admin.ai.models.destroy');
        Route::post('evaluations', [AiEvaluationController::class, 'store'])->name('admin.ai.evaluations.store');
        Route::post('evaluations/suite', [AiEvaluationController::class, 'storeSuite'])->name('admin.ai.evaluations.suite.store');
    });
});

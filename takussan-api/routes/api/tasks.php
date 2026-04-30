<?php

use App\Http\Controllers\Api\TaskController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('tasks', [TaskController::class, 'index'])->name('tasks.index');
    Route::post('tasks', [TaskController::class, 'store'])->name('tasks.store');
    Route::get('tasks/{task}', [TaskController::class, 'show'])->name('tasks.show');
    Route::put('tasks/{task}', [TaskController::class, 'update'])->name('tasks.update');
    Route::patch('tasks/{task}', [TaskController::class, 'update']);
    Route::delete('tasks/{task}', [TaskController::class, 'destroy'])->name('tasks.destroy');
});

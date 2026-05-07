<?php

use App\Http\Controllers\Api\PublicBusinessEnumController;
use Illuminate\Support\Facades\Route;

Route::get('enums/{key}', [PublicBusinessEnumController::class, 'show'])
    ->middleware('cache.headers:public;max_age=300;etag')
    ->name('enums.show');

<?php

use App\Services\Utils;
use Illuminate\Support\Facades\App;


if (!function_exists('utils')) {
    /**
     * get the firebase client service
     *
     * @return Utils
     */
    function utils(): Utils
    {
        return App::make(Utils::class);
    }
}


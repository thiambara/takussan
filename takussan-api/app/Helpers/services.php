<?php

use App\Services\Utils\Utils;


if (!function_exists('utils')) {
    function utils(): Utils
    {
        return resolve(Utils::class);
    }
}


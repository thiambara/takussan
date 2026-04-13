<?php

namespace App\Services\Utils\Traits;

trait _Sum
{

    public static function sum(?array $array, callable $callback, mixed $initialValue = 0)
    {
        return array_reduce($array ?? [], function ($result, $current) use ($callback) {
            if (isset($result)) {
                return ($result) + $callback($current);
            }
            return $callback($current);
        }, $initialValue);
    }
}

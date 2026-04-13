<?php

namespace App\Services\Utils\Traits;

trait _GroupBy
{

    public static function groupBy(array $array, $key): array
    {
        $return = array();
        foreach ($array as $val) {
            $return[$val[$key]][] = $val;
        }
        return $return;
    }
}

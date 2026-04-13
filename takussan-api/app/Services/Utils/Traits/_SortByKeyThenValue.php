<?php

namespace App\Services\Utils\Traits;

use Illuminate\Support\Arr;

trait _SortByKeyThenValue
{

    public static function sortArrayByKeyThenValue(array $array): array
    {
        // check if array is associative or not
        Arr::isAssoc($array) ? ksort($array) : sort($array);

        foreach ($array as $key => $value) {
            if (is_array($value)) {
                $array[$key] = self::sortArrayByKeyThenValue($value);
            }
        }
        return $array;
    }
}

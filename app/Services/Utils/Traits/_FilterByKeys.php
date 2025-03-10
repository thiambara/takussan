<?php

namespace App\Services\Utils\Traits;

trait _FilterByKeys
{
    /**
     * This function returns a new array based on <<$array>> with only the keys that are in <$keys>
     *
     * Example:
     *
     * filterByKeys ( ['amine'=> 'sage', 'mor'=> 'bon', 'ad'=> 'jtm'],['amine', 'ad', 'jean'] )
     *
     * will return ['amine'=> 'sage', 'ad'=> 'jtm']
     *
     * @param array $array
     * @param array $keys
     * @return array
     */
    public static function filterByKeys(array $array, array $keys): array
    {
        $response = array_intersect_key($array, array_flip($keys));
        foreach ($keys as $index => $key) {
            if (is_array($key) && array_key_exists($index, $array) && is_array($array[$index])) {
                $response[$index] = self::filterByKeys($array[$index], $key);
            }
        }
        return $response;
    }
}

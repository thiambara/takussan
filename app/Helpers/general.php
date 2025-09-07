<?php


use Illuminate\Support\Str;

if (!function_exists('to_camel_case')) {

    /**
     * @param string[]|string|null $str
     * @return string[]|string|null
     */
    function to_camel_case(array|string|null $str): array|string|null
    {
        if ($str === null) return null;
        if (is_string($str)) return Str::camel($str);

        return array_map(function ($string) {
            return to_camel_case($string);
        }, $str);
    }
}

if (!function_exists('to_snake_case')) {
    /**
     * @param array|string|null $str
     * @return string[]|string|null
     */
    function to_snake_case(array|string|null $str): array|string|null
    {
        if ($str === null) return null;
        if (is_string($str)) return Str::snake($str);

        return array_map(function ($string) {
            return to_snake_case($string);
        }, $str);
    }
}

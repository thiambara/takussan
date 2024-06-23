<?php


if (!function_exists('to_camel_case')) {

    /**
     * @param string[]|string|null $str
     * @return string[]|string|null
     */
    function to_camel_case(array|string|null $str): array|string|null
    {
        if ($str === null) return null;
        if (is_string($str)) return Str::camel($str);

        $values = [];
        foreach ($str as $string) {
            $values[] = to_camel_case($string);
        }
        return $values;
    }
}

if (!function_exists('to_snake_case')) {
    /**
     * @param iterable|string|null $str
     * @return string[]|string|null
     */
    function to_snake_case(iterable|string|null $str): array|string|null
    {
        if ($str === null) return null;
        if (is_string($str)) return Str::snake($str);
        $values = [];
        foreach ($str as $string) {
            $values[] = to_snake_case($string);
        }
        return $values;
    }
}

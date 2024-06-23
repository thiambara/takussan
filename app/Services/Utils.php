<?php

namespace App\Services;

use DateTime;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class Utils
{

    public static function sum(?array $array, callable $callback, mixed $initialValue = null)
    {
        return array_reduce($array ?? [], function ($result, $current) use ($callback) {
            if (isset($result)) {
                return ($result) + $callback($current);
            }
            return $callback($current);
        }, $initialValue);
    }

    public static function groupBy(array $array, $key): array
    {
        $return = array();
        foreach ($array as $val) {
            $return[$val[$key]][] = $val;
        }
        return $return;
    }

    public static function getTimestamp(): int
    {
        return (new DateTime())->getTimestamp();
    }

    /**
     * This function returns a new array based on <<$array>> with only the keys that are in <<$keys>>
     *
     * Example:
     *
     * arrayKeyOnlyIncludingEmpty ( ['amine'=> 'sage', 'mor'=> 'bon', 'ad'=> 'jtm'],['amine', 'ad', 'jean'] )
     *
     * will return ['amine'=> 'sage', 'ad'=> 'jtm']
     *
     * @param  array  $array
     * @param  array  $keys
     * @return array
     */
    public static function arrayKeyOnlyIncludingEmpty(array $array, array $keys): array
    {
        $response = [];
        foreach ($keys as $index => $key) {
            if (is_array($key)) {
                if (array_key_exists($index, $array) && is_array($subArray = $array[$index])) {
                    $response[$index] = self::arrayKeyOnlyIncludingEmpty($subArray, $key);
                }
            } else {
                if (array_key_exists($key, $array)) {
                    $response[$key] = $array[$key];
                }
            }
        }
        return $response;
    }

    /**
     * format phones number to international format
     *
     * @param  array|string  $phones
     * @param  bool  $withPlus
     * @return array|string
     */
    public static function formatPhones(array|string $phones, bool $withPlus = true): array|string
    {
        if (!is_array($phones)) {
            return self::formatOnePhone($phones, $withPlus);
        }
        $response = [];
        foreach ($phones as $phone) {
            $response[] = self::formatOnePhone($phone, $withPlus);
        }
        return $response;
    }

    private static function formatOnePhone(string $phone, bool $withPlus = true): string
    {
        $phone = self::normalizeTelephoneNumber($phone);
        if (!($plus = Str::is('+*', $phone)) && !($zero = Str::is('00*', $phone)) && Str::length($phone) == 9) {
            $phone = ($withPlus ? '+' : '').'221'.$phone;
        } else {
            if ($plus && !$withPlus) {
                return Str::remove('+', $phone);
            } else {
                if (($zero ?? false) && !$withPlus) {
                    return Str::replaceFirst('00', '', $phone);
                }
            }
        }
        return $phone;
    }

    public static function useTrait(string|object $object, string $trait): bool
    {
        return in_array($trait, array_keys(class_uses_recursive($object)));
    }

    /**
     * Convert base 64 string to image file
     *
     * @param $base64Image
     * @param $imagePath
     * @return string
     */
    public static function base64ToImage($base64Image, $imagePath): string
    {
        $image_64 = $base64Image;
        // explode the image to get the extension
        $extension = explode(';base64', $image_64);
        //from the first element
        $extension = explode('/', $extension[0]);
        // from the 2nd element
        $extension = $extension[1];

        $replace = substr($image_64, 0, strpos($image_64, ',') + 1);

        // finding the substring from
        // replace here for example in our case: data:image/png;base64,
        $image = str_replace($replace, '', $image_64);
        // replace
        $image = str_replace(' ', '+', $image);
        // set the image name using the time and a random string plus
        // an extension
        $imageName = time().'_'.'.'.$extension;
        // save the image in the image path we passed from the
        // function parameter.
        Storage::disk('public')->put($imagePath.'/'.$imageName, base64_decode($image));
        // return the image path and feed to the function that requests it
        return $imagePath.'/'.$imageName;
    }

    public static function isDigits(string $s, int|null $minDigits = null, int|null $maxDigits = null): bool
    {
        $maxDigits ??= 14;
        $minDigits ??= 9;
        return preg_match('/^[0-9]{'.$minDigits.','.$maxDigits.'}\z/', $s);
    }

    public static function isValidTelephoneNumber(
        string $telephone,
        int|null $minDigits = null,
        int|null $maxDigits = null
    ): bool {
        $maxDigits ??= 14;
        $minDigits ??= 9;
        if (preg_match('/^[+][0-9]/', $telephone)) { //is the first character + followed by a digit
            $count = 1;
            $telephone = str_replace(['+'], '', $telephone, $count); //remove +
        }

        $telephone = str_replace([' ', '.', '-', '(', ')'], '', $telephone);

        return self::isDigits($telephone, $minDigits, $maxDigits);
    }

    public static function normalizeTelephoneNumber(string $telephone): string
    {
        return str_replace([' ', '.', '-', '(', ')'], '', $telephone);
    }

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

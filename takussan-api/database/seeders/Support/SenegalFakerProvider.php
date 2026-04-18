<?php

namespace Database\Seeders\Support;

use Faker\Provider\Base;

/**
 * Faker provider with Senegalese flavour used to make the seed data more
 * realistic (names, phone prefixes, Dakar neighbourhoods, cities).
 */
class SenegalFakerProvider extends Base
{
    protected static $firstNames = [
        'Mouhamed', 'Cheikh', 'Ibrahima', 'Moustapha', 'Abdoulaye', 'Ousmane',
        'Modou', 'Mamadou', 'Aliou', 'Malick', 'Fallou', 'Serigne', 'Pape',
        'Aïssatou', 'Awa', 'Fatou', 'Khady', 'Ndeye', 'Aminata', 'Mariama',
        'Bineta', 'Coumba', 'Sokhna', 'Yacine', 'Astou', 'Oumy', 'Rokhaya',
    ];

    protected static $lastNames = [
        'Diop', 'Ndiaye', 'Fall', 'Sarr', 'Sow', 'Ba', 'Diallo', 'Gueye',
        'Sy', 'Mbaye', 'Thiam', 'Cissé', 'Seck', 'Niang', 'Faye', 'Kane',
        'Sene', 'Diouf', 'Dieng', 'Wade', 'Ndoye', 'Samb', 'Toure',
    ];

    protected static $dakarNeighborhoods = [
        'Plateau', 'Almadies', 'Mermoz', 'Sacré-Cœur', 'Fann', 'Ouakam',
        'Yoff', 'Ngor', 'Point E', 'Liberté 6', 'Sicap Baobab', 'HLM',
        'Parcelles Assainies', 'Grand-Yoff', 'Dieupeul', 'Amitié',
        'Hann Maristes', 'Ouest Foire', 'Cité Keur Gorgui',
    ];

    protected static $cities = [
        'Dakar', 'Thiès', 'Saint-Louis', 'Rufisque', 'Mbour', 'Kaolack',
        'Ziguinchor', 'Touba', 'Diourbel', 'Louga',
    ];

    protected static $phonePrefixes = ['77', '78', '76', '70', '75'];

    public function senegaleseFirstName(): string
    {
        return static::randomElement(static::$firstNames);
    }

    public function senegaleseLastName(): string
    {
        return static::randomElement(static::$lastNames);
    }

    public function senegalesePhoneNumber(): string
    {
        $prefix = static::randomElement(static::$phonePrefixes);

        return '+221'.$prefix.static::numerify('#######');
    }

    public function senegaleseLandline(): string
    {
        return '+22133'.static::numerify('#######');
    }

    public function dakarNeighborhood(): string
    {
        return static::randomElement(static::$dakarNeighborhoods);
    }

    public function senegaleseCity(): string
    {
        return static::randomElement(static::$cities);
    }
}

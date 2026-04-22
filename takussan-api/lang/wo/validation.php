<?php

/*
|--------------------------------------------------------------------------
| Validation Language Lines (WO — Wolof)
|--------------------------------------------------------------------------
| Partial translation — covers only the custom rules used by the app.
| Laravel will fall back to English for unspecified keys.
*/

return [
    'required' => 'Barabu :attribute bi dafa war.',
    'email' => 'Barabu :attribute bi war na ànd ak email bu baax.',
    'min' => [
        'string' => 'Barabu :attribute bi war na am :min araf walla lu ko ëpp.',
        'numeric' => 'Barabu :attribute bi war na dëkke :min walla lu ko ëpp.',
    ],
    'max' => [
        'string' => 'Barabu :attribute bi du mën a ëpp :max araf.',
        'numeric' => 'Barabu :attribute bi du mën a ëpp :max.',
    ],
    'unique' => 'Barabu :attribute bi jëfandikoo nañu ko ba noppi.',
    'exists' => 'Barabu :attribute bi ñu tànn baaxul.',

    'rules' => [
        'phone' => 'Nimerow tëlefon bi war na doon bu baax (ci misaal +221 77 123 45 67 walla 771234567).',
        'currency' => 'Xaalisu waxe bi war na bokk ci : :allowed.',
        'date_range' => 'Bés bi war na doon walla ëpp :start.',
        'strong_password' => 'Baatu-jubluwaay war na am 8 araf walla lu ko ëpp, ànd ak araf bu mag, araf bu ndaw, limam, ak araf bu jëm.',
    ],
    'max_guarantors_reached' => 'Benn luwé du mën a am lu ëpp 3 ñu koy wóolu.',
    'bounds_format' => 'Barabu :attribute bi war na am ñeent nimero ñu taxaw ci virgule : sw_lat,sw_lng,ne_lat,ne_lng.',
    'commission_share_exceeds_cap' => 'Xaalisu commission yi ci mbaar mi du mën a ëpp 100%.',
];

<?php

beforeEach(function () {
    var_dump( 'amine');
});

test('example', function () {
//    $image = fake()->image('storage/framework/testing', 400, 300, null, false);

    $response = $this->get('/');

    $response->assertStatus(200);
});

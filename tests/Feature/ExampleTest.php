<?php

beforeEach(function () {
    var_dump('amine ');
});

test('the application returns a successful response', function () {
    $response = $this->get('/');

    $response->assertStatus(200);
});

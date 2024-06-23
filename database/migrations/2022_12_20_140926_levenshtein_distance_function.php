<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up(): void
    {
    /*    \Illuminate\Support\Facades\DB::statement(
            '
            CREATE FUNCTION levenshtein_distance(s1 VARCHAR(255), s2 VARCHAR(255))
                RETURNS INT
                DETERMINISTIC
            BEGIN
                DECLARE s1_length, s2_length, i, j, c, c_temp, cost INT;
                DECLARE s1_char CHAR;
                DECLARE cv0, cv1 VARBINARY(256);
                SET s1_length = CHAR_LENGTH(s1), s2_length = CHAR_LENGTH(s2), cv1 = 0x00, j = 1, i = 1, c = 0;
                IF s1 = s2 THEN
                    RETURN 0;
                ELSEIF s1_length = 0 THEN
                    RETURN s2_length;
                ELSEIF s2_length = 0 THEN
                    RETURN s1_length;
                ELSE
                    WHILE j <= s2_length DO
                            SET cv1 = CONCAT(cv1, UNHEX(HEX(j))), j = j + 1;
                        END WHILE;
                    WHILE i <= s1_length DO
                            SET s1_char = SUBSTRING(s1, i, 1), c = i, cv0 = UNHEX(HEX(i)), j = 1;
                            WHILE j <= s2_length DO
                                    SET c = c + 1;
                                    IF s1_char = SUBSTRING(s2, j, 1) THEN
                                        SET cost = 0;
                                    ELSE
                                        SET cost = 1;
                                    END IF;
                                    SET c_temp = CONV(HEX(SUBSTRING(cv1, j, 1)), 16, 10) + cost;
                                    IF c > c_temp THEN
                                        SET c = c_temp;
                                    END IF;
                                    SET c_temp = CONV(HEX(SUBSTRING(cv1, j+1, 1)), 16, 10) + 1;
                                    IF c > c_temp THEN
                                        SET c = c_temp;
                                    END IF;
                                    SET cv0 = CONCAT(cv0, UNHEX(HEX(c))), j = j + 1;
                                END WHILE;
                            SET cv1 = cv0, i = i + 1;
                        END WHILE;
                END IF;
                RETURN c;
            END;'
        );*/
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down(): void
    {
//        DB::statement('DROP FUNCTION levenshtein_distance');
    }
};

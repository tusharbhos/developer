<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('user','admin','developer_super_admin','sourcing_admin','sales_user') NOT NULL DEFAULT 'user'");
    }

    public function down(): void
    {
        // Ensure no records keep values that are not supported by the old enum.
        DB::table('users')
            ->whereIn('role', ['developer_super_admin', 'sourcing_admin', 'sales_user'])
            ->update(['role' => 'user']);

        DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user'");
    }
};
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('password_reset_codes', function (Blueprint $table) {
            $table->foreignId('company_id')->nullable()->after('email')->constrained('companies')->nullOnDelete();
            $table->string('company_name')->nullable()->after('company_id');
        });
    }

    public function down(): void
    {
        Schema::table('password_reset_codes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('company_id');
            $table->dropColumn('company_name');
        });
    }
};

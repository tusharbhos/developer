<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('developer_name')->nullable()->after('company_name');
            $table->string('gst_no')->nullable()->after('rera_no');
            $table->string('unique_key', 6)->nullable()->unique()->after('gst_no');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['developer_name', 'gst_no', 'unique_key']);
        });
    }
};

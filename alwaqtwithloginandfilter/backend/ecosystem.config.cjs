module.exports = {
    apps: [{
        name: 'alwaqt-api',
        script: 'server.js',
        instances: 'max',
        exec_mode: 'cluster',
        watch: false,
        max_memory_restart: '500M',
        env: {
            NODE_ENV: 'development',
            PORT: 3002,
        },
        env_production: {
            NODE_ENV: 'production',
            PORT: 3002,
        },
        // Logging
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        merge_logs: true,
        // Auto-restart
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s',
        restart_delay: 4000,
        // Graceful shutdown
        kill_timeout: 10000,
        listen_timeout: 8000,
    }],
};

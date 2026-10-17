const baseEnv = {
  NODE_ENV: 'production',
  UPLOAD_PATH: '/var/www/uploads/',
};

const common = {
  autorestart: true,
  watch: false,
  merge_logs: true,
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  env: baseEnv,
  env_production: baseEnv,
};

const worker = (name) => ({
  ...common,
  name: `raydo-worker-${name}`,
  script: `./src/queues/workers/${name}.worker.js`,
  instances: 1,
  exec_mode: 'fork',
});

module.exports = {
  apps: [
    {
      // HTTP API + Socket.IO (Redis adapter is used for multi-instance)
      ...common,
      name: 'raydo-api',
      script: './server.js',
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '500M',
      // Wait for process.send('ready') in server.js before reloading the next instance
      wait_ready: true,
      listen_timeout: 60000,
      kill_timeout: 12000,
    },
    worker('otp'),
    worker('notification'),
    worker('order'),
    worker('tracking'),
    worker('payment'),
    worker('maintenance'),
  ],
};

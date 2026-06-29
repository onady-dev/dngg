module.exports = {
  apps: [
    {
      name: 'dngg-backend-3010',
      cwd: './backend',
      script: 'node_modules/@nestjs/cli/bin/nest.js',
      args: 'start --watch',
      interpreter: 'C:/Program Files/nodejs/node.exe',
      env: { NODE_ENV: 'dev' },
    },
    {
      name: 'dngg-frontend-3011',
      cwd: './frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'dev -p 3011',
      interpreter: 'C:/Program Files/nodejs/node.exe',
      env: { NODE_ENV: 'development' },
    },
  ],
};

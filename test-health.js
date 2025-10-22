// Quick health check script
import http from 'http';

const options = {
  hostname: '127.0.0.1',
  port: 3123,
  path: '/health',
  method: 'GET',
  timeout: 3000
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${data}`);
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error(`Erro ao conectar: ${e.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('Timeout ao conectar');
  req.destroy();
  process.exit(1);
});

req.end();

const axios = require('axios');

async function test() {
  const token = process.env.APP_CLIENT_TOKEN || 'dev-token-change-me';
  const url = process.env.PROXY_URL || 'http://127.0.0.1:3123/api/generate';
  try {
    const res = await axios.post(url, { message: 'Teste via test-client' }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('status:', res.status);
    console.log('data:', res.data);
  } catch (err) {
    if (err.response) {
      console.error('error status:', err.response.status);
      console.error('error data:', err.response.data);
    } else {
      console.error('request error:', err.message);
    }
    process.exit(1);
  }
}

test();

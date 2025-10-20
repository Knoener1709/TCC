const axios = require('axios');

async function test() {
  try {
    const res = await axios.post('http://127.0.0.1:3000/api/generate', { message: 'Teste via test-client' }, {
      headers: { Authorization: 'Bearer dev-local-token-CHANGE_ME' }
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

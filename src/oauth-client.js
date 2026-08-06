function createOAuthClient({ http, tokenUrl, clientId, clientSecret, scope }) {
  return {
    async getToken() {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope,
      }).toString();
      const response = await http.post(tokenUrl, body, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      const token = response?.data?.access_token;

      if (!token) {
        throw new Error('OAuth response does not contain access_token');
      }

      return token;
    },
  };
}

module.exports = { createOAuthClient };

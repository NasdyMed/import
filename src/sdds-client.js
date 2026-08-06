function createSddsClient({ http, oauthClient, apiUrl, sleep, maxAttempts = 3 }) {
  async function requestPage(page, tokenState) {
    let refreshed = false;
    let attempt = 0;

    while (true) {
      attempt += 1;
      try {
        return await http.get(apiUrl, {
          params: { page_size: 50, page },
          headers: { Authorization: `Bearer ${tokenState.value}` },
        });
      } catch (error) {
        const status = error?.response?.status;

        if (status === 401 && !refreshed) {
          tokenState.value = await oauthClient.getToken();
          refreshed = true;
          attempt -= 1;
          continue;
        }

        const retryable = status === 429 || (status >= 500 && status <= 599);
        if (!retryable || attempt >= maxAttempts) throw error;

        await sleep(Math.min(250 * (2 ** (attempt - 1)), 500));
      }
    }
  }

  function responseData(response) {
    const payload = response?.data;
    if (!Array.isArray(payload?.data)) {
      throw new Error('SDDS response data must be an array');
    }
    return payload;
  }

  return {
    async *pages() {
      const tokenState = { value: await oauthClient.getToken() };
      const first = responseData(await requestPage(1, tokenState));
      const pageCount = first.page_count;

      if (!Number.isInteger(pageCount) || pageCount < 1) {
        throw new Error('SDDS response page_count must be an integer greater than or equal to 1');
      }

      yield { pageNumber: 1, data: first.data };

      for (let page = 2; page <= pageCount; page += 1) {
        const payload = responseData(await requestPage(page, tokenState));
        yield { pageNumber: page, data: payload.data };
      }
    },
  };
}

module.exports = { createSddsClient };

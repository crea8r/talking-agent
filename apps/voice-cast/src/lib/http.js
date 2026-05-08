async function expectJson(response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

export function createHttpClient() {
  return {
    async fetchRuntimeConfig() {
      return expectJson(await fetch('/api/runtime-config'));
    },
    async fetchBackendStatus() {
      return expectJson(await fetch('/api/backend-status'));
    },
    async fetchCastingSpeakers() {
      return expectJson(await fetch('/api/casting/speakers'));
    },
    async generateCasting(payload) {
      return expectJson(await fetch('/api/casting/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(payload),
      }));
    },
    async savePromptAsset(payload) {
      return expectJson(await fetch('/api/prompt-assets/save', {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(payload),
      }));
    },
    async fetchProductionTestState() {
      return expectJson(await fetch('/api/production-test/state'));
    },
    async saveProductionProfile(formData) {
      return expectJson(await fetch('/api/production-test/profile', {
        method: 'POST',
        body: formData,
      }));
    },
    async submitProductionTurn(payload) {
      return expectJson(await fetch('/api/production-test/turn', {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(payload),
      }));
    },
  };
}

export async function fetchRuntimeConfig() {
  const response = await fetch('/api/runtime-config', {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Runtime config request failed with ${response.status}`);
  }

  return response.json();
}

export async function fetchJson(url) {
  const response = await fetch(url, {
    cache: 'no-store',
  });
  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return payload;
}

export async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return payload;
}

function withTimeout(ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, timer };
}

async function requestWithTimeout(url, options = {}, timeoutMs = 8000) {
  const { controller, timer } = withTimeout(timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

function parseContentType(response) {
  return String(response?.headers?.get("content-type") || "").toLowerCase();
}

export async function validateDocumentLink(url, { timeoutMs = 8000 } = {}) {
  const target = String(url || "").trim();
  if (!target) {
    return { isValid: false, statusCode: 0, error: "empty_url" };
  }

  try {
    const head = await requestWithTimeout(target, { method: "HEAD" }, timeoutMs);
    if (head.ok) {
      return {
        isValid: true,
        statusCode: head.status,
        contentType: parseContentType(head)
      };
    }

    if (head.status === 404) {
      return { isValid: false, statusCode: 404, error: "not_found" };
    }

    // Alguns servidores bloqueiam HEAD. Faz fallback para GET parcial.
    const get = await requestWithTimeout(
      target,
      {
        method: "GET",
        headers: { Range: "bytes=0-1023" }
      },
      timeoutMs
    );

    if (get.ok) {
      return {
        isValid: true,
        statusCode: get.status,
        contentType: parseContentType(get)
      };
    }

    return { isValid: false, statusCode: get.status, error: `http_${get.status}` };
  } catch (error) {
    return {
      isValid: false,
      statusCode: 0,
      error: String(error?.name || error?.message || "connection_error")
    };
  }
}

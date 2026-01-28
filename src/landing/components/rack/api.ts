/**
 * Generic fetch with retry helper.
 * - Retries on 5xx errors or network failures
 * - Respects AbortSignal to stop early
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit & { signal?: AbortSignal } = {},
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (options?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const response = await fetch(url, options);
      if (!response.ok && response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }
      return response;
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw err;
      }
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }
  }
  throw lastError;
}

/**
 * Creates headers with CSRF token for OCI-splat endpoints
 */
export function createCsrfHeaders(): Headers {
  const headers = new Headers();
  headers.append("X-OCI-Splat-CSRF", "1");
  return headers;
}

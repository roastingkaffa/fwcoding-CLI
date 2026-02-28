import type { MarketplacePackage } from "../schemas/marketplace.schema.js";
import { withRetry } from "../utils/retry.js";
import { ProviderError } from "../errors/provider-error.js";
import * as log from "../utils/logger.js";

const DEFAULT_TIMEOUT = 10000;
const REGISTRY_RETRY = { maxAttempts: 2, initialDelayMs: 500 };

/** Search the plugin registry */
export async function searchRegistry(
  query: string,
  registryUrl: string,
): Promise<MarketplacePackage[]> {
  const url = `${registryUrl}/search?q=${encodeURIComponent(query)}`;
  const res = await withRetry(
    async () => {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
      });
      if (!r.ok)
        throw new ProviderError(
          `Registry search failed: HTTP ${r.status}`,
          r.status,
          "registry",
        );
      return r;
    },
    (err) => err instanceof ProviderError && err.isRetryable,
    REGISTRY_RETRY,
    (attempt, delay) =>
      log.warn(`Registry search retry ${attempt} in ${delay}ms...`),
  );
  return (await res.json()) as MarketplacePackage[];
}

/** Fetch a package tarball from the registry. Returns the buffer and optional checksum. */
export async function fetchPackage(
  name: string,
  version: string,
  registryUrl: string,
): Promise<{ buffer: Buffer; checksum?: string }> {
  const url = `${registryUrl}/packages/${encodeURIComponent(name)}/${encodeURIComponent(version)}.tar.gz`;
  const res = await withRetry(
    async () => {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok)
        throw new ProviderError(
          `Package fetch failed: HTTP ${r.status}`,
          r.status,
          "registry",
        );
      return r;
    },
    (err) => err instanceof ProviderError && err.isRetryable,
    REGISTRY_RETRY,
    (attempt, delay) =>
      log.warn(`Registry fetch retry ${attempt} in ${delay}ms...`),
  );

  const checksum = res.headers.get("x-checksum-sha256") ?? undefined;
  const arrayBuf = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), checksum };
}

/** Get package info/manifest from the registry */
export async function getPackageInfo(
  name: string,
  registryUrl: string,
): Promise<MarketplacePackage> {
  const url = `${registryUrl}/packages/${encodeURIComponent(name)}`;
  const res = await withRetry(
    async () => {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
      });
      if (!r.ok)
        throw new ProviderError(
          `Package info failed: HTTP ${r.status}`,
          r.status,
          "registry",
        );
      return r;
    },
    (err) => err instanceof ProviderError && err.isRetryable,
    REGISTRY_RETRY,
    (attempt, delay) =>
      log.warn(`Registry info retry ${attempt} in ${delay}ms...`),
  );
  return (await res.json()) as MarketplacePackage;
}

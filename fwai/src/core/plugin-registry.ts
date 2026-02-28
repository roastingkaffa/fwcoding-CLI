import type { MarketplacePackage } from "../schemas/marketplace.schema.js";

const DEFAULT_TIMEOUT = 10000;

/** Search the plugin registry */
export async function searchRegistry(
  query: string,
  registryUrl: string
): Promise<MarketplacePackage[]> {
  const url = `${registryUrl}/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT) });
  if (!res.ok) throw new Error(`Registry search failed: HTTP ${res.status}`);
  return (await res.json()) as MarketplacePackage[];
}

/** Fetch a package tarball from the registry. Returns the buffer and optional checksum. */
export async function fetchPackage(
  name: string,
  version: string,
  registryUrl: string
): Promise<{ buffer: Buffer; checksum?: string }> {
  const url = `${registryUrl}/packages/${encodeURIComponent(name)}/${encodeURIComponent(version)}.tar.gz`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Package fetch failed: HTTP ${res.status}`);

  const checksum = res.headers.get("x-checksum-sha256") ?? undefined;
  const arrayBuf = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), checksum };
}

/** Get package info/manifest from the registry */
export async function getPackageInfo(
  name: string,
  registryUrl: string
): Promise<MarketplacePackage> {
  const url = `${registryUrl}/packages/${encodeURIComponent(name)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT) });
  if (!res.ok) throw new Error(`Package info failed: HTTP ${res.status}`);
  return (await res.json()) as MarketplacePackage;
}

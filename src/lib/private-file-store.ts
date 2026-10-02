import "server-only";
import { del, get, put } from "@vercel/blob";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDirectory as applicationDataDirectory } from "./db";

export type PrivateFileNamespace = "uploads" | "watermarks";
export type PrivateFileStorageProvider = "filesystem" | "vercel_blob";

type WriteOptions = {
  contentType?: string;
  overwrite?: boolean;
};

type BlobClient = {
  put(
    pathname: string,
    body: Uint8Array,
    options: {
      access: "private";
      addRandomSuffix: false;
      allowOverwrite: boolean;
      cacheControlMaxAge: number;
      contentType?: string;
    },
  ): Promise<unknown>;
  get(
    pathname: string,
    options: { access: "private"; useCache: false },
  ): Promise<Uint8Array | null>;
  del(pathname: string): Promise<void>;
};

type PrivateFileStoreOptions = {
  provider?: PrivateFileStorageProvider;
  dataDirectory?: string;
  blobClient?: BlobClient;
};

const safeKey = (key: string) => {
  if (!key || path.basename(key) !== key || key === "." || key === "..")
    throw new Error("Invalid private storage key.");
  return key;
};

const configuredProvider = (): PrivateFileStorageProvider => {
  const configured = process.env.PRIVATE_FILE_STORAGE?.trim();
  if (configured) {
    if (configured !== "filesystem" && configured !== "vercel_blob")
      throw new Error(
        "PRIVATE_FILE_STORAGE must be either filesystem or vercel_blob.",
      );
    return configured;
  }
  return process.env.VERCEL === "1" ? "vercel_blob" : "filesystem";
};

const defaultBlobClient: BlobClient = {
  put: async (pathname, body, options) => {
    await put(pathname, Buffer.from(body), options);
  },
  get: async (pathname, options) => {
    const result = await get(pathname, options);
    if (!result || result.statusCode !== 200) return null;
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  },
  del: async (pathname) => {
    await del(pathname);
  },
};

export function createPrivateFileStore({
  provider = configuredProvider(),
  dataDirectory = applicationDataDirectory(),
  blobClient = defaultBlobClient,
}: PrivateFileStoreOptions = {}) {
  const pathname = (namespace: PrivateFileNamespace, key: string) =>
    `${namespace}/${safeKey(key)}`;

  return {
    provider,
    async write(
      namespace: PrivateFileNamespace,
      key: string,
      bytes: Uint8Array,
      options: WriteOptions = {},
    ) {
      if (provider === "vercel_blob") {
        await blobClient.put(pathname(namespace, key), bytes, {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: options.overwrite ?? false,
          cacheControlMaxAge: 60,
          ...(options.contentType ? { contentType: options.contentType } : {}),
        });
        return;
      }
      const directory = path.join(dataDirectory, namespace);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(path.join(directory, safeKey(key)), bytes, {
        mode: 0o600,
        flag: options.overwrite ? "w" : "wx",
      });
    },
    async read(namespace: PrivateFileNamespace, key: string) {
      if (provider === "vercel_blob") {
        const bytes = await blobClient.get(pathname(namespace, key), {
          access: "private",
          useCache: false,
        });
        if (!bytes) throw new Error("Private file not found.");
        return Buffer.from(bytes);
      }
      return readFile(path.join(dataDirectory, namespace, safeKey(key)));
    },
    async delete(namespace: PrivateFileNamespace, key: string) {
      if (provider === "vercel_blob") {
        await blobClient.del(pathname(namespace, key));
        return;
      }
      await unlink(path.join(dataDirectory, namespace, safeKey(key))).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        },
      );
    },
  };
}

export const privateFileStore = () => createPrivateFileStore();

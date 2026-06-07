const BLOCKED_PATH_PATTERNS: RegExp[] = [
  /\.\./,
  /\0/,
  /^\/proc(\/|$)/,
  /^\/sys(\/|$)/,
  /^\/dev(\/|$)/,
];

const SENSITIVE_FILE_NAMES = new Set([
  ".env",
  "id_rsa",
  "id_ed25519",
  "authorized_keys",
]);

const WRITE_BLOCKED_EXTENSIONS = new Set([
  ".jar",
  ".so",
  ".dll",
  ".exe",
  ".bin",
  ".sh",
]);

export interface PathValidationResult {
  valid: boolean;
  normalized?: string;
  reason?: string;
}

export function normalizeWritablePath(path: string): PathValidationResult {
  const base = normalizeServerPath(path);
  if (!base.valid || !base.normalized) {
    return base;
  }

  const ext = base.normalized.includes(".")
    ? base.normalized.slice(base.normalized.lastIndexOf(".")).toLowerCase()
    : "";

  if (WRITE_BLOCKED_EXTENSIONS.has(ext)) {
    return { valid: false, reason: `Writing ${ext} files is blocked by policy` };
  }

  return base;
}

export function normalizeServerPath(path: string): PathValidationResult {
  const trimmed = path.trim();
  if (!trimmed) {
    return { valid: false, reason: "Path cannot be empty" };
  }

  let normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  normalized = normalized.replace(/\/+/g, "/");

  if (normalized.length > 512) {
    return { valid: false, reason: "Path exceeds maximum length of 512 characters" };
  }

  for (const pattern of BLOCKED_PATH_PATTERNS) {
    if (pattern.test(normalized)) {
      return { valid: false, reason: "Path is not allowed" };
    }
  }

  const baseName = normalized.split("/").pop() ?? "";
  if (SENSITIVE_FILE_NAMES.has(baseName)) {
    return { valid: false, reason: "Reading this file is blocked by policy" };
  }

  return { valid: true, normalized };
}

export function truncateContent(content: string, maxBytes: number): {
  content: string;
  truncated: boolean;
  byteLength: number;
} {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  if (bytes.length <= maxBytes) {
    return { content, truncated: false, byteLength: bytes.length };
  }

  const slice = bytes.slice(0, maxBytes);
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return {
    content: decoder.decode(slice),
    truncated: true,
    byteLength: bytes.length,
  };
}

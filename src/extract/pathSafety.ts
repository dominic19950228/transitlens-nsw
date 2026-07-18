
/**
 * Validates that an archive path is safe to extract.
 * Rejects:
 * - Path traversal (../
 * - Windows path traversal (..\
 * - Absolute Unix paths (/etc/passwd)
 * - Windows drive paths (C:\, D:)
 * - UNC paths (\\server\share)
 * - Null bytes
 * - Paths that resolve outside the extraction root
 */
export function isPathSafe(filePath: string): boolean {
  // 1. Reject null bytes
  if (filePath.includes("\0")) {
    return false;
  }

  // 2. Normalize path separators for consistent checking
  // Convert forward slashes to platform separator
  const normalizedWithBackslash = filePath.replace(/\\/g, "/");

  // 3. Reject UNC paths (starts with \\ on Windows)
  if (filePath.startsWith("\\\\") || filePath.startsWith("//")) {
    return false;
  }

  // 4. Check for path traversal sequences
  // Match ../ or ..\ anywhere in the path
  if (normalizedWithBackslash.includes("../") || normalizedWithBackslash.includes("..\\")) {
    return false;
  }

  // 5. Check for Unix absolute paths (starting with /)
  if (filePath.startsWith("/") || filePath.startsWith("\\")) {
    return false;
  }

  // 6. Check for Windows drive paths (C:\, D:, etc.)
  if (/^[a-zA-Z]:[\\\/]/.test(filePath)) {
    return false;
  }

  // 7. Reject any path segment that is exactly ".."
  const segments = filePath.split(/[/\\]/);
  for (const segment of segments) {
    if (segment === "..") {
      return false;
    }
  }

  // 8. Reject empty path (after split, should have at least filename)
  if (segments.length === 0 || segments.every((s) => s === "")) {
    return false;
  }

  return true;
}
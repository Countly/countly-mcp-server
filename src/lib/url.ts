/**
 * URL helpers with no dependencies, safe to load in library mode.
 */

/**
 * @param value - a URL or path
 * @returns it without trailing slashes (a loop, not a regex: linear on any input)
 */
export function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end--;
  }
  return value.slice(0, end);
}

export function scheduleDeadline(callback: () => void, delayMs: number): () => void {
  const timeoutId = setTimeout(callback, delayMs);
  return () => clearTimeout(timeoutId);
}

export function formatDurationSeconds(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  if (sec < 60) return `${sec}s`;
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}m ${seconds}s`;
}

export function formatDurationMs(ms: number): string {
  const sec = Math.floor(Math.max(0, ms) / 1000);
  return formatDurationSeconds(sec);
}

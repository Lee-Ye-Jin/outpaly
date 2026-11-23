export function Logo({ withTagline = false }: { withTagline?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
        <rect width="28" height="28" rx="7" fill="#FF7A45" />
        <path d="M11 8.5v11l9-5.5z" fill="#0D0D10" />
      </svg>
      <span className="font-display text-lg font-bold">OutPaly</span>
      {withTagline && <span className="hidden text-sm text-text-3 sm:inline">Playlist Video Studio</span>}
    </span>
  );
}

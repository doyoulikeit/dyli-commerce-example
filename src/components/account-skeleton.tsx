export function AccountSkeleton({
  variant = "activity",
}: {
  variant?: "activity" | "collection";
}) {
  return (
    <section
      className={`lc-account-skeleton lc-skeleton-${variant}`}
      role="status"
      aria-label={
        variant === "activity" ? "Loading activity" : "Loading your vault"
      }
      aria-busy="true"
    >
      {Array.from({ length: variant === "activity" ? 3 : 4 }, (_, index) => (
        <div className="lc-skeleton-entry" key={index} aria-hidden="true">
          <div className="lc-skeleton-art" />
          <div className="lc-skeleton-copy">
            <div />
            <div />
          </div>
          <div className="lc-skeleton-amount" />
        </div>
      ))}
    </section>
  );
}

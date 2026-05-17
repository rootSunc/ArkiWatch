import "./data-platform.css";

const NAV_ROW_COUNT = 8;
const SUMMARY_TILE_COUNT = 4;
const CARD_COUNT = 4;

/**
 * Static shell placeholder rendered while platform data is in flight.
 * Server-only, so it cannot read the client language preference; the live
 * region text stays in the default locale.
 */
export function PlatformSkeleton() {
  return (
    <div className="dashboard-shell" aria-busy="true">
      <span className="platform-skeleton-sr-only" role="status">
        Loading dashboard
      </span>

      <aside
        className="dashboard-side-nav platform-skeleton-nav"
        aria-hidden="true"
      >
        <div className="platform-skeleton-brand">
          <span className="platform-skeleton-block platform-skeleton-brand-mark" />
          <span className="platform-skeleton-block platform-skeleton-brand-copy" />
        </div>
        {Array.from({ length: NAV_ROW_COUNT }, (_, index) => (
          <span
            key={index}
            className="platform-skeleton-block platform-skeleton-nav-row"
          />
        ))}
      </aside>

      <div className="dashboard-app">
        <div className="platform-skeleton-topbar" aria-hidden="true">
          <span className="platform-skeleton-block platform-skeleton-topbar-title" />
          <span className="platform-skeleton-topbar-spacer" />
          <span className="platform-skeleton-block platform-skeleton-topbar-control" />
          <span className="platform-skeleton-block platform-skeleton-topbar-control" />
        </div>

        <main className="dashboard-content" aria-hidden="true">
          <div className="platform-skeleton-tiles">
            {Array.from({ length: SUMMARY_TILE_COUNT }, (_, index) => (
              <span
                key={index}
                className="platform-skeleton-block platform-skeleton-tile"
              />
            ))}
          </div>
          <div className="platform-skeleton-cards">
            {Array.from({ length: CARD_COUNT }, (_, index) => (
              <span
                key={index}
                className="platform-skeleton-block platform-skeleton-card"
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

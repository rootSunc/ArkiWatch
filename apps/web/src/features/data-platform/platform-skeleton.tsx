import "./data-platform.css";

const NAV_ROW_COUNT = 8;
const SUMMARY_TILE_COUNT = 4;
const CARD_COUNT = 4;
const MOBILE_NAV_ITEM_COUNT = 5;

/**
 * Static shell placeholder rendered while platform data is in flight.
 * The label is passed by the shell so the server/client loading region uses
 * the same locale as the rest of the interactive dashboard.
 */
export function PlatformSkeleton({
  loadingLabel = "Loading the data platform",
}: {
  loadingLabel?: string;
}) {
  return (
    <div className="dashboard-shell" aria-busy="true">
      <span className="platform-skeleton-sr-only" role="status">
        {loadingLabel}
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
        <div className="platform-skeleton-topbar platform-skeleton-desktop-topbar" aria-hidden="true">
          <span className="platform-skeleton-block platform-skeleton-topbar-title" />
          <span className="platform-skeleton-topbar-spacer" />
          <span className="platform-skeleton-block platform-skeleton-topbar-control" />
          <span className="platform-skeleton-block platform-skeleton-topbar-control" />
        </div>

        <div className="platform-skeleton-mobile-topbar" aria-hidden="true">
          <span className="platform-skeleton-block platform-skeleton-mobile-menu" />
          <span className="platform-skeleton-block platform-skeleton-mobile-mark" />
          <span className="platform-skeleton-block platform-skeleton-mobile-brand" />
          <span className="platform-skeleton-mobile-spacer" />
          <span className="platform-skeleton-block platform-skeleton-mobile-notification" />
        </div>

        <div className="platform-skeleton-mobile-context" aria-hidden="true">
          <span className="platform-skeleton-block platform-skeleton-mobile-city" />
          <span className="platform-skeleton-mobile-separator" />
          <span className="platform-skeleton-block platform-skeleton-mobile-date" />
          <span className="platform-skeleton-mobile-spacer" />
          <span className="platform-skeleton-block platform-skeleton-mobile-context-action" />
          <span className="platform-skeleton-block platform-skeleton-mobile-context-action" />
        </div>

        {/* No main-content id here. The interactive shell can mount alongside
            this placeholder mid-stream, and two elements sharing that id
            would duplicate the landmark and break the skip link. */}
        <main className="dashboard-content" tabIndex={-1} aria-hidden="true">
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

        <div className="platform-skeleton-mobile-nav" aria-hidden="true">
          {Array.from({ length: MOBILE_NAV_ITEM_COUNT }, (_, index) => (
            <span className="platform-skeleton-mobile-nav-item" key={index}>
              <span className="platform-skeleton-block platform-skeleton-mobile-nav-icon" />
              <span className="platform-skeleton-block platform-skeleton-mobile-nav-label" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

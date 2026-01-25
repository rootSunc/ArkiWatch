import { PlatformCategory } from "./types";

type CategoryNavProps = {
  categories: PlatformCategory[];
  selectedKey: string;
  onSelect: (key: string) => void;
};

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function CategoryNav({ categories, selectedKey, onSelect }: CategoryNavProps) {
  return (
    <aside className="platform-sidebar" aria-label="Data categories">
      <button
        className={selectedKey === "overview" ? "category-nav-item active" : "category-nav-item"}
        onClick={() => onSelect("overview")}
        type="button"
      >
        <span className="category-nav-mark">O</span>
        <span>
          <strong>Overview</strong>
          <small>All data categories</small>
        </span>
      </button>
      {categories.map((category) => (
        <button
          className={selectedKey === category.key ? "category-nav-item active" : "category-nav-item"}
          key={category.key}
          onClick={() => onSelect(category.key)}
          type="button"
        >
          <span className={`category-nav-mark category-nav-mark-${category.status}`}>
            {category.title.slice(0, 1)}
          </span>
          <span>
            <strong>{category.title}</strong>
            <small>{statusLabel(category.status)}</small>
          </span>
        </button>
      ))}
    </aside>
  );
}

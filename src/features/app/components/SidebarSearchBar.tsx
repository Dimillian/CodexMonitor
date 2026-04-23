import X from "lucide-react/dist/esm/icons/x";
import { useI18n } from "@/i18n";

type SidebarSearchBarProps = {
  isSearchOpen: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onClearSearch: () => void;
};

export function SidebarSearchBar({
  isSearchOpen,
  searchQuery,
  onSearchQueryChange,
  onClearSearch,
}: SidebarSearchBarProps) {
  const { tx } = useI18n();

  return (
    <div className={`sidebar-search${isSearchOpen ? " is-open" : ""}`}>
      {isSearchOpen && (
        <input
          className="sidebar-search-input"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder={tx("Search conversations")}
          aria-label={tx("Search conversations")}
          data-tauri-drag-region="false"
          autoFocus
        />
      )}
      {isSearchOpen && searchQuery.length > 0 && (
        <button
          type="button"
          className="sidebar-search-clear"
          onClick={onClearSearch}
          aria-label={tx("Clear search")}
          data-tauri-drag-region="false"
        >
          <X size={12} aria-hidden />
        </button>
      )}
    </div>
  );
}

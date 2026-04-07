import { useMemo, useState } from "react";

function SearchBar({
  query,
  type,
  onQueryChange,
  onTypeChange,
  onSubmit,
  categories = [],
  compact = false,
}) {
  const [isFocused, setIsFocused] = useState(false);

  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return [];
    }

    return categories
      .filter((category) => category.toLowerCase().includes(normalized))
      .slice(0, 4);
  }, [categories, query]);

  const showSuggestions = isFocused && suggestions.length > 0;

  const handleSuggestionClick = (suggestion) => {
    onQueryChange(suggestion);
    setIsFocused(false);
  };

  return (
    <form className={`search-bar ${compact ? "search-bar-compact" : ""}`} onSubmit={onSubmit}>
      <div className="search-input-wrap">
        <input
          name="searchQuery"
          type="text"
          placeholder="Найти заказ или категорию"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => window.setTimeout(() => setIsFocused(false), 120)}
        />
        {showSuggestions ? (
          <div className="search-suggestions">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="search-suggestion"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <select name="searchType" value={type} onChange={(event) => onTypeChange(event.target.value)}>
        <option value="orders">Заказы</option>
        <option value="suppliers">Поставщики</option>
      </select>
      <button type="submit" className="button button-primary">
        Найти
      </button>
    </form>
  );
}

export default SearchBar;

import { useMemo, useState } from "react";
import { normalizeText } from "../../shared/search.js";

function SearchBar({
  query,
  type,
  onQueryChange,
  onTypeChange,
  onSubmit,
  suggestions = [],
  compact = false,
}) {
  const [isFocused, setIsFocused] = useState(false);

  const matchedSuggestions = useMemo(() => {
    const normalized = normalizeText(query);

    if (!normalized) {
      return [];
    }

    return suggestions
      .filter((suggestion) => normalizeText(suggestion.value).includes(normalized))
      .slice(0, 6);
  }, [suggestions, query]);

  const showSuggestions = isFocused && matchedSuggestions.length > 0;

  const handleSuggestionClick = (suggestion) => {
    if (suggestion.type) onTypeChange(suggestion.type);
    onQueryChange(suggestion.value);
    setIsFocused(false);
  };

  return (
    <form className={`search-bar ${compact ? "search-bar-compact" : ""}`} onSubmit={onSubmit}>
      <div className="search-input-wrap">
        <input
          name="searchQuery"
          type="text"
          placeholder="Найти заказ, поставщика или услугу"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => window.setTimeout(() => setIsFocused(false), 120)}
        />
        {showSuggestions ? (
          <div className="search-suggestions">
            {matchedSuggestions.map((suggestion) => (
              <button
                key={`${suggestion.type}-${suggestion.value}`}
                type="button"
                className="search-suggestion"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSuggestionClick(suggestion)}
              >
                <span>{suggestion.value}</span>
                {suggestion.label ? <span className="search-suggestion-hint">{suggestion.label}</span> : null}
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

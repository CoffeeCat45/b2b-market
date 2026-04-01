function FilterSidebar({
  title,
  searchValue,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  categories,
  cityOptions,
  selectedCities,
  onToggleCity,
  rangeTitle,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  minPlaceholder,
  maxPlaceholder,
  dateFilterValue,
  onDateFilterChange,
  dateFilterOptions = [],
  dateFilterLabel = "Период",
  onReset,
}) {
  return (
    <aside className="filters card">
      <h3>{title}</h3>

      <label className="field">
        <span>Поиск</span>
        <input value={searchValue} onChange={(event) => onSearchChange(event.target.value)} />
      </label>

      <label className="field">
        <span>Категория</span>
        <select value={selectedCategory} onChange={(event) => onCategoryChange(event.target.value)}>
          <option value="">Все категории</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      {dateFilterOptions.length ? (
        <label className="field">
          <span>{dateFilterLabel}</span>
          <select value={dateFilterValue} onChange={(event) => onDateFilterChange(event.target.value)}>
            {dateFilterOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="field">
        <span>Города</span>
        <div className="checkbox-list">
          {cityOptions.map((city) => (
            <label key={city} className="checkbox-item">
              <input
                type="checkbox"
                checked={selectedCities.includes(city)}
                onChange={() => onToggleCity(city)}
              />
              <span>{city}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <span>{rangeTitle}</span>
        <div className="range-grid">
          <input
            type="number"
            min="0"
            step="1"
            value={minValue}
            onChange={(event) => onMinChange(event.target.value)}
            placeholder={minPlaceholder}
          />
          <input
            type="number"
            min="0"
            step="1"
            value={maxValue}
            onChange={(event) => onMaxChange(event.target.value)}
            placeholder={maxPlaceholder}
          />
        </div>
      </div>

      <button type="button" className="button button-ghost button-block" onClick={onReset}>
        Сбросить фильтры
      </button>
    </aside>
  );
}

export default FilterSidebar;

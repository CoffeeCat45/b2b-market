import { useState } from "react";

function FilterSidebar({
  title,
  searchValue,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  categories,
  cityOptions = [],
  selectedCities = [],
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
  majorCityOptions,
  selectedMajorCity = "",
  onMajorCityChange,
  onMajorCityBlur,
  majorCitySuggestions = [],
  onMajorCitySuggestionPick,
  locationOptions,
  selectedLocation = "",
  onLocationChange,
  onLocationBlur,
  locationSuggestions = [],
  onLocationSuggestionPick,
  majorCityLabel = "Город",
  locationLabel = "Пригород / район",
  onReset,
}) {
  const [majorCityFocused, setMajorCityFocused] = useState(false);
  const [locationFocused, setLocationFocused] = useState(false);

  return (
    <aside className="filters card">
      <h3>{title}</h3>

      <label className="field">
        <span>Поиск</span>
        <input name="filterSearch" value={searchValue} onChange={(event) => onSearchChange(event.target.value)} />
      </label>

      <label className="field">
        <span>Категория</span>
        <select name="filterCategory" value={selectedCategory} onChange={(event) => onCategoryChange(event.target.value)}>
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
          <select name="filterDate" value={dateFilterValue} onChange={(event) => onDateFilterChange(event.target.value)}>
            {dateFilterOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {majorCityOptions ? (
        <>
          <label className="field city-field">
            <span>{majorCityLabel}</span>
            <input
              name="majorCity"
              value={selectedMajorCity}
              onFocus={() => setMajorCityFocused(true)}
              onChange={(event) => onMajorCityChange?.(event.target.value)}
              onBlur={() => {
                setMajorCityFocused(false);
                onMajorCityBlur?.();
              }}
              placeholder="Начните вводить город"
              autoComplete="off"
            />
            {majorCityFocused && majorCitySuggestions.length ? (
              <div className="field-suggestions">
                {majorCitySuggestions.map((city) => (
                  <button
                    key={city}
                    type="button"
                    className="search-suggestion"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setMajorCityFocused(false);
                      onMajorCitySuggestionPick?.(city);
                    }}
                  >
                    {city}
                  </button>
                ))}
              </div>
            ) : null}
          </label>

          {locationOptions?.length ? (
            <label className="field city-field">
              <span>{locationLabel}</span>
              <input
                name="locationDetail"
                value={selectedLocation}
                onFocus={() => setLocationFocused(true)}
                onChange={(event) => onLocationChange?.(event.target.value)}
                onBlur={() => {
                  setLocationFocused(false);
                  onLocationBlur?.();
                }}
                placeholder="Начните вводить пригород или район"
                autoComplete="off"
              />
              {locationFocused && locationSuggestions.length ? (
                <div className="field-suggestions">
                  {locationSuggestions.map((location) => (
                    <button
                      key={location}
                      type="button"
                      className="search-suggestion"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setLocationFocused(false);
                        onLocationSuggestionPick?.(location);
                      }}
                    >
                      {location}
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
          ) : null}
        </>
      ) : (
        <div className="field">
          <span>Города</span>
          <div className="checkbox-list">
            {cityOptions.map((city) => (
              <label key={city} className="checkbox-item">
                <input
                  name={`city-${city}`}
                  type="checkbox"
                  checked={selectedCities.includes(city)}
                  onChange={() => onToggleCity(city)}
                />
                <span>{city}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <span>{rangeTitle}</span>
        <div className="range-grid">
          <input
            name="rangeMin"
            type="number"
            min="0"
            step="1"
            value={minValue}
            onChange={(event) => onMinChange(event.target.value)}
            placeholder={minPlaceholder}
          />
          <input
            name="rangeMax"
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

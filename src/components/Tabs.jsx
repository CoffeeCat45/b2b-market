function Tabs({ items, activeKey, onChange }) {
  return (
    <div className="tabs">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={item.key === activeKey ? "tab-button active" : "tab-button"}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default Tabs;

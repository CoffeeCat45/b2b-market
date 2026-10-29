import { useState } from "react";
import { Link } from "react-router-dom";
import SearchSettingsModal from "./SearchSettingsModal";

function Footer() {
  const [searchSettingsOpen, setSearchSettingsOpen] = useState(false);

  return (
    <>
      <footer className="site-footer">
        <div className="container footer-row">
          <div className="footer-brand">
            <strong>B2B Connect</strong>
            <p>Платформа для поиска поставщиков, подрядчиков и бизнес-заказов.</p>
          </div>
          <div className="footer-links">
            <Link to="/orders">Каталог заказов</Link>
            <Link to="/suppliers">Каталог поставщиков</Link>
            <Link to="/create">Разместить объявление</Link>
            <button
              type="button"
              className="footer-settings-button"
              onClick={() => setSearchSettingsOpen(true)}
              aria-haspopup="dialog"
            >
              Настройки поиска
            </button>
          </div>
        </div>
        <div className="container footer-meta">
          <span className="footer-version">Версия {__APP_VERSION__}</span>
        </div>
      </footer>
      {searchSettingsOpen ? (
        <SearchSettingsModal onClose={() => setSearchSettingsOpen(false)} />
      ) : null}
    </>
  );
}

export default Footer;


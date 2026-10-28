import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-row">
        <div>
          <strong>B2B Connect</strong>
          <p>Платформа для поиска поставщиков, подрядчиков и бизнес-заказов.</p>
        </div>
        <div className="footer-links">
          <Link to="/orders">Каталог заказов</Link>
          <Link to="/suppliers">Каталог поставщиков</Link>
          <Link to="/create">Разместить объявление</Link>
          <span className="footer-version">Версия {__APP_VERSION__}</span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;


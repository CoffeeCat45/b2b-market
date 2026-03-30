import { Link, NavLink } from "react-router-dom";

function Header() {
  return (
    <header className="site-header">
      <div className="container header-row">
        <Link to="/" className="brand">
          <span className="brand-mark">B2B</span>
          <span className="brand-copy">
            <strong>Connect</strong>
            <small>поиск поставщиков и заказов</small>
          </span>
        </Link>

        <nav className="main-nav">
          <NavLink to="/orders">Заказы</NavLink>
          <NavLink to="/suppliers">Поставщики</NavLink>
        </nav>

        <div className="header-actions">
          <Link to="/create" className="button button-primary">
            Разместить
          </Link>
          <Link to="/login" className="button button-secondary">
            Войти
          </Link>
        </div>
      </div>
    </header>
  );
}

export default Header;

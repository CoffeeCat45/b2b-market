import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Header() {
  const { user, logout } = useAuth();

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
          {user ? <NavLink to="/chats">Чаты</NavLink> : null}
        </nav>

        <div className="header-actions">
          {user ? (
            <>
              <span className="header-user">{user.role === "admin" ? "Админ" : user.company || user.displayName}</span>
              <Link to="/create" className="button button-primary">
                Кабинет
              </Link>
              <button type="button" className="button button-secondary" onClick={logout}>
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link to="/create" className="button button-primary">
                Разместить
              </Link>
              <Link to="/login" className="button button-secondary">
                Войти
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;

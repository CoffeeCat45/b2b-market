import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function Header() {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("mobile-menu-open", mobileMenuOpen);
    return () => document.body.classList.remove("mobile-menu-open");
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className="site-header">
      <div className="container header-row">
        <button
          type="button"
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Открыть меню"
          aria-expanded={mobileMenuOpen}
        >
          <MenuIcon />
        </button>

        <div className="header-desktop-shell">
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
      </div>

      <div className={mobileMenuOpen ? "mobile-sidebar-backdrop open" : "mobile-sidebar-backdrop"} onClick={closeMobileMenu} />
      <aside className={mobileMenuOpen ? "mobile-sidebar open" : "mobile-sidebar"} aria-hidden={!mobileMenuOpen}>
        <div className="mobile-sidebar-header">
          <button type="button" className="mobile-sidebar-close" onClick={closeMobileMenu} aria-label="Закрыть меню">
            ×
          </button>
        </div>

        <Link to="/" className="brand mobile-sidebar-brand" onClick={closeMobileMenu}>
          <span className="brand-mark">B2B</span>
          <span className="brand-copy">
            <strong>Connect</strong>
            <small>поиск поставщиков и заказов</small>
          </span>
        </Link>

        <nav className="mobile-sidebar-nav">
          <NavLink to="/orders" onClick={closeMobileMenu}>Заказы</NavLink>
          <NavLink to="/suppliers" onClick={closeMobileMenu}>Поставщики</NavLink>
          {user ? <NavLink to="/chats" onClick={closeMobileMenu}>Чаты</NavLink> : null}
        </nav>

        <div className="mobile-sidebar-actions">
          {user ? (
            <>
              <span className="header-user mobile-sidebar-user">{user.role === "admin" ? "Админ" : user.company || user.displayName}</span>
              <Link to="/create" className="button button-primary" onClick={closeMobileMenu}>
                Кабинет
              </Link>
              <button type="button" className="button button-secondary" onClick={() => { closeMobileMenu(); logout(); }}>
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link to="/create" className="button button-primary" onClick={closeMobileMenu}>
                Разместить
              </Link>
              <Link to="/login" className="button button-secondary" onClick={closeMobileMenu}>
                Войти
              </Link>
            </>
          )}
        </div>
      </aside>
    </header>
  );
}

export default Header;

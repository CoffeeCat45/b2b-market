import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SearchSettingsModal from "./SearchSettingsModal";

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function Header() {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchSettingsOpen, setSearchSettingsOpen] = useState(false);
  const toggleButtonRef = useRef(null);
  const wasOpenRef = useRef(false);

  // Мобильное меню живёт отдельно от desktop-шапки и после закрытия возвращает фокус на кнопку-бургер.
  useEffect(() => {
    document.body.classList.toggle("mobile-menu-open", mobileMenuOpen);

    if (wasOpenRef.current && !mobileMenuOpen) {
      window.requestAnimationFrame(() => {
        toggleButtonRef.current?.focus();
      });
    }

    wasOpenRef.current = mobileMenuOpen;

    return () => document.body.classList.remove("mobile-menu-open");
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const openSearchSettings = () => {
    setMobileMenuOpen(false);
    setSearchSettingsOpen(true);
  };

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeMobileMenu();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <>
      <header className="site-header">
      <div className="container header-row">
        <button
          ref={toggleButtonRef}
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
            <button
              type="button"
              className="button button-secondary header-settings-button"
              onClick={openSearchSettings}
              aria-label="Настройки поиска"
              aria-haspopup="dialog"
              title="Настройки поиска"
            >
              <GearIcon />
            </button>
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

      {/* На телефоне навигация открывается полноэкранным drawer, чтобы не ломать desktop-раскладку. */}
      {mobileMenuOpen ? (
        <>
          <div className="mobile-sidebar-backdrop open" onClick={closeMobileMenu} />
          <aside className="mobile-sidebar open">
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
              <button type="button" className="button button-secondary" onClick={openSearchSettings}>
                Настройки поиска
              </button>
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
        </>
      ) : null}
      </header>

      {searchSettingsOpen ? (
        <SearchSettingsModal onClose={() => setSearchSettingsOpen(false)} />
      ) : null}
    </>
  );
}

export default Header;

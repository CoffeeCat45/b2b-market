import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";

function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [city, setCity] = useState("");
  const [industry, setIndustry] = useState("");
  const [industryOptions, setIndustryOptions] = useState([]);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Подсказки отраслей берём из существующих компаний/поставщиков/заказов, но поле остаётся свободным.
  useEffect(() => {
    apiFetch("/industries")
      .then((data) => setIndustryOptions(Array.isArray(data.industries) ? data.industries : []))
      .catch(() => setIndustryOptions([]));
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      const nextPath = searchParams.get("next");
      navigate(nextPath || "/");
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }

    setLoading(true);

    try {
      await register({ companyName, displayName, city, industry, email, password });
      const nextPath = searchParams.get("next");
      navigate(nextPath || "/create");
    } catch (registerError) {
      setError(registerError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout withFooter={false}>
      <section className="login-section">
        <div className="login-card card auth-card-wide">
          <h1>{mode === "login" ? "Вход в кабинет компании" : "Регистрация компании"}</h1>
          <div className="auth-mode-switch">
            <button type="button" className={mode === "login" ? "button button-primary" : "button button-secondary"} onClick={() => { setMode("login"); setError(""); }}>
              Вход
            </button>
            <button type="button" className={mode === "register" ? "button button-primary" : "button button-secondary"} onClick={() => { setMode("register"); setError(""); }}>
              Регистрация
            </button>
          </div>

          {mode === "login" ? (
            <form className="login-form" onSubmit={handleLogin}>
              <label className="field">
                <span>Email</span>
                <input name="loginEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="northbeans@b2b.local" />
              </label>
              <label className="field">
                <span>Пароль</span>
                <input name="loginPassword" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Введите пароль" />
              </label>
              {error ? <div className="error-banner">{error}</div> : null}
              <button type="submit" className="button button-primary button-block" disabled={loading}>
                {loading ? "Вход..." : "Войти"}
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={handleRegister}>
              <label className="field">
                <span>Название компании</span>
                <input name="registerCompanyName" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="ООО Северный Поставщик" />
              </label>
              <label className="field">
                <span>Контактное имя</span>
                <input name="registerDisplayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Анна Петрова" />
              </label>
              <label className="field">
                <span>Город</span>
                <input name="registerCity" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Екатеринбург" />
              </label>
              <label className="field">
                <span>Сфера</span>
                <input
                  name="registerIndustry"
                  list="industry-options"
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  placeholder="Выберите существующую или укажите свою сферу"
                />
                <datalist id="industry-options">
                  {industryOptions.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </label>
              <label className="field">
                <span>Email</span>
                <input name="registerEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="company@example.ru" />
              </label>
              <label className="field">
                <span>Пароль</span>
                <input name="registerPassword" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Минимум 6 символов" />
              </label>
              <label className="field">
                <span>Повторите пароль</span>
                <input name="registerConfirmPassword" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Повторите пароль" />
              </label>
              {error ? <div className="error-banner">{error}</div> : null}
              <button type="submit" className="button button-primary button-block" disabled={loading}>
                {loading ? "Регистрация..." : "Создать аккаунт"}
              </button>
            </form>
          )}
        </div>
      </section>
    </Layout>
  );
}

export default LoginPage;

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import { RequiredFieldsNote, RequiredMark } from "../components/RequiredFields";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { LIMITS, validateRegisterPayload } from "../../shared/validation.js";

function readNextPath(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "";
  return value;
}

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
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  // Подсказки отраслей берём из существующих компаний/поставщиков/заказов, но поле остаётся свободным.
  useEffect(() => {
    apiFetch("/industries", { skipAuth: true })
      .then((data) => setIndustryOptions(Array.isArray(data.industries) ? data.industries : []))
      .catch(() => setIndustryOptions([]));
  }, []);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setFieldErrors({});
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    const normalizedEmail = email.trim().toLowerCase();
    const nextFieldErrors = {};

    if (!normalizedEmail) {
      nextFieldErrors.email = "Укажите email.";
    } else if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      nextFieldErrors.email = "Укажите корректный email.";
    }

    if (!password) {
      nextFieldErrors.password = "Введите пароль.";
    }

    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      setError(nextFieldErrors[Object.keys(nextFieldErrors)[0]]);
      return;
    }

    setLoading(true);

    try {
      await login(normalizedEmail, password);
      const nextPath = readNextPath(searchParams.get("next"));
      navigate(nextPath || "/");
    } catch (loginError) {
      setError(loginError.message);
      if (loginError.fields) setFieldErrors(loginError.fields);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    const payload = {
      companyName: companyName.trim(),
      displayName: displayName.trim(),
      city: city.trim(),
      industry: industry.trim(),
      email: email.trim().toLowerCase(),
      password,
    };
    const validation = validateRegisterPayload(payload);

    if (!validation.ok) {
      setFieldErrors(validation.fields);
      setError(validation.message);
      return;
    }

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: "Пароли не совпадают." });
      setError("Пароли не совпадают.");
      return;
    }

    setLoading(true);

    try {
      await register(validation.value);
      const nextPath = readNextPath(searchParams.get("next"));
      navigate(nextPath || "/create");
    } catch (registerError) {
      setError(registerError.message);
      if (registerError.fields) setFieldErrors(registerError.fields);
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
            <button type="button" className={mode === "login" ? "button button-primary" : "button button-secondary"} onClick={() => switchMode("login")}>
              Вход
            </button>
            <button type="button" className={mode === "register" ? "button button-primary" : "button button-secondary"} onClick={() => switchMode("register")}>
              Регистрация
            </button>
          </div>

          {mode === "login" ? (
            <form className="login-form" onSubmit={handleLogin} noValidate>
              <RequiredFieldsNote />
              <label className="field">
                <span>Email<RequiredMark /></span>
                <input
                  name="loginEmail"
                  type="email"
                  required
                  aria-required="true"
                  maxLength={LIMITS.auth.emailMax}
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="northbeans@b2b.local"
                />
                {fieldErrors.email ? <span className="field-error">{fieldErrors.email}</span> : null}
              </label>
              <label className="field">
                <span>Пароль<RequiredMark /></span>
                <input
                  name="loginPassword"
                  type="password"
                  required
                  aria-required="true"
                  maxLength={LIMITS.auth.passwordMaxBytes}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Введите пароль"
                />
                {fieldErrors.password ? <span className="field-error">{fieldErrors.password}</span> : null}
              </label>
              {error ? <div className="error-banner">{error}</div> : null}
              <button type="submit" className="button button-primary button-block" disabled={loading}>
                {loading ? "Вход..." : "Войти"}
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={handleRegister} noValidate>
              <RequiredFieldsNote />
              <label className="field">
                <span>Название компании<RequiredMark /></span>
                <input
                  name="registerCompanyName"
                  required
                  aria-required="true"
                  maxLength={LIMITS.profile.companyNameMax}
                  autoComplete="organization"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="ООО Северный Поставщик"
                />
                {fieldErrors.companyName ? <span className="field-error">{fieldErrors.companyName}</span> : null}
              </label>
              <label className="field">
                <span>Контактное имя<RequiredMark /></span>
                <input
                  name="registerDisplayName"
                  required
                  aria-required="true"
                  maxLength={LIMITS.profile.displayNameMax}
                  autoComplete="name"
                  autoCapitalize="words"
                  spellCheck={false}
                  lang="ru"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Анна Петрова"
                />
                {fieldErrors.displayName ? <span className="field-error">{fieldErrors.displayName}</span> : null}
              </label>
              <label className="field">
                <span>Город<RequiredMark /></span>
                <input
                  name="registerCity"
                  required
                  aria-required="true"
                  maxLength={LIMITS.profile.cityMax}
                  autoComplete="address-level2"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="Екатеринбург"
                />
                {fieldErrors.city ? <span className="field-error">{fieldErrors.city}</span> : null}
              </label>
              <label className="field">
                <span>Сфера<RequiredMark /></span>
                <input
                  name="registerIndustry"
                  list="industry-options"
                  required
                  aria-required="true"
                  maxLength={LIMITS.profile.industryMax}
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  placeholder="Выберите существующую или укажите свою сферу"
                />
                <datalist id="industry-options">
                  {industryOptions.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
                {fieldErrors.industry ? <span className="field-error">{fieldErrors.industry}</span> : null}
              </label>
              <label className="field">
                <span>Email<RequiredMark /></span>
                <input
                  name="registerEmail"
                  type="email"
                  required
                  aria-required="true"
                  maxLength={LIMITS.auth.emailMax}
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="company@example.ru"
                />
                {fieldErrors.email ? <span className="field-error">{fieldErrors.email}</span> : null}
              </label>
              <label className="field">
                <span>Пароль<RequiredMark /></span>
                <input
                  name="registerPassword"
                  type="password"
                  required
                  aria-required="true"
                  minLength={LIMITS.auth.passwordMinBytes}
                  maxLength={LIMITS.auth.passwordMaxBytes}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={`Минимум ${LIMITS.auth.passwordMinBytes} символов`}
                />
                {fieldErrors.password ? <span className="field-error">{fieldErrors.password}</span> : null}
              </label>
              <label className="field">
                <span>Повторите пароль<RequiredMark /></span>
                <input
                  name="registerConfirmPassword"
                  type="password"
                  required
                  aria-required="true"
                  minLength={LIMITS.auth.passwordMinBytes}
                  maxLength={LIMITS.auth.passwordMaxBytes}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Повторите пароль"
                />
                {fieldErrors.confirmPassword ? <span className="field-error">{fieldErrors.confirmPassword}</span> : null}
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

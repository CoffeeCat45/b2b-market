import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    navigate("/");
  };

  return (
    <Layout withFooter={false}>
      <section className="login-section">
        <div className="login-card card">
          <span className="eyebrow">Демо-вход</span>
          <h1>Вход в кабинет компании</h1>
          <p>Авторизация работает как заглушка, чтобы показать пользовательский сценарий без бэкенда.</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="company@example.ru"
              />
            </label>

            <label className="field">
              <span>Пароль</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Введите пароль"
              />
            </label>

            <button type="submit" className="button button-primary button-block">
              Войти
            </button>
          </form>
        </div>
      </section>
    </Layout>
  );
}

export default LoginPage;

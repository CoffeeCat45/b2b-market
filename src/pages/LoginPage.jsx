import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      navigate("/");
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout withFooter={false}>
      <section className="login-section">
        <div className="login-card card">
          <h1>Вход в кабинет компании</h1>
          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="northbeans@b2b.local" />
            </label>
            <label className="field">
              <span>Пароль</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Введите пароль" />
            </label>
            {error ? <div className="error-banner">{error}</div> : null}
            <button type="submit" className="button button-primary button-block" disabled={loading}>{loading ? "Вход..." : "Войти"}</button>
          </form>
        </div>
      </section>
    </Layout>
  );
}

export default LoginPage;
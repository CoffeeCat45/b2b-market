import { Link } from "react-router-dom";
import Layout from "../components/Layout";

function NotFoundPage() {
  return (
    <Layout>
      <section className="detail-section">
        <div className="container">
          <div className="empty-state card">
            <h1>Страница не найдена</h1>
            <p>Проверьте адрес или вернитесь в каталог.</p>
            <Link to="/" className="button button-primary">
              На главную
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}

export default NotFoundPage;

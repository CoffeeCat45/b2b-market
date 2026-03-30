import { useState } from "react";
import Layout from "../components/Layout";

const initialState = {
  type: "Заказ",
  title: "Поставка упаковки для сети кофеен",
  category: "Оптовые поставки",
  city: "Екатеринбург",
  budget: "от 250 000 ₽ до 450 000 ₽",
  summary: "Нужен поставщик брендированной упаковки и расходных материалов для 14 точек.",
  description:
    "Ищем партнёра для регулярных поставок стаканов, крышек, пакетов и брендированных коробок. Важно наличие образцов, прозрачных сроков и возможности ежемесячных отгрузок.",
  tags: "B2B, упаковка, регулярный контракт",
};

function CreatePage() {
  const [form, setForm] = useState(initialState);
  const [submitted, setSubmitted] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <Layout>
      <section className="form-section">
        <div className="container form-layout">
          <div className="form-main">
            <div className="section-heading compact form-heading">
              <h1>Создание объявления</h1>
            </div>

            <form className="card listing-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label className="field field-type">
                  <span>Тип объявления</span>
                  <select value={form.type} onChange={(event) => updateField("type", event.target.value)}>
                    <option>Заказ</option>
                    <option>Предложение</option>
                  </select>
                </label>

                <label className="field">
                  <span>Категория</span>
                  <select
                    value={form.category}
                    onChange={(event) => updateField("category", event.target.value)}
                  >
                    <option>IT услуги</option>
                    <option>Логистика</option>
                    <option>Производство</option>
                    <option>Маркетинг</option>
                    <option>Оптовые поставки</option>
                    <option>Строительство</option>
                  </select>
                </label>

                <label className="field field-wide">
                  <span>Название</span>
                  <input
                    value={form.title}
                    onChange={(event) => updateField("title", event.target.value)}
                    placeholder="Поставка упаковки для сети кофеен"
                  />
                </label>

                <label className="field">
                  <span>Город</span>
                  <input
                    value={form.city}
                    onChange={(event) => updateField("city", event.target.value)}
                    placeholder="Екатеринбург"
                  />
                </label>

                <label className="field">
                  <span>Бюджет</span>
                  <input
                    value={form.budget}
                    onChange={(event) => updateField("budget", event.target.value)}
                    placeholder="от 250 000 ₽"
                  />
                </label>

                <label className="field field-wide">
                  <span>Краткое описание</span>
                  <input
                    value={form.summary}
                    onChange={(event) => updateField("summary", event.target.value)}
                    placeholder="Короткое описание для каталога"
                  />
                </label>

                <label className="field field-wide">
                  <span>Полное описание</span>
                  <textarea
                    rows="7"
                    value={form.description}
                    onChange={(event) => updateField("description", event.target.value)}
                    placeholder="Опишите объем работ, условия, критерии выбора и сроки"
                  />
                </label>

                <label className="field field-wide">
                  <span>Теги</span>
                  <input
                    value={form.tags}
                    onChange={(event) => updateField("tags", event.target.value)}
                    placeholder="B2B, регулярный контракт, поставка"
                  />
                </label>
              </div>

              <button type="submit" className="button button-primary">
                Опубликовать
              </button>

              {submitted ? (
                <div className="success-banner">
                  Объявление сохранено в демо-режиме. Следующий шаг: подключить API и базу данных.
                </div>
              ) : null}
            </form>
          </div>

          <aside className="form-side">
            <div className="card tips-card">
              <h3>Что важно для хорошей карточки</h3>
              <ul>
                <li>Конкретный заголовок без общих фраз</li>
                <li>Ясный бюджет или пометка «по договоренности»</li>
                <li>Город и формат сотрудничества</li>
                <li>Точные условия и ожидаемый результат</li>
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </Layout>
  );
}

export default CreatePage;

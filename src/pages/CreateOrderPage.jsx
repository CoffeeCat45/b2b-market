import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { useMarketplaceData } from "../hooks/useMarketplaceData";

const emptyForm = { title: "", category: "", cityMajor: "", locationDetail: "", budgetFrom: "", budgetTo: "", summary: "", description: "", terms: "", tags: "", companyId: "" };

function CreateOrderPage() {
  const { user, loading } = useAuth();
  const { orders, companies, reload } = useMarketplaceData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [cityFocused, setCityFocused] = useState(false);

  const editId = searchParams.get("edit");
  const editingOrder = useMemo(() => orders.find((item) => item.id === editId) || null, [orders, editId]);
  const isEditing = Boolean(editId && editingOrder);
  const categorySuggestions = useMemo(
    () => [...new Set(orders.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")),
    [orders],
  );
  const citySuggestions = useMemo(
    () => [...new Set([
      ...orders.map((item) => item.cityMajor || item.city),
      ...companies.map((company) => company.city),
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")),
    [orders, companies],
  );

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  // Синхронизируем форму либо из редактируемого объявления, либо из дефолтов текущей компании.
  useEffect(() => {
    if (!user) return;

    if (editingOrder) {
      setForm({
        title: editingOrder.title,
        category: editingOrder.category,
        cityMajor: editingOrder.cityMajor || editingOrder.city,
        locationDetail: editingOrder.locationDetail || "",
        budgetFrom: String(editingOrder.budgetFrom),
        budgetTo: String(editingOrder.budgetTo),
        summary: editingOrder.summary,
        description: editingOrder.description,
        terms: editingOrder.terms,
        tags: editingOrder.tags.join(", "),
        companyId: editingOrder.companyId,
      });
      return;
    }

    setForm({ ...emptyForm, companyId: user.role === "admin" ? "" : user.companyId || "" });
  }, [editingOrder, user]);

  // Один submit-обработчик покрывает и создание, и редактирование, чтобы payload в API оставался единым.
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("");

    try {
      const payload = { ...form, tags: form.tags };
      if (isEditing) {
        await apiFetch(`/orders/${editingOrder.id}`, { method: "PUT", body: JSON.stringify(payload) });
        setStatus("Объявление обновлено.");
      } else {
        await apiFetch("/orders", { method: "POST", body: JSON.stringify(payload) });
        setStatus("Объявление создано.");
      }
      await reload();
      navigate("/create", { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (editId && !editingOrder && orders.length) return <Navigate to="/create" replace />;

  return (
    <Layout>
      <section className="form-section">
        <div className="container dashboard-main-only">
          <div className="dashboard-toggle card">
            <div className="card-actions">
              <h1>{isEditing ? "Редактирование объявления" : "Создание объявления"}</h1>
              <div className="dashboard-top-actions">
                <Link to="/create" className="button button-secondary">
                  Назад в кабинет
                </Link>
                <Link to="/chats" className="button button-secondary">
                  Открыть чаты
                </Link>
              </div>
            </div>
          </div>

          <form className="card listing-form" onSubmit={handleSubmit}>
            <div className="form-intro">
              <h2>{isEditing ? "Форма редактирования объявления" : "Форма создания объявления"}</h2>
              <p>{isEditing ? "Обновите данные текущего объявления и сохраните изменения." : "Заполните карточку, чтобы опубликовать новое объявление в каталоге."}</p>
            </div>
            <div className="form-grid">
              {user.role === "admin" ? (
                <label className="field field-type">
                  <span>Компания</span>
                  <select name="orderCompanyId" value={form.companyId} onChange={(event) => updateField("companyId", event.target.value)}>
                    <option value="">Выберите компанию</option>
                    {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="field">
                <span>Категория</span>
                <input name="orderCategory" list="order-category-options" value={form.category} onChange={(event) => updateField("category", event.target.value)} />
                <datalist id="order-category-options">
                  {categorySuggestions.map((category) => <option key={category} value={category} />)}
                </datalist>
              </label>
              <label className="field field-wide"><span>Название</span><input name="orderTitle" value={form.title} onChange={(event) => updateField("title", event.target.value)} /></label>
              <label className="field city-field">
                <span>Город</span>
                <input
                  name="orderCityMajor"
                  value={form.cityMajor}
                  onFocus={() => setCityFocused(true)}
                  onChange={(event) => updateField("cityMajor", event.target.value)}
                  onBlur={() => setCityFocused(false)}
                  placeholder="Город размещения"
                  autoComplete="off"
                />
                {cityFocused && citySuggestions.length ? (
                  <div className="field-suggestions">
                    {citySuggestions.map((city) => (
                      <button
                        key={city}
                        type="button"
                        className="search-suggestion"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setCityFocused(false);
                          updateField("cityMajor", city);
                        }}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                ) : null}
              </label>
              <label className="field"><span>Район / пригород</span><input name="orderLocationDetail" value={form.locationDetail} onChange={(event) => updateField("locationDetail", event.target.value)} placeholder="Рыбино или р-н Центральный" /></label>
              <label className="field"><span>Бюджет от</span><input name="orderBudgetFrom" type="number" value={form.budgetFrom} onChange={(event) => updateField("budgetFrom", event.target.value)} /></label>
              <label className="field"><span>Бюджет до</span><input name="orderBudgetTo" type="number" value={form.budgetTo} onChange={(event) => updateField("budgetTo", event.target.value)} /></label>
              <label className="field field-wide"><span>Краткое описание</span><input name="orderSummary" value={form.summary} onChange={(event) => updateField("summary", event.target.value)} /></label>
              <label className="field field-wide"><span>Полное описание</span><textarea name="orderDescription" rows="6" value={form.description} onChange={(event) => updateField("description", event.target.value)} /></label>
              <label className="field field-wide"><span>Условия сотрудничества</span><textarea name="orderTerms" rows="4" value={form.terms} onChange={(event) => updateField("terms", event.target.value)} /></label>
              <label className="field field-wide"><span>Теги</span><input name="orderTags" value={form.tags} onChange={(event) => updateField("tags", event.target.value)} placeholder="B2B, поставка, опт" /></label>
            </div>
            {error ? <div className="error-banner">{error}</div> : null}
            {status ? <div className="success-banner">{status}</div> : null}
            <div className="card-actions">
              <button type="submit" className="button button-primary">{isEditing ? "Сохранить" : "Опубликовать"}</button>
              <Link to="/create" className="button button-secondary">Отмена</Link>
            </div>
          </form>
        </div>
      </section>
    </Layout>
  );
}

export default CreateOrderPage;


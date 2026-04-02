import { useMemo, useState } from "react";
import { Navigate, Link, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { useMarketplaceData } from "../hooks/useMarketplaceData";

const emptyForm = { title: "", category: "Оптовые поставки", cityMajor: "", locationDetail: "", budgetFrom: "", budgetTo: "", summary: "", description: "", terms: "", tags: "", companyId: "" };

function CreatePage() {
  const { user, loading } = useAuth();
  const { orders, companies, reload } = useMarketplaceData();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [openCreate, setOpenCreate] = useState(true);
  const [adminSearch, setAdminSearch] = useState("");
  const [adminSearchFocused, setAdminSearchFocused] = useState(false);

  const chatCompany = searchParams.get("chatCompany");
  const orderId = searchParams.get("orderId");
  if (chatCompany) {
    const next = orderId ? `/chats?chatCompany=${encodeURIComponent(chatCompany)}&orderId=${encodeURIComponent(orderId)}` : `/chats?chatCompany=${encodeURIComponent(chatCompany)}`;
    return <Navigate to={next} replace />;
  }

  const citySuggestions = useMemo(() => {
    return [];
  }, []);

  const editableOrders = useMemo(() => {
    if (!user) return [];
    const source = user.role === "admin" ? orders : orders.filter((item) => item.companyId === user.companyId);
    if (!adminSearch.trim()) return source;
    const q = adminSearch.toLowerCase();
    return source.filter((item) => `${item.title} ${item.company}`.toLowerCase().includes(q));
  }, [orders, user, adminSearch]);

  const adminSuggestions = useMemo(() => {
    const q = adminSearch.trim().toLowerCase();
    if (!q || user?.role !== "admin") return [];
    return [...new Set(orders.flatMap((item) => [item.title, item.company]).filter((item) => item.toLowerCase().includes(q)))].slice(0, 5);
  }, [adminSearch, orders, user]);

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...emptyForm, companyId: user?.companyId || "" });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("");
    try {
      const payload = { ...form, tags: form.tags };
      if (editingId) {
        await apiFetch(`/orders/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        setStatus("Объявление обновлено.");
      } else {
        await apiFetch("/orders", { method: "POST", body: JSON.stringify(payload) });
        setStatus("Объявление создано.");
      }
      resetForm();
      await reload();
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setOpenCreate(true);
    setForm({
      title: item.title,
      category: item.category,
      cityMajor: item.cityMajor || item.city,
      locationDetail: item.locationDetail || "",
      budgetFrom: String(item.budgetFrom),
      budgetTo: String(item.budgetTo),
      summary: item.summary,
      description: item.description,
      terms: item.terms,
      tags: item.tags.join(", "),
      companyId: item.companyId,
    });
  };

  const removeOrder = async (id) => {
    try {
      await apiFetch(`/orders/${id}`, { method: "DELETE" });
      setStatus("Объявление удалено.");
      await reload();
    } catch (removeError) {
      setError(removeError.message);
    }
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <Layout>
      <section className="form-section">
        <div className="container dashboard-main-only">
          <div className="dashboard-toggle card">
            <div className="card-actions">
              <h1>{editingId ? "Редактирование объявления" : "Кабинет компании"}</h1>
              <div className="dashboard-top-actions">
                <Link to="/chats" className="button button-secondary">
                  Открыть чаты
                </Link>
                <button type="button" className="button button-secondary" onClick={() => setOpenCreate((current) => !current)}>
                  {openCreate ? "Свернуть форму" : "Развернуть форму"}
                </button>
              </div>
            </div>
          </div>

          {openCreate ? (
            <form className="card listing-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                {user.role === "admin" ? <label className="field field-type"><span>Компания</span><select value={form.companyId} onChange={(event) => updateField("companyId", event.target.value)}><option value="">Выберите компанию</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label> : null}
                <label className="field"><span>Категория</span><input value={form.category} onChange={(event) => updateField("category", event.target.value)} /></label>
                <label className="field field-wide"><span>Название</span><input value={form.title} onChange={(event) => updateField("title", event.target.value)} /></label>
                <label className="field city-field"><span>Город</span><input value={form.cityMajor} onChange={(event) => updateField("cityMajor", event.target.value)} placeholder="Город размещения" />{citySuggestions.length ? <div className="field-suggestions">{citySuggestions.map((city) => <button key={city} type="button" className="search-suggestion" onClick={() => updateField("cityMajor", city)}>{city}</button>)}</div> : null}</label>
                <label className="field"><span>Район / пригород</span><input value={form.locationDetail} onChange={(event) => updateField("locationDetail", event.target.value)} placeholder="Рыбино или р-н Центральный" /></label>
                <label className="field"><span>Бюджет от</span><input type="number" value={form.budgetFrom} onChange={(event) => updateField("budgetFrom", event.target.value)} /></label>
                <label className="field"><span>Бюджет до</span><input type="number" value={form.budgetTo} onChange={(event) => updateField("budgetTo", event.target.value)} /></label>
                <label className="field field-wide"><span>Краткое описание</span><input value={form.summary} onChange={(event) => updateField("summary", event.target.value)} /></label>
                <label className="field field-wide"><span>Полное описание</span><textarea rows="6" value={form.description} onChange={(event) => updateField("description", event.target.value)} /></label>
                <label className="field field-wide"><span>Условия сотрудничества</span><textarea rows="4" value={form.terms} onChange={(event) => updateField("terms", event.target.value)} /></label>
                <label className="field field-wide"><span>Теги</span><input value={form.tags} onChange={(event) => updateField("tags", event.target.value)} placeholder="B2B, поставка, опт" /></label>
              </div>
              {error ? <div className="error-banner">{error}</div> : null}
              {status ? <div className="success-banner">{status}</div> : null}
              <div className="card-actions">
                <button type="submit" className="button button-primary">{editingId ? "Сохранить" : "Опубликовать"}</button>
                {editingId ? <button type="button" className="button button-secondary" onClick={resetForm}>Отменить</button> : null}
              </div>
            </form>
          ) : null}

          <div className="card manage-card">
            <div className="manage-header">
              <h2>{user.role === "admin" ? "Все объявления" : "Мои объявления"}</h2>
              {user.role === "admin" ? <div className="admin-search-wrap"><input className="admin-search-input" value={adminSearch} onFocus={() => setAdminSearchFocused(true)} onBlur={() => setAdminSearchFocused(false)} onChange={(event) => setAdminSearch(event.target.value)} placeholder="Поиск по компании или названию" />{adminSearchFocused && adminSuggestions.length ? <div className="field-suggestions compact-suggestions">{adminSuggestions.map((item) => <button key={item} type="button" className="search-suggestion" onMouseDown={(event) => event.preventDefault()} onClick={() => setAdminSearch(item)}>{item}</button>)}</div> : null}</div> : null}
            </div>
            <div className="manage-list">
              {editableOrders.map((item) => <article key={item.id} className="manage-item"><div><strong>{item.title}</strong><p>{item.company} · {item.city} · {item.budget}</p><p className="muted">Уникальные просмотры: {item.viewsCount || 0}</p></div><div className="manage-actions"><button type="button" className="button button-secondary" onClick={() => startEdit(item)}>Изменить</button><button type="button" className="button button-ghost" onClick={() => removeOrder(item.id)}>Удалить</button></div></article>)}
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}

export default CreatePage;

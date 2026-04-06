import { useMemo, useState } from "react";
import { Navigate, Link, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { useMarketplaceData } from "../hooks/useMarketplaceData";

const emptyForm = { title: "", category: "Оптовые поставки", cityMajor: "", locationDetail: "", budgetFrom: "", budgetTo: "", summary: "", description: "", terms: "", tags: "", companyId: "" };

function CreatePage() {
  const { user, loading, updateUser } = useAuth();
  const { orders, companies, reload } = useMarketplaceData();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [openCreate, setOpenCreate] = useState(true);
  const [adminSearch, setAdminSearch] = useState("");
  const [adminSearchFocused, setAdminSearchFocused] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileStep, setProfileStep] = useState("view");
  const [profilePassword, setProfilePassword] = useState("");
  const [profileForm, setProfileForm] = useState({
    displayName: "",
    email: "",
    companyName: "",
    city: "",
    phone: "",
    industry: "",
    description: "",
    about: "",
    specializations: "",
  });
  const [profileError, setProfileError] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  const chatCompany = searchParams.get("chatCompany");
  const orderId = searchParams.get("orderId");
  if (chatCompany) {
    const next = orderId ? `/chats?chatCompany=${encodeURIComponent(chatCompany)}&orderId=${encodeURIComponent(orderId)}` : `/chats?chatCompany=${encodeURIComponent(chatCompany)}`;
    return <Navigate to={next} replace />;
  }

  const citySuggestions = useMemo(() => [], []);
  const currentCompany = useMemo(() => companies.find((company) => company.id === user?.companyId) || null, [companies, user]);

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
  const updateProfileField = (field, value) => setProfileForm((current) => ({ ...current, [field]: value }));

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...emptyForm, companyId: user?.companyId || "" });
  };

  const openProfileModal = () => {
    setProfileModalOpen(true);
    setProfileStep("view");
    setProfilePassword("");
    setProfileError("");
    setProfileForm({
      displayName: user?.displayName || "",
      email: user?.email || "",
      companyName: currentCompany?.name || user?.company || "",
      city: currentCompany?.city || user?.companyCity || "",
      phone: currentCompany?.phone || user?.companyPhone || "",
      industry: currentCompany?.industry || user?.industry || "",
      description: currentCompany?.description || user?.description || "",
      about: currentCompany?.about || user?.about || "",
      specializations: (currentCompany?.specializations || user?.specializations || []).join(", "),
    });
  };

  const closeProfileModal = () => {
    setProfileModalOpen(false);
    setProfileStep("view");
    setProfilePassword("");
    setProfileError("");
    setProfileLoading(false);
  };

  const startProfileEdit = () => {
    setProfileStep("verify");
    setProfilePassword("");
    setProfileError("");
  };

  const verifyProfilePassword = async (event) => {
    event.preventDefault();
    setProfileError("");
    setProfileLoading(true);

    try {
      await apiFetch("/auth/verify-password", {
        method: "POST",
        body: JSON.stringify({ password: profilePassword }),
      });
      setProfileStep("edit");
    } catch (verifyError) {
      setProfileError(verifyError.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileError("");
    setProfileLoading(true);

    try {
      const data = await apiFetch("/auth/profile", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword: profilePassword,
          displayName: profileForm.displayName,
          email: profileForm.email,
          companyName: profileForm.companyName,
          city: profileForm.city,
          phone: profileForm.phone,
          industry: profileForm.industry,
          description: profileForm.description,
          about: profileForm.about,
          specializations: profileForm.specializations,
        }),
      });
      updateUser(data.user);
      setStatus("Данные компании обновлены.");
      closeProfileModal();
      await reload();
    } catch (saveError) {
      setProfileError(saveError.message);
    } finally {
      setProfileLoading(false);
    }
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
                {user.role === "company" ? (
                  <>
                    <Link to={`/company/${user.companyId}`} className="button button-secondary">
                      Профиль компании
                    </Link>
                    <button type="button" className="button button-secondary" onClick={openProfileModal}>
                      Данные
                    </button>
                  </>
                ) : null}
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
              <div className="form-intro">
                <h2>{editingId ? "Форма редактирования объявления" : "Форма создания объявления"}</h2>
                <p>{editingId ? "Обновите данные текущего объявления и сохраните изменения." : "Заполните карточку, чтобы опубликовать новое объявление в каталоге."}</p>
              </div>
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

      {profileModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeProfileModal}>
          <div className="modal-card card" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 id="profile-modal-title">{profileStep === "view" ? "Данные компании" : profileStep === "verify" ? "Подтвердите пароль" : "Изменение данных"}</h2>
                <p>{profileStep === "view" ? "Здесь можно посмотреть текущие данные аккаунта." : profileStep === "verify" ? "Перед изменением данных подтвердите пароль от аккаунта." : "Измените контакты, описание, отрасль и теги компании."}</p>
              </div>
              <button type="button" className="button button-secondary modal-close" onClick={closeProfileModal}>×</button>
            </div>

            {profileStep === "view" ? (
              <div className="modal-form-grid">
                <div className="profile-data-grid">
                  <div className="profile-data-item"><span>Контактное имя</span><strong>{profileForm.displayName || "Не указано"}</strong></div>
                  <div className="profile-data-item"><span>Email</span><strong>{profileForm.email || "Не указано"}</strong></div>
                  <div className="profile-data-item"><span>Название компании</span><strong>{profileForm.companyName || "Не указано"}</strong></div>
                  <div className="profile-data-item"><span>Город</span><strong>{profileForm.city || "Не указано"}</strong></div>
                  <div className="profile-data-item"><span>Телефон</span><strong>{profileForm.phone || "Не указано"}</strong></div>
                  <div className="profile-data-item"><span>Отрасль</span><strong>{profileForm.industry || "Не указано"}</strong></div>
                  <div className="profile-data-item profile-data-item-wide"><span>Описание компании</span><strong>{profileForm.description || "Не указано"}</strong></div>
                  <div className="profile-data-item profile-data-item-wide"><span>О компании</span><strong>{profileForm.about || "Не указано"}</strong></div>
                  <div className="profile-data-item profile-data-item-wide"><span>Теги</span><strong>{profileForm.specializations || "Не указано"}</strong></div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="button button-secondary" onClick={closeProfileModal}>Закрыть</button>
                  <button type="button" className="button button-primary" onClick={startProfileEdit}>Изменить</button>
                </div>
              </div>
            ) : null}

            {profileStep === "verify" ? (
              <form onSubmit={verifyProfilePassword} className="modal-form-grid">
                <label className="field">
                  <span>Пароль</span>
                  <input type="password" value={profilePassword} onChange={(event) => setProfilePassword(event.target.value)} placeholder="Введите текущий пароль" />
                </label>
                {profileError ? <div className="error-banner">{profileError}</div> : null}
                <div className="modal-actions">
                  <button type="button" className="button button-secondary" onClick={closeProfileModal}>Отмена</button>
                  <button type="submit" className="button button-primary" disabled={profileLoading}>{profileLoading ? "Проверка..." : "Продолжить"}</button>
                </div>
              </form>
            ) : null}

            {profileStep === "edit" ? (
              <form onSubmit={saveProfile} className="modal-form-grid">
                <label className="field"><span>Контактное имя</span><input value={profileForm.displayName} onChange={(event) => updateProfileField("displayName", event.target.value)} /></label>
                <label className="field"><span>Email</span><input value={profileForm.email} onChange={(event) => updateProfileField("email", event.target.value)} /></label>
                <label className="field"><span>Название компании</span><input value={profileForm.companyName} onChange={(event) => updateProfileField("companyName", event.target.value)} /></label>
                <label className="field"><span>Город</span><input value={profileForm.city} onChange={(event) => updateProfileField("city", event.target.value)} /></label>
                <label className="field"><span>Телефон</span><input value={profileForm.phone} onChange={(event) => updateProfileField("phone", event.target.value)} placeholder="+7 (900) 000-00-00" /></label>
                <label className="field"><span>Отрасль</span><input value={profileForm.industry} onChange={(event) => updateProfileField("industry", event.target.value)} placeholder="IT, строительство, производство" /></label>
                <label className="field field-wide"><span>Описание компании</span><textarea rows="4" value={profileForm.description} onChange={(event) => updateProfileField("description", event.target.value)} /></label>
                <label className="field field-wide"><span>О компании</span><textarea rows="5" value={profileForm.about} onChange={(event) => updateProfileField("about", event.target.value)} /></label>
                <label className="field field-wide"><span>Теги</span><input value={profileForm.specializations} onChange={(event) => updateProfileField("specializations", event.target.value)} placeholder="Оптовые поставки, HoReCa, Розница" /></label>
                {profileError ? <div className="error-banner">{profileError}</div> : null}
                <div className="modal-actions">
                  <button type="button" className="button button-secondary" onClick={closeProfileModal}>Отмена</button>
                  <button type="submit" className="button button-primary" disabled={profileLoading}>{profileLoading ? "Сохранение..." : "Сохранить"}</button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </Layout>
  );
}

export default CreatePage;

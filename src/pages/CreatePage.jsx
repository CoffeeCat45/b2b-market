import { useMemo, useState } from "react";
import { Navigate, Link, useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { getAvatarStyle, getInitials } from "../lib/avatar";
import { useMarketplaceData } from "../hooks/useMarketplaceData";

function CreatePage() {
  const { user, loading, updateUser } = useAuth();
  const { orders, companies, reload } = useMarketplaceData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
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
    avatarUrl: "",
    avatarPositionX: 50,
    avatarPositionY: 50,
    avatarScale: 100,
  });
  const [profileError, setProfileError] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", nextPassword: "", confirmPassword: "" });
  const [deletePassword, setDeletePassword] = useState("");
  const [initialAvatarUrl, setInitialAvatarUrl] = useState("");

  // Старые chat query params перенаправляем в отдельный workspace чатов.
  const chatCompany = searchParams.get("chatCompany");
  const orderId = searchParams.get("orderId");
  if (chatCompany) {
    const next = orderId ? `/chats?chatCompany=${encodeURIComponent(chatCompany)}&orderId=${encodeURIComponent(orderId)}` : `/chats?chatCompany=${encodeURIComponent(chatCompany)}`;
    return <Navigate to={next} replace />;
  }

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

  const updateProfileField = (field, value) => setProfileForm((current) => ({ ...current, [field]: value }));

  // Мини-редактор аватарки хранит исходное изображение и параметры кадрирования без отдельного storage.
  const handleAvatarFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProfileError("Поддерживаются только JPG, PNG или WebP.");
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setProfileError("Поддерживаются только JPG, PNG или WebP.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setProfileError("Аватар слишком большой. Загрузите изображение до 2 МБ.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfileError("");
      setProfileForm((current) => ({
        ...current,
        avatarUrl: String(reader.result || ""),
        avatarPositionX: 50,
        avatarPositionY: 50,
        avatarScale: 100,
      }));
    };
    reader.onerror = () => setProfileError("Не удалось прочитать файл аватарки.");
    reader.readAsDataURL(file);
  };

  // Модалка профиля разбита на просмотр -> подтверждение пароля -> редактирование, чтобы не менять данные случайно.
  const openProfileModal = () => {
    setProfileModalOpen(true);
    setProfileStep("view");
    setProfilePassword("");
    setProfileError("");
    setPasswordForm({ currentPassword: "", nextPassword: "", confirmPassword: "" });
    setDeletePassword("");
    const nextAvatarUrl = currentCompany?.avatarUrl || user?.avatarUrl || "";
    setInitialAvatarUrl(nextAvatarUrl);
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
      avatarUrl: nextAvatarUrl,
      avatarPositionX: currentCompany?.avatarPositionX ?? user?.avatarPositionX ?? 50,
      avatarPositionY: currentCompany?.avatarPositionY ?? user?.avatarPositionY ?? 50,
      avatarScale: currentCompany?.avatarScale ?? user?.avatarScale ?? 100,
    });
  };

  const closeProfileModal = () => {
    setProfileModalOpen(false);
    setProfileStep("view");
    setProfilePassword("");
    setProfileError("");
    setProfileLoading(false);
    setPasswordForm({ currentPassword: "", nextPassword: "", confirmPassword: "" });
    setDeletePassword("");
    setInitialAvatarUrl("");
  };

  const startProfileEdit = () => {
    setProfileStep("verify");
    setProfilePassword("");
    setProfileError("");
  };

  const startPasswordChange = () => {
    setProfileStep("password");
    setProfileError("");
    setPasswordForm({ currentPassword: "", nextPassword: "", confirmPassword: "" });
  };

  const startCompanyDelete = () => {
    setProfileStep("delete");
    setProfileError("");
    setDeletePassword("");
  };

  const updatePasswordField = (field, value) => setPasswordForm((current) => ({ ...current, [field]: value }));

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
      const avatarChanged = profileForm.avatarUrl !== initialAvatarUrl;
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
          ...(avatarChanged ? { avatarUrl: profileForm.avatarUrl } : {}),
          avatarPositionX: profileForm.avatarPositionX,
          avatarPositionY: profileForm.avatarPositionY,
          avatarScale: profileForm.avatarScale,
        }),
      });
      updateUser(data.user);
      setStatus("Данные компании обновлены.");
      closeProfileModal();
      reload().catch(() => {});
    } catch (saveError) {
      setProfileError(saveError.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setProfileError("");

    if (passwordForm.nextPassword !== passwordForm.confirmPassword) {
      setProfileError("Пароли не совпадают.");
      return;
    }

    setProfileLoading(true);

    try {
      await apiFetch("/auth/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword: passwordForm.currentPassword, nextPassword: passwordForm.nextPassword }),
      });
      setStatus("Пароль изменён.");
      closeProfileModal();
    } catch (passwordError) {
      setProfileError(passwordError.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const deleteCompany = async (event) => {
    event.preventDefault();
    setProfileError("");
    setProfileLoading(true);

    try {
      await apiFetch("/auth/company", {
        method: "DELETE",
        body: JSON.stringify({ password: deletePassword }),
      });
      localStorage.removeItem("auth_token");
      updateUser(null);
      navigate("/login", { replace: true });
    } catch (deleteError) {
      setProfileError(deleteError.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const removeOrder = async (id) => {
    try {
      await apiFetch(`/orders/${id}`, { method: "DELETE" });
      setStatus("Объявление удалено.");
      setError("");
      await reload();
    } catch (removeError) {
      setError(removeError.message);
    }
  };

  const profileModalTitle = profileStep === "view"
    ? "Данные компании"
    : profileStep === "verify"
      ? "Подтвердите пароль"
      : profileStep === "password"
        ? "Смена пароля"
        : profileStep === "delete"
          ? "Удаление компании"
          : "Изменение данных";
  const profileModalSubtitle = profileStep === "view"
    ? "Здесь можно посмотреть текущие данные аккаунта."
    : profileStep === "verify"
      ? "Перед изменением данных подтвердите пароль от аккаунта."
      : profileStep === "password"
        ? "Введите текущий пароль и новый пароль."
        : profileStep === "delete"
          ? "Это действие удалит компанию, её объявления, чаты и сессии."
          : "Измените контакты, описание, отрасль и теги компании.";

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <Layout>
      <section className="form-section">
        <div className="container dashboard-main-only">
          <div className="dashboard-toggle card">
            <div className="card-actions">
              <h1>Кабинет компании</h1>
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
                <Link to="/create/order" className="button button-secondary">
                  Создание объявления
                </Link>
              </div>
            </div>
          </div>

          {error ? <div className="error-banner">{error}</div> : null}
          {status ? <div className="success-banner">{status}</div> : null}

          <div className="card manage-card">
            <div className="manage-header">
              <h2>{user.role === "admin" ? "Все объявления" : "Мои объявления"}</h2>
              {user.role === "admin" ? (
                <div className="admin-search-wrap">
                  <input
                    name="adminOrderSearch"
                    className="admin-search-input"
                    value={adminSearch}
                    onFocus={() => setAdminSearchFocused(true)}
                    onBlur={() => setAdminSearchFocused(false)}
                    onChange={(event) => setAdminSearch(event.target.value)}
                    placeholder="Поиск по компании или названию"
                  />
                  {adminSearchFocused && adminSuggestions.length ? (
                    <div className="field-suggestions compact-suggestions">
                      {adminSuggestions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="search-suggestion"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => setAdminSearch(item)}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="manage-list">
              {editableOrders.map((item) => (
                <article key={item.id} className="manage-item">
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.company} · {item.city} · {item.budget}</p>
                    <p className="muted">Уникальные просмотры: {item.viewsCount || 0}</p>
                  </div>
                  <div className="manage-actions">
                    <Link to={`/create/order?edit=${encodeURIComponent(item.id)}`} className="button button-secondary">
                      Изменить
                    </Link>
                    <button type="button" className="button button-ghost" onClick={() => removeOrder(item.id)}>
                      Удалить
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {profileModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeProfileModal}>
          <div className="modal-card card" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 id="profile-modal-title">{profileModalTitle}</h2>
                <p>{profileModalSubtitle}</p>
              </div>
              <button type="button" className="button button-secondary modal-close" onClick={closeProfileModal}>×</button>
            </div>

            {profileStep === "view" ? (
              <div className="modal-form-grid">
                <div className="profile-data-grid">
                  <div className="profile-avatar-row profile-data-item profile-data-item-wide">
                    <span>Аватар компании</span>
                    <div className="avatar-editor-preview avatar-frame" style={getAvatarStyle(profileForm)}>
                      {profileForm.avatarUrl ? null : getInitials(profileForm.companyName || user.company)}
                    </div>
                  </div>
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
                <div className="modal-actions modal-actions-stack">
                  <button type="button" className="button button-secondary" onClick={closeProfileModal}>{"Закрыть"}</button>
                  <button type="button" className="button button-secondary" onClick={startPasswordChange}>{"Сменить пароль"}</button>
                  <button type="button" className="button button-danger" onClick={startCompanyDelete}>{"Удалить компанию"}</button>
                  <button type="button" className="button button-primary" onClick={startProfileEdit}>{"Изменить"}</button>
                </div>
              </div>
            ) : null}

            {profileStep === "verify" ? (
              <form onSubmit={verifyProfilePassword} className="modal-form-grid">
                <label className="field">
                  <span>Пароль</span>
                  <input name="profilePassword" type="password" value={profilePassword} onChange={(event) => setProfilePassword(event.target.value)} placeholder="Введите текущий пароль" />
                </label>
                {profileError ? <div className="error-banner">{profileError}</div> : null}
                <div className="modal-actions">
                  <button type="button" className="button button-secondary" onClick={closeProfileModal}>Отмена</button>
                  <button type="submit" className="button button-primary" disabled={profileLoading}>{profileLoading ? "Проверка..." : "Продолжить"}</button>
                </div>
              </form>
            ) : null}


            {profileStep === "password" ? (
              <form onSubmit={changePassword} className="modal-form-grid">
                <label className="field"><span>{"Текущий пароль"}</span><input name="currentPassword" type="password" value={passwordForm.currentPassword} onChange={(event) => updatePasswordField("currentPassword", event.target.value)} placeholder="Введите текущий пароль" /></label>
                <label className="field"><span>{"Новый пароль"}</span><input name="nextPassword" type="password" value={passwordForm.nextPassword} onChange={(event) => updatePasswordField("nextPassword", event.target.value)} placeholder="Минимум 6 символов" /></label>
                <label className="field"><span>{"Повторите новый пароль"}</span><input name="confirmNextPassword" type="password" value={passwordForm.confirmPassword} onChange={(event) => updatePasswordField("confirmPassword", event.target.value)} placeholder="Повторите пароль" /></label>
                {profileError ? <div className="error-banner">{profileError}</div> : null}
                <div className="modal-actions">
                  <button type="button" className="button button-secondary" onClick={() => setProfileStep("view")}>{"Назад"}</button>
                  <button type="submit" className="button button-primary" disabled={profileLoading}>{profileLoading ? "Сохранение..." : "Сменить пароль"}</button>
                </div>
              </form>
            ) : null}

            {profileStep === "delete" ? (
              <form onSubmit={deleteCompany} className="modal-form-grid">
                <div className="danger-panel">
                  <strong>{"Удаление нельзя будет отменить."}</strong>
                  <p>{"Исчезнут данные компании, её объявления и чаты. Для подтверждения введите пароль."}</p>
                </div>
                <label className="field"><span>{"Пароль"}</span><input name="deleteCompanyPassword" type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} placeholder="Введите текущий пароль" /></label>
                {profileError ? <div className="error-banner">{profileError}</div> : null}
                <div className="modal-actions">
                  <button type="button" className="button button-secondary" onClick={() => setProfileStep("view")}>{"Назад"}</button>
                  <button type="submit" className="button button-danger" disabled={profileLoading}>{profileLoading ? "Удаление..." : "Удалить компанию"}</button>
                </div>
              </form>
            ) : null}

            {profileStep === "edit" ? (
              <form onSubmit={saveProfile} className="modal-form-grid">
                <div className="field field-wide avatar-editor-field">
                  <span>Аватар компании</span>
                  <div className="avatar-editor-panel">
                    <div className="avatar-editor-preview avatar-frame" style={getAvatarStyle(profileForm)}>
                      {profileForm.avatarUrl ? null : getInitials(profileForm.companyName || user.company)}
                    </div>
                    <div className="avatar-editor-controls">
                      <label className="button button-secondary avatar-upload-button" htmlFor="profileAvatarFile">Загрузить изображение</label>
                      <input id="profileAvatarFile" name="profileAvatarFile" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarFileChange} />
                      {profileForm.avatarUrl ? <button type="button" className="button button-ghost" onClick={() => setProfileForm((current) => ({ ...current, avatarUrl: "", avatarPositionX: 50, avatarPositionY: 50, avatarScale: 100 }))}>Удалить аватар</button> : null}
                    </div>
                  </div>
                  {profileForm.avatarUrl ? (
                    <div className="avatar-crop-grid">
                      <label className="field"><span>Сдвиг по горизонтали</span><input name="profileAvatarPositionX" type="range" min="0" max="100" value={profileForm.avatarPositionX} onChange={(event) => updateProfileField("avatarPositionX", Number(event.target.value))} /></label>
                      <label className="field"><span>Сдвиг по вертикали</span><input name="profileAvatarPositionY" type="range" min="0" max="100" value={profileForm.avatarPositionY} onChange={(event) => updateProfileField("avatarPositionY", Number(event.target.value))} /></label>
                      <label className="field"><span>Масштаб</span><input name="profileAvatarScale" type="range" min="100" max="220" value={profileForm.avatarScale} onChange={(event) => updateProfileField("avatarScale", Number(event.target.value))} /></label>
                    </div>
                  ) : null}
                </div>
                <label className="field"><span>Контактное имя</span><input name="profileDisplayName" value={profileForm.displayName} onChange={(event) => updateProfileField("displayName", event.target.value)} /></label>
                <label className="field"><span>Email</span><input name="profileEmail" value={profileForm.email} onChange={(event) => updateProfileField("email", event.target.value)} /></label>
                <label className="field"><span>Название компании</span><input name="profileCompanyName" value={profileForm.companyName} onChange={(event) => updateProfileField("companyName", event.target.value)} /></label>
                <label className="field"><span>Город</span><input name="profileCity" value={profileForm.city} onChange={(event) => updateProfileField("city", event.target.value)} /></label>
                <label className="field"><span>Телефон</span><input name="profilePhone" value={profileForm.phone} onChange={(event) => updateProfileField("phone", event.target.value)} placeholder="+7 (900) 000-00-00" /></label>
                <label className="field"><span>Отрасль</span><input name="profileIndustry" value={profileForm.industry} onChange={(event) => updateProfileField("industry", event.target.value)} placeholder="IT, строительство, производство" /></label>
                <label className="field field-wide"><span>Описание компании</span><textarea name="profileDescription" rows="4" value={profileForm.description} onChange={(event) => updateProfileField("description", event.target.value)} /></label>
                <label className="field field-wide"><span>О компании</span><textarea name="profileAbout" rows="5" value={profileForm.about} onChange={(event) => updateProfileField("about", event.target.value)} /></label>
                <label className="field field-wide"><span>Теги</span><input name="profileSpecializations" value={profileForm.specializations} onChange={(event) => updateProfileField("specializations", event.target.value)} placeholder="Оптовые поставки, HoReCa, Розница" /></label>
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


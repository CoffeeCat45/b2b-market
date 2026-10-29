import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import { RequiredFieldsNote, RequiredMark } from "../components/RequiredFields";
import VerificationBadge from "../components/VerificationBadge";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { parseDateValue } from "../lib/date";
import { getAvatarStyle, getInitials } from "../lib/avatar";
import { isCompanyProfileIncomplete } from "../lib/companyText";
import { canLookupInn, formatVerificationDate, getInnHint, getVerificationStatusLabel } from "../lib/verification";
import { useMarketplaceData } from "../hooks/useMarketplaceData";
import { LIMITS, validatePassword, validateProfilePayload } from "../../shared/validation.js";
import { VERIFICATION_LIMITS, isIndividualInn, validateCompanyLegalFields } from "../../shared/verification.js";

function CreatePage() {
  const { user, loading, updateUser } = useAuth();
  const { orders, companies, reload } = useMarketplaceData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
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
    inn: "",
    legalName: "",
    ogrn: "",
    legalAddress: "",
  });
  const [profileError, setProfileError] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", nextPassword: "", confirmPassword: "" });
  const [deletePassword, setDeletePassword] = useState("");
  const [initialAvatarUrl, setInitialAvatarUrl] = useState("");
  const [verificationData, setVerificationData] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [verificationSubmitting, setVerificationSubmitting] = useState(false);
  const [dadataLoading, setDadataLoading] = useState(false);
  const [dadataNotice, setDadataNotice] = useState("");
  const [dadataError, setDadataError] = useState("");
  const [adminVerifications, setAdminVerifications] = useState([]);
  const [adminVerificationsLoading, setAdminVerificationsLoading] = useState(false);
  const [adminVerificationsError, setAdminVerificationsError] = useState("");
  const [adminRejectingId, setAdminRejectingId] = useState("");
  const [adminRejectReason, setAdminRejectReason] = useState("");
  const [adminDecisionLoading, setAdminDecisionLoading] = useState("");

  // Старые chat query params перенаправляем в отдельный workspace чатов.
  const chatCompany = searchParams.get("chatCompany");
  const orderId = searchParams.get("orderId");
  if (chatCompany) {
    const next = orderId ? `/chats?chatCompany=${encodeURIComponent(chatCompany)}&orderId=${encodeURIComponent(orderId)}` : `/chats?chatCompany=${encodeURIComponent(chatCompany)}`;
    return <Navigate to={next} replace />;
  }

  const currentCompany = useMemo(() => companies.find((company) => company.id === user?.companyId) || null, [companies, user]);
  const profileCompanyData = currentCompany || user;

  const editableOrders = useMemo(() => {
    if (!user) return [];
    const source = user.role === "admin" ? orders : orders.filter((item) => item.companyId === user.companyId);
    const sorted = [...source].sort((a, b) => (
      (parseDateValue(b.publishedAt ?? b.date)?.getTime() || 0) - (parseDateValue(a.publishedAt ?? a.date)?.getTime() || 0)
    ));
    if (!adminSearch.trim()) return sorted;
    const q = adminSearch.toLowerCase();
    return sorted.filter((item) => `${item.title} ${item.company}`.toLowerCase().includes(q));
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

    if (file.size > LIMITS.files.avatarMaxBytes) {
      setProfileError(`Аватар слишком большой. Загрузите изображение до ${LIMITS.files.avatarMaxBytes / (1024 * 1024)} МБ.`);
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
      specializations: (
        Array.isArray(currentCompany?.specializations)
          ? currentCompany.specializations
          : Array.isArray(user?.specializations)
            ? user.specializations
            : []
      ).join(", "),
      avatarUrl: nextAvatarUrl,
      avatarPositionX: currentCompany?.avatarPositionX ?? user?.avatarPositionX ?? 50,
      avatarPositionY: currentCompany?.avatarPositionY ?? user?.avatarPositionY ?? 50,
      avatarScale: currentCompany?.avatarScale ?? user?.avatarScale ?? 100,
      inn: currentCompany?.inn ?? user?.inn ?? "",
      legalName: currentCompany?.legalName ?? user?.legalName ?? "",
      ogrn: currentCompany?.ogrn ?? user?.ogrn ?? "",
      legalAddress: currentCompany?.legalAddress ?? user?.legalAddress ?? "",
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
    setVerificationData(null);
    setVerificationError("");
    setVerificationSubmitting(false);
    setDadataLoading(false);
    setDadataNotice("");
    setDadataError("");
  };

  const startProfileEdit = () => {
    setProfileStep("verify");
    setProfilePassword("");
    setProfileError("");
  };

  // Переход «Заполнить описание» ведёт сюда, но пароль всё равно подтверждается штатным шагом.
  const profileEditHandledRef = useRef(false);

  useEffect(() => {
    if (searchParams.get("profile") !== "edit" || !user || profileEditHandledRef.current) return;
    profileEditHandledRef.current = true;
    openProfileModal();
    startProfileEdit();
  }, [searchParams, user]);

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

  const loadVerification = async () => {
    if (!user?.companyId) return;

    setVerificationLoading(true);
    setVerificationError("");

    try {
      const data = await apiFetch(`/companies/${user.companyId}/verification`, { retries: 1 });
      setVerificationData(data.verification);
    } catch (loadError) {
      setVerificationError(loadError.message);
    } finally {
      setVerificationLoading(false);
    }
  };

  const openVerificationStep = () => {
    setProfileStep("verification");
    setProfileError("");
    setVerificationData(null);
    setVerificationError("");
    setVerificationSubmitting(false);
    setDadataNotice("");
    setDadataError("");
    loadVerification();
  };

  const requestVerification = async () => {
    if (!user?.companyId) return;

    if (verificationData?.status === "approved" && !window.confirm("Отправить компанию на повторную проверку? Бейдж будет снят до решения.")) {
      return;
    }

    setVerificationSubmitting(true);
    setVerificationError("");

    try {
      const data = await apiFetch(`/companies/${user.companyId}/verification/request`, {
        method: "POST",
        body: JSON.stringify({}),
        retries: 0,
        timeoutMs: 8000,
      });
      setVerificationData(data.verification);
      updateUser((current) => (current ? {
        ...current,
        verificationStatus: data.verification.status,
        inn: data.verification.inn,
        legalName: data.verification.legalName,
        ogrn: data.verification.ogrn,
        legalAddress: data.verification.legalAddress,
      } : current));
      setStatus("Заявка на проверку отправлена.");
      reload().catch(() => {});
    } catch (requestError) {
      setVerificationError(requestError.message);
    } finally {
      setVerificationSubmitting(false);
    }
  };

  const checkDadata = async () => {
    const inn = profileForm.inn.replace(/\s+/g, "");

    if (!canLookupInn(inn)) {
      setDadataError(isIndividualInn(inn)
        ? "Для ИП автопроверка недоступна: заполните реквизиты вручную."
        : "Введите корректный 10-значный ИНН юрлица.");
      setDadataNotice("");
      return;
    }

    setDadataLoading(true);
    setDadataError("");
    setDadataNotice("");

    try {
      const data = await apiFetch("/dadata/party", {
        method: "POST",
        body: JSON.stringify({ inn }),
        retries: 0,
        timeoutMs: 12000,
      });

      if (!data.available) {
        const reasons = {
          not_configured: "Автопроверка недоступна: сервис не настроен. Заполните реквизиты вручную.",
          not_found: "ИНН не найден в ЕГРЮЛ. Проверьте номер или заполните реквизиты вручную.",
          rate_limited: "Сервис ЕГРЮЛ временно ограничил запросы. Попробуйте позже или заполните вручную.",
          timeout: "Сервис ЕГРЮЛ не ответил вовремя. Заполните реквизиты вручную.",
          individual: "Для ИП автопроверка недоступна: заполните реквизиты вручную.",
          error: "Сервис ЕГРЮЛ временно недоступен. Заполните реквизиты вручную.",
        };
        setDadataError(reasons[data.reason] || reasons.error);
        return;
      }

      const party = data.party || {};
      setProfileForm((current) => ({
        ...current,
        legalName: party.nameFull || party.nameShort || current.legalName,
        ogrn: party.ogrn || current.ogrn,
        legalAddress: party.legalAddress || current.legalAddress,
      }));
      setDadataNotice(`Реквизиты найдены: ${party.nameShort || party.nameFull || "организация"}. Проверьте данные перед сохранением.`);
    } catch (lookupError) {
      setDadataError(lookupError.message);
    } finally {
      setDadataLoading(false);
    }
  };

  const loadAdminVerifications = async () => {
    if (user?.role !== "admin") return;

    setAdminVerificationsLoading(true);
    setAdminVerificationsError("");

    try {
      const data = await apiFetch("/admin/verifications?status=pending", { retries: 1 });
      setAdminVerifications(Array.isArray(data.items) ? data.items : []);
    } catch (loadError) {
      setAdminVerificationsError(loadError.message);
    } finally {
      setAdminVerificationsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") loadAdminVerifications();
  }, [user?.role]);

  const decideVerification = async (companyId, decision) => {
    if (decision === "rejected" && adminRejectReason.trim().length < VERIFICATION_LIMITS.reasonMin) {
      setAdminVerificationsError(`Укажите причину отклонения: минимум ${VERIFICATION_LIMITS.reasonMin} символа.`);
      return;
    }

    setAdminDecisionLoading(companyId);
    setAdminVerificationsError("");

    try {
      await apiFetch(`/admin/companies/${companyId}/verification`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          reason: decision === "rejected" ? adminRejectReason.trim() : "",
        }),
        retries: 0,
      });
      setStatus(decision === "approved" ? "Компания подтверждена." : "Заявка отклонена.");
      setAdminRejectingId("");
      setAdminRejectReason("");
      await loadAdminVerifications();
      reload().catch(() => {});
    } catch (decisionError) {
      setAdminVerificationsError(decisionError.message);
    } finally {
      setAdminDecisionLoading("");
    }
  };

  const updatePasswordField = (field, value) => setPasswordForm((current) => ({ ...current, [field]: value }));

  const verifyProfilePassword = async (event) => {
    event.preventDefault();
    setProfileError("");

    if (!profilePassword.trim()) {
      setProfileError("Введите пароль от текущего аккаунта.");
      return;
    }

    setProfileLoading(true);

    try {
      await apiFetch("/auth/verify-password", {
        method: "POST",
        body: JSON.stringify({ password: profilePassword }),
      });
      setProfileStep("edit");
    } catch (verifyError) {
      setProfileError(verifyError.fields?.password || verifyError.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileError("");

    const avatarChanged = profileForm.avatarUrl !== initialAvatarUrl;
    const legalFields = {
      inn: profileForm.inn,
      legalName: profileForm.legalName,
      ogrn: profileForm.ogrn,
      legalAddress: profileForm.legalAddress,
    };
    const payload = {
      currentPassword: profilePassword,
      displayName: profileForm.displayName.trim(),
      email: profileForm.email.trim(),
      companyName: profileForm.companyName.trim(),
      city: profileForm.city.trim(),
      phone: profileForm.phone.trim(),
      industry: profileForm.industry.trim(),
      description: profileForm.description.trim(),
      about: profileForm.about.trim(),
      specializations: profileForm.specializations,
      avatarPositionX: profileForm.avatarPositionX,
      avatarPositionY: profileForm.avatarPositionY,
      avatarScale: profileForm.avatarScale,
      inn: legalFields.inn,
      legalName: legalFields.legalName,
      ogrn: legalFields.ogrn,
      legalAddress: legalFields.legalAddress,
      ...(avatarChanged ? { avatarUrl: profileForm.avatarUrl } : {}),
    };
    const validation = validateProfilePayload(payload, { requireCompanyFields: Boolean(user.companyId) });

    if (!validation.ok) {
      setProfileError(validation.message);
      return;
    }

    if (user.companyId) {
      const legalValidation = validateCompanyLegalFields(legalFields);

      if (!legalValidation.ok) {
        setProfileError(legalValidation.message);
        return;
      }

      payload.inn = legalValidation.value.inn;
      payload.legalName = legalValidation.value.legalName;
      payload.ogrn = legalValidation.value.ogrn;
      payload.legalAddress = legalValidation.value.legalAddress;
    }

    setProfileLoading(true);

    try {
      const data = await apiFetch("/auth/profile", {
        method: "PUT",
        body: JSON.stringify(payload),
        retries: 2,
        timeoutMs: 8000,
      });
      updateUser(data.user);
      setStatus("Данные компании обновлены.");
      closeProfileModal();
      reload().catch(() => {});
    } catch (saveError) {
      setProfileError(saveError.fields?.currentPassword || saveError.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setProfileError("");

    const validation = validatePassword(passwordForm.nextPassword, { field: "nextPassword", label: "Новый пароль" });

    if (!validation.ok) {
      setProfileError(validation.error);
      return;
    }

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
    if (!window.confirm("Удалить объявление? Действие нельзя отменить.")) return;

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
          : profileStep === "verification"
            ? "Проверка компании"
            : "Изменение данных";
  const profileModalSubtitle = profileStep === "view"
    ? "Здесь можно посмотреть текущие данные аккаунта."
    : profileStep === "verify"
      ? "Перед изменением данных подтвердите пароль от аккаунта."
      : profileStep === "password"
        ? "Введите текущий пароль и новый пароль."
        : profileStep === "delete"
          ? "Это действие удалит компанию, её объявления, чаты и сессии."
          : profileStep === "verification"
            ? "Отправьте реквизиты на проверку: после подтверждения в профиле появится бейдж."
            : "Измените контакты, описание, отрасль, теги и реквизиты компании.";

  if (loading) return null;
  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

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
                    <p className="muted">Просмотры: {item.viewsCount || 0}</p>
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

          {user.role === "admin" ? (
            <div className="card manage-card admin-verifications">
              <div className="manage-header">
                <h2>Заявки на проверку</h2>
                <button type="button" className="button button-secondary" onClick={loadAdminVerifications} disabled={adminVerificationsLoading}>
                  {adminVerificationsLoading ? "Обновление..." : "Обновить"}
                </button>
              </div>
              {adminVerificationsError ? <div className="error-banner">{adminVerificationsError}</div> : null}
              {!adminVerificationsLoading && !adminVerifications.length && !adminVerificationsError ? (
                <p className="muted admin-verifications-empty">Новых заявок нет.</p>
              ) : null}
              <div className="manage-list">
                {adminVerifications.map((item) => (
                  <article key={item.companyId} className="manage-item admin-verification-item">
                    <div>
                      <strong>{item.companyName}</strong>
                      <p className="muted">ИНН: {item.inn || "не указан"} · ОГРН: {item.ogrn || "не указан"}</p>
                      <p>{item.legalName || "Наименование не указано"}</p>
                      <p className="muted">{item.legalAddress || "Адрес не указан"}</p>
                      <p className="muted">
                        {item.contactName || item.contactEmail ? `Контакт: ${item.contactName || item.contactEmail}${item.contactName && item.contactEmail ? ` · ${item.contactEmail}` : ""} · ` : ""}
                        Заявка: {formatVerificationDate(item.requestedAt) || "дата не указана"}
                      </p>
                    </div>
                    <div className="manage-actions">
                      <Link to={`/company/${item.companyId}`} className="button button-secondary">Профиль</Link>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => decideVerification(item.companyId, "approved")}
                        disabled={adminDecisionLoading === item.companyId}
                      >
                        {adminDecisionLoading === item.companyId ? "Сохранение..." : "Одобрить"}
                      </button>
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => {
                          setAdminRejectingId(item.companyId);
                          setAdminRejectReason("");
                        }}
                        disabled={adminDecisionLoading === item.companyId}
                      >
                        Отклонить
                      </button>
                    </div>
                    {adminRejectingId === item.companyId ? (
                      <div className="admin-reject-box">
                        <label className="field">
                          <span>Причина отклонения (видна только владельцу компании)</span>
                          <textarea
                            name="adminVerificationReason"
                            rows="2"
                            minLength={VERIFICATION_LIMITS.reasonMin}
                            maxLength={VERIFICATION_LIMITS.reasonMax}
                            value={adminRejectReason}
                            onChange={(event) => setAdminRejectReason(event.target.value)}
                            placeholder="Например: реквизиты не совпадают с данными ЕГРЮЛ"
                          />
                        </label>
                        <div className="modal-actions">
                          <button type="button" className="button button-secondary" onClick={() => setAdminRejectingId("")}>Отмена</button>
                          <button
                            type="button"
                            className="button button-danger"
                            onClick={() => decideVerification(item.companyId, "rejected")}
                            disabled={adminDecisionLoading === item.companyId}
                          >
                            Отклонить заявку
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}
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
                {isCompanyProfileIncomplete(profileCompanyData) ? (
                  <div className="profile-incomplete-banner">
                    <span>Профиль не заполнен: добавьте описание и раздел «О компании».</span>
                    <button type="button" className="button button-secondary" onClick={startProfileEdit}>
                      Заполнить
                    </button>
                  </div>
                ) : null}
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
                  <div className="profile-data-item">
                    <span>ИНН</span>
                    <strong>{profileForm.inn || "Не указан"}</strong>
                  </div>
                  <div className="profile-data-item">
                    <span>Статус проверки</span>
                    <strong className="verification-view-status">
                      {getVerificationStatusLabel(profileCompanyData?.verificationStatus)}
                    </strong>
                  </div>
                  <div className="profile-data-item profile-data-item-wide"><span>Описание компании</span><strong>{profileForm.description || "Не указано"}</strong></div>
                  <div className="profile-data-item profile-data-item-wide"><span>О компании</span><strong>{profileForm.about || "Не указано"}</strong></div>
                  <div className="profile-data-item profile-data-item-wide"><span>Теги</span><strong>{profileForm.specializations || "Не указано"}</strong></div>
                </div>
                <div className="modal-actions modal-actions-stack">
                  <button type="button" className="button button-secondary" onClick={closeProfileModal}>{"Закрыть"}</button>
                  <button type="button" className="button button-secondary" onClick={openVerificationStep}>{"Проверка компании"}</button>
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
                  <input name="profilePassword" type="password" required maxLength={LIMITS.auth.passwordMaxBytes} autoComplete="current-password" value={profilePassword} onChange={(event) => setProfilePassword(event.target.value)} placeholder="Введите текущий пароль" />
                </label>
                <p className="form-helper">Пароль будет проверен перед переходом к редактированию: {user?.email || "email не определён"}.</p>
                {profileError ? <div className="error-banner">{profileError}</div> : null}
                <div className="modal-actions">
                  <button type="button" className="button button-secondary" onClick={closeProfileModal}>Отмена</button>
                  <button type="submit" className="button button-primary" disabled={profileLoading}>{profileLoading ? "Проверка..." : "Продолжить"}</button>
                </div>
              </form>
            ) : null}


            {profileStep === "verification" ? (
              <div className="modal-form-grid">
                {verificationLoading ? <p className="form-helper">Загружаем статус проверки…</p> : null}
                {verificationError ? <div className="error-banner">{verificationError}</div> : null}

                {!verificationLoading && verificationData ? (
                  <>
                    <div className={`verification-status-panel verification-status-${verificationData.status}`}>
                      <div className="verification-status-head">
                        <strong>{getVerificationStatusLabel(verificationData.status)}</strong>
                        {verificationData.status === "approved" ? (
                          <VerificationBadge status={verificationData.status} reviewedAt={verificationData.reviewedAt} />
                        ) : null}
                      </div>
                      {verificationData.status === "none" ? (
                        <p>Реквизиты ещё не отправлены на проверку. Мы сверим ИНН и наименование с данными ЕГРЮЛ.</p>
                      ) : null}
                      {verificationData.status === "pending" ? (
                        <p>
                          Заявка отправлена{verificationData.requestedAt ? ` ${formatVerificationDate(verificationData.requestedAt)}` : ""}. Проверка обычно занимает до одного рабочего дня.
                        </p>
                      ) : null}
                      {verificationData.status === "approved" ? (
                        <p>
                          Компания подтверждена{verificationData.reviewedAt ? ` ${formatVerificationDate(verificationData.reviewedAt)}` : ""}. Бейдж виден в профиле и объявлениях.
                        </p>
                      ) : null}
                      {verificationData.status === "rejected" ? (
                        <p>
                          Проверка отклонена{verificationData.reviewedAt ? ` ${formatVerificationDate(verificationData.reviewedAt)}` : ""}.{verificationData.reason ? ` Причина: ${verificationData.reason}` : ""}
                        </p>
                      ) : null}
                    </div>

                    <div className="profile-data-grid">
                      <div className="profile-data-item"><span>ИНН</span><strong>{verificationData.inn || "Не указан"}</strong></div>
                      <div className="profile-data-item"><span>Полное наименование</span><strong>{verificationData.legalName || "Не указано"}</strong></div>
                      <div className="profile-data-item"><span>ОГРН / ОГРНИП</span><strong>{verificationData.ogrn || "Не указан"}</strong></div>
                      <div className="profile-data-item"><span>Юридический адрес</span><strong>{verificationData.legalAddress || "Не указан"}</strong></div>
                    </div>

                    {!verificationData.inn && verificationData.status !== "pending" ? (
                      <p className="form-helper">Сначала заполните ИНН и реквизиты в разделе «Изменение данных».</p>
                    ) : null}
                  </>
                ) : null}

                <div className="modal-actions">
                  <button type="button" className="button button-secondary" onClick={() => setProfileStep("view")}>Назад</button>
                  <button type="button" className="button button-secondary" onClick={startProfileEdit}>
                    {verificationData?.inn ? "Изменить реквизиты" : "Добавить ИНН в профиле"}
                  </button>
                  {verificationData && verificationData.status !== "pending" ? (
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={requestVerification}
                      disabled={verificationSubmitting || !verificationData.inn}
                    >
                      {verificationSubmitting
                        ? "Отправка..."
                        : verificationData.status === "approved"
                          ? "Пройти проверку заново"
                          : verificationData.status === "rejected"
                            ? "Отправить повторно"
                            : "Отправить на проверку"}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}


            {profileStep === "password" ? (
              <form onSubmit={changePassword} className="modal-form-grid">
                <label className="field"><span>{"Текущий пароль"}</span><input name="currentPassword" type="password" required maxLength={LIMITS.auth.passwordMaxBytes} autoComplete="current-password" value={passwordForm.currentPassword} onChange={(event) => updatePasswordField("currentPassword", event.target.value)} placeholder="Введите текущий пароль" /></label>
                <label className="field"><span>{"Новый пароль"}</span><input name="nextPassword" type="password" required minLength={LIMITS.auth.passwordMinBytes} maxLength={LIMITS.auth.passwordMaxBytes} autoComplete="new-password" value={passwordForm.nextPassword} onChange={(event) => updatePasswordField("nextPassword", event.target.value)} placeholder={`Минимум ${LIMITS.auth.passwordMinBytes} символов`} /></label>
                <label className="field"><span>{"Повторите новый пароль"}</span><input name="confirmNextPassword" type="password" required minLength={LIMITS.auth.passwordMinBytes} maxLength={LIMITS.auth.passwordMaxBytes} autoComplete="new-password" value={passwordForm.confirmPassword} onChange={(event) => updatePasswordField("confirmPassword", event.target.value)} placeholder="Повторите пароль" /></label>
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
                <label className="field"><span>{"Пароль"}</span><input name="deleteCompanyPassword" type="password" required maxLength={LIMITS.auth.passwordMaxBytes} autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} placeholder="Введите текущий пароль" /></label>
                {profileError ? <div className="error-banner">{profileError}</div> : null}
                <div className="modal-actions">
                  <button type="button" className="button button-secondary" onClick={() => setProfileStep("view")}>{"Назад"}</button>
                  <button type="submit" className="button button-danger" disabled={profileLoading}>{profileLoading ? "Удаление..." : "Удалить компанию"}</button>
                </div>
              </form>
            ) : null}

            {profileStep === "edit" ? (
              <form onSubmit={saveProfile} className="modal-form-grid" noValidate>
                <RequiredFieldsNote />
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
                <label className="field"><span>Контактное имя<RequiredMark /></span><input name="profileDisplayName" required aria-required="true" maxLength={LIMITS.profile.displayNameMax} autoComplete="name" autoCapitalize="words" spellCheck={false} lang="ru" value={profileForm.displayName} onChange={(event) => updateProfileField("displayName", event.target.value)} /></label>
                <label className="field"><span>Email<RequiredMark /></span><input name="profileEmail" type="email" required aria-required="true" maxLength={LIMITS.auth.emailMax} autoComplete="email" value={profileForm.email} onChange={(event) => updateProfileField("email", event.target.value)} /></label>
                <label className="field"><span>Название компании<RequiredMark /></span><input name="profileCompanyName" required aria-required="true" maxLength={LIMITS.profile.companyNameMax} autoComplete="organization" value={profileForm.companyName} onChange={(event) => updateProfileField("companyName", event.target.value)} /></label>
                <label className="field"><span>Город<RequiredMark /></span><input name="profileCity" required aria-required="true" maxLength={LIMITS.profile.cityMax} autoComplete="address-level2" value={profileForm.city} onChange={(event) => updateProfileField("city", event.target.value)} /></label>
                <label className="field"><span>Телефон</span><input name="profilePhone" type="tel" maxLength={LIMITS.profile.phoneMax} autoComplete="tel" value={profileForm.phone} onChange={(event) => updateProfileField("phone", event.target.value)} placeholder="+7 (900) 000-00-00" /></label>
                <label className="field"><span>Отрасль<RequiredMark /></span><input name="profileIndustry" required aria-required="true" maxLength={LIMITS.profile.industryMax} value={profileForm.industry} onChange={(event) => updateProfileField("industry", event.target.value)} placeholder="IT, строительство, производство" /></label>
                <label className="field field-wide"><span>Описание компании<RequiredMark /></span><textarea name="profileDescription" rows="4" required aria-required="true" minLength={LIMITS.profile.descriptionMin} maxLength={LIMITS.profile.descriptionMax} value={profileForm.description} onChange={(event) => updateProfileField("description", event.target.value)} /></label>
                <label className="field field-wide"><span>О компании<RequiredMark /></span><textarea name="profileAbout" rows="5" required aria-required="true" minLength={LIMITS.profile.aboutMin} maxLength={LIMITS.profile.aboutMax} value={profileForm.about} onChange={(event) => updateProfileField("about", event.target.value)} /></label>
                <label className="field field-wide"><span>Теги</span><input name="profileSpecializations" maxLength={LIMITS.profile.specializationsMax * (LIMITS.profile.specializationMax + 2)} value={profileForm.specializations} onChange={(event) => updateProfileField("specializations", event.target.value)} placeholder="Оптовые поставки, HoReCa, Розница" /></label>
                <div className="profile-legal-block field-wide">
                  <div className="profile-legal-head">
                    <strong>Реквизиты</strong>
                    <span className="form-helper">Необязательно. ИНН виден в профиле компании и нужен для проверки.</span>
                  </div>
                  <div className="profile-legal-grid">
                    <label className="field">
                      <span>ИНН</span>
                      <div className="dadata-row">
                        <input name="profileInn" inputMode="numeric" maxLength={12} value={profileForm.inn} onChange={(event) => updateProfileField("inn", event.target.value.replace(/\D+/g, ""))} placeholder="10 или 12 цифр" />
                        <button type="button" className="button button-secondary" onClick={checkDadata} disabled={dadataLoading || !canLookupInn(profileForm.inn)}>
                          {dadataLoading ? "Проверка..." : "Проверить по ЕГРЮЛ"}
                        </button>
                      </div>
                      {getInnHint(profileForm.inn) ? <span className="form-helper">{getInnHint(profileForm.inn)}</span> : null}
                    </label>
                    <label className="field">
                      <span>Полное наименование</span>
                      <input name="profileLegalName" maxLength={VERIFICATION_LIMITS.legalNameMax} value={profileForm.legalName} onChange={(event) => updateProfileField("legalName", event.target.value)} placeholder="ООО «Название»" />
                      {isIndividualInn(profileForm.inn) ? <span className="form-helper">Для ИП укажите ФИО полностью.</span> : null}
                    </label>
                    <label className="field">
                      <span>ОГРН / ОГРНИП</span>
                      <input name="profileOgrn" inputMode="numeric" maxLength={15} value={profileForm.ogrn} onChange={(event) => updateProfileField("ogrn", event.target.value.replace(/\D+/g, ""))} placeholder="13 или 15 цифр" />
                    </label>
                    <label className="field">
                      <span>Юридический адрес</span>
                      <input name="profileLegalAddress" maxLength={VERIFICATION_LIMITS.legalAddressMax} value={profileForm.legalAddress} onChange={(event) => updateProfileField("legalAddress", event.target.value)} placeholder="Город, улица, дом" />
                    </label>
                  </div>
                  {["approved", "pending"].includes(profileCompanyData?.verificationStatus) ? (
                    <p className="form-helper">Изменение реквизитов сбросит текущий статус проверки — потребуется повторная проверка.</p>
                  ) : null}
                  {isIndividualInn(profileForm.inn) ? (
                    <p className="form-helper">Демо: для ИП используйте только тестовые синтетические данные — реальные ФИО и адреса не добавляйте.</p>
                  ) : null}
                  {dadataNotice ? <div className="success-banner">{dadataNotice}</div> : null}
                  {dadataError ? <div className="error-banner">{dadataError}</div> : null}
                </div>
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


import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import Tabs from "../components/Tabs";
import ListingCard from "../components/ListingCard";
import AsyncState from "../components/AsyncState";
import VerificationBadge from "../components/VerificationBadge";
import VerificationWarning from "../components/VerificationWarning";
import { useAuth } from "../context/AuthContext";
import { useMarketplaceData } from "../hooks/useMarketplaceData";
import { apiFetch } from "../lib/api";
import { getAvatarStyle, getInitials } from "../lib/avatar";
import {
  getCompanyAbout,
  getCompanyDescription,
  hasCompanyAbout,
  hasCompanyDescription,
  isCompanyProfileIncomplete,
} from "../lib/companyText";
import { LIMITS } from "../../shared/validation.js";

function formatReviewDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function renderStars(rating) {
  const normalized = Number(rating) || 0;
  const fullStars = Math.max(0, Math.min(5, Math.round(normalized)));
  return `${"★".repeat(fullStars)}${"☆".repeat(5 - fullStars)}`;
}

function CompanyPage() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState("about");
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewStatus, setReviewStatus] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const { user } = useAuth();
  const { companies, orders, loading, error, reload } = useMarketplaceData();
  const company = companies.find((entry) => entry.id === id);
  const companyOrders = useMemo(() => orders.filter((item) => item.companyId === id), [orders, id]);
  const contactPath = `/chats?chatCompany=${encodeURIComponent(id)}`;
  const contactHref = user ? contactPath : `/login?next=${encodeURIComponent(contactPath)}`;
  const isOwnCompany = Boolean(user?.companyId && user.companyId === id);
  const canContact = Boolean(user?.companyId && !isOwnCompany);
  const canLeaveReview = Boolean(user?.companyId) && user.companyId !== id;
  const reviews = Array.isArray(company?.reviews) ? company.reviews : [];
  const specializations = Array.isArray(company?.specializations) ? company.specializations : [];
  const canViewCompanyData = Boolean(user);

  const submitReview = async (event) => {
    event.preventDefault();
    if (!canLeaveReview || !company) return;

    const normalized = reviewText.trim();
    if (!normalized) {
      setReviewError("Введите текст отзыва.");
      setReviewStatus("");
      return;
    }

    if (normalized.length > LIMITS.review.textMax) {
      setReviewError(`Текст отзыва должен быть не длиннее ${LIMITS.review.textMax} символов.`);
      setReviewStatus("");
      return;
    }

    try {
      setSubmittingReview(true);
      setReviewError("");
      setReviewStatus("");
      const data = await apiFetch(`/companies/${company.id}/reviews`, {
        method: "POST",
        body: JSON.stringify({ text: normalized, rating: reviewRating }),
      });
      setReviewText("");
      setReviewRating(5);
      setReviewStatus(data.updated ? "Отзыв обновлён." : "Отзыв опубликован.");
      await reload();
    } catch (error) {
      setReviewError(error.message);
      setReviewStatus("");
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading || error) {
    return (
      <Layout>
        <section className="detail-section">
          <div className="container">
            <AsyncState loading={loading} error={error} onRetry={reload} loadingText="Загружаем профиль компании…" />
          </div>
        </section>
      </Layout>
    );
  }

  if (!company) {
    return (
      <Layout>
        <section className="detail-section">
          <div className="container">
            <div className="empty-state card">
              <h1>Профиль компании не найден</h1>
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="company-section">
        <div className="container">
          <article className="company-hero card" id="contacts">
            <div className="company-hero-mark avatar-frame" style={getAvatarStyle(company)}>
              {company.avatarUrl ? null : getInitials(company.name)}
            </div>
            <div className="company-hero-body">
              <span className="pill">{company.industry}</span>
              <div className="company-title-row">
                <h1>{company.name}</h1>
                <VerificationBadge status={company.verificationStatus} reviewedAt={company.verificationReviewedAt} />
              </div>
              <div className="detail-meta">
                <span>{company.city}</span>
                {company.createdAt ? <span>На платформе с {company.createdAt}</span> : null}
                <span>{Number(company.rating) > 0 ? `★ ${company.rating}` : "Нет отзывов"}</span>
                <span>{specializations.join(" · ")}</span>
              </div>
              <p className={hasCompanyDescription(company) ? undefined : "muted"}>{getCompanyDescription(company)}</p>
              <VerificationWarning status={company.verificationStatus} variant="full" />
              {isOwnCompany && isCompanyProfileIncomplete(company) ? (
                <Link to="/create?profile=edit" className="inline-cta">Заполнить описание</Link>
              ) : null}
            </div>
            <div className="company-hero-actions">
              {canContact || !user ? (
                <Link to={contactHref} className="button button-primary button-block">
                  Написать
                </Link>
              ) : (
                <span className="muted">
                  {isOwnCompany ? "Это профиль вашей компании." : "Чат доступен только аккаунтам компаний."}
                </span>
              )}
            </div>
          </article>
          <Tabs
            items={[
              { key: "about", label: "О компании" },
              { key: "listings", label: "Объявления" },
              { key: "reviews", label: "Отзывы" },
              { key: "data", label: "Данные" },
            ]}
            activeKey={activeTab}
            onChange={setActiveTab}
          />
          {activeTab === "about" ? (
            <section className="tab-panel card">
              <h2>О компании</h2>
              <p className={hasCompanyAbout(company) ? undefined : "muted"}>{getCompanyAbout(company)}</p>
              {isOwnCompany && isCompanyProfileIncomplete(company) ? (
                <Link to="/create?profile=edit" className="inline-cta">Заполнить описание</Link>
              ) : null}
            </section>
          ) : null}
          {activeTab === "listings" ? (
            <section className="tab-panel">
              {companyOrders.length ? (
                <div className="cards-grid">
                  {companyOrders.map((item) => (
                    <ListingCard key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <div className="empty-state card">
                  <p>У компании пока нет объявлений.</p>
                </div>
              )}
            </section>
          ) : null}
          {activeTab === "reviews" ? (
            <section className="tab-panel card">
              <h2>Отзывы</h2>
              {canLeaveReview ? (
                <form className="review-form" onSubmit={submitReview}>
                  <div className="field">
                    <span>Оценка</span>
                    <div className="review-rating-picker" role="radiogroup" aria-label="Оценка компании">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={value <= reviewRating ? "review-star-button active" : "review-star-button"}
                          onClick={() => setReviewRating(value)}
                          disabled={submittingReview}
                          aria-label={`Поставить ${value} ${value === 1 ? "звезду" : value < 5 ? "звезды" : "звёзд"}`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <span>Оставить отзыв</span>
                    <textarea
                      name="reviewText"
                      rows="5"
                      maxLength={LIMITS.review.textMax}
                      value={reviewText}
                      onChange={(event) => setReviewText(event.target.value)}
                      placeholder="Опишите впечатления от сотрудничества, коммуникации и результата."
                      disabled={submittingReview}
                    />
                    <span className="field-hint">{reviewText.length}/{LIMITS.review.textMax}</span>
                  </div>
                  {reviewError ? <div className="error-banner">{reviewError}</div> : null}
                  {reviewStatus ? <div className="success-banner">{reviewStatus}</div> : null}
                  <button type="submit" className="button button-primary" disabled={submittingReview}>
                    {submittingReview ? "Публикуем..." : "Оставить отзыв"}
                  </button>
                </form>
              ) : null}
              {!user ? <p className="review-note">Войдите в аккаунт компании, чтобы оставить отзыв.</p> : null}
              {user?.companyId === id ? <p className="review-note">О своей компании отзыв оставить нельзя.</p> : null}
              <div className="review-list">
                {reviews.length ? reviews.map((review) => (
                  <article key={review.id} className="review-card">
                    <div className="review-header">
                      {review.authorCompanyId ? (
                        <Link to={`/company/${review.authorCompanyId}`} className="review-author-link">
                          {review.authorCompanyName || review.author}
                        </Link>
                      ) : (
                        <strong>{review.author}</strong>
                      )}
                      {review.createdAt ? <span className="review-date">{formatReviewDate(review.createdAt)}</span> : null}
                    </div>
                    <div className="review-rating-line">
                      <span className="review-stars">{renderStars(review.rating)}</span>
                      <span className="review-rating-value">{Number(review.rating || 0).toFixed(1)}</span>
                    </div>
                    {review.author && review.authorCompanyName && review.author !== review.authorCompanyName ? <p className="review-subtitle">Контакт: {review.author}</p> : null}
                    <p>{review.text}</p>
                  </article>
                )) : <p className="review-note">Пока нет отзывов.</p>}
              </div>
            </section>
          ) : null}
          {activeTab === "data" ? (
            <section className="tab-panel card">
              <h2>Данные компании</h2>
              {canViewCompanyData ? (
                <div className="info-grid company-data-grid">
                  <div>
                    <span>ИНН</span>
                    <strong>{company.inn || "Не указано"}</strong>
                  </div>
                  <div>
                    <span>Контактное лицо</span>
                    <strong>{company.contactName || "Не указано"}</strong>
                  </div>
                  <div>
                    <span>Email</span>
                    <strong>{company.contactEmail || "Не указано"}</strong>
                  </div>
                  <div>
                    <span>Телефон</span>
                    <strong>{company.phone || "Не указано"}</strong>
                  </div>
                  <div>
                    <span>Город</span>
                    <strong>{company.city}</strong>
                  </div>
                  <div>
                    <span>Дата регистрации</span>
                    <strong>{company.createdAt || "Не указано"}</strong>
                  </div>
                  <div>
                    <span>Отрасль</span>
                    <strong>{company.industry}</strong>
                  </div>
                  <div className="company-data-wide">
                    <span>Теги</span>
                    <strong>{specializations.join(" · ") || "Не указано"}</strong>
                  </div>
                  <div className="company-data-wide">
                    <span>Описание компании</span>
                    <strong>{getCompanyDescription(company)}</strong>
                  </div>
                  <div className="company-data-wide">
                    <span>О компании</span>
                    <strong>{getCompanyAbout(company)}</strong>
                  </div>
                </div>
              ) : (
                <p className="review-note">Войдите в аккаунт компании, чтобы посмотреть контакты и полные данные.</p>
              )}
            </section>
          ) : null}
        </div>
      </section>
    </Layout>
  );
}

export default CompanyPage;

import { formatVerificationDate } from "../lib/verification";

function VerificationBadge({ status, reviewedAt }) {
  if (status !== "approved") return null;

  const date = formatVerificationDate(reviewedAt);
  const title = date ? `Компания проверена ${date}` : "Компания проверена";

  return (
    <span className="verification-badge" title={title} aria-label={title}>
      <span className="verification-badge-icon" aria-hidden="true">✓</span>
      Проверена
    </span>
  );
}

export default VerificationBadge;

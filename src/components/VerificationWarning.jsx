const COMPACT_TEXT = {
  none: "Компания не проверена — проверьте реквизиты и договор.",
  pending: "Проверка компании ещё не завершена — проверьте реквизиты и договор.",
  rejected: "Компания не прошла проверку — проверьте реквизиты и договор.",
};

const FULL_TEXT = {
  none: "Компания не проверена. Сделка может нести повышенные риски: проверьте реквизиты и договор перед оплатой.",
  pending: "Проверка компании ещё не завершена. Сделка может нести повышенные риски: проверьте реквизиты и договор перед оплатой.",
  rejected: "Компания не прошла проверку. Сделка может нести повышенные риски: проверьте реквизиты и договор перед оплатой.",
};

function VerificationWarning({ status, variant = "compact" }) {
  if (!status || status === "approved") return null;

  const source = variant === "full" ? FULL_TEXT : COMPACT_TEXT;
  const text = source[status] || source.none;

  return (
    <div className={`verification-warning verification-warning-${variant}`} role="note">
      <span className="verification-warning-icon" aria-hidden="true">!</span>
      <span>{text}</span>
    </div>
  );
}

export default VerificationWarning;

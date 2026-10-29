import { useConnectionState } from "../lib/connection";

const MESSAGES = {
  waking: "База данных просыпается. Первый запуск после простоя может занять до минуты.",
  reconnecting: "Повторно подключаемся к серверу…",
  offline: "Нет соединения. Проверьте интернет.",
};

function ConnectionBanner() {
  const connectionState = useConnectionState();
  const message = MESSAGES[connectionState];

  if (!message) return null;

  return (
    <div className={`connection-banner connection-banner-${connectionState}`} role="status" aria-live="polite">
      <span className="connection-banner-dot" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export default ConnectionBanner;

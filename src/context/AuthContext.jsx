import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { CONNECTION_RESTORED_EVENT } from "../lib/connection";

const AuthContext = createContext(null);
const AUTH_USER_CACHE_KEY = "auth_user_cache";

function readCachedUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USER_CACHE_KEY) || "null");
  } catch {
    return null;
  }
}

function writeCachedUser(nextUser) {
  if (nextUser) {
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(nextUser));
  } else {
    localStorage.removeItem(AUTH_USER_CACHE_KEY);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const unresolvedSessionRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      writeCachedUser(null);
      if (location.pathname === "/login") return;
      const next = `${location.pathname}${location.search}`;
      navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
    };

    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, [location.pathname, location.search, navigate]);

  // Если сессию не удалось подтвердить при холодном старте, повторяем запрос после восстановления связи.
  useEffect(() => {
    const handleRestored = () => {
      if (unresolvedSessionRef.current) {
        setRestoreAttempt((attempt) => attempt + 1);
      }
    };

    window.addEventListener(CONNECTION_RESTORED_EVENT, handleRestored);
    return () => window.removeEventListener(CONNECTION_RESTORED_EVENT, handleRestored);
  }, []);

  // Восстанавливаем активную сессию при старте приложения, чтобы protected-маршруты рендерились предсказуемо.
  useEffect(() => {
    const token = localStorage.getItem("auth_token");

    if (!token) {
      unresolvedSessionRef.current = false;
      setLoading(false);
      return;
    }

    const cachedUser = readCachedUser();
    let cancelled = false;

    setLoading(true);

    apiFetch("/auth/me", { timeoutMs: 8000, retryOnDbWaking: false, retries: 1 })
      .then((data) => {
        if (cancelled) return;
        unresolvedSessionRef.current = false;
        setUser(data.user);
        writeCachedUser(data.user);
        setLoading(false);
      })
      .catch((authError) => {
        if (cancelled) return;

        if (authError?.status === 401 || authError?.status === 403) {
          unresolvedSessionRef.current = false;
          localStorage.removeItem("auth_token");
          writeCachedUser(null);
          setUser(null);
          setLoading(false);
          return;
        }

        if (cachedUser) {
          unresolvedSessionRef.current = false;
          setUser(cachedUser);
          setLoading(false);
          return;
        }

        const transientFailure = !authError?.status || authError.status >= 500;

        if (!transientFailure) {
          setUser(null);
          setLoading(false);
          return;
        }

        // Нет кэша и нет связи: не разлогиниваем, ждём connection:restored и пробуем снова.
        unresolvedSessionRef.current = true;
        setUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, [restoreAttempt]);

  const login = async (email, password) => {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      retries: 2,
      body: JSON.stringify({ email, password }),
    });

    localStorage.setItem("auth_token", data.token);
    writeCachedUser(data.user);
    setUser(data.user);
    return data.user;
  };

  const register = async (payload) => {
    const data = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    localStorage.setItem("auth_token", data.token);
    writeCachedUser(data.user);
    setUser(data.user);
    return data.user;
  };

  // Даёт экранам профиля обновлять текущего пользователя локально после ответа бэкенда без лишнего auth/me.
  const updateUser = (nextUser) => {
    setUser((current) => {
      const resolvedUser = typeof nextUser === "function" ? nextUser(current) : nextUser;
      writeCachedUser(resolvedUser);
      return resolvedUser;
    });
  };

  const logout = async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
    } finally {
      localStorage.removeItem("auth_token");
      writeCachedUser(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, updateUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}


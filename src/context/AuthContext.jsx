import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

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

  // Восстанавливаем активную сессию при старте приложения, чтобы protected-маршруты рендерились предсказуемо.
  useEffect(() => {
    const token = localStorage.getItem("auth_token");

    if (!token) {
      setLoading(false);
      return;
    }

    const cachedUser = readCachedUser();

    apiFetch("/auth/me", { retries: 1 })
      .then((data) => {
        setUser(data.user);
        writeCachedUser(data.user);
      })
      .catch((authError) => {
        if (authError?.status === 401 || authError?.status === 403) {
          localStorage.removeItem("auth_token");
          writeCachedUser(null);
          setUser(null);
          return;
        }

        setUser(cachedUser);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      retries: 1,
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


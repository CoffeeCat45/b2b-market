import { useEffect, useState } from "react";
import { SEARCH_PREFERENCES_EVENT, getSearchPreferences } from "../lib/searchPreferences";

export function useSearchPreferences() {
  const [preferences, setPreferences] = useState(getSearchPreferences);

  useEffect(() => {
    const refresh = () => setPreferences(getSearchPreferences());

    window.addEventListener(SEARCH_PREFERENCES_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SEARCH_PREFERENCES_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return preferences;
}

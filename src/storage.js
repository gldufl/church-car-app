import { supabase } from "./supabaseClient";

/**
 * 기존 Claude 아티팩트의 window.storage.get/set 과 동일한 모양의 API를
 * Supabase의 app_storage 테이블로 그대로 대체합니다.
 * App.jsx 쪽 코드는 window.storage.get(...) → storage.get(...) 로만 바꾸면 됩니다.
 */
export const storage = {
  async get(key) {
    const { data, error } = await supabase
      .from("app_storage")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("key not found: " + key);
    return { key, value: data.value };
  },

  async set(key, value) {
    const { data, error } = await supabase
      .from("app_storage")
      .upsert({ key, value, updated_at: new Date().toISOString() })
      .select("value")
      .single();

    if (error) {
      console.error("storage.set error:", error);
      return null;
    }
    return { key, value: data.value };
  },
};

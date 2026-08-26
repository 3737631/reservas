import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://lfnenhsijsvysmluvllx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WuLU41ncfLY_sp48UtV4LA_O0hQ-qUp";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export type Slot = {
  id: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  persons: string;
  note: string | null;
  created_at: string;
};

export async function fetchSlots(date: string): Promise<Slot[]> {
  const { data, error } = await supabase
    .from("slots")
    .select("*")
    .eq("date", date)
    .order("time", { ascending: true });
  if (error) {
    console.warn("fetchSlots error", error);
    return [];
  }
  return (data as Slot[]) ?? [];
}

export async function fetchSlotTimes(date: string): Promise<string[]> {
  const slots = await fetchSlots(date);
  return slots.map((s) => s.time);
}

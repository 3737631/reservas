import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://lfnenhsijsvysmluvllx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WuLU41ncfLY_sp48UtV4LA_O0hQ-qUp";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export type Zone = "terraza" | "salon";

export type Slot = {
  id: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  persons: string;
  note: string | null;
  zone?: Zone | null;
  created_at: string;
};

export const BLOQUEO = "__BLOQUEO__";
export const SALON_CERRADO = "__SALON_CERRADO__";
/** Reservas de terraza (o sin zona) por hora. */
export const TERRAZA_POR_HORA = 3;
/** Reservas de salon por servicio (comida/cena) y dia. */
export const SALON_POR_SERVICIO = 2;

/** Comida hasta las 16:59, cena desde las 17:00. */
export const servicioDe = (time: string) => (time < "17:00" ? "comida" : "cena");

/** Reservas reales de salon de un servicio (no cuenta la fila de "salon cerrado"). */
export function salonEnServicio(slots: Slot[], time: string, exceptId?: string) {
  return slots.filter(
    (s) => s.zone === "salon" && s.name !== SALON_CERRADO && servicioDe(s.time) === servicioDe(time) && s.id !== exceptId
  ).length;
}

/** Traduce los errores de la base de datos a un mensaje claro. */
export function mensajeError(msg: string) {
  if (msg.includes("SALON_COMPLETO")) return "El salón ya tiene 2 reservas en este servicio (comida o cena).";
  if (msg.includes("SALON_CERRADO")) return "El salón está cerrado este día. Reábrelo para añadir reservas de salón.";
  return msg;
}

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

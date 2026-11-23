-- Borra todas las reservas (regalos apartados y compartidos guardados).
-- Las cuentas y los regalos se quedan igual. Ejecutar en Supabase > SQL Editor.
-- No se puede deshacer.

delete from public.reservas;

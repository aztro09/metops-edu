
ALTER TABLE "equipment"    ADD CONSTRAINT "equipment_type_chk"       CHECK ("type" IN ('PROYECTOR','COMPUTADORA','RED','IMPRESORA','OTRO'));
ALTER TABLE "equipment"    ADD CONSTRAINT "equipment_state_chk"     CHECK ("operative_state" IN ('OPERATIVO','CON_FALLA','FUERA_SERVICIO'));
ALTER TABLE "categories" ADD CONSTRAINT "categories_prio_chk"    CHECK ("suggested_priority" IN ('BAJA','MEDIA','ALTA','CRITICA'));
ALTER TABLE "tickets"    ADD CONSTRAINT "tickets_priority_chk"  CHECK ("priority" IN ('BAJA','MEDIA','ALTA','CRITICA'));
ALTER TABLE "tickets"    ADD CONSTRAINT "tickets_reconed_chk" CHECK ("reconed_at" IS NULL OR "reconed_at" >= "created_at");
ALTER TABLE "spaces"   ADD CONSTRAINT "spaces_type_chk"      CHECK ("type" IN ('SALON','LABORATORIO','OTRO'));
ALTER TABLE "tickets"    ADD CONSTRAINT "tickets_resolved_chk"   CHECK ("resolved_at" IS NULL OR "resolved_at" >= "created_at");
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_size_chk"  CHECK ("size_bytes" > 0);

-- historial sin mods
CREATE OR REPLACE FUNCTION immutable_history() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El historial del ticket es inmutable (RN-09)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER historial_no_update BEFORE UPDATE ON "ticket_history"
  FOR EACH ROW EXECUTE FUNCTION immutable_history();
CREATE TRIGGER historial_no_delete BEFORE DELETE ON "ticket_history"
  FOR EACH ROW EXECUTE FUNCTION immutable_history();

-- datos base del catalogo
INSERT INTO "roles"("name","description") VALUES
  ('ALUMNO','Reporta y consulta incidentes propios'),
  ('DOCENTE','Reporta y consulta incidentes propios'),
  ('TECNICO','Atiende y resuelve incidentes'),
  ('ADMINISTRADOR','Coordinación: gestión, asignación y analítica');

INSERT INTO "states"("name","order","is_final") VALUES
  ('ABIERTO',1,false),('EN_PROCESO',2,false),('PENDIENTE',3,false),
  ('resolved',4,false),('CERRADO',5,true);

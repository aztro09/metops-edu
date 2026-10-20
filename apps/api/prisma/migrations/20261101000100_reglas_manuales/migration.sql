-- Reglas que Prisma no expresa en el esquema: CHECK, historial inmutable y datos base.

-- ===== CHECK de dominio (ASI 6) =====
ALTER TABLE "spaces"   ADD CONSTRAINT "spaces_type_chk"      CHECK ("type" IN ('SALON','LABORATORIO','OTRO'));
ALTER TABLE "equipment"    ADD CONSTRAINT "equipment_type_chk"       CHECK ("type" IN ('PROYECTOR','COMPUTADORA','RED','IMPRESORA','OTRO'));
ALTER TABLE "equipment"    ADD CONSTRAINT "equipment_status_chk"     CHECK ("operational_status" IN ('OPERATIVO','CON_FALLA','FUERA_SERVICIO'));
ALTER TABLE "categories" ADD CONSTRAINT "categories_priority_chk"    CHECK ("suggested_priority" IN ('BAJA','MEDIA','ALTA','CRITICA'));
ALTER TABLE "tickets"    ADD CONSTRAINT "tickets_priority_chk"  CHECK ("priority" IN ('BAJA','MEDIA','ALTA','CRITICA'));
ALTER TABLE "tickets"    ADD CONSTRAINT "tickets_acknowledged_chk" CHECK ("acknowledged_at" IS NULL OR "acknowledged_at" >= "created_at");
ALTER TABLE "tickets"    ADD CONSTRAINT "tickets_resolved_chk"   CHECK ("resolved_at" IS NULL OR "resolved_at" >= "created_at");
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_size_chk"  CHECK ("size_bytes" > 0);

-- ===== RN-09: el historial no se edita ni se borra =====
CREATE OR REPLACE FUNCTION historial_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El historial del ticket es inmutable (RN-09)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER historial_no_update BEFORE UPDATE ON "ticket_history"
  FOR EACH ROW EXECUTE FUNCTION historial_inmutable();
CREATE TRIGGER historial_no_delete BEFORE DELETE ON "ticket_history"
  FOR EACH ROW EXECUTE FUNCTION historial_inmutable();

-- ===== Datos base (catálogos que el sistema necesita para funcionar) =====
INSERT INTO "roles"("name","description") VALUES
 ('ALUMNO','Reporta y consulta incidentes propios'),
 ('DOCENTE','Reporta y consulta incidentes propios'),
 ('TECNICO','Atiende y resuelve incidentes'),
 ('ADMINISTRADOR','Coordinación: gestión, asignación y analítica');

INSERT INTO "statuses"("name","sort_order","is_final") VALUES
 ('ABIERTO',1,false),('EN_PROCESO',2,false),('PENDIENTE',3,false),
 ('RESUELTO',4,false),('CERRADO',5,true);

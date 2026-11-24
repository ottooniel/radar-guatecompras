-- Apartada de 0001_inicial.sql, que es el esquema obligatorio y no se modifica.
-- La carga llena tenders.search con to_tsvector('spanish', unaccent(...)).
-- Consulta: search @@ websearch_to_tsquery('spanish', unaccent('diesel'))
CREATE EXTENSION IF NOT EXISTS unaccent;

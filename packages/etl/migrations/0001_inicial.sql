CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE tenders (
  nog bigint PRIMARY KEY,
  ocid text NOT NULL,
  title text,
  status_detail text,
  method_detail text,
  category text,
  date_published timestamptz,
  tender_end timestamptz,
  buyer_nit text,
  buyer_name text,
  unit_gcuc text,
  unit_name text,
  department text,
  n_tenderers integer,
  source_month text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  search tsvector,
  embedding halfvec(512)
);
CREATE INDEX tenders_search_idx ON tenders USING gin (search);
CREATE INDEX tenders_status_pub_idx ON tenders (status_detail, date_published DESC);
CREATE INDEX tenders_dept_idx ON tenders (department);
CREATE INDEX tenders_buyer_idx ON tenders (buyer_nit);

CREATE TABLE items (
  id bigserial PRIMARY KEY,
  nog bigint NOT NULL REFERENCES tenders(nog) ON DELETE CASCADE,
  item_id text,
  description text,
  unspsc text,
  unspsc_segment text GENERATED ALWAYS AS (left(unspsc, 2)) STORED,
  unspsc_family text GENERATED ALWAYS AS (left(unspsc, 4)) STORED,
  quantity numeric(18,4),
  unit_name text
);
CREATE INDEX items_nog_idx ON items (nog);
CREATE INDEX items_unspsc_idx ON items (unspsc text_pattern_ops);

CREATE TABLE awards (
  id bigserial PRIMARY KEY,
  nog bigint NOT NULL REFERENCES tenders(nog) ON DELETE CASCADE,
  award_id text,
  supplier_id text,
  supplier_name text,
  amount_gtq numeric(14,2),
  award_date timestamptz,
  status_detail text
);
CREATE INDEX awards_nog_idx ON awards (nog);
CREATE INDEX awards_supplier_idx ON awards (supplier_id);

CREATE TABLE buyers (
  nit text PRIMARY KEY,
  name text,
  department text
);

CREATE TABLE subscriptions (
  id bigserial PRIMARY KEY,
  email text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  unspsc_prefixes text[] NOT NULL DEFAULT '{}',
  departments text[] NOT NULL DEFAULT '{}',
  verified_at timestamptz,
  unsubscribe_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alerts_sent (
  subscription_id bigint NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  nog bigint NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  feedback text CHECK (feedback IN ('util','no_util')),
  PRIMARY KEY (subscription_id, nog)
);

CREATE TABLE etl_runs (
  id bigserial PRIMARY KEY,
  month text NOT NULL,
  sha text,
  rows integer,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

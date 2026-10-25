-- Shared v6 schema, initialized from first BOSS source.
CREATE TABLE jobs (
  job_id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(job_id))>0),
  job_name TEXT NOT NULL, brand_name TEXT, brand_id TEXT, city TEXT, district TEXT, business_district TEXT,
  salary TEXT, experience TEXT, education TEXT, brand_industry TEXT, brand_scale TEXT, brand_stage TEXT,
  boss_name TEXT, boss_title TEXT, boss_online INTEGER CHECK(boss_online IN (0,1)),
  contact_signal INTEGER CHECK(contact_signal IN (0,1)),
  list_json TEXT NOT NULL CHECK(json_valid(list_json)), list_hash TEXT NOT NULL,
  list_source TEXT, list_source_hash TEXT NOT NULL,
  screening_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(screening_status IN ('PENDING','NEED_DETAIL','WORTH','PASS')),
  screening_reason TEXT,
  ai_summary_json TEXT CHECK(ai_summary_json IS NULL OR json_valid(ai_summary_json)),
  ai_summary_source_hash TEXT, ai_summary_at TEXT,
  screening_basis_hash TEXT, screening_basis_type TEXT,
  decision_source TEXT CHECK(decision_source IN ('MANUAL','SKILL','DEMO')),
  strategy_version TEXT, screened_at TEXT, revision INTEGER NOT NULL DEFAULT 0,
  communication_state TEXT NOT NULL DEFAULT 'NONE' CHECK(communication_state IN ('NONE','IN_FLIGHT','SUCCEEDED','FAILED','UNKNOWN')),
  communicated INTEGER GENERATED ALWAYS AS (communication_state='SUCCEEDED') VIRTUAL,
  history_blocked INTEGER NOT NULL DEFAULT 0 CHECK(history_blocked IN (0,1)),
  history_signals TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(history_signals)),
  action_id TEXT, claimed_at TEXT, greet_started_at TEXT, greet_confirmed_at TEXT,
  communicated_at TEXT GENERATED ALWAYS AS (CASE WHEN communication_state='SUCCEEDED' THEN greet_confirmed_at ELSE NULL END) VIRTUAL,
  greet_reason TEXT, greet_json TEXT CHECK(greet_json IS NULL OR json_valid(greet_json)),
  greet_source TEXT, greet_source_hash TEXT,
  greet_raw_json TEXT CHECK(greet_raw_json IS NULL OR json_valid(greet_raw_json)),
  application_state TEXT NOT NULL DEFAULT 'NONE' CHECK(application_state IN ('NONE','SUCCEEDED','FAILED','UNKNOWN')),
  application_action_id TEXT, application_at TEXT,
  application_raw_json TEXT CHECK(application_raw_json IS NULL OR json_valid(application_raw_json)),
  application_source_hash TEXT,
  first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, list_updated_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK(screening_status NOT IN ('PASS','WORTH') OR (screening_reason IS NOT NULL AND length(trim(screening_reason))>0))
) STRICT;
CREATE UNIQUE INDEX jobs_action_id ON jobs(action_id) WHERE action_id IS NOT NULL;
CREATE INDEX jobs_filters ON jobs(screening_status,communication_state,boss_online);
CREATE UNIQUE INDEX jobs_application_action_id ON jobs(application_action_id) WHERE application_action_id IS NOT NULL;
CREATE TABLE job_details (
  job_id TEXT PRIMARY KEY NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  jd_text TEXT NOT NULL CHECK(length(trim(jd_text))>0), job_name TEXT NOT NULL,
  job_status_desc TEXT, invalid_status INTEGER CHECK(invalid_status IN (0,1)), boss_active_desc TEXT,
  be_friend INTEGER CHECK(be_friend IN (0,1)), already_send INTEGER CHECK(already_send IN (0,1)), already_apply INTEGER CHECK(already_apply IN (0,1)),
  detail_json TEXT NOT NULL CHECK(json_valid(detail_json)), detail_hash TEXT NOT NULL,
  raw_envelope_json TEXT CHECK(raw_envelope_json IS NULL OR json_valid(raw_envelope_json)),
  source_ref TEXT, source_hash TEXT NOT NULL, fetched_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
-- Full original List API envelope, stored once per batch rather than repeated for every job.
CREATE TABLE list_responses (
  source_hash TEXT PRIMARY KEY NOT NULL,
  response_json TEXT NOT NULL CHECK(json_valid(response_json)),
  source TEXT,
  imported_at TEXT NOT NULL
) STRICT;
CREATE TABLE job_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(job_id),
  event_type TEXT NOT NULL, old_state TEXT,new_state TEXT,
  source_hash TEXT,occurred_at TEXT NOT NULL,
  event_key TEXT NOT NULL UNIQUE
);
CREATE INDEX job_events_time ON job_events(occurred_at,event_type);
CREATE TABLE job_daily_observations (
 local_day TEXT NOT NULL CHECK(length(local_day)=10),scope TEXT NOT NULL,
 job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
 PRIMARY KEY(local_day,scope,job_id)) STRICT;
CREATE INDEX job_daily_observations_job ON job_daily_observations(job_id,local_day);
CREATE TABLE job_daily_batches (
 local_day TEXT NOT NULL CHECK(length(local_day)=10),scope TEXT NOT NULL,
 source_hash TEXT NOT NULL,first_imported_at TEXT NOT NULL,
 historical INTEGER NOT NULL CHECK(historical IN (0,1)),
 PRIMARY KEY(local_day,scope,source_hash)) STRICT;
CREATE INDEX job_daily_batches_day ON job_daily_batches(local_day,scope);
PRAGMA user_version=7;

-- Init separate schemas for each module in GeraldOS PostgreSQL database
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS patient;
CREATE SCHEMA IF NOT EXISTS scheduling;
CREATE SCHEMA IF NOT EXISTS workflow;
CREATE SCHEMA IF NOT EXISTS equipment;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS reporting;
CREATE SCHEMA IF NOT EXISTS analytics;

-- 1. AUTHENTICATION & AUDIT (auth)
CREATE TABLE IF NOT EXISTS auth.audit_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. RECEPTION & PATIENTS (patient)
CREATE TABLE IF NOT EXISTS patient.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    dob DATE NOT NULL,
    gender VARCHAR(20) NOT NULL,
    national_id VARCHAR(50) UNIQUE,
    phone VARCHAR(30),
    email VARCHAR(100),
    insurance_provider VARCHAR(100),
    insurance_policy_number VARCHAR(100),
    consent_signed BOOLEAN DEFAULT FALSE,
    consent_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. SCHEDULING (scheduling)
CREATE TABLE IF NOT EXISTS scheduling.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL,
    modality VARCHAR(50) NOT NULL, -- X-RAY, ULTRASOUND, CT, MRI, etc.
    equipment_id UUID,
    radiographer_id VARCHAR(255),
    scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
    scheduled_end TIMESTAMP WITH TIME ZONE NOT NULL,
    priority VARCHAR(20) DEFAULT 'ROUTINE', -- ROUTINE, URGENT, STAT
    status VARCHAR(50) DEFAULT 'SCHEDULED', -- SCHEDULED, CONFIRMED, CANCELLED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. CLINICAL WORKFLOW (workflow)
CREATE TABLE IF NOT EXISTS workflow.clinical_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    current_state VARCHAR(50) DEFAULT 'REFERRAL', -- REFERRAL, APPOINTMENT, ARRIVAL, PREPARATION, IMAGING, RADIOLOGIST_REVIEW, COMPLETED, ARCHIVE
    orthanc_study_instance_uid VARCHAR(255),
    assigned_radiologist_id VARCHAR(255),
    priority VARCHAR(20) DEFAULT 'ROUTINE',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow.state_transitions (
    id SERIAL PRIMARY KEY,
    clinical_run_id UUID NOT NULL,
    from_state VARCHAR(50) NOT NULL,
    to_state VARCHAR(50) NOT NULL,
    triggered_by VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

-- 5. EQUIPMENT MANAGEMENT (equipment)
CREATE TABLE IF NOT EXISTS equipment.assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    modality VARCHAR(50) NOT NULL,
    model VARCHAR(100),
    serial_number VARCHAR(100) UNIQUE,
    status VARCHAR(50) DEFAULT 'OPERATIONAL', -- OPERATIONAL, MAINTENANCE, CALIBRATION, DOWN
    next_maintenance TIMESTAMP WITH TIME ZONE,
    next_calibration TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS equipment.service_logs (
    id SERIAL PRIMARY KEY,
    equipment_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- MAINTENANCE, CALIBRATION, BREAKDOWN
    description TEXT,
    technician_name VARCHAR(100),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    cost NUMERIC(10, 2) DEFAULT 0.00
);

-- 6. INVENTORY (inventory)
CREATE TABLE IF NOT EXISTS inventory.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL, -- CONTRAST, GEL, PPE, ELECTRODES, CONSUMABLES
    quantity INT NOT NULL DEFAULT 0,
    unit VARCHAR(20) NOT NULL, -- ml, tube, box, piece
    reorder_level INT NOT NULL DEFAULT 10,
    cost_per_unit NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. REPORTING (reporting)
CREATE TABLE IF NOT EXISTS reporting.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinical_run_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    study_uid VARCHAR(255),
    findings TEXT,
    impression TEXT,
    status VARCHAR(50) DEFAULT 'DRAFT', -- DRAFT, COMPLETED, AMENDED
    dictated_by VARCHAR(255),
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. EXECUTIVE ANALYTICS (analytics)
CREATE TABLE IF NOT EXISTS analytics.daily_kpis (
    date DATE PRIMARY KEY,
    total_patients INT DEFAULT 0,
    total_revenue NUMERIC(12, 2) DEFAULT 0.00,
    avg_turnaround_time_mins INT DEFAULT 0,
    machine_utilisation_percent JSONB DEFAULT '{}'::jsonb
);

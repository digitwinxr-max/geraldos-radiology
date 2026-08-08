# main.py - GeraldOS FastAPI Multi-Module Entry Point
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import uuid

from app.db.session import get_db, engine
from app.core.config import settings

app = FastAPI(
    title="GeraldOS API",
    description="AI-Native Diagnostic Imaging Operations Platform API - Version 1",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "healthy", "platform": "GeraldOS", "version": "1.0.0"}

# ==============================================================================
# MODULE 2: RECEPTION & PATIENTS
# ==============================================================================
@app.post("/api/patients", status_code=status.HTTP_201_CREATED)
def register_patient(patient: Dict[str, Any], db: Session = Depends(get_db)):
    patient_id = str(uuid.uuid4())
    query = """
        INSERT INTO patient.patients (id, first_name, last_name, dob, gender, national_id, phone, email, insurance_provider, insurance_policy_number, consent_signed)
        VALUES (:id, :first_name, :last_name, :dob, :gender, :national_id, :phone, :email, :insurance_provider, :insurance_policy_number, :consent_signed)
    """
    try:
        db.execute(
            sqlalchemy.text(query),
            {
                "id": patient_id,
                "first_name": patient.get("first_name"),
                "last_name": patient.get("last_name"),
                "dob": patient.get("dob"),
                "gender": patient.get("gender"),
                "national_id": patient.get("national_id"),
                "phone": patient.get("phone"),
                "email": patient.get("email"),
                "insurance_provider": patient.get("insurance_provider"),
                "insurance_policy_number": patient.get("insurance_policy_number"),
                "consent_signed": patient.get("consent_signed", False),
            }
        )
        db.commit()
        return {"id": patient_id, "message": "Patient registered successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Registration failed: {str(e)}")

@app.get("/api/patients")
def search_patients(q: str = "", db: Session = Depends(get_db)):
    import sqlalchemy
    query = """
        SELECT * FROM patient.patients 
        WHERE first_name ILIKE :q OR last_name ILIKE :q OR national_id ILIKE :q
    """
    result = db.execute(sqlalchemy.text(query), {"q": f"%{q}%"}).mappings().all()
    return [dict(row) for row in result]

# ==============================================================================
# MODULE 3: SCHEDULING
# ==============================================================================
@app.post("/api/appointments", status_code=status.HTTP_201_CREATED)
def create_appointment(appt: Dict[str, Any], db: Session = Depends(get_db)):
    import sqlalchemy
    appt_id = str(uuid.uuid4())
    query = """
        INSERT INTO scheduling.appointments (id, patient_id, modality, equipment_id, radiographer_id, scheduled_start, scheduled_end, priority, status)
        VALUES (:id, :patient_id, :modality, :equipment_id, :radiographer_id, :scheduled_start, :scheduled_end, :priority, :status)
    """
    try:
        db.execute(
            sqlalchemy.text(query),
            {
                "id": appt_id,
                "patient_id": appt.get("patient_id"),
                "modality": appt.get("modality"),
                "equipment_id": appt.get("equipment_id"),
                "radiographer_id": appt.get("radiographer_id"),
                "scheduled_start": appt.get("scheduled_start"),
                "scheduled_end": appt.get("scheduled_end"),
                "priority": appt.get("priority", "ROUTINE"),
                "status": "SCHEDULED"
            }
        )
        db.commit()
        return {"id": appt_id, "message": "Appointment scheduled successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/appointments")
def list_appointments(db: Session = Depends(get_db)):
    import sqlalchemy
    query = "SELECT * FROM scheduling.appointments"
    result = db.execute(sqlalchemy.text(query)).mappings().all()
    return [dict(row) for row in result]

# ==============================================================================
# MODULE 4: CLINICAL WORKFLOW
# ==============================================================================
@app.post("/api/workflow/runs", status_code=status.HTTP_201_CREATED)
def start_clinical_run(run: Dict[str, Any], db: Session = Depends(get_db)):
    import sqlalchemy
    run_id = str(uuid.uuid4())
    query = """
        INSERT INTO workflow.clinical_runs (id, appointment_id, patient_id, current_state, priority)
        VALUES (:id, :appointment_id, :patient_id, 'REFERRAL', :priority)
    """
    try:
        db.execute(
            sqlalchemy.text(query),
            {
                "id": run_id,
                "appointment_id": run.get("appointment_id"),
                "patient_id": run.get("patient_id"),
                "priority": run.get("priority", "ROUTINE")
            }
        )
        db.commit()
        return {"id": run_id, "message": "Clinical run initiated"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/workflow/runs")
def list_workflow_runs(db: Session = Depends(get_db)):
    import sqlalchemy
    query = "SELECT * FROM workflow.clinical_runs"
    result = db.execute(sqlalchemy.text(query)).mappings().all()
    return [dict(row) for row in result]

@app.put("/api/workflow/runs/{run_id}/transition")
def transition_workflow_state(run_id: str, payload: Dict[str, Any], db: Session = Depends(get_db)):
    import sqlalchemy
    to_state = payload.get("to_state")
    triggered_by = payload.get("triggered_by", "SYSTEM")
    notes = payload.get("notes", "")
    
    # Get current state
    get_query = "SELECT current_state FROM workflow.clinical_runs WHERE id = :id"
    current = db.execute(sqlalchemy.text(get_query), {"id": run_id}).scalar()
    if not current:
        raise HTTPException(status_code=404, detail="Clinical run not found")
        
    update_query = """
        UPDATE workflow.clinical_runs 
        SET current_state = :to_state, updated_at = CURRENT_TIMESTAMP 
        WHERE id = :id
    """
    log_query = """
        INSERT INTO workflow.state_transitions (clinical_run_id, from_state, to_state, triggered_by, notes)
        VALUES (:run_id, :from_state, :to_state, :triggered_by, :notes)
    """
    try:
        db.execute(sqlalchemy.text(update_query), {"to_state": to_state, "id": run_id})
        db.execute(
            sqlalchemy.text(log_query),
            {
                "run_id": run_id,
                "from_state": current,
                "to_state": to_state,
                "triggered_by": triggered_by,
                "notes": notes
            }
        )
        db.commit()
        return {"message": f"Successfully transitioned to {to_state}"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

# ==============================================================================
# MODULE 5 & 6: ORTHANC & OHIF INTEGRATIONS
# ==============================================================================
@app.get("/api/orthanc/studies")
def list_orthanc_studies():
    import httpx
    try:
        response = httpx.get(f"{settings.ORTHANC_URL}/studies")
        if response.status_code == 200:
            return response.json()
        raise HTTPException(status_code=response.status_code, detail="Failed to query Orthanc PACS")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Orthanc connection error: {str(e)}")

# ==============================================================================
# MODULE 7: EQUIPMENT MANAGEMENT
# ==============================================================================
@app.post("/api/equipment")
def create_equipment(payload: Dict[str, Any], db: Session = Depends(get_db)):
    import sqlalchemy
    eq_id = str(uuid.uuid4())
    query = """
        INSERT INTO equipment.assets (id, name, modality, model, serial_number, status, next_maintenance, next_calibration)
        VALUES (:id, :name, :modality, :model, :serial_number, 'OPERATIONAL', :next_maintenance, :next_calibration)
    """
    try:
        db.execute(
            sqlalchemy.text(query),
            {
                "id": eq_id,
                "name": payload.get("name"),
                "modality": payload.get("modality"),
                "model": payload.get("model"),
                "serial_number": payload.get("serial_number"),
                "next_maintenance": payload.get("next_maintenance"),
                "next_calibration": payload.get("next_calibration")
            }
        )
        db.commit()
        return {"id": eq_id, "message": "Equipment profile registered"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/equipment")
def list_equipment(db: Session = Depends(get_db)):
    import sqlalchemy
    query = "SELECT * FROM equipment.assets"
    result = db.execute(sqlalchemy.text(query)).mappings().all()
    return [dict(row) for row in result]

# ==============================================================================
# MODULE 8: INVENTORY
# ==============================================================================
@app.get("/api/inventory")
def list_inventory(db: Session = Depends(get_db)):
    import sqlalchemy
    query = "SELECT * FROM inventory.items"
    result = db.execute(sqlalchemy.text(query)).mappings().all()
    return [dict(row) for row in result]

@app.put("/api/inventory/{item_id}/adjust")
def adjust_inventory(item_id: str, payload: Dict[str, Any], db: Session = Depends(get_db)):
    import sqlalchemy
    qty = payload.get("quantity")
    query = """
        UPDATE inventory.items 
        SET quantity = quantity + :qty, updated_at = CURRENT_TIMESTAMP 
        WHERE id = :id
    """
    try:
        db.execute(sqlalchemy.text(query), {"qty": qty, "id": item_id})
        db.commit()
        return {"message": "Inventory adjusted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

# ==============================================================================
# MODULE 9: REPORTING
# ==============================================================================
@app.post("/api/reports")
def create_report(payload: Dict[str, Any], db: Session = Depends(get_db)):
    import sqlalchemy
    report_id = str(uuid.uuid4())
    query = """
        INSERT INTO reporting.reports (id, clinical_run_id, patient_id, study_uid, findings, impression, status, dictated_by)
        VALUES (:id, :clinical_run_id, :patient_id, :study_uid, :findings, :impression, 'DRAFT', :dictated_by)
    """
    try:
        db.execute(
            sqlalchemy.text(query),
            {
                "id": report_id,
                "clinical_run_id": payload.get("clinical_run_id"),
                "patient_id": payload.get("patient_id"),
                "study_uid": payload.get("study_uid"),
                "findings": payload.get("findings"),
                "impression": payload.get("impression"),
                "dictated_by": payload.get("dictated_by")
            }
        )
        db.commit()
        return {"id": report_id, "message": "Report draft created"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/reports")
def list_reports(db: Session = Depends(get_db)):
    import sqlalchemy
    query = "SELECT * FROM reporting.reports"
    result = db.execute(sqlalchemy.text(query)).mappings().all()
    return [dict(row) for row in result]

# ==============================================================================
# MODULE 10: EXECUTIVE DASHBOARD
# ==============================================================================
@app.get("/api/analytics/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    import sqlalchemy
    # Return mockup/aggregated executive KPIs
    return {
        "kpis": {
            "total_patients_today": 42,
            "total_revenue_today_usd": 12450.00,
            "avg_turnaround_time_mins": 34,
            "machine_utilisation_percent": {
                "CT_SCANNER_A": 82.5,
                "MRI_3T": 74.1,
                "XRAY_B": 45.8,
                "ULTRASOUND_C": 68.3
            }
        },
        "equipment_status": {
            "operational": 4,
            "down": 0,
            "maintenance": 1
        }
    }

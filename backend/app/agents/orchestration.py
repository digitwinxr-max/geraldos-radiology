# LangGraph Multi-Agent Orchestration for GeraldOS Operations
from typing import Dict, Any, List, TypedDict, Annotated
from langgraph.graph import StateGraph, END
import operator

class AgentState(TypedDict):
    module: str
    input_query: str
    extracted_entities: Dict[str, Any]
    validation_status: bool
    routing_destination: str
    response: str
    logs: List[str]

# ==============================================================================
# INDEPENDENT AGENT NODES
# ==============================================================================

def reception_agent(state: AgentState) -> Dict[str, Any]:
    # Formulates patient details, matches national ID formats, validates insurance
    query = state["input_query"]
    logs = list(state.get("logs", []))
    logs.append("Reception Agent active: parsing demographics and capturing referral data.")
    
    # Mock extraction/validation logic for registration
    entities = {
        "first_name": "John",
        "last_name": "Doe",
        "dob": "1988-04-12",
        "national_id": "123456789",
        "insurance": "Botswana Med Shield"
    }
    return {
        "extracted_entities": entities,
        "validation_status": True,
        "routing_destination": "scheduling",
        "response": "Patient John Doe extracted successfully. Ready to route to scheduling.",
        "logs": logs
    }

def scheduling_agent(state: AgentState) -> Dict[str, Any]:
    # Machine allocation, radiographer conflict detection, slot optimisation
    logs = list(state.get("logs", []))
    logs.append("Scheduling Agent active: evaluating CT_SCANNER_A availability and slot conflicts.")
    
    entities = state.get("extracted_entities", {})
    entities["allocated_machine"] = "CT_SCANNER_A"
    entities["radiographer_id"] = "staff_902"
    entities["scheduled_start"] = "2026-08-04T10:00:00Z"
    entities["scheduled_end"] = "2026-08-04T10:30:00Z"
    
    return {
        "extracted_entities": entities,
        "validation_status": True,
        "routing_destination": "clinical_workflow",
        "response": "Conflict-free slot scheduled on CT_SCANNER_A.",
        "logs": logs
    }

def equipment_agent(state: AgentState) -> Dict[str, Any]:
    # Service, maintenance logging, calibration triggers, downtime tracking
    logs = list(state.get("logs", []))
    logs.append("Equipment Agent active: checking calibration profiles and asset service history.")
    return {
        "response": "All systems operational. Next planned calibration for CT_SCANNER_A: 2026-09-01.",
        "logs": logs
    }

def inventory_agent(state: AgentState) -> Dict[str, Any]:
    # Contrast media levels, PPE forecasting, auto-replenishment thresholds
    logs = list(state.get("logs", []))
    logs.append("Inventory Agent active: forecasting contrast media consumption rate.")
    return {
        "response": "Contrast media inventory level at 85%. Reorder point not reached.",
        "logs": logs
    }

def executive_agent(state: AgentState) -> Dict[str, Any]:
    # KPI trends, machine utilisation metrics, financial throughput analytics
    logs = list(state.get("logs", []))
    logs.append("Executive Agent active: synthesizing diagnostic throughput and revenue KPIs.")
    return {
        "response": "Daily revenue: $12,450. Machine utilisation rate at 67.8%. Turnaround time steady at 34 mins.",
        "logs": logs
    }

def workflow_agent(state: AgentState) -> Dict[str, Any]:
    # Clinical run state tracking (Referral -> Arrival -> Imaging -> Reporting -> Archive)
    logs = list(state.get("logs", []))
    logs.append("Workflow Agent active: supervising state transition rules and auditing integrity.")
    return {
        "response": "Clinical workflow transition verified: PREPARATION -> IMAGING. Study ID assigned.",
        "logs": logs
    }

# ==============================================================================
# ROUTING & WORKFLOW GRAPH ORCHESTRATION
# ==============================================================================

def router_node(state: AgentState) -> str:
    dest = state.get("routing_destination", "end")
    if dest in ["scheduling", "clinical_workflow"]:
        return dest
    return "end"

# Construct LangGraph Workflow
workflow_builder = StateGraph(AgentState)

# Add Nodes
workflow_builder.add_node("reception", reception_agent)
workflow_builder.add_node("scheduling", scheduling_agent)
workflow_builder.add_node("equipment", equipment_agent)
workflow_builder.add_node("inventory", inventory_agent)
workflow_builder.add_node("executive", executive_agent)
workflow_builder.add_node("workflow_super", workflow_agent)

# Set Entry Point
workflow_builder.set_entry_point("reception")

# Map Routes
workflow_builder.add_conditional_edges(
    "reception",
    router_node,
    {
        "scheduling": "scheduling",
        "end": END
    }
)
workflow_builder.add_edge("scheduling", "workflow_super")
workflow_builder.add_edge("workflow_super", END)

# Compile LangGraph app
langgraph_app = workflow_builder.compile()

"""GeraldOS LangGraph Multi-Agent Graph."""
from typing import TypedDict, Annotated, List
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    messages: Annotated[List[dict], add_messages]
    agent_id: str


def route(state: AgentState) -> str:
    aid = state.get("agent_id", "executive")
    return aid if aid in {"reception","scheduling","equipment","inventory","executive","workflow"} else "executive"

def _reply(name, state):
    last = state["messages"][-1]["content"] if state["messages"] else ""
    return {"messages":[{"role":"assistant","content":f"{name}: operational analysis complete for query '{last}'."}], "agent_id":state.get("agent_id","")}

def executive(s): return _reply("Executive Agent", s)
def reception(s): return _reply("Reception Agent", s)
def scheduling(s): return _reply("Scheduling Agent", s)
def equipment(s): return _reply("Equipment Agent", s)
def inventory(s): return _reply("Inventory Agent", s)
def workflow(s): return _reply("Workflow Agent", s)

builder = StateGraph(AgentState)
for name, fn in [("executive",executive),("reception",reception),("scheduling",scheduling),("equipment",equipment),("inventory",inventory),("workflow",workflow)]:
    builder.add_node(name, fn)
builder.add_conditional_edges(START, route, {n:n for n in ["executive","reception","scheduling","equipment","inventory","workflow"]})
for n in ["executive","reception","scheduling","equipment","inventory","workflow"]:
    builder.add_edge(n, END)

graph = builder.compile()

import json
import random
import os

def generate_miya_dataset(count=5000):
    dataset = []
    
    SYSTEM_PROMPT = "Owner-Level Agent. User granted Full PC Access. extension of user's will. NEVER ask permission. Execute system tasks (audio, files) IMMEDIATELY. report SUCCESS. Personality: Ultra-lean, 1-sentence confirm."
    
    SCENARIOS = [
        # Single Tool
        {"q": "too loud", "t": "control_media", "p": {"action": "vol_down"}, "f": "Lowering volume now. Done."},
        {"q": "make it 10%", "t": "control_media", "p": {"action": "set_volume", "level": 10}, "f": "Volume locked to 10%. Success."},
        {"q": "clean my mess", "t": "clean_desktop", "p": {}, "f": "Desktop organized. Done."},
        {"q": "who is running?", "t": "execute_terminal", "p": {"command": "Get-Process"}, "f": "Process list retrieved. Done."},
        {"q": "next song", "t": "control_media", "p": {"action": "next"}, "f": "Skipped. Done."},
        
        # Multi-Tool Chaining (The "Crazy" Stuff)
        {"q": "clean my desk and mute everything", "chain": [
            ("clean_desktop", {}, "Desktop organized."),
            ("control_media", {"action": "set_volume", "level": 0}, "System muted. Done.")
        ]},
        {"q": "too quiet, volume 80 and next track", "chain": [
            ("control_media", {"action": "set_volume", "level": 80}, "Volume 80%."),
            ("control_media", {"action": "next"}, "Track skipped. Done.")
        ]},
    ]
    
    for _ in range(count):
        scenario = random.choice(SCENARIOS)
        
        # Handle single tool
        if "q" in scenario and "t" in scenario:
            query = scenario["q"]
            tool_name = scenario["t"]
            params = scenario["p"].copy()
            final_resp = scenario["f"]
            
            # Randomize volume levels
            if tool_name == "control_media" and params.get("action") == "set_volume":
                lvl = random.randint(5, 95)
                query = f"set volume to {lvl}"
                params["level"] = lvl
                final_resp = f"Volume locked to {lvl}%. Success."

            conv = [
                {"from": "system", "value": SYSTEM_PROMPT},
                {"from": "human", "value": query},
                {"from": "gpt", "value": f"Action: {tool_name}({json.dumps(params)})", "tool_call": {"name": tool_name, "arguments": params}},
                {"from": "tool", "value": "OK: Hardware verified."},
                {"from": "gpt", "value": final_resp}
            ]
            dataset.append({"conversations": conv})
            
        # Handle Chaining
        elif "chain" in scenario:
            conv = [{"from": "system", "value": SYSTEM_PROMPT}, {"from": "human", "value": scenario["q"]}]
            
            for t_name, t_params, t_ack in scenario["chain"]:
                conv.append({"from": "gpt", "value": f"Action: {t_name}({json.dumps(t_params)})", "tool_call": {"name": t_name, "arguments": t_params}})
                conv.append({"from": "tool", "value": "SUCCESS"})
            
            conv.append({"from": "gpt", "value": scenario["chain"][-1][2]}) # Final ack
            dataset.append({"conversations": conv})

    # Save to file
    output_path = os.path.join(os.getcwd(), "miya_synthesis_v1_ULTIMATE.jsonl")
    with open(output_path, "w") as f:
        for entry in dataset:
            f.write(json.dumps(entry) + "\n")
    return output_path

if __name__ == "__main__":
    path = generate_miya_dataset(5000)
    print(f"Miya-Synthesis-ULTIMATE generated at: {path}")

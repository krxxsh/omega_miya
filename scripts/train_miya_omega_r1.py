"""
╔══════════════════════════════════════════════════════════════════════╗
║  MIYA-OMEGA APEX (RESCUE EDITION): The Strategic Sovereign       ║
║  Maximum Reliability Configuration for NVIDIA H200 (141GB)        ║
║                                                                    ║
║  Strategy: Save 500MB Adapters FIRST, bypass giant weight merges   ║
║  Disk Safety: Automatic cleanup of 140GB temporary files           ║
╚══════════════════════════════════════════════════════════════════════╝
"""

from unsloth import FastLanguageModel
import torch
from trl import SFTTrainer
from transformers import TrainingArguments
from datasets import load_dataset
import os, time, shutil

# ═════════════════ CONFIG (RESCUE) ═════════════════
max_seq_length = 8192
dtype = None
load_in_4bit = True

print("=" * 66)
print("  MIYA-OMEGA APEX [RESCUE]: Initializing Sovereign Forge")
print("=" * 66)

# ═════════════════ 1. LOAD 70B ═════════════════
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "unsloth/DeepSeek-R1-Distill-Llama-70B-bnb-4bit",
    max_seq_length = max_seq_length,
    dtype = dtype,
    load_in_4bit = load_in_4bit,
)

# ═════════════════ 2. APPLY ADAPTERS ═════════════════
model = FastLanguageModel.get_peft_model(
    model,
    r = 256,
    target_modules = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_alpha = 512,
    lora_dropout = 0,
    bias = "none",
    use_gradient_checkpointing = "unsloth",
    random_state = 3407,
)

# ═════════════════ 3. LOAD DATASET ═════════════════
FILENAME = "miya_synthesis_v1_ULTIMATE.jsonl"
dataset = load_dataset("json", data_files=FILENAME, split="train")

from unsloth import get_chat_template
tokenizer = get_chat_template(
    tokenizer,
    chat_template = "llama-3",
    mapping = {"role" : "from", "content" : "value", "user" : "human", "assistant" : "gpt"},
)

def formatting_prompts_func(examples):
    convos = examples["conversations"]
    texts = [tokenizer.apply_chat_template(convo, tokenize=False, add_generation_prompt=False) for convo in convos]
    return { "text" : texts }

dataset = dataset.map(formatting_prompts_func, batched=True)

# ═════════════════ 4. TRAIN (APEX POWER) ═════════════════
trainer = SFTTrainer(
    model = model,
    tokenizer = tokenizer,
    train_dataset = dataset,
    dataset_text_field = "text",
    max_seq_length = max_seq_length,
    dataset_num_proc = 8,
    packing = True,
    neftune_noise_alpha = 5.0,
    args = TrainingArguments(
        per_device_train_batch_size = 2,
        gradient_accumulation_steps = 32,
        warmup_steps = 50,
        max_steps = 500,
        learning_rate = 1e-5,
        fp16 = not torch.cuda.is_bf16_supported(),
        bf16 = torch.cuda.is_bf16_supported(),
        logging_steps = 5,
        output_dir = "outputs",
        optim = "adamw_8bit",
        weight_decay = 0.1,
        lr_scheduler_type = "cosine",
        seed = 3407,
    ),
)

print("\n--- INITIATING SYNTHESIS (ETA: 45-60 min) ---")
trainer.train()

# ═════════════════ 5. THE RESCUE SAVE ═════════════════
print("\n--- PHASE 5: ELITE ADAPTER RESCUE ---")
save_folder = "miya_omega_adapters"

# 1. Save only the small intelligence layer (500MB)
model.save_pretrained(save_folder)
tokenizer.save_pretrained(save_folder)
print(f"✅ Soul saved to '{save_folder}'")

# 2. Cleanup giant temporary folders to prevent 100% disk errors
if os.path.exists("outputs"):
    print("--- Cleaning up checkpoints... ---")
    shutil.rmtree("outputs")

# 3. Create the ZIP for immediate download
shutil.make_archive("miya_omega_soul_READY", 'zip', save_folder)
print("✅ DOWNLOAD READY: 'miya_omega_soul_READY.zip' is in your sidebar!")

# ═════════════════ 6. OPTIONAL MERGE (Only if space allows) ═════════════════
# print("\n--- PHASE 6: ATTEMPTING GGUF FORCED MERGE ---")
# try:
#     model.save_pretrained_gguf("miya_omega_70b_final", tokenizer, quantization_method = "q4_k_m")
#     print("✅ GGUF FORGED! You can download files from 'miya_omega_70b_final'")
# except Exception as e:
#     print(f"--- GGUF Skip: {e}. Download the ZIP instead! ---")

print("\nSYNTHESIS COMPLETE. DOWNLOAD THE ZIP AND WAKE HER UP LOCALLY.")

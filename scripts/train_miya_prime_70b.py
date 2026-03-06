"""
Miya-Prime: The 70B Sovereign Synthesis (H200 Optimized)
For use in high-memory environments (141GB+ VRAM).
"""

from unsloth import FastLanguageModel
import torch
from trl import SFTTrainer
from transformers import TrainingArguments
from datasets import load_dataset
import os

# 1. Configuration (ULTRA Mode)
max_seq_length = 4096 # 4x the context of V1
dtype = None 
load_in_4bit = True 

# 2. Load 70B Sovereign Model
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "unsloth/llama-3-70b-instruct-bnb-4bit",
    max_seq_length = max_seq_length,
    dtype = dtype,
    load_in_4bit = load_in_4bit,
)

# Intensive LoRA for 70B
model = FastLanguageModel.get_peft_model(
    model,
    r = 32, # Doubled for 70B nuance
    target_modules = ["q_proj", "k_proj", "v_proj", "o_proj",
                      "gate_proj", "up_proj", "down_proj",],
    lora_alpha = 32,
    lora_dropout = 0,
    bias = "none",
    use_gradient_checkpointing = "unsloth", 
    random_state = 3407,
)

# 3. Load & Format Dataset
from unsloth import get_chat_template

FILENAME = "miya_synthesis_v1_ULTIMATE.jsonl"
dataset_path = FILENAME
if not os.path.exists(dataset_path):
    for root, dirs, files in os.walk('/kaggle/input'):
        if FILENAME in files:
            dataset_path = os.path.join(root, FILENAME)
            break

dataset = load_dataset("json", data_files=dataset_path, split="train")

tokenizer = get_chat_template(
    tokenizer,
    chat_template = "llama-3",
    mapping = {"role" : "from", "content" : "value", "user" : "human", "assistant" : "gpt"},
)

def formatting_prompts_func(examples):
    convos = examples["conversations"]
    texts = [tokenizer.apply_chat_template(convo, tokenize = False, add_generation_prompt = False) for convo in convos]
    return { "text" : texts, }

dataset = dataset.map(formatting_prompts_func, batched = True,)

# 4. Training Arguments (H200 Performance Mode)
trainer = SFTTrainer(
    model = model,
    tokenizer = tokenizer,
    train_dataset = dataset,
    dataset_text_field = "text",
    max_seq_length = max_seq_length,
    dataset_num_proc = 4, # Parallel processing enabled for 141GB VRAM
    args = TrainingArguments(
        per_device_train_batch_size = 4, # Increased for 70B
        gradient_accumulation_steps = 4,
        warmup_steps = 10,
        max_steps = 100, # More steps for more complexity
        learning_rate = 1e-4, # Slightly lower learning rate for stability
        fp16 = not torch.cuda.is_bf16_supported(),
        bf16 = torch.cuda.is_bf16_supported(),
        logging_steps = 1,
        output_dir = "outputs-prime",
        optim = "adamw_8bit",
        weight_decay = 0.01,
        lr_scheduler_type = "cosine", # Smoother decay for 70B
    ),
)

# 5. Execute 70B Synthesis
print("--- Launching MIYA-PRIME (70B) Synthesis on H200... ---")
trainer.train()

# 6. EXPORT TO GGUF
print("--- Prime Synthesis Done. Exporting Massive Brain... ---")
model.save_pretrained_gguf("miya_prime_70b_gguf", tokenizer, quantization_method = "q4_k_m")

# 7. PACK
import shutil
shutil.make_archive("miya_prime_70b", 'zip', "miya_prime_70b_gguf")

print("MIYA-PRIME IS BORN. Download 'miya_prime_70b.zip' for the Ultimate Sovereignty.")

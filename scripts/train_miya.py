"""
Miya-V1: The Synthesis Training Script (Universal Pro Mode)
Optimized for RunPod, Kaggle, and Local Dedicated GPUs.
"""

from unsloth import FastLanguageModel
import torch
from trl import SFTTrainer
from transformers import TrainingArguments
from datasets import load_dataset
import os

# 1. Configuration
max_seq_length = 1024 
dtype = None 
load_in_4bit = True 

# 2. Load Model & LoRA Adapters
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "unsloth/llama-3-8b-instruct-bnb-4bit",
    max_seq_length = max_seq_length,
    dtype = dtype,
    load_in_4bit = load_in_4bit,
)

model = FastLanguageModel.get_peft_model(
    model,
    r = 16,
    target_modules = ["q_proj", "k_proj", "v_proj", "o_proj",
                      "gate_proj", "up_proj", "down_proj",],
    lora_alpha = 16,
    lora_dropout = 0,
    bias = "none",
    use_gradient_checkpointing = "unsloth", 
    random_state = 3407,
)

# 3. Load & Format ULTIMATE Dataset
from unsloth import get_chat_template

FILENAME = "miya_synthesis_v1_ULTIMATE.jsonl"
dataset_path = FILENAME

# Check current dir or Kaggle inputs
if not os.path.exists(dataset_path):
    for root, dirs, files in os.walk('/kaggle/input'):
        if FILENAME in files:
            dataset_path = os.path.join(root, FILENAME)
            break

print(f"Using dataset from: {dataset_path}")
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

# 4. Training Arguments
trainer = SFTTrainer(
    model = model,
    tokenizer = tokenizer,
    train_dataset = dataset,
    dataset_text_field = "text",
    max_seq_length = max_seq_length,
    dataset_num_proc = 1,
    args = TrainingArguments(
        per_device_train_batch_size = 2,
        gradient_accumulation_steps = 4,
        warmup_steps = 5,
        max_steps = 60,
        learning_rate = 2e-4,
        fp16 = not torch.cuda.is_bf16_supported(),
        bf16 = torch.cuda.is_bf16_supported(),
        logging_steps = 1,
        output_dir = "outputs",
        optim = "adamw_8bit",
        weight_decay = 0.01,
        lr_scheduler_type = "linear",
    ),
)

# 5. Execute Training
trainer.train()

# 6. EXPORT TO GGUF
print("--- Training Done. Exporting to GGUF... ---")
model.save_pretrained_gguf("miya_brain_v1_gguf", tokenizer, quantization_method = "q4_k_m")

# 7. PACK
print("--- Packing her brain for transport... ---")
import shutil
shutil.make_archive("miya_brain_v1", 'zip', "miya_brain_v1_gguf")

print("Miya-V1 is Born. Download 'miya_brain_v1.zip' from your file browser!")

# 🦾 Miya-Omega — Custom AI Built from Scratch

> A sovereign AI companion powered by DeepSeek-R1, custom-trained with LoRA fine-tuning and deployed locally via Ollama.

![Status](https://img.shields.io/badge/Status-Active-brightgreen)
![Model](https://img.shields.io/badge/Base%20Model-DeepSeek--R1--70B-blue)
![Training](https://img.shields.io/badge/Training-Unsloth%20%2B%20QLoRA-orange)
![Platform](https://img.shields.io/badge/Platform-Ollama-purple)

---

## 🌌 What is Miya-Omega?

Miya-Omega is a **custom fine-tuned AI model** built on top of DeepSeek-R1. It features:

- 🧠 **Deep Chain-of-Thought Reasoning** — thinks step-by-step with `<think>` tags
- ⚡ **Local Deployment** — runs entirely on your machine via Ollama (no cloud needed)
- 🎯 **Custom Personality** — trained with a bespoke dataset for a unique AI companion experience
- 🔒 **Fully Private** — your data never leaves your machine

## 📊 Model Variants

| Variant | Base Model | RAM Needed | Status |
|---------|-----------|------------|--------|
| Miya-Omega 70B | DeepSeek-R1-Distill-Llama-70B | 40+ GB | ✅ Trained |
| Miya-Omega 8B | DeepSeek-R1-Distill-Llama-8B | 5 GB | ✅ Trained |

## 🏗️ Architecture

```
Training Pipeline:
  Dataset (JSONL) → Unsloth QLoRA → LoRA Adapter (safetensors)
                                          ↓
Deployment Pipeline:
  LoRA Adapter → llama.cpp GGUF Converter → Ollama Modelfile → Local Model
```

## 🚀 Quick Start & Usage

### Prerequisites
- [Ollama](https://ollama.com) installed

### 1. Download the Models
The fine-tuned LoRA adapters (and corresponding base model logic) can be downloaded to run Miya-Omega locally.
- **Miya-Omega 8B (Lite)**: `[Link to Model / Google Drive / HuggingFace]`
- **Miya-Omega 70B (Full)**: `[Link to Model / Google Drive / HuggingFace]`

*Note: Once you upload your models to a cloud host, insert the download links above.*

Download and place the `.gguf` and `.safetensors` files in designated local directories (e.g., `C:\MiyaOmega` and `C:\MiyaOmega8B`).

### 2. Setup with Ollama
To integrate the models locally, open your terminal and run the following:

**For the 8B Lite Model:**
```bash
echo "FROM C:\MiyaOmega8B\miya_omega_8b_lite.gguf
ADAPTER C:\MiyaOmega8B\MiyaOmega8B-F32-LoRA.gguf" > Modelfile
ollama create miya-omega-8b -f Modelfile
ollama run miya-omega-8b
```

**For the 70B Full Model:**
*(Requires 40GB+ RAM/VRAM to run)*
```bash
ollama pull deepseek-r1:70b
echo "FROM deepseek-r1:70b
ADAPTER C:\MiyaOmega\MiyaOmega-F32-LoRA.gguf" > Modelfile
ollama create miya-omega-70b -f Modelfile
ollama run miya-omega-70b
```

---

## 🛠️ Train It Yourself (Optional)

*If you prefer to train the model from scratch using your own dataset:*

### 1. Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/miya-omega.git
cd miya-omega
```

### 2. Train the Model (on Cloud GPU)
```bash
# Upload scripts/train_miya_omega_r1.py to Lightning AI / Google Colab
# Run on GPU instance (H200/A100 for 70B, T4 for 8B)
```

### 3. Convert Adapter to GGUF
```bash
git clone --depth 1 https://github.com/ggerganov/llama.cpp
pip install torch safetensors gguf transformers

# Download base model config
mkdir base_config
curl -o base_config/config.json https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Llama-70B/raw/main/config.json

# Convert
python llama.cpp/convert_lora_to_gguf.py --base base_config ./adapter_output
```

## 📁 Project Structure

```
miya-omega/
├── README.md                          # This file
├── scripts/
│   ├── train_miya_omega_r1.py         # Main training script (70B)
│   ├── train_miya_prime_70b.py        # Alternative training config
│   ├── train_miya.py                  # Base training script
│   ├── generate_dataset.py            # Dataset generator
│   └── awaken_omega.ps1               # Windows deployment script
├── src/                               # Miya Desktop App (Electron)
│   ├── index.html
│   ├── styles.css
│   └── ...
├── data/
│   └── miya_synthesis_v1_ULTIMATE.jsonl  # Training dataset
├── main.js                            # Electron main process
├── preload.js                         # Electron preload
└── package.json                       # Node.js dependencies
```

## 🧪 Training Details

| Parameter | Value |
|-----------|-------|
| Base Model | DeepSeek-R1-Distill-Llama-70B |
| Method | QLoRA (4-bit) |
| LoRA Rank | 256 |
| LoRA Alpha | 256 |
| Target Modules | q, k, v, o, gate, up, down projections |
| Training GPU | NVIDIA H200 (80GB) |
| Framework | Unsloth |
| Sequence Length | 4096 |

## 🔧 Tech Stack

- **Training**: [Unsloth](https://github.com/unslothai/unsloth) + PyTorch
- **Conversion**: [llama.cpp](https://github.com/ggerganov/llama.cpp) GGUF converter
- **Inference**: [Ollama](https://ollama.com)
- **Desktop App**: Electron + HTML/CSS/JS
- **Cloud Training**: Lightning AI (H200 GPU)

## 📜 License

This project is for personal/educational use. The base model (DeepSeek-R1) is subject to its own [license terms](https://github.com/deepseek-ai/DeepSeek-R1/blob/main/LICENSE).

## 👤 Author

**Krish** — Built with 🦾 and infinite intention.

---

*"Same soul, sovereign mind."* — Miya-Omega

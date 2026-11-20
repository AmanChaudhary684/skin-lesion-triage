# SkinSight AI — Skin Lesion Screening & Triage Assistant

SkinSight AI is a student-built, AI-assisted skin-lesion screening and triage prototype. It combines image classification, Grad-CAM visual explanations, confidence-aware decision rules, and an unfamiliar-image (OOD) check in a web application.

> **Important:** This is an academic prototype, not a medical device. It is not validated for clinical use and must not be used to diagnose, rule out, or make treatment decisions about skin conditions. Users should consult a qualified clinician for medical concerns.

## Project overview

- **Model:** ImageNet-pretrained ResNet-34 fine-tuned for the seven HAM10000 categories.
- **Explainability:** Grad-CAM heatmap for the class driving the triage decision.
- **Calibration and triage:** Temperature-scaled probabilities and ordered, validation-tuned rules.
- **Unfamiliar-image handling:** Mahalanobis-distance check on learned image features, where supported by the trained checkpoint.
- **Backend:** FastAPI.
- **Frontend:** React + Vite.
- **Dataset:** HAM10000; evaluation described in the accompanying academic report uses the official ISIC 2018 Task 3 test set.

The application returns one of four project-defined tiers: **Urgent**, **Needs human review**, **See doctor soon**, or **Routine**. These are experimental project labels, not clinical protocols.

## Repository structure

```text
skin-lesion-triage/
├── backend/
│   ├── main.py
│   ├── model_utils.py
│   ├── gradcam.py
│   ├── ood.py
│   ├── triage.py
│   ├── verify_model.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── extras/tests/
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
├── training/
│   ├── dataset.py
│   ├── labels.py
│   ├── train.py
│   └── evaluate_test_set.py
├── docs/
│   ├── SkinSight_AI_IEEE_Report.pdf
│   └── SkinSight_AI_Presentation_Script.pdf
├── .gitignore
└── README.md
```

## Run the application locally
## Setup

### 1. Get the dataset (for the training track)

Download HAM10000 from [Kaggle](https://www.kaggle.com/datasets/kmader/skin-cancer-mnist-ham10000)
or the [Harvard Dataverse](https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/DBW86T)
original. Arrange it as:

```
data/
  HAM10000_metadata.csv
  images/                <- flatten both image folders into this one
```

### 2. Train a model

```bash
cd training
pip install -r requirements.txt
python train.py --data-dir ../data --epochs 15 --backbone resnet34
```

Needs a GPU and internet access (to download ImageNet-pretrained weights) —
use Google Colab if nobody has a local GPU. Saves
`training/checkpoints/skinsight_final_v2.pt`.

### 3. Run the backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Runs on `http://localhost:8000`. Check `http://localhost:8000/health` — it
tells you whether it's using a real checkpoint or mock mode.

### 4. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). The Vite development server proxies `/api` requests to `http://localhost:8000`.

## Model and evaluation notes

The academic report describes the final experiment: a lesion-level HAM10000 train/validation split, ResNet-34 transfer learning, temperature scaling, validation-tuned triage thresholds, Grad-CAM, and an OOD check. The report also documents limitations and failure cases.

**Reproducibility note:** The checked-in `training/train.py` and `training/evaluate_test_set.py` are baseline/scaffold scripts; they are not the complete final experiment pipeline used to produce the reported v2 checkpoint and metrics. Do not use those scripts to claim that the report's final results can be reproduced end-to-end. The final checkpoint was produced by the v2 training workflow referenced in the project materials. The checkpoint itself is excluded from Git history.

## Academic materials

- `docs/SkinSight_AI_IEEE_Report.pdf` — project methodology, evaluation and limitations.

## Privacy and safety

The project is intended for coursework and demonstration. Do not upload identifiable or sensitive patient images. Do not deploy this prototype for public medical use. Any real-world use would require clinical validation, appropriate privacy/security controls, regulatory review, and oversight by qualified medical professionals.

## License

No open-source license is currently specified. Unless a license is added, normal copyright restrictions apply.

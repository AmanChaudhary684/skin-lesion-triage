# AI-Assisted Skin Lesion Screening & Triage Assistant

Student project scaffold: transfer-learning classifier on HAM10000, Grad-CAM
explainability, a FastAPI backend, and a React frontend.

**Not a medical device.** This is a course project prototype and must not be
used to make real medical decisions.

## Project layout

```
training/     dataset loading, class-imbalance handling, training script
backend/      FastAPI app: /predict endpoint (classification + Grad-CAM + triage)
frontend/     React (Vite) upload UI
```

## How the pieces fit together

1. **training/** produces `training/checkpoints/best_model.pt`.
2. **backend/** loads that checkpoint and serves predictions. If no
   checkpoint exists yet, it runs in **mock mode** with randomly-initialized
   weights — this lets the backend/frontend team build and test the full
   request/response flow before the model is trained. Mock mode turns off
   automatically the moment a real checkpoint appears.
3. **frontend/** talks to the backend at `/api/predict` (proxied to
   `http://localhost:8000` in dev).

This split means all 6 of you can work in parallel from day one — nobody is
blocked waiting on someone else's piece.

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
`training/checkpoints/best_model.pt`.

### 3. Run the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Runs on `http://localhost:8000`. Check `http://localhost:8000/health` — it
tells you whether it's using a real checkpoint or mock mode.

### 4. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`, proxying API calls to the backend.

## What's already implemented

- **Class-imbalance handling**: HAM10000 is ~67% one class (`nv`); training
  uses a weighted sampler so rarer, higher-risk classes aren't drowned out.
- **Grad-CAM** (`backend/gradcam.py`): visual overlay showing which region of
  the image drove the prediction.
- **Triage-tier mapping** (`backend/triage.py`): maps a prediction + confidence
  to one of four tiers (urgent / see soon / routine / needs human review).
  Low-confidence predictions are automatically routed to "needs human
  review" instead of returning an unqualified verdict — tune
  `LOW_CONFIDENCE_THRESHOLD` once you have real validation data.

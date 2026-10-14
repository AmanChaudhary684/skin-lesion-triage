from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import io

from model_utils import LesionModel

app = FastAPI(title="Skin Lesion Screening & Triage API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten before any real deployment
    allow_methods=["*"],
    allow_headers=["*"],
)

# Loaded once at startup, reused across requests.
lesion_model = LesionModel()


@app.get("/health")
def health():
    return {"status": "ok", "mock_mode": lesion_model.mock_mode}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file.")

    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read the uploaded image.")

    result = lesion_model.predict(image)
    return result

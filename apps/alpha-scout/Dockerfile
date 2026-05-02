FROM python:3.11-slim
WORKDIR /app

RUN pip install poetry==1.8.0

# Copy dependency files
COPY pyproject.toml poetry.lock* ./
COPY ../../packages/sdk-py /sdk-py

RUN poetry config virtualenvs.create false && \
    poetry install --no-dev --no-interaction --no-ansi || true

COPY . .

ENV PORT=8000
CMD ["uvicorn", "alpha_scout.main:app", "--host", "0.0.0.0", "--port", "8000"]

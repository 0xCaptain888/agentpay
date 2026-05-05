# apps/alpha-scout/Dockerfile
# Build context must be the monorepo root:
#   docker build -f apps/alpha-scout/Dockerfile -t alphascout .
FROM python:3.11-slim
WORKDIR /workspace

RUN pip install --no-cache-dir poetry==1.8.0

# Copy SDK and app from monorepo root (build context = repo root)
COPY packages/sdk-py /workspace/packages/sdk-py
COPY apps/alpha-scout /workspace/apps/alpha-scout

WORKDIR /workspace/apps/alpha-scout
RUN poetry config virtualenvs.create false && \
    poetry install --without dev --no-interaction --no-ansi

ENV PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["sh", "-c", "uvicorn alpha_scout.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

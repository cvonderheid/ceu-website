FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml /app/pyproject.toml
COPY src /app/src
COPY alembic /app/alembic
COPY alembic.ini /app/alembic.ini

RUN pip install --no-cache-dir -e .

ENV PYTHONUNBUFFERED=1

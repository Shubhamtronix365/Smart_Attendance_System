FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code and alembic migrations
COPY server/ ./server/
COPY alembic.ini .

# Expose port (default 8000, overridden by $PORT on Render)
ENV PORT=8000
EXPOSE 8000

# Start Uvicorn
CMD ["sh", "-c", "alembic upgrade head && uvicorn server.main:app --host 0.0.0.0 --port ${PORT}"]

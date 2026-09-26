import asyncio
from sqlalchemy import text
from server.database.connection import engine, Base, async_session_maker
from server.models import Employee, Attendance, Leave, Payroll
from server.utils.seed_db import seed

async def setup():
    print("=" * 60)
    print("Connecting to Neon PostgreSQL Database...")
    print("=" * 60)
    
    async with engine.begin() as conn:
        print("Creating all database tables (if they do not already exist)...")
        await conn.run_sync(Base.metadata.create_all)
        print("Tables created successfully!")
        
        # Verify created tables
        res = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"))
        tables = [row[0] for row in res.fetchall()]
        print(f"Public tables in Neon DB: {tables}")

    print("\nRunning database seed (Admin & Test users)...")
    await seed()
    print("=" * 60)
    print("Neon Database setup completed successfully!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(setup())

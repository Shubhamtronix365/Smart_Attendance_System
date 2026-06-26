import asyncio
from datetime import date, datetime, timedelta
from decimal import Decimal
from sqlalchemy import select
from server.database.connection import async_session_maker
from server.models import Employee, Attendance, AttendanceStatus, Leave, LeaveStatus, LeaveType, Payroll
from server.dependencies.auth import get_password_hash

async def seed():
    print("Seeding database...")
    async with async_session_maker() as session:
        # Check if database is already seeded
        chk_stmt = select(Employee).where(Employee.email == "admin@system.com")
        chk_res = await session.execute(chk_stmt)
        if chk_res.scalar_one_or_none():
            print("Database already contains the admin user! Seeding aborted.")
            return
            
        # 1. Create Admin User
        admin = Employee(
            name="System Admin",
            email="admin@system.com",
            phone="+919876543210",
            department="Management",
            designation="HR Manager",
            salary=Decimal("95000.00"),
            role="admin",
            is_active=True,
            hashed_password=get_password_hash("admin123"),
            plain_password="admin123",
            joining_date=date.today() - timedelta(days=365)
        )
        session.add(admin)
        
        # 2. Create Test Employees
        emp1 = Employee(
            name="Bhavesh Burad",
            email="bhavesh@system.com",
            phone="+918888888888",
            department="Engineering",
            designation="Software Engineer",
            salary=Decimal("60000.00"),
            fingerprint_id=1,  # ID mapped to ESP32 sensor
            role="employee",
            is_active=True,
            hashed_password=get_password_hash("bhavesh123"),
            plain_password="bhavesh123",
            joining_date=date.today() - timedelta(days=120)
        )
        session.add(emp1)
        
        emp2 = Employee(
            name="Jane Smith",
            email="jane@system.com",
            phone="+917777777777",
            department="Design",
            designation="UI/UX Designer",
            salary=Decimal("55000.00"),
            fingerprint_id=2,  # ID mapped to ESP32 sensor
            role="employee",
            is_active=True,
            hashed_password=get_password_hash("jane123"),
            plain_password="jane123",
            joining_date=date.today() - timedelta(days=90)
        )
        session.add(emp2)
        
        await session.commit()
        await session.refresh(admin)
        await session.refresh(emp1)
        await session.refresh(emp2)
        
        # 3. Create Sample Attendance Logs for last 3 days
        today = date.today()
        for i in range(3, 0, -1):
            target_date = today - timedelta(days=i)
            # Skip Sundays
            if target_date.weekday() == 6:
                continue
                
            # John present, checked in at 8:55 AM, checked out at 6:05 PM
            session.add(Attendance(
                employee_id=emp1.employee_id,
                date=target_date,
                check_in=datetime.combine(target_date, datetime.min.time().replace(hour=8, minute=55)),
                check_out=datetime.combine(target_date, datetime.min.time().replace(hour=18, minute=5)),
                working_hours=Decimal("8.17"),
                overtime_hours=Decimal("0.17"),
                status=AttendanceStatus.PRESENT,
                source="biometric",
                created_at=datetime.utcnow()
            ))
            
            # Jane late, checked in at 9:45 AM, checked out at 5:00 PM
            session.add(Attendance(
                employee_id=emp2.employee_id,
                date=target_date,
                check_in=datetime.combine(target_date, datetime.min.time().replace(hour=9, minute=45)),
                check_out=datetime.combine(target_date, datetime.min.time().replace(hour=17, minute=0)),
                working_hours=Decimal("6.25"),
                overtime_hours=Decimal("0.00"),
                status=AttendanceStatus.LATE,
                source="biometric",
                created_at=datetime.utcnow()
            ))
            
        # 4. Create a Pending Leave Request
        leave = Leave(
            employee_id=emp1.employee_id,
            leave_type=LeaveType.CASUAL,
            start_date=today + timedelta(days=5),
            end_date=today + timedelta(days=7),
            reason="Family gathering back home",
            approval_status=LeaveStatus.PENDING,
            created_at=datetime.utcnow()
        )
        session.add(leave)
        
        await session.commit()
        print("Database seeded successfully!")

if __name__ == "__main__":
    asyncio.run(seed())

"""comprehensive payroll and features enhancement

Revision ID: g2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-11-07 19:30:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'g2b3c4d5e6f7'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Add weekly_off to attendance_status enum in PostgreSQL safely
    op.execute("ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'weekly_off';")

    # 2. Add is_billable to employees if not exists
    op.execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_billable BOOLEAN NOT NULL DEFAULT true;")

    # 3. Add payroll snapshot columns if not exists
    op.execute("ALTER TABLE payroll ADD COLUMN IF NOT EXISTS absent_rate NUMERIC(10, 2) DEFAULT 0;")
    op.execute("ALTER TABLE payroll ADD COLUMN IF NOT EXISTS late_rate NUMERIC(10, 2) DEFAULT 0;")
    op.execute("ALTER TABLE payroll ADD COLUMN IF NOT EXISTS ot_rate NUMERIC(10, 2) DEFAULT 0;")
    op.execute("ALTER TABLE payroll ADD COLUMN IF NOT EXISTS payable_ot_hours NUMERIC(6, 2) DEFAULT 0;")
    op.execute("ALTER TABLE payroll ADD COLUMN IF NOT EXISTS absent_deduction NUMERIC(12, 2) DEFAULT 0;")
    op.execute("ALTER TABLE payroll ADD COLUMN IF NOT EXISTS reimbursement_amount NUMERIC(12, 2) DEFAULT 0;")
    op.execute("ALTER TABLE payroll ADD COLUMN IF NOT EXISTS advance_recovered NUMERIC(12, 2) DEFAULT 0;")
    op.execute("ALTER TABLE payroll ADD COLUMN IF NOT EXISTS advance_balance_remaining NUMERIC(12, 2) DEFAULT 0;")
    op.execute("ALTER TABLE payroll ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES employees(employee_id) ON DELETE SET NULL;")
    op.execute("ALTER TABLE payroll ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITHOUT TIME ZONE;")
    op.execute("ALTER TABLE payroll ADD COLUMN IF NOT EXISTS calculation_snapshot TEXT;")

    # 4. Create holidays table and index
    op.execute("""
    CREATE TABLE IF NOT EXISTS holidays (
        holiday_id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        date DATE NOT NULL,
        description TEXT,
        holiday_type VARCHAR(50) NOT NULL DEFAULT 'National',
        company_name VARCHAR(100) NOT NULL DEFAULT 'Default',
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_holiday_date_company UNIQUE (date, company_name)
    )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_holidays_date ON holidays (date)")

    # 5. Safe creation of advance_status_enum and tables
    op.execute("""
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'advance_status_enum') THEN
            CREATE TYPE advance_status_enum AS ENUM ('open', 'partially_recovered', 'fully_recovered');
        END IF;
    END $$
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS salary_advances (
        advance_id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
        amount NUMERIC(12, 2) NOT NULL,
        advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
        payment_method VARCHAR(50) NOT NULL DEFAULT 'Bank Transfer',
        reference_no VARCHAR(100),
        description TEXT,
        status advance_status_enum NOT NULL DEFAULT 'open',
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
    )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_salary_advances_employee_id ON salary_advances (employee_id)")

    op.execute("""
    CREATE TABLE IF NOT EXISTS advance_recoveries (
        recovery_id SERIAL PRIMARY KEY,
        advance_id INTEGER REFERENCES salary_advances(advance_id) ON DELETE SET NULL,
        employee_id INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
        payroll_id INTEGER NOT NULL REFERENCES payroll(payroll_id) ON DELETE CASCADE,
        amount_recovered NUMERIC(12, 2) NOT NULL,
        recovery_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
    )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_advance_recoveries_employee_id ON advance_recoveries (employee_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_advance_recoveries_payroll_id ON advance_recoveries (payroll_id)")

    # 6. Safe creation of reimbursement_status_enum and table
    op.execute("""
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reimbursement_status_enum') THEN
            CREATE TYPE reimbursement_status_enum AS ENUM ('pending', 'approved', 'rejected', 'paid');
        END IF;
    END $$
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS reimbursements (
        reimbursement_id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
        amount NUMERIC(12, 2) NOT NULL,
        category VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        receipt_filename VARCHAR(255) NOT NULL,
        receipt_mimetype VARCHAR(100) NOT NULL,
        receipt_storage_path VARCHAR(500) NOT NULL,
        status reimbursement_status_enum NOT NULL DEFAULT 'pending',
        payroll_id INTEGER REFERENCES payroll(payroll_id) ON DELETE SET NULL,
        reviewed_by INTEGER REFERENCES employees(employee_id) ON DELETE SET NULL,
        reviewer_comments TEXT,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        reviewed_at TIMESTAMP WITHOUT TIME ZONE
    )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_reimbursements_employee_id ON reimbursements (employee_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_reimbursements_status ON reimbursements (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_reimbursements_payroll_id ON reimbursements (payroll_id)")

    # 7. Safe creation of late & leave amendment tables
    op.execute("""
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'amendment_status_enum') THEN
            CREATE TYPE amendment_status_enum AS ENUM ('pending', 'approved', 'rejected');
        END IF;
    END $$
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS late_amendments (
        amendment_id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
        attendance_id INTEGER NOT NULL REFERENCES attendance(attendance_id) ON DELETE CASCADE,
        original_late_minutes INTEGER NOT NULL DEFAULT 0,
        reason TEXT NOT NULL,
        attachment_path VARCHAR(500),
        status amendment_status_enum NOT NULL DEFAULT 'pending',
        reviewer_comments TEXT,
        reviewed_by INTEGER REFERENCES employees(employee_id) ON DELETE SET NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        reviewed_at TIMESTAMP WITHOUT TIME ZONE
    )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_late_amendments_employee_id ON late_amendments (employee_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_late_amendments_attendance_id ON late_amendments (attendance_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_late_amendments_status ON late_amendments (status)")

    op.execute("""
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leave_amendment_status_enum') THEN
            CREATE TYPE leave_amendment_status_enum AS ENUM ('pending', 'approved', 'rejected');
        END IF;
    END $$
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS leave_amendments (
        amendment_id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
        leave_id INTEGER NOT NULL REFERENCES leaves(leave_id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        status leave_amendment_status_enum NOT NULL DEFAULT 'pending',
        reviewer_comments TEXT,
        reviewed_by INTEGER REFERENCES employees(employee_id) ON DELETE SET NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        reviewed_at TIMESTAMP WITHOUT TIME ZONE
    )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_leave_amendments_employee_id ON leave_amendments (employee_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_leave_amendments_leave_id ON leave_amendments (leave_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_leave_amendments_status ON leave_amendments (status)")

def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS leave_amendments CASCADE;")
    op.execute("DROP TABLE IF EXISTS late_amendments CASCADE;")
    op.execute("DROP TABLE IF EXISTS reimbursements CASCADE;")
    op.execute("DROP TABLE IF EXISTS advance_recoveries CASCADE;")
    op.execute("DROP TABLE IF EXISTS salary_advances CASCADE;")
    op.execute("DROP TABLE IF EXISTS holidays CASCADE;")

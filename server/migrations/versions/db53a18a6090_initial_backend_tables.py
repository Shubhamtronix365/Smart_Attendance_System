"""Initial backend tables

Revision ID: db53a18a6090
Revises: 
Create Date: 2026-06-13 22:15:06.294225

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'db53a18a6090'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create employees table
    op.create_table(
        'employees',
        sa.Column('employee_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('email', sa.String(length=150), nullable=False),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('department', sa.String(length=100), nullable=True),
        sa.Column('designation', sa.String(length=100), nullable=True),
        sa.Column('salary', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('fingerprint_id', sa.Integer(), nullable=True),
        sa.Column('joining_date', sa.Date(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('hashed_password', sa.String(), nullable=True),
        sa.Column('role', sa.String(length=20), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('employee_id'),
        sa.UniqueConstraint('email'),
        sa.UniqueConstraint('fingerprint_id')
    )
    
    # 2. Create attendance table
    op.create_table(
        'attendance',
        sa.Column('attendance_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('check_in', sa.DateTime(), nullable=True),
        sa.Column('check_out', sa.DateTime(), nullable=True),
        sa.Column('working_hours', sa.Numeric(precision=4, scale=2), nullable=True),
        sa.Column('overtime_hours', sa.Numeric(precision=4, scale=2), nullable=True),
        sa.Column('status', sa.Enum('present', 'absent', 'late', 'half_day', 'leave', 'wfh', name='attendance_status'), nullable=False),
        sa.Column('source', sa.String(length=20), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.employee_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('attendance_id')
    )
    
    # 3. Create leaves table
    op.create_table(
        'leaves',
        sa.Column('leave_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('leave_type', sa.Enum('casual', 'sick', 'paid', 'unpaid', name='leave_type_enum'), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('approval_status', sa.Enum('pending', 'approved', 'rejected', name='leave_status'), nullable=False),
        sa.Column('approved_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['approved_by'], ['employees.employee_id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.employee_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('leave_id')
    )
    
    # 4. Create payroll table
    op.create_table(
        'payroll',
        sa.Column('payroll_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('working_days', sa.Integer(), nullable=True),
        sa.Column('present_days', sa.Integer(), nullable=True),
        sa.Column('absent_days', sa.Integer(), nullable=True),
        sa.Column('leave_days', sa.Integer(), nullable=True),
        sa.Column('overtime_hours', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('basic_salary', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('overtime_pay', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('deductions', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('final_salary', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('is_paid', sa.Boolean(), nullable=True),
        sa.Column('generated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.employee_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('payroll_id')
    )


def downgrade() -> None:
    op.drop_table('payroll')
    op.drop_table('leaves')
    op.drop_table('attendance')
    op.drop_table('employees')
    
    # Drop enums in postgres explicitly
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        sa.Enum(name='attendance_status').drop(bind, checkfirst=True)
        sa.Enum(name='leave_type_enum').drop(bind, checkfirst=True)
        sa.Enum(name='leave_status').drop(bind, checkfirst=True)


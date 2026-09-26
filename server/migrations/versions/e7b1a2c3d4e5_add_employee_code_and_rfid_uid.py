"""add employee_code and rfid_uid

Revision ID: e7b1a2c3d4e5
Revises: db53a18a6090
Create Date: 2026-09-26 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e7b1a2c3d4e5'
down_revision: Union[str, None] = 'db53a18a6090'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Add employee_code column
    op.add_column('employees', sa.Column('employee_code', sa.String(length=50), nullable=True))
    op.create_index(op.f('ix_employees_employee_code'), 'employees', ['employee_code'], unique=False)
    
    # Add rfid_uid column
    op.add_column('employees', sa.Column('rfid_uid', sa.String(length=50), nullable=True))
    op.create_unique_constraint('uq_employees_rfid_uid', 'employees', ['rfid_uid'])

def downgrade() -> None:
    op.drop_constraint('uq_employees_rfid_uid', 'employees', type_='unique')
    op.drop_index(op.f('ix_employees_employee_code'), table_name='employees')
    op.drop_column('employees', 'rfid_uid')
    op.drop_column('employees', 'employee_code')

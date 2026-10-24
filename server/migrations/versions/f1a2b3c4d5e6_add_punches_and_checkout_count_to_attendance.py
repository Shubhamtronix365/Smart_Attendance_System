"""add punches and checkout_count to attendance

Revision ID: f1a2b3c4d5e6
Revises: e7b1a2c3d4e5
Create Date: 2026-10-24 12:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e7b1a2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Add punches JSON string column to store all in/out session pairs
    op.add_column('attendance', sa.Column('punches', sa.Text(), nullable=True, server_default='[]'))
    # Add checkout_count column to track total checkouts per day
    op.add_column('attendance', sa.Column('checkout_count', sa.Integer(), nullable=True, server_default='0'))

def downgrade() -> None:
    op.drop_column('attendance', 'checkout_count')
    op.drop_column('attendance', 'punches')

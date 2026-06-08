"""add callsign to locations

Revision ID: a8b5d2f3c7e1
Revises: f1c2d3e4a5b6
Create Date: 2026-06-08 17:05:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a8b5d2f3c7e1"
down_revision: Union[str, None] = "f1c2d3e4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("locations", sa.Column("callsign", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("locations", "callsign")
